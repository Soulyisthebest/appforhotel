const router = require('express').Router();
const { supabase } = require('../config');
const { auth, requireManager } = require('../middleware/auth');

/**
 * NIGHT AUDIT — el proceso más crítico del PMS hotelero
 * Se ejecuta cada noche (normalmente a las 23:59 o a demanda)
 * Hace 6 cosas esenciales:
 * 1. Marca no-shows automáticamente
 * 2. Postea cargos de habitación del día
 * 3. Avanza fechas de reservas en curso
 * 4. Calcula KPIs del día (ocupación, ADR, RevPAR)
 * 5. Guarda revenue_daily
 * 6. Genera informe del día
 */

// POST /api/night-audit/run
router.post('/run', auth, requireManager, async (req, res) => {
  const auditDate = req.body.date || new Date().toISOString().split('T')[0];
  const results = { date: auditDate, steps: [], errors: [], summary: {} };

  try {
    console.log(`[NIGHT AUDIT] Starting for ${auditDate} — hotel ${req.hotelId}`);

    // ── PASO 1: Marcar no-shows ──────────────────────────────
    const { data: noShows, error: nsErr } = await supabase.from('reservations')
      .update({ status: 'no_show', no_show_at: new Date() })
      .eq('hotel_id', req.hotelId)
      .eq('check_in_date', auditDate)
      .eq('status', 'confirmed')
      .select('id, reservation_number, guest_id');

    results.steps.push({ step: 'no_shows', count: noShows?.length || 0, status: nsErr ? 'error' : 'ok' });
    if (nsErr) results.errors.push(`No-shows: ${nsErr.message}`);

    // ── PASO 2: Obtener reservas en casa hoy ─────────────────
    const { data: inhouse } = await supabase.from('reservations')
      .select('id, room_id, room_rate, guest_id, folios(id)')
      .eq('hotel_id', req.hotelId)
      .eq('status', 'checked_in');

    // ── PASO 3: Postear cargo de habitación del día ──────────
    let chargesPosted = 0;
    const today = new Date(auditDate);

    for (const res of (inhouse || [])) {
      if (!res.folios?.[0]?.id || !res.room_rate) continue;

      // Check if room charge already posted today
      const { data: existing } = await supabase.from('folio_charges')
        .select('id').eq('folio_id', res.folios[0].id)
        .eq('charge_date', auditDate).eq('category', 'room').single();

      if (!existing) {
        await supabase.from('folio_charges').insert({
          folio_id: res.folios[0].id,
          hotel_id: req.hotelId,
          charge_date: auditDate,
          description: `Alojamiento ${today.toLocaleDateString('es-ES')}`,
          category: 'room',
          amount: res.room_rate,
          tax_rate: 10,
          tax_amount: res.room_rate * 0.10
        });
        chargesPosted++;
      }
    }
    results.steps.push({ step: 'room_charges', count: chargesPosted, status: 'ok' });

    // ── PASO 4: Calcular KPIs del día ────────────────────────
    const { data: allRooms } = await supabase.from('rooms')
      .select('id, status').eq('hotel_id', req.hotelId);

    const totalRooms = allRooms?.length || 0;
    const occupied = inhouse?.length || 0;
    const vacant = totalRooms - occupied;
    const occupancy_pct = totalRooms > 0 ? (occupied / totalRooms) * 100 : 0;

    const totalRevenue = inhouse?.reduce((s, r) => s + (r.room_rate || 0), 0) || 0;
    const adr = occupied > 0 ? totalRevenue / occupied : 0;
    const revpar = totalRooms > 0 ? totalRevenue / totalRooms : 0;

    // Count arrivals and departures
    const { count: arrivals } = await supabase.from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', req.hotelId).eq('check_in_date', auditDate).eq('status', 'checked_in');

    const { count: departures } = await supabase.from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', req.hotelId).eq('check_out_date', auditDate).eq('status', 'checked_out');

    // ── PASO 5: Guardar revenue_daily ────────────────────────
    const { error: rdErr } = await supabase.from('revenue_daily').upsert({
      hotel_id: req.hotelId,
      date: auditDate,
      rooms_available: totalRooms,
      rooms_occupied: occupied,
      rooms_vacant: vacant,
      occupancy_pct: Math.round(occupancy_pct * 10) / 10,
      adr: Math.round(adr * 100) / 100,
      revpar: Math.round(revpar * 100) / 100,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      room_revenue: Math.round(totalRevenue * 100) / 100,
      arrivals: arrivals || 0,
      departures: departures || 0,
      no_shows: noShows?.length || 0,
      updated_at: new Date()
    }, { onConflict: 'hotel_id,date' });

    results.steps.push({ step: 'revenue_daily', status: rdErr ? 'error' : 'ok' });
    if (rdErr) results.errors.push(`Revenue daily: ${rdErr.message}`);

    // ── PASO 6: Audit log ────────────────────────────────────
    await supabase.from('audit_log').insert({
      hotel_id: req.hotelId, staff_id: req.staff.id,
      action: 'NIGHT_AUDIT', entity_type: 'hotel',
      new_values: { date: auditDate, occupied, adr: adr.toFixed(2), revpar: revpar.toFixed(2) }
    });

    results.summary = {
      date: auditDate,
      rooms_total: totalRooms, rooms_occupied: occupied,
      occupancy_pct: occupancy_pct.toFixed(1) + '%',
      adr: adr.toFixed(2) + '€', revpar: revpar.toFixed(2) + '€',
      total_revenue: totalRevenue.toFixed(2) + '€',
      arrivals: arrivals || 0, departures: departures || 0,
      no_shows: noShows?.length || 0,
      charges_posted: chargesPosted,
      errors: results.errors.length
    };

    console.log(`[NIGHT AUDIT] Completed:`, results.summary);
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('[NIGHT AUDIT] Fatal error:', err.message);
    res.status(500).json({ error: err.message, partial_results: results });
  }
});

// GET /api/night-audit/status — check if night audit has run today
router.get('/status', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('revenue_daily')
      .select('*').eq('hotel_id', req.hotelId).eq('date', today).single();
    res.json({ ran_today: !!data, data: data || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/night-audit/history
router.get('/history', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('revenue_daily')
      .select('*').eq('hotel_id', req.hotelId)
      .order('date', { ascending: false }).limit(30);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
