-- ============================================================
-- HOTELOSMS — SCHEMA COMPLETO PostgreSQL / Supabase
-- 45 tablas · Multi-tenant · RLS activado
-- ============================================================

-- ─── EXTENSIONES ───────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- 1. HOTELS (tenant raíz)
-- ============================================================
CREATE TABLE IF NOT EXISTS hotels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  legal_name      TEXT,
  tax_id          TEXT,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  city            TEXT,
  country         TEXT DEFAULT 'ES',
  postal_code     TEXT,
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  website         TEXT,
  logo_url        TEXT,
  currency        TEXT DEFAULT 'EUR',
  timezone        TEXT DEFAULT 'Europe/Madrid',
  locale          TEXT DEFAULT 'es',
  check_in_time   TIME DEFAULT '15:00',
  check_out_time  TIME DEFAULT '11:00',
  total_rooms     INT DEFAULT 0,
  stars           SMALLINT CHECK (stars BETWEEN 1 AND 5),
  active          BOOLEAN DEFAULT TRUE,
  subscription_plan TEXT DEFAULT 'starter' CHECK (subscription_plan IN ('starter','professional','enterprise')),
  subscription_status TEXT DEFAULT 'active',
  stripe_customer_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. STAFF / USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  auth_user_id    UUID UNIQUE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  role            TEXT NOT NULL CHECK (role IN (
                    'general_manager','front_desk_manager','receptionist',
                    'housekeeper','housekeeping_manager','maintenance',
                    'maintenance_manager','fnb_manager','accountant',
                    'revenue_manager','admin','superadmin')),
  department      TEXT,
  pin_code        TEXT,
  language        TEXT DEFAULT 'es',
  avatar_url      TEXT,
  active          BOOLEAN DEFAULT TRUE,
  hired_at        DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. ROOM TYPES
-- ============================================================
CREATE TABLE IF NOT EXISTS room_types (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  max_adults      SMALLINT DEFAULT 2,
  max_children    SMALLINT DEFAULT 0,
  max_occupancy   SMALLINT DEFAULT 2,
  base_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  size_sqm        NUMERIC(6,1),
  bed_type        TEXT,
  amenities       JSONB DEFAULT '[]',
  images          JSONB DEFAULT '[]',
  active          BOOLEAN DEFAULT TRUE,
  sort_order      SMALLINT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, code)
);

-- ============================================================
-- 4. FLOORS
-- ============================================================
CREATE TABLE IF NOT EXISTS floors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  floor_number    SMALLINT NOT NULL,
  name            TEXT,
  sort_order      SMALLINT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, floor_number)
);

-- ============================================================
-- 5. ROOMS
-- ============================================================
CREATE TABLE IF NOT EXISTS rooms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  floor_id        UUID REFERENCES floors(id),
  room_type_id    UUID REFERENCES room_types(id),
  room_number     TEXT NOT NULL,
  name            TEXT,
  status          TEXT DEFAULT 'vacant' CHECK (status IN (
                    'vacant','occupied','check_in_today','check_out_today',
                    'maintenance','blocked','cleaning')),
  housekeeping_status TEXT DEFAULT 'clean' CHECK (housekeeping_status IN (
                    'clean','dirty','inspected','out_of_service','do_not_disturb')),
  is_smoking      BOOLEAN DEFAULT FALSE,
  is_accessible   BOOLEAN DEFAULT FALSE,
  floor_number    SMALLINT,
  notes           TEXT,
  last_cleaned_at TIMESTAMPTZ,
  last_inspected_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, room_number)
);

-- ============================================================
-- 6. RATE PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  meal_plan       TEXT DEFAULT 'RO' CHECK (meal_plan IN ('RO','BB','HB','FB','AI')),
  is_refundable   BOOLEAN DEFAULT TRUE,
  cancellation_policy TEXT,
  advance_purchase_days INT DEFAULT 0,
  min_stay        SMALLINT DEFAULT 1,
  max_stay        SMALLINT,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, code)
);

