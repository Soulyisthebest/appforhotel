const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    let query = supabase.from('staff').select('id,first_name,last_name,email,role,department,active,phone,language').eq('hotel_id', req.hotelId).order('last_name');
    if (req.query.role) query = query.eq('role', req.query.role);
    if (req.query.active !== undefined) query = query.eq('active', req.query.active === 'true');
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('staff').insert({ ...req.body, hotel_id: req.hotelId }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('staff').update({ ...req.body, updated_at: new Date() }).eq('id', req.params.id).eq('hotel_id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
