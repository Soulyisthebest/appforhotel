const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/pending', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('reservations')
      .select(`*, guests(first_name, last_name, phone, email),
        rooms(room_number, floor_number),
        folios(id, total, balance, status, folio_charges(*), payments(*))`)
      .eq('hotel_id', req.hotelId).eq('check_out_date', today)
      .eq('status', 'checked_in').order('created_at');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// BUG 6 FIX: validate reservation is actually checked_in before checkout
router.post('/:reservationId', auth, async (req, res) => {
  try {
    const { force_checkout, notes } = req.body;

    const { data: reservation, error: fetchErr } = await supabase.from('reservations')
      .select('*, folios(id, balance), rooms(id, room_number)')
      .eq('id', req.params.reservationId).eq('hotel_id', req.hotelId).single();

    if (fetchErr || !reservation) return res.status(404).json({ error: 'Reserva no encontrada' });

    // ✅ BUG 6 FIX: only allow checkout of checked_in reservations
    if (reservation.status !== 'checked_in')
      return res.status(400).json({
        error: `No se puede hacer check-out: estado actual es "${reservation.status}". Solo reservas con check-in activo pueden hacer check-out.`
      });

    const balance = reservation.folios?.[0]?.balance || 0;
    if (balance > 0.01 && !force_checkout)
      return res.status(400).json({
        error: 'Hay un saldo pendiente',
        balance: balance.toFixed(2),
        folio_id: reservation.folios?.[0]?.id,
        message: 'Cobra el saldo o usa force_checkout: true para continuar'
      });

    await Promise.all([
      supabase.from('reservations').update({
        status: 'checked_out',
        actual_check_out: new Date(),
        checked_out_by: req.staff.id,
        internal_notes: notes
      }).eq('id', req.params.reservationId),

      // Set room dirty for housekeeping
      supabase.from('rooms').update({
        status: 'vacant',
        housekeeping_status: 'dirty'
      }).eq('id', reservation.rooms?.id),

      // Close folio
      supabase.from('folios').update({
        status: 'closed', closed_at: new Date()
      }).eq('reservation_id', req.params.reservationId),

      // Notify housekeeping
      supabase.from('notifications').insert({
        hotel_id: req.hotelId, type: 'checkout',
        title: `Check-out — Hab. ${reservation.rooms?.room_number}`,
        message: `Habitación sucia. Pendiente de limpieza.`,
        data: { room_id: reservation.rooms?.id }
      }),

      // Audit
      supabase.from('audit_log').insert({
        hotel_id: req.hotelId, staff_id: req.staff.id,
        action: 'CHECK_OUT', entity_type: 'reservation',
        entity_id: req.params.reservationId,
        new_values: { room: reservation.rooms?.room_number }
      })
    ]);

    // Update guest stats (total stays + revenue)
    if (reservation.guest_id) {
      const { data: guest } = await supabase.from('guests')
        .select('total_stays, total_revenue').eq('id', reservation.guest_id).single();
      if (guest) {
        await supabase.from('guests').update({
          total_stays: (guest.total_stays || 0) + 1,
          total_revenue: (guest.total_revenue || 0) + (reservation.total_amount || 0)
        }).eq('id', reservation.guest_id);
      }
    }

    res.json({ success: true, message: `Check-out completado — Hab. ${reservation.rooms?.room_number} lista para limpieza` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
