// ============================================================
// EXPEDIA GROUP CONNECTIVITY ADAPTER (EQC API)
// Protocolo: REST + JSON
// Cubre: Expedia, Hotels.com, Vrbo, Orbitz, Travelocity
// Docs: https://developers.expediagroup.com/
// ============================================================

const { supabase } = require('../../config');

const EXPEDIA_API_BASE = 'https://services.expediapartnercentral.com';

// ── EXPEDIA AUTH HEADERS ─────────────────────────────────────
function getExpediaHeaders(credentials) {
  const { api_key, api_secret } = credentials;
  if (!api_key || !api_secret) throw new Error('Credenciales Expedia no configuradas');
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`${api_key}:${api_secret}`).toString('base64'),
    'Accept': 'application/json'
  };
}

// ── SEND AVAILABILITY TO EXPEDIA ─────────────────────────────
async function sendAvailabilityToExpedia(channel, roomTypeCode, dates, availability) {
  const creds = channel.credentials || {};
  const hotelId = creds.expedia_hotel_id;
  if (!hotelId) throw new Error('Expedia Hotel ID no configurado');

  const payload = {
    type: 'roomTypeAvailabilities',
    entity: {
      roomTypeId: roomTypeCode,
      dates: dates.map(d => ({
        date: d,
        isOpen: availability > 0,
        roomAvailable: availability,
        restrictions: {
          minLengthOfStay: 1,
          maxLengthOfStay: 28
        }
      }))
    }
  };

  const response = await fetch(
    `${EXPEDIA_API_BASE}/products/v3/properties/${hotelId}/roomTypes/${roomTypeCode}/availabilities`,
    {
      method: 'PUT',
      headers: getExpediaHeaders(creds),
      body: JSON.stringify(payload)
    }
  );

  return { ok: response.ok, status: response.status };
}

// ── SEND RATES TO EXPEDIA ────────────────────────────────────
async function sendRatesToExpedia(channel, roomTypeCode, ratePlanCode, rates) {
  const creds = channel.credentials || {};
  const hotelId = creds.expedia_hotel_id;

  const payload = {
    type: 'rateSchedules',
    entity: rates.map(r => ({
      startDate: r.date,
      endDate: r.date,
      rates: [{
        rateId: ratePlanCode,
        currency: 'EUR',
        minAmount: r.price * 0.85,
        maxAmount: r.price * 1.20,
        baseRate: r.price
      }]
    }))
  };

  const response = await fetch(
    `${EXPEDIA_API_BASE}/products/v3/properties/${hotelId}/roomTypes/${roomTypeCode}/ratePlans/${ratePlanCode}/priceSchedules`,
    {
      method: 'PUT',
      headers: getExpediaHeaders(creds),
      body: JSON.stringify(payload)
    }
  );

  return { ok: response.ok, status: response.status };
}

// ── FETCH EXPEDIA RESERVATIONS ───────────────────────────────
async function fetchExpediaReservations(channel) {
  const creds = channel.credentials || {};
  const hotelId = creds.expedia_hotel_id;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const response = await fetch(
    `${EXPEDIA_API_BASE}/bookings/v2/bookings?propertyId=${hotelId}&createdSince=${since}&status=pending`,
    { headers: getExpediaHeaders(creds) }
  );

  if (!response.ok) throw new Error(`Expedia API error: ${response.status}`);
  const data = await response.json();
  return data.entities || [];
}

