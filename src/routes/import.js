const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/jobs', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('import_jobs').select('*').eq('hotel_id', req.hotelId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/start', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('import_jobs').insert({ ...req.body, hotel_id: req.hotelId, status: 'pending', started_by: req.staff.id }).select().single();
    if (error) throw error;
    res.status(201).json({ job: data, message: 'Import job queued' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
