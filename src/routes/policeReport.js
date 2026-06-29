const router = require('express').Router();
const { supabase } = require('../config');
const { auth, requireManager } = require('../middleware/auth');

/**
 * PARTE DE VIAJEROS — Obligatorio en España
 * Ley Orgánica 4/2015, Real Decreto 933/2021
 * Obligación: comunicar datos de cada huésped a la Guardia Civil/Policía
 * en las 24 horas siguientes al check-in
 * Sistema: SES.HOSPEDAJES (desde enero 2023)
 */

// GET /api/police-report/pending — guests checked in but not reported
router.get('/pending', auth, async (req, res) => {
  try {
    const since = new Date();
    since.setHours(since.getHours() - 24);

    const { data, error } = await supabase.from('guest_documents')
      .select(`*,
        guests(first_name, last_name, nationality, date_of_birth, document_type, document_number),
        reservations!inner(reservation_number, check_in_date, actual_check_in, rooms(room_number))
      `)
      .eq('hotel_id', req.hotelId)
      .is('reported_to_police_at', null)
      .gte('created_at', since.toISOString())
      .order('created_at');
    if (error) throw error;
    res.json({ pending: data?.length || 0, guests: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/police-report/generate — generate daily report file (CSV for SES.HOSPEDAJES)
router.get('/generate', auth, requireManager, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const { data: hotel } = await supabase.from('hotels').select('name, tax_id, address').eq('id', req.hotelId).single();

    const { data: checkins } = await supabase.from('reservations')
      .select(`
        reservation_number, check_in_date, actual_check_in,
        adults, rooms(room_number),
        guests(first_name, last_name, date_of_birth, nationality,
               document_type, document_number, document_expiry, gender, address)
      `)
      .eq('hotel_id', req.hotelId)
      .eq('check_in_date', date)
      .eq('status', 'checked_in');

    // Generate CSV in SES.HOSPEDAJES format
    const rows = (checkins || []).map(c => {
      const g = c.guests;
      return [
        hotel.tax_id || '',           // CIF establecimiento
        hotel.name || '',             // Nombre establecimiento
        c.rooms?.room_number || '',   // Número habitación
        c.reservation_number || '',   // Localizador
        g?.document_type || '',       // Tipo documento
        g?.document_number || '',     // Número documento
        g?.last_name || '',           // Primer apellido
        g?.first_name || '',          // Nombre
        g?.date_of_birth || '',       // Fecha nacimiento
        g?.gender || '',              // Sexo
        g?.nationality || '',         // Nacionalidad
        date,                         // Fecha entrada
        c.actual_check_in || ''       // Hora entrada
      ].join(';');
    });

    const header = 'CIF;ESTABLECIMIENTO;HAB;LOCALIZADOR;TIPO_DOC;NUM_DOC;APELLIDO;NOMBRE;NACIMIENTO;SEXO;NACIONALIDAD;FECHA_ENTRADA;HORA_ENTRADA';
    const csv = [header, ...rows].join('\n');

    // Mark as reported
    if (checkins?.length > 0) {
      const guestIds = checkins.map(c => c.guests?.document_number).filter(Boolean);
      await supabase.from('audit_log').insert({
        hotel_id: req.hotelId, staff_id: req.staff.id,
        action: 'POLICE_REPORT_GENERATED', entity_type: 'hotel',
        new_values: { date, count: checkins.length, generated_at: new Date() }
      });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="parte_viajeros_${date}.csv"`);
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/police-report/history — past reports
router.get('/history', auth, requireManager, async (req, res) => {
  try {
    const { data, error } = await supabase.from('audit_log')
      .select('*').eq('hotel_id', req.hotelId).eq('action', 'POLICE_REPORT_GENERATED')
      .order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
