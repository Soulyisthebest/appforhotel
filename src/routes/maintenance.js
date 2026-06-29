const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    let query = supabase.from('maintenance_tickets')
      .select('*, rooms(room_number, floor_number), maintenance_comments(id, comment, created_at)')
      .eq('hotel_id', req.hotelId).order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    if (req.query.priority) query = query.eq('priority', req.query.priority);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { count } = await supabase.from('maintenance_tickets').select('id', { count: 'exact', head: true }).eq('hotel_id', req.hotelId);
    const ticketNumber = `MNT-${String((count || 0) + 1).padStart(4, '0')}`;
    const { data, error } = await supabase.from('maintenance_tickets')
      .insert({ ...req.body, hotel_id: req.hotelId, ticket_number: ticketNumber, reported_by: req.staff.id }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status, resolution_notes, assigned_to, actual_minutes } = req.body;
    const update = { status, updated_at: new Date() };
    if (resolution_notes) update.resolution_notes = resolution_notes;
    if (actual_minutes) update.actual_minutes = actual_minutes;
    if (status === 'assigned' && assigned_to) { update.assigned_at = new Date(); update.assigned_to = assigned_to; }
    if (status === 'in_progress') update.started_at = new Date();
    if (status === 'resolved') update.resolved_at = new Date();
    if (status === 'closed') update.closed_at = new Date();
    const { data, error } = await supabase.from('maintenance_tickets')
      .update(update).eq('id', req.params.id).eq('hotel_id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/comment', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('maintenance_comments')
      .insert({ ticket_id: req.params.id, staff_id: req.staff.id, ...req.body }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
