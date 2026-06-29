const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { date_from, date_to, room_type_id, rate_plan_id } = req.query;
    let query = supabase.from('rates').select('*, room_types(name,code), rate_plans(name,code,meal_plan)').eq('hotel_id', req.hotelId).order('date');
    if (date_from) query = query.gte('date', date_from);
    if (date_to) query = query.lte('date', date_to);
    if (room_type_id) query = query.eq('room_type_id', room_type_id);
    if (rate_plan_id) query = query.eq('rate_plan_id', rate_plan_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk', auth, async (req, res) => {
  try {
    const toUpsert = (req.body.rates || []).map(r => ({ ...r, hotel_id: req.hotelId }));
    const { data, error } = await supabase.from('rates').upsert(toUpsert, { onConflict: 'hotel_id,room_type_id,rate_plan_id,date' }).select();
    if (error) throw error;
    res.json({ updated: data?.length, data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/room-types', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('room_types').select('*').eq('hotel_id', req.hotelId).eq('active', true).order('sort_order');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/plans', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('rate_plans').select('*').eq('hotel_id', req.hotelId).eq('active', true);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