-- ============================================================
-- 7. SEASONS
-- ============================================================
CREATE TABLE IF NOT EXISTS seasons (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  multiplier      NUMERIC(4,2) DEFAULT 1.00,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. RATES (tarifas por tipo·plan·fecha)
-- ============================================================
CREATE TABLE IF NOT EXISTS rates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id    UUID REFERENCES room_types(id) ON DELETE CASCADE,
  rate_plan_id    UUID REFERENCES rate_plans(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  price           NUMERIC(10,2) NOT NULL,
  availability    SMALLINT DEFAULT 0,
  min_stay        SMALLINT DEFAULT 1,
  closed_to_arrival    BOOLEAN DEFAULT FALSE,
  closed_to_departure  BOOLEAN DEFAULT FALSE,
  stop_sell       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, room_type_id, rate_plan_id, date)
);

-- ============================================================
-- 9. OTA CHANNELS
-- ============================================================
CREATE TABLE IF NOT EXISTS ota_channels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  channel_code    TEXT NOT NULL,
  channel_name    TEXT NOT NULL,
  api_type        TEXT DEFAULT 'xml' CHECK (api_type IN ('xml','rest','ical','manual')),
  credentials     JSONB DEFAULT '{}',
  commission_pct  NUMERIC(5,2) DEFAULT 0,
  is_connected    BOOLEAN DEFAULT FALSE,
  sync_interval_minutes SMALLINT DEFAULT 15,
  last_synced_at  TIMESTAMPTZ,
  sync_status     TEXT DEFAULT 'idle',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, channel_code)
);

-- ============================================================
-- 10. CHANNEL ROOM MAPPING
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_room_mapping (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  channel_id      UUID REFERENCES ota_channels(id) ON DELETE CASCADE,
  room_type_id    UUID REFERENCES room_types(id) ON DELETE CASCADE,
  channel_room_code TEXT NOT NULL,
  channel_room_name TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 11. CHANNEL RATE MAPPING
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_rate_mapping (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  channel_id      UUID REFERENCES ota_channels(id) ON DELETE CASCADE,
  rate_plan_id    UUID REFERENCES rate_plans(id) ON DELETE CASCADE,
  channel_rate_code TEXT NOT NULL,
  markup_pct      NUMERIC(5,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 12. GUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS guests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  nationality     TEXT,
  country_of_birth TEXT,
  document_type   TEXT CHECK (document_type IN ('passport','dni','nie','residence_permit','other')),
  document_number TEXT,
  document_expiry DATE,
  date_of_birth   DATE,
  gender          TEXT CHECK (gender IN ('male','female','other','unknown')),
  address         TEXT,
  city            TEXT,
  country         TEXT,
  postal_code     TEXT,
  language        TEXT DEFAULT 'es',
  vip_level       TEXT DEFAULT 'standard' CHECK (vip_level IN ('standard','silver','gold','platinum','vip')),
  notes           TEXT,
  allergies       TEXT,
  preferences     JSONB DEFAULT '{}',
  marketing_consent BOOLEAN DEFAULT FALSE,
  total_stays     INT DEFAULT 0,
  total_revenue   NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 13. GUEST DOCUMENTS (scan pasaporte)
-- ============================================================
CREATE TABLE IF NOT EXISTS guest_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guest_id        UUID REFERENCES guests(id) ON DELETE CASCADE,
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  document_type   TEXT,
  document_number TEXT,
  issued_by       TEXT,
  issue_date      DATE,
  expiry_date     DATE,
  scan_extracted  JSONB DEFAULT '{}',
  scan_deleted_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 14. COMPANIES
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  tax_id          TEXT,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  contact_name    TEXT,
  credit_limit    NUMERIC(10,2) DEFAULT 0,
  payment_terms_days SMALLINT DEFAULT 30,
  discount_pct    NUMERIC(5,2) DEFAULT 0,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 15. RESERVATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  reservation_number TEXT NOT NULL,
  status          TEXT DEFAULT 'confirmed' CHECK (status IN (
                    'inquiry','confirmed','checked_in','checked_out',
                    'cancelled','no_show','waitlist')),
  channel_id      UUID REFERENCES ota_channels(id),
  channel_reservation_id TEXT,
  guest_id        UUID REFERENCES guests(id),
  company_id      UUID REFERENCES companies(id),
  room_id         UUID REFERENCES rooms(id),
  room_type_id    UUID REFERENCES room_types(id),
  rate_plan_id    UUID REFERENCES rate_plans(id),
  check_in_date   DATE NOT NULL,
  check_out_date  DATE NOT NULL,
  nights          SMALLINT GENERATED ALWAYS AS (check_out_date - check_in_date) STORED,
  adults          SMALLINT DEFAULT 1,
  children        SMALLINT DEFAULT 0,
  infants         SMALLINT DEFAULT 0,
  meal_plan       TEXT DEFAULT 'RO',
  room_rate       NUMERIC(10,2),
  total_room      NUMERIC(10,2),
  total_extras    NUMERIC(10,2) DEFAULT 0,
  total_discount  NUMERIC(10,2) DEFAULT 0,
  total_tax       NUMERIC(10,2) DEFAULT 0,
  total_amount    NUMERIC(10,2),
  amount_paid     NUMERIC(10,2) DEFAULT 0,
  amount_pending  NUMERIC(10,2),
  currency        TEXT DEFAULT 'EUR',
  actual_check_in  TIMESTAMPTZ,
  actual_check_out TIMESTAMPTZ,
  checked_in_by   UUID REFERENCES staff(id),
  checked_out_by  UUID REFERENCES staff(id),
  special_requests TEXT,
  internal_notes  TEXT,
  estimated_arrival TIME,
  guaranteed       BOOLEAN DEFAULT FALSE,
  guarantee_type   TEXT,
  source           TEXT DEFAULT 'direct',
  created_by       UUID REFERENCES staff(id),
  cancelled_at     TIMESTAMPTZ,
  cancellation_reason TEXT,
  no_show_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, reservation_number)
);

-- ============================================================
-- 16. RESERVATION GUESTS (acompañantes)
-- ============================================================
CREATE TABLE IF NOT EXISTS reservation_guests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id  UUID REFERENCES reservations(id) ON DELETE CASCADE,
  guest_id        UUID REFERENCES guests(id),
  is_primary      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 17. FOLIOS (cuenta del huésped)
-- ============================================================
CREATE TABLE IF NOT EXISTS folios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  reservation_id  UUID REFERENCES reservations(id) ON DELETE CASCADE,
  guest_id        UUID REFERENCES guests(id),
  folio_number    TEXT NOT NULL,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','closed','voided')),
  currency        TEXT DEFAULT 'EUR',
  subtotal        NUMERIC(10,2) DEFAULT 0,
  tax_amount      NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(10,2) DEFAULT 0,
  paid            NUMERIC(10,2) DEFAULT 0,
  balance         NUMERIC(10,2) DEFAULT 0,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, folio_number)
);

