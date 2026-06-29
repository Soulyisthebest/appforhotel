const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

// GET /api/reservations
router.get('/', auth, async (req, res) => {
  try {
    const { status, date_from, date_to, room_id, guest_id, channel_id, search, page = 1, limit = 50 } = req.query;
    let query = supabase.from('reservations')
      .select(`*,
        guests(id, first_name, last_name, email, phone, nationality, vip_level),
        rooms(id, room_number, floor_number),
        room_types(id, name, code),
        rate_plans(id, name, meal_plan),
        ota_channels(id, channel_name, channel_code),
        folios(id, total, balance, status)
      `, { count: 'exact' })
      .eq('hotel_id', req.hotelId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status) query = query.eq('status', status);
    if (room_id) query = query.eq('room_id', room_id);
    if (guest_id) query = query.eq('guest_id', guest_id);
    if (channel_id) query = query.eq('channel_id', channel_id);
    if (date_from) query = query.gte('check_in_date', date_from);
    if (date_to) query = query.lte('check_out_date', date_to);
    if (search) query = query.or(`reservation_number.ilike.%${search}%,channel_reservation_id.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: +page, limit: +limit, pages: Math.ceil(count / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reservations/today
router.get('/today', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [arrivals, departures, inhouse] = await Promise.all([
      supabase.from('reservations').select(`*,
        guests(first_name, last_name, phone, nationality, vip_level),
        rooms(room_number), room_types(name)
      `).eq('hotel_id', req.hotelId).eq('check_in_date', today)
        .in('status', ['confirmed', 'checked_in']).order('estimated_arrival'),
      supabase.from('reservations').select(`*,
        guests(first_name, last_name, phone),
        rooms(room_number), folios(total, balance)
      `).eq('hotel_id', req.hotelId).eq('check_out_date', today)
        .eq('status', 'checked_in'),
      supabase.from('reservations').select('id', { count: 'exact', head: true })
        .eq('hotel_id', req.hotelId).eq('status', 'checked_in')
    ]);
    res.json({
      arrivals: arrivals.data || [], departures: departures.data || [],
      inhouse_count: inhouse.count || 0, date: today
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reservations/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('reservations')
      .select(`*, guests(*), rooms(*, room_types(*), floors(*)),
        room_types(*), rate_plans(*), ota_channels(channel_name, channel_code),
        folios(*, folio_charges(*), payments(*))`)
      .eq('id', req.params.id).eq('hotel_id', req.hotelId).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/reservations — BUG 2 FIX: availability check before creating
router.post('/', auth, async (req, res) => {
  try {
    const body = { ...req.body, hotel_id: req.hotelId, created_by: req.staff.id };
    const { check_in_date, check_out_date, room_id, room_type_id } = body;

    if (!check_in_date || !check_out_date)
      return res.status(400).json({ error: 'Fechas de entrada y salida requeridas' });

    const checkIn = new Date(check_in_date);
    const checkOut = new Date(check_out_date);
    if (checkOut <= checkIn)
      return res.status(400).json({ error: 'La fecha de salida debe ser posterior a la entrada' });

    // ✅ BUG 2 FIX: Check room availability before creating reservation
    if (room_id) {
      const { data: conflict } = await supabase.from('reservations')
        .select('id, reservation_number, check_in_date, check_out_date')
        .eq('hotel_id', req.hotelId)
        .eq('room_id', room_id)
        .not('status', 'in', '("cancelled","checked_out","no_show")')
        .lt('check_in_date', check_out_date)
        .gt('check_out_date', check_in_date);

      if (conflict && conflict.length > 0) {
        return res.status(409).json({
          error: `Overbooking: la habitación ya tiene reserva ${conflict[0].reservation_number} del ${conflict[0].check_in_date} al ${conflict[0].check_out_date}`,
          conflict: conflict[0]
        });
      }
    }

    // Calculate totals
    const nights = Math.ceil((checkOut - checkIn) / 86400000);
    body.total_room = (body.room_rate || 0) * nights;
    body.total_amount = body.total_room + (body.total_extras || 0) - (body.total_discount || 0);
    body.amount_pending = body.total_amount - (body.amount_paid || 0);

    // ✅ BUG 3 FIX: Don't use reservation_number in folio until after insert
    const { data, error } = await supabase.from('reservations')
      .insert(body).select().single();
    if (error) throw error;

    // Create folio using the returned reservation data (reservation_number now exists)
    const folioNumber = `FOL-${data.reservation_number || data.id.slice(0,8).toUpperCase()}`;
    const { data: folio } = await supabase.from('folios').insert({
      hotel_id: req.hotelId, reservation_id: data.id,
      guest_id: data.guest_id, folio_number: folioNumber
    }).select('id').single();

    // Post nightly room charges
    if (folio && data.room_rate) {
      const charges = [];
      for (let i = 0; i < nights; i++) {
        const d = new Date(checkIn);
        d.setDate(d.getDate() + i);
        charges.push({
          folio_id: folio.id, hotel_id: req.hotelId,
          charge_date: d.toISOString().split('T')[0],
          description: `Alojamiento ${d.toLocaleDateString('es-ES')}`,
          category: 'room', amount: data.room_rate,
          tax_rate: 10, tax_amount: data.room_rate * 0.10,
          posted_by: req.staff.id
        });
      }
      await supabase.from('folio_charges').insert(charges);
    }

    // Send confirmation notification
    await supabase.from('notifications').insert({
      hotel_id: req.hotelId, type: 'new_reservation',
      title: `Nueva reserva — ${data.reservation_number}`,
      message: `Check-in: ${check_in_date} · ${nights} noches`,
      data: { reservation_id: data.id }
    });

    res.status(201).json({ ...data, folio_id: folio?.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/reservations/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('reservations')
      .update({ ...req.body, updated_at: new Date() })
      .eq('id', req.params.id).eq('hotel_id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/reservations/:id/no-show
router.patch('/:id/no-show', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('reservations')
      .update({ status: 'no_show', no_show_at: new Date() })
      .eq('id', req.params.id).eq('hotel_id', req.hotelId)
      .eq('status', 'confirmed').select().single();
    if (error) throw error;
    if (!data) return res.status(400).json({ error: 'Reserva no encontrada o ya procesada' });
    await supabase.from('audit_log').insert({
      hotel_id: req.hotelId, staff_id: req.staff.id,
      action: 'NO_SHOW', entity_type: 'reservation', entity_id: req.params.id
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/reservations/:id/extend — stay extension
router.patch('/:id/extend', auth, async (req, res) => {
  try {
    const { new_check_out_date } = req.body;
    const { data: res_ } = await supabase.from('reservations')
      .select('*, folios(id), rooms(id)').eq('id', req.params.id).eq('hotel_id', req.hotelId).single();
    if (!res_) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (res_.status !== 'checked_in') return res.status(400).json({ error: 'Solo se puede extender una reserva con check-in activo' });

    // Check new dates don't conflict
    const { data: conflict } = await supabase.from('reservations')
      .select('id').eq('hotel_id', req.hotelId).eq('room_id', res_.room_id)
      .not('id', 'eq', req.params.id)
      .not('status', 'in', '("cancelled","checked_out","no_show")')
      .lt('check_in_date', new_check_out_date).gt('check_out_date', res_.check_out_date);
    if (conflict && conflict.length > 0)
      return res.status(409).json({ error: 'La habitación ya está reservada para esas fechas' });

    // Add extra night charges to folio
    const oldOut = new Date(res_.check_out_date);
    const newOut = new Date(new_check_out_date);
    const extraNights = Math.ceil((newOut - oldOut) / 86400000);
    if (res_.folios?.[0]?.id && extraNights > 0) {
      const charges = [];
      for (let i = 0; i < extraNights; i++) {
        const d = new Date(oldOut); d.setDate(d.getDate() + i);
        charges.push({
          folio_id: res_.folios[0].id, hotel_id: req.hotelId,
          charge_date: d.toISOString().split('T')[0],
          description: `Alojamiento extensión ${d.toLocaleDateString('es-ES')}`,
          category: 'room', amount: res_.room_rate,
          tax_rate: 10, tax_amount: res_.room_rate * 0.10,
          posted_by: req.staff.id
        });
      }
      await supabase.from('folio_charges').insert(charges);
    }

    const { data, error } = await supabase.from('reservations')
      .update({ check_out_date: new_check_out_date })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ ...data, extra_nights: extraNights });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/reservations/:id (cancel)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const { data, error } = await supabase.from('reservations')
      .update({ status: 'cancelled', cancelled_at: new Date(), cancellation_reason: reason })
      .eq('id', req.params.id).eq('hotel_id', req.hotelId)
      .in('status', ['confirmed', 'inquiry']).select().single();
    if (error) throw error;
    if (!data) return res.status(400).json({ error: 'No se puede cancelar: reserva ya en proceso o no encontrada' });
    if (data.room_id) {
      await supabase.from('rooms').update({ status: 'vacant' }).eq('id', data.room_id);
    }
    await supabase.from('audit_log').insert({
      hotel_id: req.hotelId, staff_id: req.staff.id,
      action: 'CANCEL', entity_type: 'reservation', entity_id: req.params.id,
      new_values: { reason }
    });
    res.json({ message: 'Reserva cancelada', data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
