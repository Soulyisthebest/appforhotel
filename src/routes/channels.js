const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');
const { processBookingReservation, buildSuccessResponseXML, buildErrorResponseXML } = require('../integrations/booking/bookingAdapter');
const { processExpediaReservation, fetchExpediaReservations } = require('../integrations/expedia/expediaAdapter');
const { syncAirbnbIcal, generateIcalForChannel } = require('../integrations/airbnb/airbnbAdapter');
const { syncAllChannels, triggerAvailabilityPush } = require('../integrations/channelSyncEngine');

// GET /api/channels
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('ota_channels')
      .select('*, channel_room_mapping(*, room_types(name,code)), channel_rate_mapping(*, rate_plans(name,code))')
      .eq('hotel_id', req.hotelId).order('channel_name');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/channels
router.post('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('ota_channels')
      .insert({ ...req.body, hotel_id: req.hotelId }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/channels/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('ota_channels')
      .update({ ...req.body, updated_at: new Date() })
      .eq('id', req.params.id).eq('hotel_id', req.hotelId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/channels/:id/sync
router.post('/:id/sync', auth, async (req, res) => {
  try {
    const { data: channel } = await supabase.from('ota_channels')
      .select('*').eq('id', req.params.id).eq('hotel_id', req.hotelId).single();
    if (!channel) return res.status(404).json({ error: 'Canal no encontrado' });
    let result = {};
    if (channel.channel_code === 'airbnb') {
      result = await syncAirbnbIcal(req.hotelId, req.params.id, channel);
    } else if (channel.channel_code === 'expedia') {
      const bookings = await fetchExpediaReservations(channel);
      for (const b of bookings) await processExpediaReservation(req.hotelId, req.params.id, b);
      result = { processed: bookings.length };
    } else {
      result = { message: 'Sync iniciado' };
    }
    await supabase.from('ota_channels').update({ last_synced_at: new Date() }).eq('id', req.params.id);
    res.json({ success: true, result, synced_at: new Date() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/channels/sync-all
router.post('/sync-all', auth, async (req, res) => {
  syncAllChannels();
  res.json({ message: 'Sincronización iniciada', started_at: new Date() });
});

// GET /api/channels/log
router.get('/log', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('channel_sync_log')
      .select('*, ota_channels(channel_name, channel_code)')
      .eq('hotel_id', req.hotelId).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET/POST /api/channels/:id/mapping
router.get('/:id/mapping', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('channel_room_mapping')
      .select('*, room_types(name,code,base_price)').eq('channel_id', req.params.id);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/mapping', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('channel_room_mapping')
      .upsert({ hotel_id: req.hotelId, channel_id: req.params.id, ...req.body },
        { onConflict: 'channel_id,room_type_id' }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/channels/:id/ical
router.get('/:id/ical', async (req, res) => {
  try {
    const { data: ch } = await supabase.from('ota_channels').select('hotel_id').eq('id', req.params.id).single();
    if (!ch) return res.status(404).send('Not found');
    const ical = await generateIcalForChannel(ch.hotel_id, null);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
    res.send(ical);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/channels/:id/test
router.post('/:id/test', auth, async (req, res) => {
  try {
    const { data: channel } = await supabase.from('ota_channels')
      .select('*').eq('id', req.params.id).eq('hotel_id', req.hotelId).single();
    if (!channel) return res.status(404).json({ error: 'Canal no encontrado' });
    const creds = channel.credentials || {};
    let status = 'unknown', message = '';
    if (channel.channel_code === 'booking') {
      status = creds.hotel_code && creds.username ? 'configured' : 'missing_credentials';
      message = status === 'configured' ? 'Credenciales OK' : 'Faltan hotel_code / username / password';
    } else if (channel.channel_code === 'expedia') {
      status = creds.api_key && creds.expedia_hotel_id ? 'configured' : 'missing_credentials';
      message = status === 'configured' ? 'Credenciales OK' : 'Faltan api_key / expedia_hotel_id';
    } else if (channel.channel_code === 'airbnb') {
      if (creds.ical_url) {
        try { const r = await fetch(creds.ical_url, { method: 'HEAD' }); status = r.ok ? 'ok' : 'error'; message = r.ok ? 'URL iCal accesible' : 'URL iCal no accesible'; }
        catch { status = 'error'; message = 'URL iCal no accesible'; }
      } else { status = 'missing_credentials'; message = 'Falta ical_url'; }
    } else { status = 'not_implemented'; message = `Test no disponible para ${channel.channel_code}`; }
    res.json({ channel: channel.channel_name, status, message });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── WEBHOOKS PÚBLICOS (sin auth JWT) ────────────────────────

// POST /api/channels/webhook/booking
router.post('/webhook/booking', async (req, res) => {
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  try {
    const xmlBody = req.body?.toString() || '';
    const hotelCode = xmlBody.match(/HotelCode="([^"]+)"/)?.[1];
    if (!hotelCode) return res.send(buildErrorResponseXML('0', 'HotelCode missing'));
    const { data: channels } = await supabase.from('ota_channels').select('*').eq('channel_code', 'booking').eq('is_connected', true);
    const channel = (channels || []).find(c => c.credentials?.hotel_code === hotelCode);
    if (!channel) return res.send(buildErrorResponseXML('0', `Hotel ${hotelCode} not found`));
    const echoToken = xmlBody.match(/EchoToken="([^"]+)"/)?.[1] || Date.now().toString();
    const result = await processBookingReservation(channel.hotel_id, channel.id, xmlBody);
    if (result.action === 'created') triggerAvailabilityPush(channel.hotel_id, null).catch(console.error);
    res.send(buildSuccessResponseXML(echoToken));
  } catch (err) { res.send(buildErrorResponseXML('0', err.message)); }
});

// POST /api/channels/webhook/expedia
router.post('/webhook/expedia', async (req, res) => {
  try {
    const booking = req.body;
    const propertyId = String(booking?.propertyId || booking?.hotelId || '');
    const { data: channels } = await supabase.from('ota_channels').select('*').eq('channel_code', 'expedia').eq('is_connected', true);
    const channel = (channels || []).find(c => String(c.credentials?.expedia_hotel_id) === propertyId);
    if (!channel) return res.status(404).json({ error: 'Hotel not found' });
    const result = await processExpediaReservation(channel.hotel_id, channel.id, booking);
    if (result.action === 'created') triggerAvailabilityPush(channel.hotel_id, null).catch(console.error);
    res.json({ success: true, action: result.action });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/channels/webhook/airbnb
router.post('/webhook/airbnb', async (req, res) => {
  try {
    const { listing_id } = req.body;
    const { data: channels } = await supabase.from('ota_channels').select('*').eq('channel_code', 'airbnb').eq('is_connected', true);
    for (const ch of (channels || [])) {
      if (ch.credentials?.listing_id === listing_id) {
        syncAirbnbIcal(ch.hotel_id, ch.id, ch).catch(console.error);
        break;
      }
    }
    res.json({ received: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/channels/google-feed/:hotelId
router.get('/google-feed/:hotelId', async (req, res) => {
  try {
    const { data: roomTypes } = await supabase.from('room_types').select('*').eq('hotel_id', req.params.hotelId).eq('active', true);
    const items = (roomTypes || []).map(rt => `<listing><id>${rt.id}</id><name>${rt.name}</name><price currency="EUR">${rt.base_price}</price></listing>`).join('');
    res.setHeader('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0"?><listings hotel_id="${req.params.hotelId}" timestamp="${new Date().toISOString()}">${items}</listings>`);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
