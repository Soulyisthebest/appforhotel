const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/settings', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('booking_engine_settings')
      .select('*').eq('hotel_id', req.hotelId).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('booking_engine_settings')
      .upsert({ ...req.body, hotel_id: req.hotelId }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// FIX D: public availability WITH real stock check
router.get('/public/:hotelId/availability', async (req, res) => {
  try {
    const { check_in, check_out, adults = 1 } = req.query;
    const { hotelId } = req.params;

    if (!check_in || !check_out)
      return res.status(400).json({ error: 'check_in y check_out requeridos' });

    // Get hotel + booking engine settings
    const { data: hotel } = await supabase.from('hotels')
      .select('id, name, logo_url, currency, check_in_time, check_out_time')
      .eq('id', hotelId).eq('active', true).single();
    if (!hotel) return res.status(404).json({ error: 'Hotel no encontrado' });

    // Get room types
    const { data: roomTypes } = await supabase.from('room_types')
      .select('*').eq('hotel_id', hotelId).eq('active', true).order('sort_order');

    // Get occupied rooms for the period
    const { data: occupied } = await supabase.from('reservations')
      .select('room_id, room_type_id')
      .eq('hotel_id', hotelId)
      .not('status', 'in', '("cancelled","checked_out","no_show")')
      .lt('check_in_date', check_out)
      .gt('check_out_date', check_in);

    // Count available units per room type
    const { data: allRooms } = await supabase.from('rooms')
      .select('id, room_type_id').eq('hotel_id', hotelId)
      .not('status', 'in', '("maintenance","blocked")');

    const occupiedByType = (occupied || []).reduce((acc, r) => {
      if (r.room_type_id) acc[r.room_type_id] = (acc[r.room_type_id] || 0) + 1;
      return acc;
    }, {});

    const totalByType = (allRooms || []).reduce((acc, r) => {
      if (r.room_type_id) acc[r.room_type_id] = (acc[r.room_type_id] || 0) + 1;
      return acc;
    }, {});

    // Get rates for the period
    const { data: rates } = await supabase.from('rates')
      .select('room_type_id, price, date')
      .eq('hotel_id', hotelId)
      .gte('date', check_in).lt('date', check_out);

    // Build availability response
    const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / 86400000);

    const available = (roomTypes || []).map(rt => {
      const total = totalByType[rt.id] || 0;
      const occ = occupiedByType[rt.id] || 0;
      const units = total - occ;
      const typeRates = (rates || []).filter(r => r.room_type_id === rt.id);
      const avgPrice = typeRates.length > 0
        ? typeRates.reduce((s, r) => s + r.price, 0) / typeRates.length
        : rt.base_price;

      return {
        ...rt,
        units_available: units,
        is_available: units > 0 && rt.max_adults >= +adults,
        price_per_night: avgPrice,
        total_price: Math.round(avgPrice * nights * 100) / 100,
        nights
      };
    }).filter(rt => rt.is_available);

    res.json({ hotel, available, check_in, check_out, nights, adults: +adults });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/booking-engine/public/:hotelId/book — direct booking (no auth)
router.post('/public/:hotelId/book', async (req, res) => {
  try {
    const { hotelId } = req.params;
    const {
      room_type_id, check_in_date, check_out_date, adults, children,
      meal_plan, rate_plan_id, promo_code,
      guest_first_name, guest_last_name, guest_email, guest_phone, guest_nationality,
      payment_intent_id, payment_method
    } = req.body;

    if (!room_type_id || !check_in_date || !check_out_date || !guest_email)
      return res.status(400).json({ error: 'Campos requeridos: tipo habitación, fechas, email' });

    // Find available room of this type
    const { data: availRooms } = await supabase.from('rooms')
      .select('id, room_number, room_type_id')
      .eq('hotel_id', hotelId).eq('room_type_id', room_type_id)
      .not('status', 'in', '("maintenance","blocked")').limit(20);

    const { data: occupiedForPeriod } = await supabase.from('reservations')
      .select('room_id').eq('hotel_id', hotelId)
      .not('status', 'in', '("cancelled","checked_out","no_show")')
      .lt('check_in_date', check_out_date).gt('check_out_date', check_in_date)
      .not('room_id', 'is', null);

    const occupiedIds = (occupiedForPeriod || []).map(r => r.room_id);
    const freeRoom = (availRooms || []).find(r => !occupiedIds.includes(r.id));
    if (!freeRoom) return res.status(409).json({ error: 'No hay habitaciones disponibles para estas fechas' });

    // Get or create guest
    let guest;
    const { data: existingGuest } = await supabase.from('guests')
      .select('id').eq('hotel_id', hotelId).eq('email', guest_email).single();

    if (existingGuest) {
      guest = existingGuest;
    } else {
      const { data: newGuest } = await supabase.from('guests').insert({
        hotel_id: hotelId, first_name: guest_first_name, last_name: guest_last_name,
        email: guest_email, phone: guest_phone, nationality: guest_nationality
      }).select('id').single();
      guest = newGuest;
    }

    // Get room type price
    const { data: rt } = await supabase.from('room_types').select('base_price').eq('id', room_type_id).single();
    const nights = Math.ceil((new Date(check_out_date) - new Date(check_in_date)) / 86400000);
    const roomRate = rt?.base_price || 0;
    const totalAmount = roomRate * nights;

    // Create reservation
    const { data: reservation, error } = await supabase.from('reservations').insert({
      hotel_id: hotelId, guest_id: guest.id,
      room_id: freeRoom.id, room_type_id,
      check_in_date, check_out_date, adults: adults || 1, children: children || 0,
      meal_plan: meal_plan || 'RO', rate_plan_id,
      room_rate: roomRate, total_room: totalAmount, total_amount: totalAmount,
      amount_pending: totalAmount, status: 'confirmed',
      source: 'direct_booking', channel_id: null
    }).select().single();

    if (error) throw error;

    res.status(201).json({
      success: true, message: 'Reserva confirmada',
      reservation_number: reservation.reservation_number,
      room: freeRoom.room_number,
      check_in: check_in_date, check_out: check_out_date,
      total: totalAmount, nights
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