-- ============================================================
-- 18. FOLIO CHARGES (cargos al folio)
-- ============================================================
CREATE TABLE IF NOT EXISTS folio_charges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio_id        UUID REFERENCES folios(id) ON DELETE CASCADE,
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  charge_date     DATE DEFAULT CURRENT_DATE,
  description     TEXT NOT NULL,
  category        TEXT DEFAULT 'room' CHECK (category IN (
                    'room','breakfast','halfboard','fullboard','allincl',
                    'minibar','restaurant','bar','spa','parking',
                    'laundry','phone','transfer','extra','discount','tax')),
  quantity        NUMERIC(8,2) DEFAULT 1,
  unit_price      NUMERIC(10,2),
  amount          NUMERIC(10,2) NOT NULL,
  tax_rate        NUMERIC(5,2) DEFAULT 10,
  tax_amount      NUMERIC(10,2) DEFAULT 0,
  posted_by       UUID REFERENCES staff(id),
  voided          BOOLEAN DEFAULT FALSE,
  voided_at       TIMESTAMPTZ,
  voided_by       UUID REFERENCES staff(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 19. PAYMENT GATEWAYS
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_gateways (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  gateway_code    TEXT NOT NULL CHECK (gateway_code IN (
                    'saferpay','stripe','redsys','adyen','paycomet',
                    'datatrans','paypal','mollie','sumup','square',
                    'vivawallet','cash','bank_transfer','other')),
  gateway_name    TEXT NOT NULL,
  credentials     JSONB DEFAULT '{}',
  is_active       BOOLEAN DEFAULT FALSE,
  is_default      BOOLEAN DEFAULT FALSE,
  supports_preauth BOOLEAN DEFAULT TRUE,
  supports_refund  BOOLEAN DEFAULT TRUE,
  supports_tokenization BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, gateway_code)
);

