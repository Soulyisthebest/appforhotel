const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

/**
 * WALK-IN — huésped que llega sin reserva previa
 * Flujo completo en un solo endpoint:
 * 1. Crear o encontrar huésped (por documento)
 * 2. Crear reserva con check-in inmediato
 * 3. Asignar habitación
 * 4. Crear folio con cargo del primer día
 * 5. Check-in automático
 */
router.post('/', auth, async (req, res) => {
  try {
    const {
      room_id, room_rate,
      check_out_date, adults = 1, children = 0,
      meal_plan = 'RO', rate_plan_id,
      // Guest data
      first_name, last_name, email, phone,
      nationality, document_type, document_number, document_expiry,
      date_of_birth, address,
      // Payment
      payment_method, payment_gateway_id, amount_paid = 0
    } = req.body;

    if (!room_id) return res.status(400).json({ error: 'Habitación requerida para walk-in' });
    if (!check_out_date) return res.status(400).json({ error: 'Fecha de salida requerida' });
    if (!first_name || !last_name) return res.status(400).json({ error: 'Nombre y apellidos requeridos' });

    const today = new Date().toISOString().split('T')[0];
    const checkOut = new Date(check_out_date);
    const checkIn = new Date(today);
    const nights = Math.ceil((checkOut - checkIn) / 86400000);

    if (nights < 1) return res.status(400).json({ error: 'La fecha de salida debe ser posterior a hoy' });

    // 1. Verify room is available
    const { data: room } = await supabase.from('rooms')
      .select('id, room_number, status, room_type_id, floor_number, room_types(name, base_price)')
      .eq('id', room_id).eq('hotel_id', req.hotelId).single();

    if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });
    if (room.status === 'occupied') return res.status(409).json({ error: `Habitación ${room.room_number} está ocupada` });
    if (room.status === 'maintenance' || room.status === 'blocked')
      return res.status(409).json({ error: `Habitación ${room.room_number} no disponible` });

    const finalRate = room_rate || room.room_types?.base_price || 0;

    // 2. Find or create guest
    let guestId;
    if (document_number) {
      const { data: existing } = await supabase.from('guests')
        .select('id').eq('hotel_id', req.hotelId).eq('document_number', document_number).single();
      if (existing) {
        guestId = existing.id;
        await supabase.from('guests').update({
          first_name, last_name, email, phone, nationality, updated_at: new Date()
        }).eq('id', guestId);
      }
    }

    if (!guestId) {
      const { data: newGuest } = await supabase.from('guests').insert({
        hotel_id: req.hotelId, first_name, last_name, email, phone,
        nationality, document_type, document_number, document_expiry,
        date_of_birth, address
      }).select('id').single();
      guestId = newGuest?.id;
    }

    if (!guestId) return res.status(500).json({ error: 'Error creando perfil del huésped' });

    // 3. Create reservation (already checked_in)
    const totalAmount = finalRate * nights;
    const { data: reservation, error: resErr } = await supabase.from('reservations').insert({
      hotel_id: req.hotelId,
      guest_id: guestId,
      room_id, room_type_id: room.room_type_id,
      rate_plan_id, check_in_date: today, check_out_date,
      adults, children, meal_plan,
      room_rate: finalRate, total_room: totalAmount,
      total_amount: totalAmount, amount_paid, amount_pending: totalAmount - amount_paid,
      status: 'checked_in',
      actual_check_in: new Date(),
      checked_in_by: req.staff.id,
      source: 'walk_in',
      created_by: req.staff.id
    }).select().single();

    if (resErr) throw resErr;

    // 4. Create folio
    const folioNumber = `FOL-${reservation.reservation_number}`;
    const { data: folio } = await supabase.from('folios').insert({
      hotel_id: req.hotelId, reservation_id: reservation.id,
      guest_id: guestId, folio_number: folioNumber
    }).select('id').single();

    // 5. Post room charges for each night
    if (folio && finalRate > 0) {
      const charges = [];
      for (let i = 0; i < nights; i++) {
        const d = new Date(checkIn); d.setDate(d.getDate() + i);
        charges.push({
          folio_id: folio.id, hotel_id: req.hotelId,
          charge_date: d.toISOString().split('T')[0],
          description: `Alojamiento ${d.toLocaleDateString('es-ES')}`,
          category: 'room', amount: finalRate,
          tax_rate: 10, tax_amount: finalRate * 0.10,
          posted_by: req.staff.id
        });
      }
      await supabase.from('folio_charges').insert(charges);
    }

    // 6. Update room status
    await supabase.from('rooms').update({
      status: 'occupied', housekeeping_status: 'occupied'
    }).eq('id', room_id);

    // 7. Audit
    await supabase.from('audit_log').insert({
      hotel_id: req.hotelId, staff_id: req.staff.id,
      action: 'WALK_IN', entity_type: 'reservation', entity_id: reservation.id,
      new_values: { room: room.room_number, guest: `${first_name} ${last_name}`, nights }
    });

    res.status(201).json({
      success: true, message: `Walk-in completado — Hab. ${room.room_number}`,
      reservation, folio_id: folio?.id, guest_id: guestId,
      summary: { room: room.room_number, nights, total: totalAmount, rate: finalRate }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
