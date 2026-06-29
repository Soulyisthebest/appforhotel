const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { folio_id, status, page = 1, limit = 50 } = req.query;
    let query = supabase.from('payments').select('*, payment_gateways(gateway_name)', { count: 'exact' })
      .eq('hotel_id', req.hotelId).order('created_at', { ascending: false }).range((page-1)*limit, page*limit-1);
    if (folio_id) query = query.eq('folio_id', folio_id);
    if (status) query = query.eq('status', status);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const payment = { ...req.body, hotel_id: req.hotelId, processed_by: req.staff.id, processed_at: new Date(), status: req.body.status || 'captured' };
    const { data, error } = await supabase.from('payments').insert(payment).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/refund', auth, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const { data: orig } = await supabase.from('payments').select('*').eq('id', req.params.id).single();
    if (!orig) return res.status(404).json({ error: 'Not found' });
    const { data, error } = await supabase.from('payments').insert({
      hotel_id: req.hotelId, folio_id: orig.folio_id, reservation_id: orig.reservation_id,
      gateway_id: orig.gateway_id, payment_type: 'refund', method_code: orig.method_code,
      amount: -(amount || orig.amount), currency: orig.currency, status: 'refunded',
      processed_by: req.staff.id, processed_at: new Date(), notes: reason
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
