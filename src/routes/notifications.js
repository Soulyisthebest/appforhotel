const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('notifications').select('*').eq('hotel_id', req.hotelId)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/read', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('notifications').update({ read: true, read_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
