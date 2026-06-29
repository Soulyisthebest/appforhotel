// ============================================================
// AIRBNB ADAPTER
// Opción A: iCal sync (disponible inmediatamente)
// Opción B: Airbnb API for Software Partners (requiere aprobación)
// ============================================================

const { supabase } = require('../../config');

// ── PARSE ICAL ───────────────────────────────────────────────
function parseIcal(icalText) {
  const events = [];
  const blocks = icalText.split('BEGIN:VEVENT');
  blocks.shift(); // remove header

  for (const block of blocks) {
    const get = (prop) => {
      const match = block.match(new RegExp(`${prop}[^:]*:(.+)`));
      return match ? match[1].replace(/\r/g, '').trim() : null;
    };

    const parseIcalDate = (dateStr) => {
      if (!dateStr) return null;
      // YYYYMMDD or YYYYMMDDTHHMMSSZ
      const clean = dateStr.replace('T', '').replace('Z', '');
      return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}`;
    };

    const summary = get('SUMMARY');
    const dtstart = parseIcalDate(get('DTSTART'));
    const dtend = parseIcalDate(get('DTEND'));
    const uid = get('UID');
    const description = get('DESCRIPTION');
    const status = get('STATUS');

    if (summary && dtstart && dtend) {
      events.push({
        uid, summary, dtstart, dtend, description,
        status: status || 'CONFIRMED',
        is_reservation: summary !== 'Airbnb (Not available)' && !summary.includes('Unavailable'),
        is_blocked: summary === 'Airbnb (Not available)' || summary.includes('Unavailable')
      });
    }
  }
  return events;
}

// ── FETCH AND SYNC ICAL ──────────────────────────────────────
async function syncAirbnbIcal(hotelId, channelId, channel) {
  const creds = channel.credentials || {};
  const icalUrl = creds.ical_url;
  if (!icalUrl) throw new Error('URL iCal de Airbnb no configurada');

  // Fetch iCal
  const response = await fetch(icalUrl);
  if (!response.ok) throw new Error(`No se pudo obtener el iCal de Airbnb: ${response.status}`);
  const icalText = await response.text();

  const events = parseIcal(icalText);
  let created = 0, updated = 0, skipped = 0;

  for (const event of events) {
    if (!event.is_reservation || !event.dtstart || !event.dtend) {
      skipped++;
      continue;
    }

    // Check for existing
    const { data: existing } = await supabase.from('reservations')
      .select('id, status').eq('hotel_id', hotelId)
      .eq('channel_reservation_id', event.uid).single();

    if (event.status === 'CANCELLED') {
      if (existing) {
        await supabase.from('reservations').update({
          status: 'cancelled', cancelled_at: new Date(),
          cancellation_reason: 'Cancelada desde Airbnb'
        }).eq('id', existing.id);
        updated++;
      }
      continue;
    }

    if (existing) { skipped++; continue; }

    // Extract guest name from summary (Airbnb format: "FirstName LastName (CONFIRMED)")
    const nameParts = event.summary.replace(/\s*\([^)]*\)\s*/g, '').trim().split(' ');
    const firstName = nameParts[0] || 'Huésped';
    const lastName = nameParts.slice(1).join(' ') || 'Airbnb';

    const nights = Math.ceil(
      (new Date(event.dtend) - new Date(event.dtstart)) / 86400000
    );

    // Find room from channel mapping or use first available
    const { data: mappings } = await supabase.from('channel_room_mapping')
      .select('room_type_id').eq('channel_id', channelId).limit(1);
    const roomTypeId = mappings?.[0]?.room_type_id || null;

    // Get base price
    let roomRate = 0;
    if (roomTypeId) {
      const { data: rt } = await supabase.from('room_types')
        .select('base_price').eq('id', roomTypeId).single();
      roomRate = rt?.base_price || 0;
    }

    // Create guest
    const { data: guest } = await supabase.from('guests').insert({
      hotel_id: hotelId, first_name: firstName, last_name: lastName
    }).select('id').single();

    // Create reservation
    const { data: reservation, error } = await supabase.from('reservations').insert({
      hotel_id: hotelId, channel_id: channelId,
      channel_reservation_id: event.uid,
      guest_id: guest?.id, room_type_id: roomTypeId,
      check_in_date: event.dtstart, check_out_date: event.dtend,
      adults: 1, room_rate: roomRate,
      total_room: roomRate * nights, total_amount: roomRate * nights,
      amount_pending: roomRate * nights,
      special_requests: event.description,
      status: 'confirmed', source: 'airbnb'
    }).select().single();

    if (!error && reservation) {
      await supabase.from('folios').insert({
        hotel_id: hotelId, reservation_id: reservation.id,
        guest_id: guest?.id,
        folio_number: `FOL-${reservation.reservation_number}`
      });
      created++;
    }
  }

  await supabase.from('channel_sync_log').insert({
    hotel_id: hotelId, channel_id: channelId,
    sync_type: 'reservation', status: 'success',
    message: `iCal Airbnb: ${created} creadas, ${updated} actualizadas, ${skipped} ignoradas`,
    payload: { created, updated, skipped, total_events: events.length }
  });

  await supabase.from('ota_channels').update({ last_synced_at: new Date(), sync_status: 'idle' })
    .eq('id', channelId);

  return { created, updated, skipped, total: events.length };
}

// ── GENERATE ICAL FOR AIRBNB (export our calendar) ──────────
async function generateIcalForChannel(hotelId, roomTypeId) {
  const { data: reservations } = await supabase.from('reservations')
    .select('*, guests(first_name, last_name)')
    .eq('hotel_id', hotelId)
    .not('status', 'in', '("cancelled","no_show")')
    .not('check_out_date', 'lt', new Date().toISOString().split('T')[0])
    .order('check_in_date');

  const toIcalDate = (d) => d.replace(/-/g, '');

  const events = (reservations || []).map(r => `BEGIN:VEVENT
UID:hotelospms-${r.id}
DTSTART;VALUE=DATE:${toIcalDate(r.check_in_date)}
DTEND;VALUE=DATE:${toIcalDate(r.check_out_date)}
SUMMARY:${r.guests?.first_name || 'Huésped'} ${r.guests?.last_name || ''} (${r.reservation_number})
STATUS:CONFIRMED
CREATED:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
END:VEVENT`).join('\n');

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//HotelOS PMS//ES
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:HotelOS Reservations
${events}
END:VCALENDAR`;
}

module.exports = { syncAirbnbIcal, generateIcalForChannel, parseIcal };
