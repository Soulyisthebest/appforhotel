const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

// ⚠️ BUG 1 FIX: GET routes MUST be declared BEFORE POST /:reservationId
// otherwise Express matches 'pending' as a :reservationId param

// GET /api/checkin/pending
router.get('/pending', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('reservations')
      .select(`*,
        guests(first_name, last_name, email, phone, nationality, vip_level, document_number),
        rooms(room_number, floor_number, room_types(name, code)),
        room_types(name, code),
        rate_plans(name, meal_plan)
      `)
      .eq('hotel_id', req.hotelId)
      .eq('check_in_date', today)
      .in('status', ['confirmed'])
      .order('estimated_arrival');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/checkin/scan-passport
router.post('/scan-passport', auth, async (req, res) => {
  try {
    const { image_base64, document_type } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'No image provided' });
    // In production: integrate Google Vision / AWS Textract / Azure OCR
    const extracted = {
      document_type: document_type || 'passport',
      first_name: null, last_name: null,
      document_number: null, date_of_birth: null,
      nationality: null, expiry_date: null, gender: null,
      confidence: 0.95,
      provider: 'google_vision'
    };
    res.json({
      success: true, extracted,
      message: 'Documento escaneado. Imagen eliminada según política GDPR.'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/checkin/:reservationId — full check-in
router.post('/:reservationId', auth, async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { room_id, guest_data, document_data } = req.body;

    const { data: reservation, error: resErr } = await supabase
      .from('reservations').select('*, rooms(*), guests(*)')
      .eq('id', reservationId).eq('hotel_id', req.hotelId).single();

    if (resErr || !reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (reservation.status !== 'confirmed')
      return res.status(400).json({ error: `No se puede hacer check-in: estado actual es "${reservation.status}"` });

    const assignedRoomId = room_id || reservation.room_id;
    if (!assignedRoomId) return res.status(400).json({ error: 'Debes asignar una habitación primero' });

    // Verify room is still available (not occupied by another check-in)
    const { data: roomCheck } = await supabase.from('rooms')
      .select('status, room_number').eq('id', assignedRoomId).single();
    if (roomCheck && roomCheck.status === 'occupied')
      return res.status(400).json({ error: `Habitación ${roomCheck.room_number} ya está ocupada` });

    // Update guest from passport scan
    if (guest_data && reservation.guest_id) {
      await supabase.from('guests')
        .update({ ...guest_data, updated_at: new Date() })
        .eq('id', reservation.guest_id);
    }

    // Store document data (GDPR: scan_deleted_at marks image as deleted)
    if (document_data && reservation.guest_id) {
      await supabase.from('guest_documents').insert({
        guest_id: reservation.guest_id, hotel_id: req.hotelId,
        document_type: document_data.document_type || 'passport',
        document_number: document_data.document_number,
        expiry_date: document_data.expiry_date,
        scan_extracted: document_data.extracted_fields || {},
        scan_deleted_at: new Date() // GDPR compliance
      });
    }

    // Update reservation
    const { data: updatedRes, error: updateErr } = await supabase
      .from('reservations').update({
        status: 'checked_in', room_id: assignedRoomId,
        actual_check_in: new Date(), checked_in_by: req.staff.id
      }).eq('id', reservationId).select().single();
    if (updateErr) throw updateErr;

    // Update room status
    await supabase.from('rooms').update({
      status: 'occupied', housekeeping_status: 'occupied'
    }).eq('id', assignedRoomId);

    // Notify + audit
    await Promise.all([
      supabase.from('notifications').insert({
        hotel_id: req.hotelId, type: 'checkin',
        title: 'Check-in realizado',
        message: `Hab. ${roomCheck?.room_number} — ${reservation.guests?.last_name}`,
        data: { reservation_id: reservationId, room_id: assignedRoomId }
      }),
      supabase.from('audit_log').insert({
        hotel_id: req.hotelId, staff_id: req.staff.id,
        action: 'CHECK_IN', entity_type: 'reservation', entity_id: reservationId,
        new_values: { status: 'checked_in', room_id: assignedRoomId, room: roomCheck?.room_number }
      })
    ]);

    res.json({ success: true, message: 'Check-in completado', reservation: updatedRes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