-- ============================================================
-- 20. PAYMENT METHODS ENABLED
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  gateway_id      UUID REFERENCES payment_gateways(id),
  method_code     TEXT NOT NULL,
  method_name     TEXT NOT NULL,
  region          TEXT,
  is_enabled      BOOLEAN DEFAULT FALSE,
  sort_order      SMALLINT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 21. PAYMENTS / TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  folio_id        UUID REFERENCES folios(id),
  reservation_id  UUID REFERENCES reservations(id),
  gateway_id      UUID REFERENCES payment_gateways(id),
  payment_type    TEXT DEFAULT 'charge' CHECK (payment_type IN (
                    'charge','preauth','capture','refund','void')),
  method_code     TEXT,
  amount          NUMERIC(10,2) NOT NULL,
  currency        TEXT DEFAULT 'EUR',
  status          TEXT DEFAULT 'pending' CHECK (status IN (
                    'pending','authorized','captured','failed',
                    'refunded','voided','disputed')),
  gateway_ref     TEXT,
  gateway_response JSONB DEFAULT '{}',
  card_last4      TEXT,
  card_brand      TEXT,
  card_expiry     TEXT,
  card_token      TEXT,
  three_ds_status TEXT,
  processed_by    UUID REFERENCES staff(id),
  processed_at    TIMESTAMPTZ,
  refunded_amount NUMERIC(10,2) DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 22. INVOICES (facturas)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  folio_id        UUID REFERENCES folios(id),
  reservation_id  UUID REFERENCES reservations(id),
  invoice_number  TEXT NOT NULL,
  invoice_date    DATE DEFAULT CURRENT_DATE,
  due_date        DATE,
  bill_to_guest   UUID REFERENCES guests(id),
  bill_to_company UUID REFERENCES companies(id),
  bill_name       TEXT,
  bill_tax_id     TEXT,
  bill_address    TEXT,
  subtotal        NUMERIC(10,2),
  tax_amount      NUMERIC(10,2),
  total           NUMERIC(10,2),
  currency        TEXT DEFAULT 'EUR',
  status          TEXT DEFAULT 'issued' CHECK (status IN ('draft','issued','paid','cancelled')),
  pdf_url         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, invoice_number)
);

-- ============================================================
-- 23. HOUSEKEEPING ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS housekeeping_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  room_id         UUID REFERENCES rooms(id) ON DELETE CASCADE,
  assigned_to     UUID REFERENCES staff(id),
  assigned_by     UUID REFERENCES staff(id),
  date            DATE DEFAULT CURRENT_DATE,
  task_type       TEXT DEFAULT 'daily' CHECK (task_type IN (
                    'daily','checkout','arrival','deep_clean','inspection')),
  priority        SMALLINT DEFAULT 2 CHECK (priority BETWEEN 1 AND 5),
  status          TEXT DEFAULT 'pending' CHECK (status IN (
                    'pending','in_progress','done','inspected','skipped')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  inspected_at    TIMESTAMPTZ,
  inspected_by    UUID REFERENCES staff(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 24. MAINTENANCE TICKETS
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  ticket_number   TEXT NOT NULL,
  room_id         UUID REFERENCES rooms(id),
  reported_by     UUID REFERENCES staff(id),
  assigned_to     UUID REFERENCES staff(id),
  category        TEXT CHECK (category IN (
                    'plumbing','electrical','hvac','furniture',
                    'appliance','structural','cleaning','pest',
                    'safety','it','other')),
  title           TEXT NOT NULL,
  description     TEXT,
  priority        TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status          TEXT DEFAULT 'open' CHECK (status IN (
                    'open','assigned','in_progress','resolved','closed','cancelled')),
  photo_url       TEXT,
  resolution_notes TEXT,
  reported_at     TIMESTAMPTZ DEFAULT NOW(),
  assigned_at     TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  estimated_minutes INT,
  actual_minutes  INT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, ticket_number)
);

