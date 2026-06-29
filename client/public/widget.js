// ============================================================
// HOTELOSPMS BOOKING WIDGET
// El hotel pega este script en su web y aparece el motor de reservas
// Compatible con WordPress, Wix, Squarespace, HTML puro
// ============================================================

(function() {
  'use strict';

  // Get config from script tag attributes
  const script = document.currentScript || document.querySelector('script[data-hotel]');
  const CONFIG = {
    hotelId: script?.getAttribute('data-hotel') || '',
    lang: script?.getAttribute('data-lang') || 'es',
    color: script?.getAttribute('data-color') || '#1a2640',
    apiBase: script?.getAttribute('data-api') || window.location.origin,
    currency: script?.getAttribute('data-currency') || 'EUR'
  };

  if (!CONFIG.hotelId) {
    console.error('[HotelOS Widget] data-hotel attribute is required');
    return;
  }

  // ── TRANSLATIONS ─────────────────────────────────────────
  const T = {
    es: {
      title: 'Reservar habitación',
      checkin: 'Llegada', checkout: 'Salida', adults: 'Adultos',
      children: 'Niños', search: 'Ver disponibilidad',
      available: 'disponible', from: 'Desde',
      night: 'noche', nights: 'noches', total: 'Total',
      book: 'Reservar ahora', back: '← Volver',
      name: 'Nombre completo', email: 'Email', phone: 'Teléfono',
      confirm: 'Confirmar reserva', booking_for: 'Reservando:',
      success_title: '¡Reserva confirmada!',
      success_msg: 'Recibirás la confirmación en tu email.',
      localizador: 'Tu localizador:',
      no_rooms: 'No hay habitaciones disponibles para estas fechas.',
      loading: 'Buscando disponibilidad...',
      processing: 'Procesando reserva...',
      select_dates: 'Selecciona las fechas de tu estancia',
      required: 'Campo obligatorio'
    },
    en: {
      title: 'Book a room', checkin: 'Check-in', checkout: 'Check-out',
      adults: 'Adults', children: 'Children', search: 'Check availability',
      available: 'available', from: 'From', night: 'night', nights: 'nights',
      total: 'Total', book: 'Book now', back: '← Back',
      name: 'Full name', email: 'Email', phone: 'Phone',
      confirm: 'Confirm booking', booking_for: 'Booking:',
      success_title: 'Booking confirmed!', success_msg: 'Check your email for confirmation.',
      localizador: 'Your booking reference:', no_rooms: 'No rooms available for these dates.',
      loading: 'Checking availability...', processing: 'Processing...',
      select_dates: 'Select your stay dates', required: 'Required field'
    },
    fr: {
      title: 'Réserver une chambre', checkin: 'Arrivée', checkout: 'Départ',
      adults: 'Adultes', children: 'Enfants', search: 'Vérifier disponibilité',
      available: 'disponible', from: 'À partir de', night: 'nuit', nights: 'nuits',
      total: 'Total', book: 'Réserver maintenant', back: '← Retour',
      name: 'Nom complet', email: 'Email', phone: 'Téléphone',
      confirm: 'Confirmer la réservation', booking_for: 'Réservation:',
      success_title: 'Réservation confirmée!', success_msg: 'Vous recevrez une confirmation par email.',
      localizador: 'Votre référence:', no_rooms: 'Aucune chambre disponible pour ces dates.',
      loading: 'Vérification...', processing: 'Traitement...',
      select_dates: 'Sélectionnez les dates de votre séjour', required: 'Champ obligatoire'
    },
    ar: {
      title: 'احجز غرفة', checkin: 'تسجيل الوصول', checkout: 'تسجيل المغادرة',
      adults: 'البالغين', children: 'الأطفال', search: 'تحقق من التوفر',
      available: 'متاح', from: 'من', night: 'ليلة', nights: 'ليالي',
      total: 'المجموع', book: 'احجز الآن', back: '→ رجوع',
      name: 'الاسم الكامل', email: 'البريد الإلكتروني', phone: 'الهاتف',
      confirm: 'تأكيد الحجز', booking_for: 'حجز:',
      success_title: 'تم تأكيد الحجز!', success_msg: 'ستتلقى تأكيداً على بريدك الإلكتروني.',
      localizador: 'رقم الحجز:', no_rooms: 'لا توجد غرف متاحة لهذه التواريخ.',
      loading: 'جارٍ البحث...', processing: 'جارٍ المعالجة...',
      select_dates: 'اختر تواريخ إقامتك', required: 'حقل مطلوب'
    }
  };

  const t = T[CONFIG.lang] || T.es;
  const isRTL = CONFIG.lang === 'ar';

  // ── STYLES ───────────────────────────────────────────────
  const styles = `
    #hotelospms-widget * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #hotelospms-widget { max-width: 680px; margin: 0 auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.12); border: 1px solid #e2e6ea; direction: ${isRTL ? 'rtl' : 'ltr'}; }
    .hw-header { background: ${CONFIG.color}; padding: 20px 24px; color: #fff; }
    .hw-header h2 { font-size: 18px; font-weight: 500; margin: 0; }
    .hw-header p { font-size: 13px; opacity: .7; margin: 4px 0 0; }
    .hw-body { background: #fff; padding: 20px 24px; }
    .hw-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 14px; }
    .hw-field { display: flex; flex-direction: column; gap: 4px; }
    .hw-label { font-size: 11px; font-weight: 500; color: #8892a0; text-transform: uppercase; letter-spacing: .5px; }
    .hw-input { border: 1.5px solid #e2e6ea; border-radius: 8px; padding: 9px 12px; font-size: 14px; outline: none; width: 100%; background: #fafafa; transition: border-color .15s; }
    .hw-input:focus { border-color: ${CONFIG.color}; background: #fff; }
    .hw-btn { width: 100%; background: ${CONFIG.color}; color: #fff; border: none; border-radius: 8px; padding: 13px; font-size: 15px; font-weight: 500; cursor: pointer; transition: opacity .15s; }
    .hw-btn:hover { opacity: .9; }
    .hw-btn:disabled { opacity: .5; cursor: not-allowed; }
    .hw-rooms { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
    .hw-room { border: 1.5px solid #e2e6ea; border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: border-color .15s; }
    .hw-room:hover { border-color: ${CONFIG.color}; }
    .hw-room.selected { border-color: ${CONFIG.color}; background: ${CONFIG.color}10; }
    .hw-room-name { font-size: 14px; font-weight: 500; color: #1a2035; }
    .hw-room-desc { font-size: 12px; color: #8892a0; margin-top: 2px; }
    .hw-room-price { text-align: right; }
    .hw-room-from { font-size: 11px; color: #8892a0; }
    .hw-room-amount { font-size: 20px; font-weight: 500; color: ${CONFIG.color}; }
    .hw-room-total { font-size: 11px; color: #8892a0; }
    .hw-success { text-align: center; padding: 30px 20px; }
    .hw-success-icon { font-size: 48px; margin-bottom: 12px; }
    .hw-success-title { font-size: 20px; font-weight: 500; color: #2d8a4e; margin-bottom: 8px; }
    .hw-success-ref { font-size: 24px; font-weight: 600; color: ${CONFIG.color}; background: #f0f2f5; padding: 8px 20px; border-radius: 8px; display: inline-block; margin: 10px 0; letter-spacing: 2px; }
    .hw-success-msg { font-size: 13px; color: #8892a0; }
    .hw-error { background: #fce4ec; border: 1px solid #f48fb1; border-radius: 8px; padding: 10px 14px; color: #c62828; font-size: 13px; margin-bottom: 12px; }
    .hw-loading { text-align: center; padding: 30px; color: #8892a0; font-size: 14px; }
    .hw-back { background: none; border: none; color: ${CONFIG.color}; cursor: pointer; font-size: 13px; margin-bottom: 12px; padding: 0; }
    .hw-summary { background: #f8f9fa; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; font-size: 13px; }
    .hw-summary-row { display: flex; justify-content: space-between; padding: 4px 0; color: #555; }
    .hw-summary-total { display: flex; justify-content: space-between; font-size: 16px; font-weight: 500; color: #1a2035; border-top: 1px solid #e2e6ea; margin-top: 6px; padding-top: 8px; }
    .hw-steps { display: flex; gap: 4px; margin-bottom: 16px; }
    .hw-step { flex: 1; height: 3px; border-radius: 2px; background: #e2e6ea; }
    .hw-step.active { background: ${CONFIG.color}; }
    @media (max-width: 480px) { .hw-grid { grid-template-columns: 1fr 1fr; } .hw-body { padding: 16px; } }
  `;

  // ── STATE ────────────────────────────────────────────────
  let state = {
    step: 1, // 1=dates, 2=rooms, 3=guest, 4=success
    checkIn: '', checkOut: '', adults: 2, children: 0,
    rooms: [], selectedRoom: null,
    nights: 0, loading: false, error: '',
    guest: { name: '', email: '', phone: '' },
    confirmation: null
  };

  // ── RENDER ───────────────────────────────────────────────
  function render() {
    const container = document.getElementById('hotelospms-booking');
    if (!container) return;

    const steps = `<div class="hw-steps">
      <div class="hw-step ${state.step >= 1 ? 'active' : ''}"></div>
      <div class="hw-step ${state.step >= 2 ? 'active' : ''}"></div>
      <div class="hw-step ${state.step >= 3 ? 'active' : ''}"></div>
      <div class="hw-step ${state.step >= 4 ? 'active' : ''}"></div>
    </div>`;

    let body = '';

    if (state.step === 1) {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      body = `
        ${steps}
        <p style="font-size:13px;color:#8892a0;margin-bottom:14px">${t.select_dates}</p>
        <div class="hw-grid">
          <div class="hw-field" style="grid-column:span 2">
            <label class="hw-label">${t.checkin}</label>
            <input type="date" class="hw-input" id="hw-checkin" value="${state.checkIn || today}" min="${today}">
          </div>
          <div class="hw-field" style="grid-column:span 2">
            <label class="hw-label">${t.checkout}</label>
            <input type="date" class="hw-input" id="hw-checkout" value="${state.checkOut || tomorrow}" min="${tomorrow}">
          </div>
          <div class="hw-field" style="grid-column:span 2">
            <label class="hw-label">${t.adults}</label>
            <select class="hw-input" id="hw-adults">
              ${[1,2,3,4,5,6].map(n => `<option ${state.adults==n?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="hw-field" style="grid-column:span 2">
            <label class="hw-label">${t.children}</label>
            <select class="hw-input" id="hw-children">
              ${[0,1,2,3,4].map(n => `<option ${state.children==n?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
        </div>
        ${state.error ? `<div class="hw-error">${state.error}</div>` : ''}
        <button class="hw-btn" onclick="HotelOSWidget.searchRooms()">${t.search}</button>`;

    } else if (state.step === 2) {
      if (state.loading) {
        body = `${steps}<div class="hw-loading">⏳ ${t.loading}</div>`;
      } else if (state.rooms.length === 0) {
        body = `${steps}<button class="hw-back" onclick="HotelOSWidget.goStep(1)">${t.back}</button>
          <div class="hw-error">${t.no_rooms}</div>`;
      } else {
        body = `${steps}
          <button class="hw-back" onclick="HotelOSWidget.goStep(1)">${t.back}</button>
          <div class="hw-rooms">
            ${state.rooms.map(r => `
              <div class="hw-room ${state.selectedRoom?.id===r.id?'selected':''}" onclick="HotelOSWidget.selectRoom('${r.id}')">
                <div>
                  <div class="hw-room-name">${r.name}</div>
                  <div class="hw-room-desc">Max ${r.max_adults} adultos · ${r.units_available} ${t.available}</div>
                </div>
                <div class="hw-room-price">
                  <div class="hw-room-from">${t.from}</div>
                  <div class="hw-room-amount">${r.price_per_night}€</div>
                  <div class="hw-room-total">${t.total}: ${r.total_price}€</div>
                </div>
              </div>`).join('')}
          </div>
          <button class="hw-btn" onclick="HotelOSWidget.goStep(3)" ${!state.selectedRoom?'disabled':''}>${t.book}</button>`;
      }

    } else if (state.step === 3) {
      const r = state.selectedRoom;
      body = `${steps}
        <button class="hw-back" onclick="HotelOSWidget.goStep(2)">${t.back}</button>
        <div class="hw-summary">
          <div class="hw-summary-row"><span>${t.booking_for}</span><span><b>${r?.name}</b></span></div>
          <div class="hw-summary-row"><span>${t.checkin}</span><span>${state.checkIn}</span></div>
          <div class="hw-summary-row"><span>${t.checkout}</span><span>${state.checkOut}</span></div>
          <div class="hw-summary-row"><span>${state.nights} ${state.nights===1?t.night:t.nights} × ${r?.price_per_night}€</span></div>
          <div class="hw-summary-total"><span>${t.total}</span><span>${r?.total_price}€</span></div>
        </div>
        <div class="hw-grid">
          <div class="hw-field" style="grid-column:span 4">
            <label class="hw-label">${t.name}</label>
            <input type="text" class="hw-input" id="hw-name" value="${state.guest.name}" placeholder="${t.name}">
          </div>
          <div class="hw-field" style="grid-column:span 2">
            <label class="hw-label">${t.email}</label>
            <input type="email" class="hw-input" id="hw-email" value="${state.guest.email}" placeholder="email@ejemplo.com">
          </div>
          <div class="hw-field" style="grid-column:span 2">
            <label class="hw-label">${t.phone}</label>
            <input type="tel" class="hw-input" id="hw-phone" value="${state.guest.phone}" placeholder="+34 600 000 000">
          </div>
        </div>
        ${state.error ? `<div class="hw-error">${state.error}</div>` : ''}
        <button class="hw-btn" onclick="HotelOSWidget.confirmBooking()" ${state.loading?'disabled':''}>
          ${state.loading ? t.processing : t.confirm}
        </button>`;

    } else if (state.step === 4) {
      body = `<div class="hw-success">
        <div class="hw-success-icon">✅</div>
        <div class="hw-success-title">${t.success_title}</div>
        <div>${t.localizador}</div>
        <div class="hw-success-ref">${state.confirmation?.reservation_number || ''}</div>
        <div class="hw-success-msg">${t.success_msg}</div>
      </div>`;
    }

    container.innerHTML = `
      <div id="hotelospms-widget">
        <div class="hw-header">
          <h2>🏨 ${t.title}</h2>
        </div>
        <div class="hw-body">${body}</div>
      </div>`;
  }

  // ── WIDGET API ───────────────────────────────────────────
  window.HotelOSWidget = {
    goStep: (step) => { state.step = step; state.error = ''; render(); },

    searchRooms: async () => {
      const ci = document.getElementById('hw-checkin')?.value;
      const co = document.getElementById('hw-checkout')?.value;
      const adults = parseInt(document.getElementById('hw-adults')?.value || '2');
      const children = parseInt(document.getElementById('hw-children')?.value || '0');

      if (!ci || !co || ci >= co) {
        state.error = 'Las fechas no son válidas'; render(); return;
      }

      state.checkIn = ci; state.checkOut = co;
      state.adults = adults; state.children = children;
      state.nights = Math.ceil((new Date(co) - new Date(ci)) / 86400000);
      state.step = 2; state.loading = true; state.error = '';
      render();

      try {
        const url = `${CONFIG.apiBase}/api/booking-engine/public/${CONFIG.hotelId}/availability?check_in=${ci}&check_out=${co}&adults=${adults}`;
        const response = await fetch(url);
        const data = await response.json();
        state.rooms = (data.available || []).map(r => ({
          ...r,
          price_per_night: r.price_per_night || r.base_price || 0,
          total_price: r.total_price || (r.base_price * state.nights)
        }));
      } catch (err) {
        state.error = 'Error al cargar disponibilidad';
      }
      state.loading = false; render();
    },

    selectRoom: (id) => {
      state.selectedRoom = state.rooms.find(r => r.id === id) || null;
      render();
    },

    confirmBooking: async () => {
      const name = document.getElementById('hw-name')?.value?.trim();
      const email = document.getElementById('hw-email')?.value?.trim();
      const phone = document.getElementById('hw-phone')?.value?.trim();

      if (!name || !email) { state.error = t.required; render(); return; }

      state.guest = { name, email, phone };
      state.loading = true; state.error = ''; render();

      try {
        const nameParts = name.split(' ');
        const response = await fetch(`${CONFIG.apiBase}/api/booking-engine/public/${CONFIG.hotelId}/book`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_type_id: state.selectedRoom.id,
            check_in_date: state.checkIn,
            check_out_date: state.checkOut,
            adults: state.adults,
            children: state.children,
            guest_first_name: nameParts[0],
            guest_last_name: nameParts.slice(1).join(' ') || '',
            guest_email: email,
            guest_phone: phone,
            meal_plan: 'RO'
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al procesar la reserva');

        state.confirmation = data;
        state.step = 4;
      } catch (err) {
        state.error = err.message;
      }
      state.loading = false; render();
    }
  };

  // ── INJECT STYLES AND INIT ───────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

})();
