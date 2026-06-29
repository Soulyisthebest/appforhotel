# 🏨 HotelOS PMS

Sistema de gestión hotelera completo — SaaS multi-tenant.
**Un solo repositorio · Un solo servicio Railway · Frontend + Backend unificados.**

---

## Arquitectura

```
hotelospms/
├── src/               ← Backend Express (API)
│   ├── index.js       ← Entry point — sirve API + frontend compilado
│   ├── middleware/
│   ├── routes/        ← 19 módulos de API
│   └── config.js      ← Supabase client
├── client/            ← Frontend React (Vite)
│   ├── src/
│   └── dist/          ← Generado por 'npm run build' (Railway lo hace auto)
├── docs/
│   └── schema.sql     ← 45 tablas PostgreSQL
├── package.json       ← Scripts: build + start
└── railway.toml       ← Configuración Railway
```

**En producción (Railway):**
- `npm run build` → compila React en `client/dist/`
- `node src/index.js` → Express sirve la API en `/api/*` y el frontend en `/*`
- **Una sola URL** para todo

---

## 🚀 Deploy en Railway (5 minutos)

### Paso 1 — Subir a GitHub
```bash
git init
git add .
git commit -m "HotelOS PMS — initial deploy"
git branch -M main
git remote add origin https://github.com/TUUSUARIO/hotelospms.git
git push -u origin main
```

### Paso 2 — Crear proyecto en Railway
1. Ve a [railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** → selecciona `hotelospms`
3. Railway detecta automáticamente el `railway.toml`

### Paso 3 — Variables de entorno en Railway
En tu proyecto Railway → **Variables** → añade:

```
SUPABASE_URL          = https://neplhhfuktyqlijecnrk.supabase.co
SUPABASE_ANON_KEY     = eyJhbGci...  (tu anon key)
SUPABASE_SERVICE_KEY  = eyJhbGci...  (tu service role key)
JWT_SECRET            = una_cadena_muy_larga_aleatoria_aqui
NODE_ENV              = production
STRIPE_SECRET_KEY     = sk_live_...  (opcional para pagos)
```

### Paso 4 — Deploy automático
Railway hace automáticamente:
1. `npm install` (instala dependencias backend)
2. `npm run build` → `cd client && npm install && npm run build`
3. `node src/index.js` (arranca Express)

Tu PMS estará online en: `https://hotelospms-production.up.railway.app`

---

## 💻 Desarrollo local

```bash
# Terminal 1 — Backend
npm install
cp .env.example .env   # rellenar con tus claves
npm run dev:server     # puerto 3001

# Terminal 2 — Frontend
cd client
npm install
npm run dev:client     # puerto 5173 (proxy → 3001)
```

Abre `http://localhost:5173` — el frontend se conecta al backend automáticamente.

---

## 📊 Base de datos

El schema ya está ejecutado en tu Supabase.
Si necesitas reinstalar: `docs/schema.sql` → SQL Editor de Supabase → Run.

**45 tablas:** hotels, rooms, room_types, floors, rate_plans, rates, seasons,
reservations, guests, guest_documents, companies, folios, folio_charges,
payments, invoices, payment_gateways, payment_methods, ota_channels,
channel_room_mapping, channel_rate_mapping, channel_sync_log,
housekeeping_assignments, maintenance_tickets, maintenance_comments,
staff, staff_shifts, notifications, internal_messages, concierge_requests,
amenities, minibar_items, minibar_consumption, parking_spaces, lost_found,
reviews, revenue_daily, onboarding_guides, onboarding_progress,
audit_log, subscriptions, import_jobs, booking_engine_settings,
promo_codes, hotel_settings

---

## 🔑 API endpoints

| Módulo | Base URL |
|---|---|
| Auth | `POST /api/auth/login` |
| Dashboard | `GET /api/dashboard` |
| Habitaciones | `GET/POST/PUT /api/rooms` |
| Rack | `GET /api/rooms/rack` |
| Reservas | `GET/POST/PUT/DELETE /api/reservations` |
| Check-in | `POST /api/checkin/:id` |
| Check-out | `POST /api/checkout/:id` |
| Huéspedes | `GET/POST/PUT /api/guests` |
| Folios | `GET /api/folios/:id` |
| Pagos | `GET/POST /api/payments` |
| Housekeeping | `GET/POST/PATCH /api/housekeeping` |
| Mantenimiento | `GET/POST/PATCH /api/maintenance` |
| Canales OTA | `GET/POST/PUT /api/channels` |
| Tarifas | `GET/POST /api/rates` |
| Informes | `GET /api/reports/occupancy` |
| Personal | `GET/POST/PUT /api/staff` |
| Notificaciones | `GET /api/notifications` |
| Importación | `POST /api/import/start` |
| Motor reservas | `GET /api/booking-engine/settings` |

---

## 💳 Pasarelas de pago soportadas
Saferpay · Redsys · Stripe · Adyen · PayComet · Datatrans ·
PayPal · Mollie · SumUp · Square · Viva Wallet · Efectivo · Transferencia

## 🌐 Canales OTA soportados
Booking.com · Expedia · Airbnb · TripAdvisor · Google Hotel Ads ·
Hotelbeds · Vrbo · Agoda · Despegar · HRS · Trip.com

---

HotelOS PMS © 2026
