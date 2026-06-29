const jwt = require('jsonwebtoken');
const { supabase } = require('../config');

// BUG 5 FIX: correct join syntax for staff → hotels
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get staff with hotel data using correct FK relationship
    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, first_name, last_name, email, role, department, hotel_id, language, active, pin_code')
      .eq('id', decoded.staffId)
      .eq('active', true)
      .single();

    if (error || !staff) return res.status(401).json({ error: 'Token inválido o usuario inactivo' });

    // Get hotel separately (avoids ambiguous join)
    const { data: hotel } = await supabase
      .from('hotels')
      .select('id, name, currency, timezone, locale, check_in_time, check_out_time')
      .eq('id', staff.hotel_id)
      .single();

    req.staff = staff;
    req.hotel = hotel;
    req.hotelId = staff.hotel_id;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Sesión expirada, vuelve a iniciar sesión' });
    return res.status(401).json({ error: 'Token inválido' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.staff?.role)) {
    return res.status(403).json({ error: 'No tienes permisos para esta acción' });
  }
  next();
};

const requireManager = requireRole(
  'general_manager', 'front_desk_manager', 'housekeeping_manager',
  'maintenance_manager', 'fnb_manager', 'revenue_manager', 'admin', 'superadmin'
);

module.exports = { auth, requireRole, requireManager };