-- ============================================================
-- 25. MAINTENANCE COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_comments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id       UUID REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  staff_id        UUID REFERENCES staff(id),
  comment         TEXT NOT NULL,
  photo_url       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 26. AMENITIES / SERVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS amenities (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT,
  price           NUMERIC(10,2) DEFAULT 0,
  unit            TEXT DEFAULT 'unit',
  taxable         BOOLEAN DEFAULT TRUE,
  tax_rate        NUMERIC(5,2) DEFAULT 10,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 27. MINIBAR ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS minibar_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  price           NUMERIC(8,2) NOT NULL,
  category        TEXT,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 28. MINIBAR CONSUMPTION
-- ============================================================
CREATE TABLE IF NOT EXISTS minibar_consumption (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  reservation_id  UUID REFERENCES reservations(id),
  folio_id        UUID REFERENCES folios(id),
  room_id         UUID REFERENCES rooms(id),
  item_id         UUID REFERENCES minibar_items(id),
  quantity        INT DEFAULT 1,
  unit_price      NUMERIC(8,2),
  total           NUMERIC(8,2),
  consumed_date   DATE DEFAULT CURRENT_DATE,
  posted_by       UUID REFERENCES staff(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 29. STAFF SHIFTS
-- ============================================================
CREATE TABLE IF NOT EXISTS staff_shifts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  staff_id        UUID REFERENCES staff(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  shift_type      TEXT DEFAULT 'morning' CHECK (shift_type IN ('morning','afternoon','night','split')),
  start_time      TIME,
  end_time        TIME,
  department      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 30. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  staff_id        UUID REFERENCES staff(id),
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  message         TEXT,
  data            JSONB DEFAULT '{}',
  read            BOOLEAN DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 31. CHANNEL SYNC LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_sync_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  channel_id      UUID REFERENCES ota_channels(id),
  sync_type       TEXT CHECK (sync_type IN ('availability','rates','reservation','cancellation')),
  status          TEXT CHECK (status IN ('success','error','warning')),
  message         TEXT,
  payload         JSONB,
  response        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 32. REVENUE DAILY STATS
-- ============================================================
CREATE TABLE IF NOT EXISTS revenue_daily (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  rooms_available INT DEFAULT 0,
  rooms_occupied  INT DEFAULT 0,
  rooms_vacant    INT DEFAULT 0,
  occupancy_pct   NUMERIC(5,2) DEFAULT 0,
  adr             NUMERIC(10,2) DEFAULT 0,
  revpar          NUMERIC(10,2) DEFAULT 0,
  total_revenue   NUMERIC(12,2) DEFAULT 0,
  room_revenue    NUMERIC(12,2) DEFAULT 0,
  extras_revenue  NUMERIC(12,2) DEFAULT 0,
  arrivals        INT DEFAULT 0,
  departures      INT DEFAULT 0,
  no_shows        INT DEFAULT 0,
  cancellations   INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, date)
);

-- ============================================================
-- 33. REVIEWS / RATINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  reservation_id  UUID REFERENCES reservations(id),
  guest_id        UUID REFERENCES guests(id),
  source          TEXT DEFAULT 'direct',
  overall_score   NUMERIC(3,1),
  cleanliness     NUMERIC(3,1),
  staff_score     NUMERIC(3,1),
  location_score  NUMERIC(3,1),
  value_score     NUMERIC(3,1),
  comment         TEXT,
  response        TEXT,
  responded_at    TIMESTAMPTZ,
  reviewed_at     DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 34. CONCIERGE REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS concierge_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  reservation_id  UUID REFERENCES reservations(id),
  guest_id        UUID REFERENCES guests(id),
  request_type    TEXT,
  description     TEXT NOT NULL,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','cancelled')),
  assigned_to     UUID REFERENCES staff(id),
  due_at          TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 35. PARKING SPACES
-- ============================================================
CREATE TABLE IF NOT EXISTS parking_spaces (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  space_number    TEXT NOT NULL,
  space_type      TEXT DEFAULT 'standard',
  status          TEXT DEFAULT 'free' CHECK (status IN ('free','occupied','reserved','blocked')),
  reservation_id  UUID REFERENCES reservations(id),
  price_per_night NUMERIC(8,2) DEFAULT 0,
  notes           TEXT,
  UNIQUE(hotel_id, space_number)
);

-- ============================================================
-- 36. LOST AND FOUND
-- ============================================================
CREATE TABLE IF NOT EXISTS lost_found (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  found_by        UUID REFERENCES staff(id),
  room_id         UUID REFERENCES rooms(id),
  description     TEXT NOT NULL,
  found_date      DATE DEFAULT CURRENT_DATE,
  found_location  TEXT,
  status          TEXT DEFAULT 'in_storage' CHECK (status IN ('in_storage','returned','donated','disposed')),
  guest_id        UUID REFERENCES guests(id),
  photo_url       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 37. INTERNAL MESSAGES (chat interno)
-- ============================================================
CREATE TABLE IF NOT EXISTS internal_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  from_staff      UUID REFERENCES staff(id),
  to_department   TEXT,
  to_staff        UUID REFERENCES staff(id),
  room_id         UUID REFERENCES rooms(id),
  reservation_id  UUID REFERENCES reservations(id),
  message         TEXT NOT NULL,
  priority        TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  read            BOOLEAN DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 38. ONBOARDING GUIDES
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_guides (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  role            TEXT,
  department      TEXT,
  content         TEXT,
  order_index     SMALLINT DEFAULT 0,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 39. ONBOARDING PROGRESS
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  staff_id        UUID REFERENCES staff(id) ON DELETE CASCADE,
  guide_id        UUID REFERENCES onboarding_guides(id),
  completed       BOOLEAN DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, guide_id)
);

-- ============================================================
-- 40. AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  staff_id        UUID REFERENCES staff(id),
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 41. SUBSCRIPTIONS (SaaS billing)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE UNIQUE,
  plan            TEXT DEFAULT 'starter' CHECK (plan IN ('starter','professional','enterprise')),
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','trialing','past_due','cancelled')),
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  trial_end       TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 42. IMPORT JOBS (migración desde otros PMS)
-- ============================================================
CREATE TABLE IF NOT EXISTS import_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  source_system   TEXT,
  import_type     TEXT,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  total_records   INT DEFAULT 0,
  processed       INT DEFAULT 0,
  errors          INT DEFAULT 0,
  error_log       JSONB DEFAULT '[]',
  started_by      UUID REFERENCES staff(id),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 43. DIRECT BOOKING ENGINE SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_engine_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE UNIQUE,
  enabled         BOOLEAN DEFAULT TRUE,
  domain          TEXT,
  logo_url        TEXT,
  primary_color   TEXT DEFAULT '#1a2640',
  allow_promo_codes BOOLEAN DEFAULT FALSE,
  require_credit_card BOOLEAN DEFAULT TRUE,
  pre_auth_amount NUMERIC(10,2) DEFAULT 0,
  cancellation_policy TEXT,
  custom_css      TEXT,
  languages       JSONB DEFAULT '["es","en","fr","ar"]',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 44. PROMO CODES
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_codes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  description     TEXT,
  discount_type   TEXT DEFAULT 'pct' CHECK (discount_type IN ('pct','fixed')),
  discount_value  NUMERIC(8,2) NOT NULL,
  min_nights      SMALLINT DEFAULT 1,
  min_amount      NUMERIC(10,2),
  valid_from      DATE,
  valid_until     DATE,
  max_uses        INT,
  used_count      INT DEFAULT 0,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, code)
);

-- ============================================================
-- 45. SYSTEM SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS hotel_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE UNIQUE,
  night_audit_time TIME DEFAULT '23:59',
  auto_night_audit BOOLEAN DEFAULT TRUE,
  require_deposit  BOOLEAN DEFAULT FALSE,
  deposit_pct      NUMERIC(5,2) DEFAULT 0,
  tax_config       JSONB DEFAULT '{"room_tax_pct": 10, "city_tax": 0}',
  invoice_prefix   TEXT DEFAULT 'F',
  folio_prefix     TEXT DEFAULT 'FOL',
  reservation_prefix TEXT DEFAULT 'RES',
  ticket_prefix    TEXT DEFAULT 'MNT',
  email_config     JSONB DEFAULT '{}',
  whatsapp_config  JSONB DEFAULT '{}',
  smtp_config      JSONB DEFAULT '{}',
  languages        JSONB DEFAULT '["es","en","fr","ar"]',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES DE RENDIMIENTO
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reservations_hotel_dates    ON reservations(hotel_id, check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status         ON reservations(hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_room           ON reservations(room_id);
CREATE INDEX IF NOT EXISTS idx_reservations_guest          ON reservations(guest_id);
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_status          ON rooms(hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_rates_hotel_date            ON rates(hotel_id, date);
CREATE INDEX IF NOT EXISTS idx_payments_folio              ON payments(folio_id);
CREATE INDEX IF NOT EXISTS idx_payments_status             ON payments(hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_folio_charges_folio         ON folio_charges(folio_id);
CREATE INDEX IF NOT EXISTS idx_guests_hotel_email          ON guests(hotel_id, email);
CREATE INDEX IF NOT EXISTS idx_guests_document             ON guests(hotel_id, document_number);
CREATE INDEX IF NOT EXISTS idx_maintenance_hotel_status    ON maintenance_tickets(hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_hk_assignments_date         ON housekeeping_assignments(hotel_id, date);
CREATE INDEX IF NOT EXISTS idx_channel_sync_log            ON channel_sync_log(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log                   ON audit_log(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_staff         ON notifications(staff_id, read);
CREATE INDEX IF NOT EXISTS idx_internal_messages           ON internal_messages(hotel_id, created_at DESC);

-- ============================================================
-- FUNCIÓN updated_at AUTOMÁTICO
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'hotels','staff','room_types','rooms','rate_plans','rates',
    'ota_channels','guests','companies','reservations','folios',
    'payment_gateways','payments','invoices','maintenance_tickets',
    'revenue_daily','concierge_requests','subscriptions',
    'booking_engine_settings','hotel_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', tbl);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', tbl);
  END LOOP;
END $$;

-- ============================================================
-- FUNCIÓN: generar número de reserva automático
-- ============================================================
CREATE OR REPLACE FUNCTION generate_reservation_number()
RETURNS TRIGGER AS $$
DECLARE prefix TEXT; seq_val INT;
BEGIN
  SELECT COALESCE(reservation_prefix, 'RES') INTO prefix
  FROM hotel_settings WHERE hotel_id = NEW.hotel_id;
  seq_val := (SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(reservation_number, '[^0-9]','','g') AS INT)),0)+1
              FROM reservations WHERE hotel_id = NEW.hotel_id);
  NEW.reservation_number := prefix || '-' || LPAD(seq_val::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservation_number
BEFORE INSERT ON reservations
FOR EACH ROW WHEN (NEW.reservation_number IS NULL OR NEW.reservation_number = '')
EXECUTE FUNCTION generate_reservation_number();

-- ============================================================
-- FUNCIÓN: actualizar balance del folio automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_folio_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE folios SET
    subtotal = (SELECT COALESCE(SUM(amount),0) FROM folio_charges WHERE folio_id = COALESCE(NEW.folio_id, OLD.folio_id) AND voided = FALSE),
    tax_amount = (SELECT COALESCE(SUM(tax_amount),0) FROM folio_charges WHERE folio_id = COALESCE(NEW.folio_id, OLD.folio_id) AND voided = FALSE),
    paid = (SELECT COALESCE(SUM(amount),0) FROM payments WHERE folio_id = COALESCE(NEW.folio_id, OLD.folio_id) AND status IN ('captured','authorized')),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.folio_id, OLD.folio_id);
  UPDATE folios SET
    total = subtotal + tax_amount,
    balance = (subtotal + tax_amount) - paid
  WHERE id = COALESCE(NEW.folio_id, OLD.folio_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_folio_charges_balance
AFTER INSERT OR UPDATE OR DELETE ON folio_charges
FOR EACH ROW EXECUTE FUNCTION update_folio_balance();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE hotels                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_types              ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ota_channels            ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE folios                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio_charges           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tickets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;

-- Políticas básicas: cada staff ve solo su hotel
CREATE POLICY hotel_isolation ON hotels
  USING (id IN (SELECT hotel_id FROM staff WHERE auth_user_id = auth.uid()));

CREATE POLICY staff_hotel ON staff
  USING (hotel_id IN (SELECT hotel_id FROM staff WHERE auth_user_id = auth.uid()));

-- ============================================================
-- SEED: hotel demo + datos iniciales
-- ============================================================
INSERT INTO hotels (id, name, legal_name, email, phone, address, city, country, stars, total_rooms, timezone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Hotel Sol & Mar', 'Sol & Mar S.L.', 'info@solmar.es',
  '+34 952 000 001', 'Paseo Marítimo 42', 'Málaga', 'ES', 4, 60, 'Europe/Madrid'
) ON CONFLICT DO NOTHING;

INSERT INTO hotel_settings (hotel_id) VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO booking_engine_settings (hotel_id) VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;

INSERT INTO floors (hotel_id, floor_number, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 1, 'Planta 1'),
  ('00000000-0000-0000-0000-000000000001', 2, 'Planta 2'),
  ('00000000-0000-0000-0000-000000000001', 3, 'Planta 3 — Suites')
ON CONFLICT DO NOTHING;

INSERT INTO room_types (hotel_id, code, name, max_adults, base_price, size_sqm, bed_type) VALUES
  ('00000000-0000-0000-0000-000000000001', 'SGL', 'Individual', 1, 89.00, 18, 'Single'),
  ('00000000-0000-0000-0000-000000000001', 'DBL', 'Doble Estándar', 2, 128.00, 24, 'Double'),
  ('00000000-0000-0000-0000-000000000001', 'DBLSUP', 'Doble Superior', 2, 148.00, 28, 'Double'),
  ('00000000-0000-0000-0000-000000000001', 'FAM', 'Familiar', 4, 178.00, 36, 'Double + Twin'),
  ('00000000-0000-0000-0000-000000000001', 'JSUITE', 'Junior Suite', 2, 220.00, 42, 'King'),
  ('00000000-0000-0000-0000-000000000001', 'SUITE', 'Suite Deluxe', 2, 290.00, 58, 'King')
ON CONFLICT DO NOTHING;

INSERT INTO rate_plans (hotel_id, code, name, meal_plan) VALUES
  ('00000000-0000-0000-0000-000000000001', 'RO', 'Solo Alojamiento', 'RO'),
  ('00000000-0000-0000-0000-000000000001', 'BB', 'Alojamiento y Desayuno', 'BB'),
  ('00000000-0000-0000-0000-000000000001', 'HB', 'Media Pensión', 'HB'),
  ('00000000-0000-0000-0000-000000000001', 'FB', 'Pensión Completa', 'FB')
ON CONFLICT DO NOTHING;

INSERT INTO ota_channels (hotel_id, channel_code, channel_name, api_type, commission_pct, is_connected) VALUES
  ('00000000-0000-0000-0000-000000000001', 'booking', 'Booking.com', 'xml', 15.00, true),
  ('00000000-0000-0000-0000-000000000001', 'expedia', 'Expedia Group', 'rest', 18.00, true),
  ('00000000-0000-0000-0000-000000000001', 'airbnb', 'Airbnb', 'ical', 3.00, true),
  ('00000000-0000-0000-0000-000000000001', 'tripadvisor', 'TripAdvisor', 'rest', 12.00, true),
  ('00000000-0000-0000-0000-000000000001', 'google', 'Google Hotel Ads', 'rest', 0.00, true),
  ('00000000-0000-0000-0000-000000000001', 'direct', 'Motor Directo', 'rest', 0.00, true)
ON CONFLICT DO NOTHING;

INSERT INTO payment_gateways (hotel_id, gateway_code, gateway_name, is_active, is_default) VALUES
  ('00000000-0000-0000-0000-000000000001', 'saferpay', 'Worldline Saferpay', true, true),
  ('00000000-0000-0000-0000-000000000001', 'redsys', 'Redsys TPV', true, false),
  ('00000000-0000-0000-0000-000000000001', 'stripe', 'Stripe', true, false),
  ('00000000-0000-0000-0000-000000000001', 'cash', 'Efectivo', true, false),
  ('00000000-0000-0000-0000-000000000001', 'bank_transfer', 'Transferencia', true, false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- FIN DEL SCHEMA
-- ============================================================
