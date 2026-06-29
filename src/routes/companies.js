const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { search, active } = req.query;
    let query = supabase.from('companies').select('*').eq('hotel_id', req.hotelId).order('name');
    if (search) query = query.ilike('name', `%${search}%`);
    if (active !== undefined) query = query.eq('active', active === 'true');
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('companies').select(`*,
      reservations(id, reservation_number, check_in_date, total_amount, status)
    `).eq('id', req.params.id).eq('hotel_id', req.hotelId).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('companies')
      .insert({ ...req.body, hotel_id: req.hotelId }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('companies')
      .update({ ...req.body, updated_at: new Date() })
      .eq('id', req.params.id).eq('hotel_id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/companies/:id/balance — outstanding balance for corporate account
router.get('/:id/balance', auth, async (req, res) => {
  try {
    const { data: reservations } = await supabase.from('reservations')
      .select('total_amount, amount_paid, amount_pending, reservation_number, check_in_date, status')
      .eq('hotel_id', req.hotelId).eq('company_id', req.params.id)
      .in('status', ['confirmed','checked_in','checked_out'])
      .order('check_in_date', { ascending: false });

    const totalDebt = (reservations || []).reduce((s, r) => s + (r.amount_pending || 0), 0);
    const totalRevenue = (reservations || []).reduce((s, r) => s + (r.total_amount || 0), 0);

    res.json({ total_debt: totalDebt, total_revenue: totalRevenue, reservations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
