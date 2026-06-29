const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

// GET /api/invoices
router.get('/', auth, async (req, res) => {
  try {
    const { status, date_from, date_to, page = 1, limit = 50 } = req.query;
    let query = supabase.from('invoices')
      .select('*, reservations(reservation_number), guests(first_name, last_name)', { count: 'exact' })
      .eq('hotel_id', req.hotelId)
      .order('invoice_date', { ascending: false })
      .range((page-1)*limit, page*limit-1);
    if (status) query = query.eq('status', status);
    if (date_from) query = query.gte('invoice_date', date_from);
    if (date_to) query = query.lte('invoice_date', date_to);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/invoices — generate invoice from folio
router.post('/', auth, async (req, res) => {
  try {
    const { folio_id, reservation_id, bill_to_guest, bill_to_company, bill_name, bill_tax_id, bill_address } = req.body;

    // Get folio data
    const { data: folio } = await supabase.from('folios')
      .select('*, folio_charges(*), reservations(reservation_number, check_in_date, check_out_date)')
      .eq('id', folio_id).eq('hotel_id', req.hotelId).single();

    if (!folio) return res.status(404).json({ error: 'Folio no encontrado' });

    // Get hotel settings for invoice prefix
    const { data: settings } = await supabase.from('hotel_settings')
      .select('invoice_prefix, tax_config').eq('hotel_id', req.hotelId).single();

    const prefix = settings?.invoice_prefix || 'F';
    const year = new Date().getFullYear();

    // Generate sequential invoice number
    const { count } = await supabase.from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', req.hotelId)
      .gte('invoice_date', `${year}-01-01`);

    const invoiceNumber = `${prefix}${year}-${String((count || 0) + 1).padStart(4, '0')}`;

    // Calculate from folio charges
    const charges = folio.folio_charges?.filter(c => !c.voided) || [];
    const subtotal = charges.reduce((s, c) => s + (c.amount || 0), 0);
    const tax_amount = charges.reduce((s, c) => s + (c.tax_amount || 0), 0);
    const total = subtotal + tax_amount;

    const { data: invoice, error } = await supabase.from('invoices').insert({
      hotel_id: req.hotelId,
      folio_id, reservation_id: reservation_id || folio.reservation_id,
      invoice_number: invoiceNumber,
      invoice_date: new Date().toISOString().split('T')[0],
      bill_to_guest, bill_to_company,
      bill_name: bill_name || null,
      bill_tax_id: bill_tax_id || null,
      bill_address: bill_address || null,
      subtotal: Math.round(subtotal * 100) / 100,
      tax_amount: Math.round(tax_amount * 100) / 100,
      total: Math.round(total * 100) / 100,
      currency: 'EUR',
      status: 'issued'
    }).select().single();

    if (error) throw error;
    res.status(201).json(invoice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/invoices/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('invoices')
      .select(`*, 
        reservations(reservation_number, check_in_date, check_out_date, nights, adults, meal_plan),
        guests(first_name, last_name, email, address, document_number),
        folios(folio_charges(*))`)
      .eq('id', req.params.id).eq('hotel_id', req.hotelId).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/invoices/:id/mark-paid
router.patch('/:id/mark-paid', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('invoices')
      .update({ status: 'paid' })
      .eq('id', req.params.id).eq('hotel_id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/invoices/:id/cancel
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('invoices')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id).eq('hotel_id', req.hotelId)
      .eq('status', 'issued').select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
