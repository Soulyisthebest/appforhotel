const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');

// GET /api/dashboard
router.get('/', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const hotelId = req.hotelId;

    const [
      roomStats, arrivals, departures, inhouse,
      maintenance, revenue, recentPayments
    ] = await Promise.all([
      supabase.from('rooms').select('status, housekeeping_status').eq('hotel_id', hotelId),
      supabase.from('reservations').select('id', { count: 'exact', head: true })
        .eq('hotel_id', hotelId).eq('check_in_date', today).eq('status', 'confirmed'),
      supabase.from('reservations').select('id', { count: 'exact', head: true })
        .eq('hotel_id', hotelId).eq('check_out_date', today).eq('status', 'checked_in'),
      supabase.from('reservations').select('room_rate', { count: 'exact' })
        .eq('hotel_id', hotelId).eq('status', 'checked_in'),
      supabase.from('maintenance_tickets').select('priority, status').eq('hotel_id', hotelId)
        .in('status', ['open', 'assigned', 'in_progress']),
      supabase.from('revenue_daily').select('*').eq('hotel_id', hotelId).eq('date', today).single(),
      supabase.from('payments').select('amount, method_code, created_at')
        .eq('hotel_id', hotelId).eq('status', 'captured').gte('created_at', today).order('created_at', { ascending: false }).limit(10)
    ]);

    const rooms = roomStats.data || [];
    const totalRooms = rooms.length;
    const occupied = rooms.filter(r => r.status === 'occupied').length;
    const vacant = rooms.filter(r => r.status === 'vacant').length;
    const maintenance_count = rooms.filter(r => r.status === 'maintenance').length;
    const dirty = rooms.filter(r => r.housekeeping_status === 'dirty').length;

    const inhouseData = inhouse.data || [];
    const adr = inhouseData.length > 0
      ? inhouseData.reduce((s, r) => s + (r.room_rate || 0), 0) / inhouseData.length
      : 0;
    const revpar = totalRooms > 0 ? (adr * occupied) / totalRooms : 0;

    const todayRevenue = (recentPayments.data || []).reduce((s, p) => s + p.amount, 0);

    res.json({
      date: today,
      rooms: { total: totalRooms, occupied, vacant, maintenance: maintenance_count, dirty },
      occupancy_pct: totalRooms > 0 ? ((occupied / totalRooms) * 100).toFixed(1) : 0,
      adr: adr.toFixed(2),
      revpar: revpar.toFixed(2),
      arrivals: arrivals.count || 0,
      departures: departures.count || 0,
      inhouse: inhouse.count || 0,
      maintenance_open: (maintenance.data || []).filter(t => t.status !== 'closed').length,
      maintenance_urgent: (maintenance.data || []).filter(t => t.priority === 'urgent').length,
      today_revenue: todayRevenue.toFixed(2),
      recent_payments: recentPayments.data || []
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
