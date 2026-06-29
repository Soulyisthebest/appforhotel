const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { search, vip_level, nationality, page = 1, limit = 50 } = req.query;
    let query = supabase.from('guests').select('*', { count: 'exact' })
      .eq('hotel_id', req.hotelId).order('last_name')
      .range((page-1)*limit, page*limit-1);
    if (vip_level) query = query.eq('vip_level', vip_level);
    if (nationality) query = query.eq('nationality', nationality);
    if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,document_number.ilike.%${search}%`);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: +page, limit: +limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('guests').select('*').eq('id', req.params.id).eq('hotel_id', req.hotelId).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('guests').insert({ ...req.body, hotel_id: req.hotelId }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('guests').update({ ...req.body, updated_at: new Date() }).eq('id', req.params.id).eq('hotel_id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
