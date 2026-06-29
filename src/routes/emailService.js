const router = require('express').Router();
const { supabase } = require('../config');
const { auth } = require('../middleware/auth');
const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// POST /api/email/reservation-confirmation
router.post('/reservation-confirmation', auth, async (req, res) => {
  try {
    const { reservation_id } = req.body;
    const { data: res_ } = await supabase.from('reservations')
      .select('*, guests(first_name, last_name, email), rooms(room_number), room_types(name), rate_plans(name, meal_plan)')
      .eq('id', reservation_id).eq('hotel_id', req.hotelId).single();

    if (!res_) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!res_.guests?.email) return res.status(400).json({ error: 'El huésped no tiene email registrado' });

    const { data: hotel } = await supabase.from('hotels')
      .select('name, email, phone, address').eq('id', req.hotelId).single();

    const { data: settings } = await supabase.from('hotel_settings')
      .select('tax_config').eq('hotel_id', req.hotelId).single();

    const mealPlanMap = { RO: 'Solo alojamiento', BB: 'Alojamiento y desayuno', HB: 'Media pensión', FB: 'Pensión completa', AI: 'Todo incluido' };

    const html = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
<div style="background:#1a2640;padding:20px;border-radius:5px 5px 0 0;text-align:center">
  <h1 style="color:#d4a843;margin:0;font-size:22px">🏨 ${hotel?.name}</h1>
  <p style="color:#a8b4c4;margin:8px 0 0;font-size:13px">Confirmación de reserva</p>
</div>
<div style="background:#fff;border:1px solid #e2e6ea;padding:24px;border-radius:0 0 5px 5px">
  <p style="font-size:15px">Estimado/a <b>${res_.guests.first_name} ${res_.guests.last_name}</b>,</p>
  <p>Le confirmamos su reserva en <b>${hotel?.name}</b>. A continuación encontrará los detalles de su estancia:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#f0f2f5"><td style="padding:8px 12px;font-weight:bold;width:40%">Localizador</td><td style="padding:8px 12px"><b style="color:#1a2640;font-size:16px">${res_.reservation_number}</b></td></tr>
    <tr><td style="padding:8px 12px;font-weight:bold">Check-in</td><td style="padding:8px 12px">${new Date(res_.check_in_date).toLocaleDateString('es-ES', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}</td></tr>
    <tr style="background:#f0f2f5"><td style="padding:8px 12px;font-weight:bold">Check-out</td><td style="padding:8px 12px">${new Date(res_.check_out_date).toLocaleDateString('es-ES', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:bold">Noches</td><td style="padding:8px 12px">${res_.nights}</td></tr>
    <tr style="background:#f0f2f5"><td style="padding:8px 12px;font-weight:bold">Habitación</td><td style="padding:8px 12px">${res_.room_types?.name || '—'}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:bold">Régimen</td><td style="padding:8px 12px">${mealPlanMap[res_.meal_plan] || res_.meal_plan}</td></tr>
    <tr style="background:#f0f2f5"><td style="padding:8px 12px;font-weight:bold">Adultos</td><td style="padding:8px 12px">${res_.adults}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:bold;color:#1a2640">Total</td><td style="padding:8px 12px;font-weight:bold;color:#1a2640;font-size:16px">${res_.total_amount}€</td></tr>
  </table>
  <div style="background:#e8f5e9;border-left:4px solid #2d8a4e;padding:12px;border-radius:3px;margin:16px 0">
    <p style="margin:0;font-size:13px"><b>📋 Información importante:</b><br>
    Hora de entrada: ${hotel?.check_in_time || '15:00'} h · Hora de salida: ${hotel?.check_out_time || '11:00'} h<br>
    Le pediremos un documento de identidad válido en recepción.</p>
  </div>
  <p style="font-size:12px;color:#8892a0;margin-top:20px">
    Para cancelaciones o modificaciones contacte con nosotros:<br>
    📧 ${hotel?.email || ''} · 📞 ${hotel?.phone || ''}<br>
    📍 ${hotel?.address || ''}
  </p>
</div>
</body></html>`;

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"${hotel?.name}" <${process.env.SMTP_USER}>`,
        to: res_.guests.email,
        subject: `✅ Confirmación reserva ${res_.reservation_number} — ${hotel?.name}`,
        html
      });
    }

    await supabase.from('audit_log').insert({
      hotel_id: req.hotelId, staff_id: req.staff.id,
      action: 'EMAIL_SENT', entity_type: 'reservation', entity_id: reservation_id,
      new_values: { type: 'confirmation', to: res_.guests.email }
    });

    res.json({ success: true, message: `Email de confirmación enviado a ${res_.guests.email}`, html_preview: html });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/email/checkout-invoice
router.post('/checkout-invoice', auth, async (req, res) => {
  try {
    const { reservation_id, invoice_id } = req.body;
    const { data: res_ } = await supabase.from('reservations')
      .select('*, guests(first_name, last_name, email)').eq('id', reservation_id).eq('hotel_id', req.hotelId).single();
    if (!res_?.guests?.email) return res.status(400).json({ error: 'Sin email para el huésped' });

    const { data: hotel } = await supabase.from('hotels').select('name, email').eq('id', req.hotelId).single();
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"${hotel?.name}" <${process.env.SMTP_USER}>`,
        to: res_.guests.email,
        subject: `Factura / Check-out — ${hotel?.name} — ${res_.reservation_number}`,
        text: `Estimado/a ${res_.guests.first_name},\n\nGracias por su estancia en ${hotel?.name}.\nEsperamos haberle tenido como huésped y le invitamos a volver pronto.\n\nLocalizador: ${res_.reservation_number}\n\nAtentamente,\n${hotel?.name}`
      });
    }
    res.json({ success: true, sent_to: res_.guests.email });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
