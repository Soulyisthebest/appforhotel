const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { status, floor, type, hk_status } = req.query;
    let query = supabase.from('rooms')
      .select('*, room_types(*), floors(*)')
      .eq('hotel_id', req.hotelId).order('floor_number').order('room_number');
    if (status) query = query.eq('status', status);
    if (floor) query = query.eq('floor_number', floor);
    if (type) query = query.eq('room_type_id', type);
    if (hk_status) query = query.eq('housekeeping_status', hk_status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// BUG 4 FIX: handle empty occupiedIds list properly
router.get('/availability', auth, async (req, res) => {
  try {
    const { check_in, check_out, room_type_id } = req.query;
    if (!check_in || !check_out) return res.status(400).json({ error: 'Fechas requeridas' });

    const { data: occupied } = await supabase.from('reservations')
      .select('room_id')
      .eq('hotel_id', req.hotelId)
      .not('status', 'in', '("cancelled","checked_out","no_show")')
      .not('room_id', 'is', null)
      .lt('check_in_date', check_out)
      .gt('check_out_date', check_in);

    const occupiedIds = (occupied || []).map(r => r.room_id).filter(Boolean);

    let query = supabase.from('rooms')
      .select('*, room_types(*), floors(*)')
      .eq('hotel_id', req.hotelId)
      .not('status', 'in', '("maintenance","blocked")');

    // ✅ BUG 4 FIX: only apply 'not in' filter when there are occupied rooms
    if (occupiedIds.length > 0) {
      query = query.not('id', 'in', `(${occupiedIds.map(id => `"${id}"`).join(',')})`);
    }

    if (room_type_id) query = query.eq('room_type_id', room_type_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/rack', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('rooms')
      .select(`*, room_types(name, code, base_price), floors(name, floor_number),
        reservations!rooms_id_fkey(
          id, reservation_number, status, check_in_date, check_out_date, nights, adults, meal_plan,
          guests(first_name, last_name, nationality, vip_level, phone)
        )`)
      .eq('hotel_id', req.hotelId).order('floor_number').order('room_number');
    if (error) throw error;
    const byFloor = {};
    (data || []).forEach(room => {
      const f = room.floor_number || 1;
      if (!byFloor[f]) byFloor[f] = { floor: f, floor_name: room.floors?.name || `Planta ${f}`, rooms: [] };
      byFloor[f].rooms.push(room);
    });
    res.json(Object.values(byFloor).sort((a, b) => a.floor - b.floor));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('rooms')
      .select('*, room_types(*), floors(*)').eq('id', req.params.id).eq('hotel_id', req.hotelId).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('rooms')
      .insert({ ...req.body, hotel_id: req.hotelId }).select('*, room_types(*), floors(*)').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('rooms')
      .update({ ...req.body, updated_at: new Date() })
      .eq('id', req.params.id).eq('hotel_id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status, housekeeping_status, notes } = req.body;
    const update = { updated_at: new Date() };
    if (status) update.status = status;
    if (housekeeping_status) update.housekeeping_status = housekeeping_status;
    if (notes) update.notes = notes;
    const { data, error } = await supabase.from('rooms')
      .update(update).eq('id', req.params.id).eq('hotel_id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/rooms/:id/block — block/unblock room (out of order)
router.patch('/:id/block', auth, async (req, res) => {
  try {
    const { reason, blocked_until } = req.body;
    const { data, error } = await supabase.from('rooms')
      .update({ status: 'blocked', notes: reason || 'Bloqueada', updated_at: new Date() })
      .eq('id', req.params.id).eq('hotel_id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
