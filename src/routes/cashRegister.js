const router = require('express').Router();
const { supabase } = require('../config');
const { auth, requireManager } = require('../middleware/auth');

// GET /api/cash-register/current — current open shift
router.get('/current', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('audit_log')
      .select('*').eq('hotel_id', req.hotelId).eq('action', 'SHIFT_OPEN')
      .order('created_at', { ascending: false }).limit(1).single();
    if (!data) return res.json({ open: false, message: 'No hay turno abierto' });
    const shift = data.new_values;
    // Get payments since shift opened
    const { data: payments } = await supabase.from('payments')
      .select('amount, method_code, payment_type, created_at')
      .eq('hotel_id', req.hotelId).eq('status', 'captured')
      .gte('created_at', data.created_at);
    const total = (payments || []).reduce((s, p) => s + p.amount, 0);
    const byMethod = (payments || []).reduce((acc, p) => {
      acc[p.method_code || 'other'] = (acc[p.method_code || 'other'] || 0) + p.amount;
      return acc;
    }, {});
    res.json({ open: true, shift, opened_at: data.created_at, total, by_method: byMethod, transactions: payments?.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cash-register/open — open shift
router.post('/open', auth, async (req, res) => {
  try {
    const { initial_cash = 0, notes } = req.body;
    await supabase.from('audit_log').insert({
      hotel_id: req.hotelId, staff_id: req.staff.id,
      action: 'SHIFT_OPEN', entity_type: 'cash_register',
      new_values: { initial_cash, staff: `${req.staff.first_name} ${req.staff.last_name}`, notes }
    });
    res.json({ success: true, message: `Turno abierto con saldo inicial de ${initial_cash}€`, opened_at: new Date() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cash-register/close — close shift with arqueo
router.post('/close', auth, async (req, res) => {
  try {
    const { cash_counted, notes } = req.body;
    // Get all payments of this shift
    const { data: shiftOpen } = await supabase.from('audit_log')
      .select('*').eq('hotel_id', req.hotelId).eq('action', 'SHIFT_OPEN')
      .order('created_at', { ascending: false }).limit(1).single();
    if (!shiftOpen) return res.status(400).json({ error: 'No hay turno abierto' });

    const { data: payments } = await supabase.from('payments')
      .select('amount, method_code, payment_type')
      .eq('hotel_id', req.hotelId).eq('status', 'captured')
      .gte('created_at', shiftOpen.created_at);

    const initial = shiftOpen.new_values?.initial_cash || 0;
    const cashPayments = (payments || []).filter(p => p.method_code === 'cash').reduce((s,p) => s + p.amount, 0);
    const expected_cash = initial + cashPayments;
    const difference = (cash_counted || 0) - expected_cash;
    const total = (payments || []).reduce((s, p) => s + p.amount, 0);

    const byMethod = (payments || []).reduce((acc, p) => {
      acc[p.method_code || 'other'] = (acc[p.method_code || 'other'] || 0) + p.amount;
      return acc;
    }, {});

    await supabase.from('audit_log').insert({
      hotel_id: req.hotelId, staff_id: req.staff.id,
      action: 'SHIFT_CLOSE', entity_type: 'cash_register',
      new_values: {
        staff: `${req.staff.first_name} ${req.staff.last_name}`,
        initial_cash: initial, total_revenue: total,
        cash_payments: cashPayments, cash_counted: cash_counted || 0,
        expected_cash, difference, by_method: byMethod,
        transactions: payments?.length, notes
      }
    });

    res.json({
      success: true, closed_at: new Date(),
      summary: { initial_cash: initial, total_revenue: total, cash_payments: cashPayments,
        cash_counted: cash_counted || 0, expected_cash, difference,
        status: Math.abs(difference) < 1 ? 'balanced' : difference > 0 ? 'surplus' : 'shortage',
        by_method: byMethod, transactions: payments?.length }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cash-register/history — past shifts
router.get('/history', auth, requireManager, async (req, res) => {
  try {
    const { data, error } = await supabase.from('audit_log')
      .select('*').eq('hotel_id', req.hotelId)
      .in('action', ['SHIFT_OPEN','SHIFT_CLOSE'])
      .order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
