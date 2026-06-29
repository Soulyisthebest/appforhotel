const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.post('/', auth, async (req, res) => {
  try {
    const { reservation_id, new_room_id, reason } = req.body;
    if (!reservation_id || !new_room_id)
      return res.status(400).json({ error: 'reservation_id y new_room_id requeridos' });

    const { data: res_ } = await supabase.from('reservations')
      .select('id, room_id, status, rooms(room_number, id)')
      .eq('id', reservation_id).eq('hotel_id', req.hotelId).single();

    if (!res_) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (res_.status !== 'checked_in')
      return res.status(400).json({ error: 'Solo se puede mover a un huésped con check-in activo' });

    const oldRoomId = res_.room_id;
    const oldRoomNumber = res_.rooms?.room_number;

    const { data: newRoom } = await supabase.from('rooms')
      .select('id, room_number, status, room_type_id')
      .eq('id', new_room_id).eq('hotel_id', req.hotelId).single();

    if (!newRoom) return res.status(404).json({ error: 'Habitación destino no encontrada' });
    if (newRoom.status === 'occupied')
      return res.status(409).json({ error: `Habitación ${newRoom.room_number} está ocupada` });
    if (newRoom.status === 'maintenance' || newRoom.status === 'blocked')
      return res.status(409).json({ error: `Habitación ${newRoom.room_number} no disponible (${newRoom.status})` });

    // FIX B: get folio_id BEFORE the insert block
    const { data: folio } = await supabase.from('folios')
      .select('id').eq('reservation_id', reservation_id).single();

    await Promise.all([
      supabase.from('reservations').update({ room_id: new_room_id, updated_at: new Date() }).eq('id', reservation_id),
      supabase.from('rooms').update({ status: 'vacant', housekeeping_status: 'dirty' }).eq('id', oldRoomId),
      supabase.from('rooms').update({ status: 'occupied' }).eq('id', new_room_id),
      supabase.from('notifications').insert({
        hotel_id: req.hotelId, type: 'room_move',
        title: `Cambio habitación — ${oldRoomNumber} → ${newRoom.room_number}`,
        message: `Hab. ${oldRoomNumber} libre, pendiente de limpieza.`,
        data: { old_room: oldRoomId, new_room: new_room_id }
      }),
      supabase.from('audit_log').insert({
        hotel_id: req.hotelId, staff_id: req.staff.id,
        action: 'ROOM_MOVE', entity_type: 'reservation', entity_id: reservation_id,
        old_values: { room: oldRoomNumber }, new_values: { room: newRoom.room_number, reason }
      })
    ]);

    // Add folio note only if folio exists
    if (folio?.id) {
      await supabase.from('folio_charges').insert({
        hotel_id: req.hotelId, folio_id: folio.id,
        charge_date: new Date().toISOString().split('T')[0],
        description: `Cambio de habitación: ${oldRoomNumber} → ${newRoom.room_number}${reason ? ` (${reason})` : ''}`,
        category: 'extra', amount: 0, posted_by: req.staff.id
      });
    }

    res.json({
      success: true,
      message: `Huésped movido de hab. ${oldRoomNumber} a hab. ${newRoom.room_number}`,
      old_room: oldRoomNumber, new_room: newRoom.room_number
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