// ── PROCESS EXPEDIA RESERVATION ──────────────────────────────
async function processExpediaReservation(hotelId, channelId, booking) {
  const reservationId = booking.bookingId || booking.id;

  // Check duplicate
  const { data: existing } = await supabase.from('reservations')
    .select('id').eq('hotel_id', hotelId).eq('channel_reservation_id', String(reservationId)).single();

  if (existing) return { action: 'duplicate', reservation_id: existing.id };

  // Handle cancellation
  if (booking.status === 'canceled' || booking.status === 'cancelled') {
    if (existing) {
      await supabase.from('reservations').update({
        status: 'cancelled', cancelled_at: new Date(),
        cancellation_reason: 'Cancelada desde Expedia'
      }).eq('id', existing.id);
      return { action: 'cancelled', reservation_id: existing.id };
    }
    return { action: 'cancel_not_found' };
  }

  const primaryGuest = booking.primaryGuest || booking.guests?.[0] || {};
  const stay = booking.stayDetails || {};
  const rate = booking.pricing || {};

  // Find or create guest
  let guestId;
  if (primaryGuest.email) {
    const { data: existingGuest } = await supabase.from('guests')
      .select('id').eq('hotel_id', hotelId).eq('email', primaryGuest.email).single();
    if (existingGuest) guestId = existingGuest.id;
  }

  if (!guestId) {
    const { data: newGuest } = await supabase.from('guests').insert({
      hotel_id: hotelId,
      first_name: primaryGuest.firstName || primaryGuest.givenName || 'Huésped',
      last_name: primaryGuest.lastName || primaryGuest.surname || 'Expedia',
      email: primaryGuest.email,
      phone: primaryGuest.phone
    }).select('id').single();
    guestId = newGuest?.id;
  }

  // Map room type
  const roomTypeCode = String(stay.roomTypeId || booking.roomTypeId || '');
  const { data: mapping } = await supabase.from('channel_room_mapping')
    .select('room_type_id').eq('channel_id', channelId).eq('channel_room_code', roomTypeCode).single();

  const checkIn = stay.checkInDate || booking.checkInDate;
  const checkOut = stay.checkOutDate || booking.checkOutDate;
  const nights = checkIn && checkOut
    ? Math.ceil((new Date(checkOut) - new Date(checkIn)) / 86400000) : 1;
  const totalAmount = rate.totalAmountAfterTax || rate.baseRate || 0;

  const { data: reservation, error } = await supabase.from('reservations').insert({
    hotel_id: hotelId,
    channel_id: channelId,
    channel_reservation_id: String(reservationId),
    guest_id: guestId,
    room_type_id: mapping?.room_type_id || null,
    check_in_date: checkIn,
    check_out_date: checkOut,
    adults: stay.numberOfAdults || booking.adults || 1,
    children: stay.numberOfChildren || booking.children || 0,
    room_rate: nights > 0 ? totalAmount / nights : totalAmount,
    total_room: totalAmount,
    total_amount: totalAmount,
    amount_pending: totalAmount,
    currency: rate.currency || 'EUR',
    status: 'confirmed',
    source: 'expedia'
  }).select().single();

  if (error) throw error;

  // Confirm to Expedia
  await confirmExpediaReservation(channelId, reservationId, reservation, hotelId);

  // Create folio
  await supabase.from('folios').insert({
    hotel_id: hotelId, reservation_id: reservation.id,
    guest_id: guestId,
    folio_number: `FOL-${reservation.reservation_number}`
  });

  await supabase.from('channel_sync_log').insert({
    hotel_id: hotelId, channel_id: channelId,
    sync_type: 'reservation', status: 'success',
    message: `Reserva ${reservationId} recibida desde Expedia`
  });

  return { action: 'created', reservation_id: reservation.id };
}

// ── CONFIRM RESERVATION TO EXPEDIA ───────────────────────────
async function confirmExpediaReservation(channelId, expediaBookingId, reservation, hotelId) {
  try {
    const { data: channel } = await supabase.from('ota_channels')
      .select('credentials').eq('id', channelId).single();
    if (!channel) return;

    await fetch(
      `${EXPEDIA_API_BASE}/bookings/v2/bookings/${expediaBookingId}/confirm`,
      {
        method: 'PUT',
        headers: getExpediaHeaders(channel.credentials || {}),
        body: JSON.stringify({
          confirmationCode: reservation.reservation_number,
          confirmationStatus: 'CONFIRMED'
        })
      }
    );
  } catch (err) {
    console.error('[Expedia] Confirmation failed:', err.message);
  }
}

module.exports = {
  sendAvailabilityToExpedia,
  sendRatesToExpedia,
  fetchExpediaReservations,
  processExpediaReservation,
  confirmExpediaReservation
};
