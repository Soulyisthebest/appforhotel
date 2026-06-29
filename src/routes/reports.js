const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/occupancy', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('revenue_daily').select('*').eq('hotel_id', req.hotelId)
      .gte('date', req.query.date_from || '2026-01-01').lte('date', req.query.date_to || '2026-12-31').order('date');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/revenue', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('payments')
      .select('amount, method_code, created_at, payment_gateways(gateway_name)')
      .eq('hotel_id', req.hotelId).eq('status', 'captured')
      .gte('created_at', (req.query.date_from || '2026-01-01') + 'T00:00:00')
      .lte('created_at', (req.query.date_to || '2026-12-31') + 'T23:59:59');
    if (error) throw error;
    const total = (data || []).reduce((s, p) => s + p.amount, 0);
    res.json({ total, transactions: data?.length, data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
