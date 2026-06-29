const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

router.get('/me', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('hotels').select('*, hotel_settings(*), booking_engine_settings(*)').eq('id', req.hotelId).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/me', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('hotels').update({ ...req.body, updated_at: new Date() }).eq('id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

// POST /api/hotels/calculate-city-tax — calculate city tax for a stay
router.post('/calculate-city-tax', auth, async (req, res) => {
  try {
    const { adults, nights, stars } = req.body;
    const { data: settings } = await supabase.from('hotel_settings')
      .select('tax_config').eq('hotel_id', req.hotelId).single();
    const taxConfig = settings?.tax_config || {};
    const cityTaxPerNight = taxConfig.city_tax || 0;
    const hotelStars = stars || taxConfig.hotel_stars || 3;
    // Andalucía: 0.50-2.00€ / person / night depending on stars
    const andaluciaTax = { 1: 0.50, 2: 0.50, 3: 1.00, 4: 1.50, 5: 2.00 };
    const autoTax = cityTaxPerNight || andaluciaTax[hotelStars] || 1.00;
    const total = autoTax * (adults || 1) * (nights || 1);
    res.json({ city_tax_per_person_night: autoTax, adults, nights, total_city_tax: Math.round(total * 100) / 100 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
