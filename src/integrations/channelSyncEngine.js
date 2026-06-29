// ============================================================
// CHANNEL SYNC ENGINE
// Orquesta la sincronización automática con todas las OTAs
// Se ejecuta cada 5 minutos via setInterval
// ============================================================

const { supabase } = require('../../config');
const { processBookingReservation, sendAvailabilityToBooking, sendRatesToBooking } = require('./booking/bookingAdapter');
const { fetchExpediaReservations, processExpediaReservation, sendAvailabilityToExpedia, sendRatesToExpedia } = require('./expedia/expediaAdapter');
const { syncAirbnbIcal } = require('./airbnb/airbnbAdapter');

// ── MAIN SYNC FUNCTION ───────────────────────────────────────
async function syncAllChannels() {
  console.log('[ChannelSync] Starting sync cycle...');

  try {
    const { data: channels } = await supabase.from('ota_channels')
      .select('*').eq('is_connected', true);

    if (!channels || channels.length === 0) {
      console.log('[ChannelSync] No connected channels found');
      return;
    }

    for (const channel of channels) {
      try {
        await syncChannel(channel);
      } catch (err) {
        console.error(`[ChannelSync] Error syncing ${channel.channel_code}:`, err.message);
        await supabase.from('channel_sync_log').insert({
          hotel_id: channel.hotel_id, channel_id: channel.id,
          sync_type: 'reservation', status: 'error',
          message: err.message
        });
      }
    }
  } catch (err) {
    console.error('[ChannelSync] Fatal error:', err.message);
  }
}

async function syncChannel(channel) {
  const { channel_code, hotel_id, id: channelId } = channel;

  switch (channel_code) {
    case 'expedia':
      await syncExpedia(channel, hotel_id, channelId);
      break;
    case 'airbnb':
      await syncAirbnb(channel, hotel_id, channelId);
      break;
    case 'booking':
      // Booking is push-based (they send to us via webhook)
      // We just sync availability/rates TO Booking periodically
      await syncAvailabilityToBooking(channel, hotel_id, channelId);
      break;
    case 'tripadvisor':
    case 'google':
    case 'hotelbeds':
      // Future adapters — log as pending
      console.log(`[ChannelSync] ${channel_code} sync not yet implemented`);
      break;
    default:
      console.log(`[ChannelSync] Unknown channel: ${channel_code}`);
  }

  await supabase.from('ota_channels')
    .update({ last_synced_at: new Date(), sync_status: 'idle' })
    .eq('id', channelId);
}

// ── SYNC EXPEDIA (pull reservations) ────────────────────────
async function syncExpedia(channel, hotelId, channelId) {
  console.log(`[ChannelSync] Syncing Expedia for hotel ${hotelId}`);
  const reservations = await fetchExpediaReservations(channel);
  let processed = 0;
  for (const booking of reservations) {
    try {
      await processExpediaReservation(hotelId, channelId, booking);
      processed++;
    } catch (err) {
      console.error(`[ChannelSync] Expedia reservation error:`, err.message);
    }
  }
  console.log(`[ChannelSync] Expedia: processed ${processed} reservations`);
}

// ── SYNC AIRBNB (pull iCal) ──────────────────────────────────
async function syncAirbnb(channel, hotelId, channelId) {
  console.log(`[ChannelSync] Syncing Airbnb iCal for hotel ${hotelId}`);
  const result = await syncAirbnbIcal(hotelId, channelId, channel);
  console.log(`[ChannelSync] Airbnb: created=${result.created} updated=${result.updated}`);
}

// ── PUSH AVAILABILITY TO BOOKING.COM ────────────────────────
async function syncAvailabilityToBooking(channel, hotelId, channelId) {
  const creds = channel.credentials || {};
  if (!creds.hotel_code) return; // Not configured yet

  // Get current availability for next 90 days
  const today = new Date();
  const dates = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // Get room types with channel mapping
  const { data: mappings } = await supabase.from('channel_room_mapping')
    .select('*, room_types(id, code)')
    .eq('channel_id', channelId);

  for (const mapping of (mappings || [])) {
    try {
      // Count occupied for each date
      const { data: occupied } = await supabase.from('reservations')
        .select('room_type_id')
        .eq('hotel_id', hotelId)
        .eq('room_type_id', mapping.room_type_id)
        .not('status', 'in', '("cancelled","checked_out","no_show")')
        .gte('check_out_date', dates[0])
        .lte('check_in_date', dates[dates.length - 1]);

      // Get total rooms of this type
      const { count: totalRooms } = await supabase.from('rooms')
        .select('id', { count: 'exact', head: true })
        .eq('hotel_id', hotelId)
        .eq('room_type_id', mapping.room_type_id)
        .not('status', 'in', '("maintenance","blocked")');

      const available = Math.max(0, (totalRooms || 0) - (occupied?.length || 0));

      await sendAvailabilityToBooking(channel, mapping.channel_room_code, dates, available);
    } catch (err) {
      console.error(`[ChannelSync] Booking availability error for ${mapping.channel_room_code}:`, err.message);
    }
  }
}

// ── TRIGGER AVAILABILITY PUSH (called after check-in/checkout/reservation) ──
async function triggerAvailabilityPush(hotelId, roomTypeId) {
  try {
    const { data: channels } = await supabase.from('ota_channels')
      .select('*').eq('hotel_id', hotelId).eq('is_connected', true);

    for (const channel of (channels || [])) {
      const { data: mapping } = await supabase.from('channel_room_mapping')
        .select('channel_room_code').eq('channel_id', channel.id)
        .eq('room_type_id', roomTypeId).single();
      if (!mapping) continue;

      const today = new Date();
      const dates = Array.from({ length: 90 }, (_, i) => {
        const d = new Date(today); d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
      });

      const { count: totalRooms } = await supabase.from('rooms')
        .select('id', { count: 'exact', head: true })
        .eq('hotel_id', hotelId).eq('room_type_id', roomTypeId)
        .not('status', 'in', '("maintenance","blocked","occupied")');

      const available = totalRooms || 0;

      if (channel.channel_code === 'booking') {
        await sendAvailabilityToBooking(channel, mapping.channel_room_code, dates, available);
      } else if (channel.channel_code === 'expedia') {
        await sendAvailabilityToExpedia(channel, mapping.channel_room_code, dates, available);
      }
    }
  } catch (err) {
    console.error('[ChannelSync] Availability push error:', err.message);
  }
}

// ── START AUTO SYNC ──────────────────────────────────────────
function startAutoSync(intervalMinutes = 5) {
  console.log(`[ChannelSync] Auto-sync started — every ${intervalMinutes} minutes`);
  setInterval(syncAllChannels, intervalMinutes * 60 * 1000);
  // Run immediately on startup
  setTimeout(syncAllChannels, 5000);
}

module.exports = { syncAllChannels, syncChannel, triggerAvailabilityPush, startAutoSync };
