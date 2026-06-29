const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { supabase, supabaseAnon } = require('../config');
const { auth } = require('../middleware/auth');

// POST /api/auth/login — email + password
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    // Step 1: Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
      email: email.toLowerCase().trim(), password
    });
    if (authError) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    // Step 2: Get staff profile linked to this auth user
    const { data: staff, error: staffError } = await supabase.from('staff')
      .select('*').eq('auth_user_id', authData.user.id).eq('active', true).single();

    if (staffError || !staff) {
      // Fallback: find by email (for staff not yet linked to auth)
      const { data: staffByEmail } = await supabase.from('staff')
        .select('*').eq('email', email.toLowerCase().trim()).eq('active', true).single();
      if (!staffByEmail) return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });

      const token = jwt.sign(
        { staffId: staffByEmail.id, hotelId: staffByEmail.hotel_id, role: staffByEmail.role },
        process.env.JWT_SECRET, { expiresIn: '12h' }
      );
      const { data: hotel } = await supabase.from('hotels').select('*').eq('id', staffByEmail.hotel_id).single();
      return res.json({ token, staff: sanitizeStaff(staffByEmail), hotel });
    }

    const token = jwt.sign(
      { staffId: staff.id, hotelId: staff.hotel_id, role: staff.role },
      process.env.JWT_SECRET, { expiresIn: '12h' }
    );
    const { data: hotel } = await supabase.from('hotels').select('*').eq('id', staff.hotel_id).single();
    res.json({ token, staff: sanitizeStaff(staff), hotel });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/pin-login — PIN for front desk staff
router.post('/pin-login', async (req, res) => {
  try {
    const { pin_code, hotel_id } = req.body;
    if (!pin_code || !hotel_id) return res.status(400).json({ error: 'PIN y hotel_id requeridos' });
    if (pin_code.length < 4) return res.status(400).json({ error: 'PIN debe tener al menos 4 dígitos' });

    const { data: staff, error } = await supabase.from('staff')
      .select('*').eq('pin_code', pin_code).eq('hotel_id', hotel_id).eq('active', true).single();
    if (error || !staff) return res.status(401).json({ error: 'PIN incorrecto' });

    const token = jwt.sign(
      { staffId: staff.id, hotelId: staff.hotel_id, role: staff.role },
      process.env.JWT_SECRET, { expiresIn: '8h' }
    );
    res.json({ token, staff: sanitizeStaff(staff) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  res.json({ staff: req.staff, hotel: req.hotel });
});

// POST /api/auth/refresh
router.post('/refresh', auth, async (req, res) => {
  const token = jwt.sign(
    { staffId: req.staff.id, hotelId: req.staff.hotel_id, role: req.staff.role },
    process.env.JWT_SECRET, { expiresIn: '12h' }
  );
  res.json({ token });
});

// POST /api/auth/register-staff — create staff + Supabase Auth user
router.post('/register-staff', auth, async (req, res) => {
  try {
    const { email, password, first_name, last_name, role, department, pin_code, language } = req.body;
    if (!email || !password || !first_name || !last_name || !role)
      return res.status(400).json({ error: 'Campos obligatorios: email, password, nombre, apellido, rol' });

    // Create Supabase Auth user
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(), password, email_confirm: true
    });
    if (authErr) return res.status(400).json({ error: `Error creando usuario: ${authErr.message}` });

    // Create staff record
    const { data: staff, error: staffErr } = await supabase.from('staff').insert({
      hotel_id: req.hotelId,
      auth_user_id: authUser.user.id,
      email: email.toLowerCase().trim(),
      first_name, last_name, role, department,
      pin_code, language: language || 'es', active: true
    }).select().single();

    if (staffErr) {
      // Rollback auth user if staff creation fails
      await supabase.auth.admin.deleteUser(authUser.user.id);
      throw staffErr;
    }

    res.status(201).json({ staff: sanitizeStaff(staff) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 8)
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });

    const { error } = await supabase.auth.admin.updateUserById(
      req.staff.auth_user_id, { password: new_password }
    );
    if (error) throw error;
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function sanitizeStaff(staff) {
  const { pin_code, auth_user_id, ...safe } = staff;
  return safe;
}

module.exports = router;
