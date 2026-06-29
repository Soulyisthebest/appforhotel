const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const today = req.query.date || new Date().toISOString().split('T')[0];
    let query = supabase.from('housekeeping_assignments')
      .select('*, rooms(room_number, floor_number, housekeeping_status, room_types(name)), staff!housekeeping_assignments_assigned_to_fkey(first_name, last_name)')
      .eq('hotel_id', req.hotelId).eq('date', today).order('created_at');
    if (req.query.assigned_to) query = query.eq('assigned_to', req.query.assigned_to);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/room-status', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('rooms')
      .select('id, room_number, floor_number, housekeeping_status, status, notes, last_cleaned_at, room_types(name)')
      .eq('hotel_id', req.hotelId).order('floor_number').order('room_number');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/assign', auth, async (req, res) => {
  try {
    const assignments = Array.isArray(req.body) ? req.body : [req.body];
    const toInsert = assignments.map(a => ({ ...a, hotel_id: req.hotelId, assigned_by: req.staff.id, date: a.date || new Date().toISOString().split('T')[0] }));
    const { data, error } = await supabase.from('housekeeping_assignments').insert(toInsert).select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const update = { status, notes, updated_at: new Date() };
    if (status === 'in_progress') update.started_at = new Date();
    if (status === 'done') update.completed_at = new Date();
    if (status === 'inspected') { update.inspected_at = new Date(); update.inspected_by = req.staff.id; }
    const { data, error } = await supabase.from('housekeeping_assignments')
      .update(update).eq('id', req.params.id).select('*, rooms(id)').single();
    if (error) throw error;
    if (data?.rooms?.id) {
      const hkMap = { done: 'clean', inspected: 'inspected' };
      if (hkMap[status]) await supabase.from('rooms').update({ housekeeping_status: hkMap[status] }).eq('id', data.rooms.id);
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
