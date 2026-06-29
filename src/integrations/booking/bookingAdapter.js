// ============================================================
// BOOKING.COM CONNECTIVITY ADAPTER
// Protocolo: XML Push (OTA_HotelResNotif_RQ)
// Docs: https://connect.booking.com/user_guide/site/en-US/
// ============================================================

const { supabase } = require('../../config');

// ── PARSE BOOKING XML RESERVATION ───────────────────────────
function parseBookingReservation(xmlBody) {
  // In production use a proper XML parser like 'fast-xml-parser'
  // This extracts the key fields from Booking.com OTA XML format
  const extract = (tag, text) => {
    const match = text.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
    return match ? match[1].trim() : null;
  };

  const extractAttr = (tag, attr, text) => {
    const match = text.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*>`));
    return match ? match[1].trim() : null;
  };

  return {
    channel_reservation_id: extract('UniqueID', xmlBody) || extractAttr('UniqueID', 'ID', xmlBody),
    reservation_type: extractAttr('ResStatus', 'ResStatus', xmlBody) || 'Committed',
    check_in_date: extractAttr('TimeSpan', 'Start', xmlBody),
    check_out_date: extractAttr('TimeSpan', 'End', xmlBody),
    adults: parseInt(extract('AdultCount', xmlBody) || '1'),
    children: parseInt(extract('ChildCount', xmlBody) || '0'),
    room_type_code: extractAttr('RoomType', 'RoomTypeCode', xmlBody),
    rate_plan_code: extractAttr('RatePlan', 'RatePlanCode', xmlBody),
    total_amount: parseFloat(extract('AmountAfterTax', xmlBody) || '0'),
    currency: extractAttr('Amounts', 'CurrencyCode', xmlBody) || 'EUR',
    guest_first: extract('GivenName', xmlBody),
    guest_last: extract('Surname', xmlBody),
    guest_email: extract('Email', xmlBody),
    guest_phone: extract('PhoneTechType', xmlBody),
    guest_nationality: extractAttr('CitizenCountryName', 'Code', xmlBody),
    special_requests: extract('SpecialRequest', xmlBody),
    commission_pct: 15,
    meal_plan: 'RO'
  };
}

// ── BUILD AVAILABILITY UPDATE XML (send to Booking) ─────────
function buildAvailabilityXML(hotelCode, roomTypeCode, dates, availability) {
  const rows = dates.map(d => `
    <AvailStatusMessage BookingLimit="${availability}" BookingLimitMessageType="SetLimit">
      <StatusApplicationControl Start="${d}" End="${d}" Mon="1" Tue="1" Weds="1" Thur="1" Fri="1" Sat="1" Sun="1"
        InvTypeCode="${roomTypeCode}" />
    </AvailStatusMessage>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelAvailNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
  EchoToken="${Date.now()}" TimeStamp="${new Date().toISOString()}"
  Target="Production" Version="2.001">
  <AvailStatusMessages HotelCode="${hotelCode}">
    ${rows}
  </AvailStatusMessages>
</OTA_HotelAvailNotifRQ>`;
}

// ── BUILD RATE UPDATE XML (send to Booking) ──────────────────
function buildRateXML(hotelCode, roomTypeCode, ratePlanCode, rates) {
  const rows = rates.map(r => `
    <RateAmount CurrencyCode="EUR" AgeQualifyingCode="10" Amount="${r.price}">
      <StatusApplicationControl Start="${r.date}" End="${r.date}"
        InvTypeCode="${roomTypeCode}" RatePlanCode="${ratePlanCode}" />
    </RateAmount>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelRateAmountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
  EchoToken="${Date.now()}" TimeStamp="${new Date().toISOString()}"
  Target="Production" Version="2.001">
  <RateAmountMessages HotelCode="${hotelCode}">
    ${rows}
  </RateAmountMessages>
</OTA_HotelRateAmountNotifRQ>`;
}

// ── BUILD SUCCESS RESPONSE XML ───────────────────────────────
function buildSuccessResponseXML(echoToken) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRS xmlns="http://www.opentravel.org/OTA/2003/05"
  EchoToken="${echoToken}" TimeStamp="${new Date().toISOString()}"
  Version="2.001">
  <Success/>
</OTA_HotelResNotifRS>`;
}

function buildErrorResponseXML(echoToken, message) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRS xmlns="http://www.opentravel.org/OTA/2003/05"
  EchoToken="${echoToken}" TimeStamp="${new Date().toISOString()}"
  Version="2.001">
  <Errors>
    <Error Type="3" Code="322" ShortText="${message}"/>
  </Errors>
</OTA_HotelResNotifRS>`;
}

// ── SEND AVAILABILITY TO BOOKING.COM ────────────────────────
async function sendAvailabilityToBooking(channel, roomTypeCode, dates, availability) {
  const creds = channel.credentials || {};
  if (!creds.endpoint || !creds.username || !creds.password) {
    throw new Error('Credenciales de Booking.com no configuradas');
  }

  const xml = buildAvailabilityXML(creds.hotel_code, roomTypeCode, dates, availability);

  const response = await fetch(creds.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'OTA_HotelAvailNotifRQ',
      'Authorization': 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64')
    },
    body: xml
  });

  const responseText = await response.text();
  return { ok: response.ok, status: response.status, body: responseText };
}

// ── SEND RATES TO BOOKING.COM ────────────────────────────────
async function sendRatesToBooking(channel, roomTypeCode, ratePlanCode, rates) {
  const creds = channel.credentials || {};
  if (!creds.endpoint || !creds.username || !creds.password) {
    throw new Error('Credenciales de Booking.com no configuradas');
  }

  const xml = buildRateXML(creds.hotel_code, roomTypeCode, ratePlanCode, rates);

  const response = await fetch(creds.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'OTA_HotelRateAmountNotifRQ',
      'Authorization': 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64')
    },
    body: xml
  });

  return { ok: response.ok, status: response.status };
}

// ── PROCESS INCOMING BOOKING RESERVATION ────────────────────
async function processBookingReservation(hotelId, channelId, xmlBody) {
  const parsed = parseBookingReservation(xmlBody);

  if (!parsed.channel_reservation_id) {
    throw new Error('No se pudo extraer el ID de reserva del XML');
  }

  // Check for duplicate
  const { data: existing } = await supabase.from('reservations')
    .select('id, reservation_number, status')
    .eq('hotel_id', hotelId)
    .eq('channel_reservation_id', parsed.channel_reservation_id)
    .single();

  // Handle cancellation
  if (parsed.reservation_type === 'Cancel' || parsed.reservation_type === 'Cancelled') {
    if (existing) {
      await supabase.from('reservations').update({
        status: 'cancelled',
        cancelled_at: new Date(),
        cancellation_reason: 'Cancelada desde Booking.com'
      }).eq('id', existing.id);
      return { action: 'cancelled', reservation_id: existing.id };
    }
    return { action: 'cancel_not_found' };
  }

  // Handle modification
  if (existing && parsed.reservation_type === 'Committed') {
    await supabase.from('reservations').update({
      check_in_date: parsed.check_in_date,
      check_out_date: parsed.check_out_date,
      adults: parsed.adults,
      total_amount: parsed.total_amount
    }).eq('id', existing.id);
    return { action: 'modified', reservation_id: existing.id };
  }

  // Find or create guest
  let guestId;
  if (parsed.guest_email) {
    const { data: existingGuest } = await supabase.from('guests')
      .select('id').eq('hotel_id', hotelId).eq('email', parsed.guest_email).single();
    if (existingGuest) {
      guestId = existingGuest.id;
    }
  }

  if (!guestId && (parsed.guest_first || parsed.guest_last)) {
    const { data: newGuest } = await supabase.from('guests').insert({
      hotel_id: hotelId,
      first_name: parsed.guest_first || 'Huésped',
      last_name: parsed.guest_last || 'Booking',
      email: parsed.guest_email,
      phone: parsed.guest_phone,
      nationality: parsed.guest_nationality
    }).select('id').single();
    guestId = newGuest?.id;
  }

  // Find room type by channel mapping
  const { data: mapping } = await supabase.from('channel_room_mapping')
    .select('room_type_id')
    .eq('channel_id', channelId)
    .eq('channel_room_code', parsed.room_type_code)
    .single();

  const nights = Math.ceil(
    (new Date(parsed.check_out_date) - new Date(parsed.check_in_date)) / 86400000
  );

  // Create reservation
  const { data: reservation, error } = await supabase.from('reservations').insert({
    hotel_id: hotelId,
    channel_id: channelId,
    channel_reservation_id: parsed.channel_reservation_id,
    guest_id: guestId,
    room_type_id: mapping?.room_type_id || null,
    check_in_date: parsed.check_in_date,
    check_out_date: parsed.check_out_date,
    adults: parsed.adults,
    children: parsed.children,
    meal_plan: parsed.meal_plan,
    room_rate: nights > 0 ? parsed.total_amount / nights : parsed.total_amount,
    total_room: parsed.total_amount,
    total_amount: parsed.total_amount,
    amount_pending: parsed.total_amount,
    currency: parsed.currency,
    special_requests: parsed.special_requests,
    status: 'confirmed',
    source: 'booking_com'
  }).select().single();

  if (error) throw error;

  // Create folio
  await supabase.from('folios').insert({
    hotel_id: hotelId,
    reservation_id: reservation.id,
    guest_id: guestId,
    folio_number: `FOL-${reservation.reservation_number}`
  });

  // Log sync
  await supabase.from('channel_sync_log').insert({
    hotel_id: hotelId,
    channel_id: channelId,
    sync_type: 'reservation',
    status: 'success',
    message: `Reserva ${parsed.channel_reservation_id} recibida desde Booking.com`,
    payload: { parsed }
  });

  return { action: 'created', reservation_id: reservation.id, reservation_number: reservation.reservation_number };
}

module.exports = {
  parseBookingReservation,
  buildAvailabilityXML,
  buildRateXML,
  buildSuccessResponseXML,
  buildErrorResponseXML,
  sendAvailabilityToBooking,
  sendRatesToBooking,
  processBookingReservation
};
