const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('folios').select('*, folio_charges(*), payments(*), guests(first_name,last_name,email), reservations(reservation_number,check_in_date,check_out_date,nights)').eq('id', req.params.id).eq('hotel_id', req.hotelId).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/charge', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('folio_charges').insert({ ...req.body, folio_id: req.params.id, hotel_id: req.hotelId, posted_by: req.staff.id }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:folioId/charge/:chargeId', auth, async (req, res) => {
  try {
    await supabase.from('folio_charges').update({ voided: true, voided_at: new Date(), voided_by: req.staff.id }).eq('id', req.params.chargeId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
