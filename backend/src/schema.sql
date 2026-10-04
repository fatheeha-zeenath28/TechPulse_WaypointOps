-- Waypoint Ops schema
-- Reference tables (loaded from the competition's shared datasets)

CREATE TABLE IF NOT EXISTS outlets (
  outlet_id          TEXT PRIMARY KEY,
  brand              TEXT NOT NULL,
  district           TEXT NOT NULL,
  depot              TEXT NOT NULL,
  dock_type          TEXT NOT NULL,
  parking_constraint TEXT NOT NULL,
  mall_window        TEXT,
  window_open_time   TEXT,
  window_close_time  TEXT
);

CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id          TEXT PRIMARY KEY,
  type                TEXT NOT NULL,          -- truck | van
  temp                TEXT NOT NULL,           -- reefer | ambient
  weight_cap_kg       NUMERIC NOT NULL,
  volume_cap_m3       NUMERIC NOT NULL,
  fuel_type           TEXT,
  km_per_l            NUMERIC,
  weekly_fuel_quota_l NUMERIC,
  depot               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'available'  -- available | in_workshop
);

CREATE TABLE IF NOT EXISTS calendar (
  date                  DATE PRIMARY KEY,
  dow                   INT,
  dow_name              TEXT,
  is_weekend            BOOLEAN,
  iso_year              INT,
  iso_week              INT,
  is_payday             BOOLEAN,
  festival              TEXT,
  festival_ramp         NUMERIC,
  is_holiday            BOOLEAN,
  monsoon               BOOLEAN,
  is_operating          BOOLEAN
);

CREATE TABLE IF NOT EXISTS district_travel (
  district                     TEXT PRIMARY KEY,
  depot                        TEXT NOT NULL,
  road_class                   TEXT,
  free_flow_kmh                NUMERIC,
  depot_to_district_km         NUMERIC,
  depot_to_district_freeflow_min NUMERIC,
  inter_stop_km                NUMERIC,
  inter_stop_freeflow_min      NUMERIC
);

CREATE TABLE IF NOT EXISTS service_allowance (
  brand                 TEXT NOT NULL,
  dock_type             TEXT NOT NULL,
  service_allowance_min NUMERIC NOT NULL,
  PRIMARY KEY (brand, dock_type)
);

-- Accounts (one seeded account per role, as required by the brief)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,         -- dispatcher | loader | driver | storemanager
  display_name  TEXT NOT NULL,
  outlet_id     TEXT REFERENCES outlets(outlet_id),
  vehicle_id    TEXT REFERENCES vehicles(vehicle_id)
);

-- Live operational data

CREATE TABLE IF NOT EXISTS orders (
  order_id         TEXT PRIMARY KEY,
  outlet_id        TEXT NOT NULL REFERENCES outlets(outlet_id),
  brand            TEXT NOT NULL,
  district         TEXT NOT NULL,
  depot            TEXT NOT NULL,
  temp_requirement TEXT NOT NULL,        -- chilled | ambient
  order_units      INT NOT NULL,
  order_weight_kg  NUMERIC NOT NULL,
  order_volume_m3  NUMERIC NOT NULL,
  order_date       DATE NOT NULL,        -- date the order is FOR
  dispatch_status  TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | served | deferred | not_run
  defer_reason     TEXT,
  times_deferred   INT NOT NULL DEFAULT 0,
  receipt_status   TEXT,                  -- received | short | damaged (set by store manager)
  receipt_note     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trips (
  trip_key   TEXT PRIMARY KEY,           -- vehicleId:tripNo:date
  vehicle_id TEXT NOT NULL REFERENCES vehicles(vehicle_id),
  trip_no    INT NOT NULL,
  date       DATE NOT NULL,
  depot      TEXT NOT NULL,
  brand      TEXT NOT NULL,
  district   TEXT NOT NULL,
  planned_minutes NUMERIC
);

CREATE TABLE IF NOT EXISTS trip_stops (
  id           SERIAL PRIMARY KEY,
  trip_key     TEXT NOT NULL REFERENCES trips(trip_key) ON DELETE CASCADE,
  order_id     TEXT NOT NULL REFERENCES orders(order_id),
  seq          INT NOT NULL,
  load_status  TEXT NOT NULL DEFAULT 'pending',   -- pending | loaded | flagged
  flag_note    TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending', -- pending | arrived | delivered | blocked
  pod_note     TEXT,
  arrived_at   TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  recorded_offline BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS events (
  id         SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,     -- deferral | flag | delivery | conflict | sync | receipt
  order_id   TEXT REFERENCES orders(order_id),
  actor_role TEXT,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_date_depot ON orders(order_date, depot);
CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(date);
CREATE INDEX IF NOT EXISTS idx_stops_trip ON trip_stops(trip_key);
