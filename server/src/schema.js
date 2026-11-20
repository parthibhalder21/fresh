// Database schema, shared by the server (node:sqlite) and the in-browser demo (sql.js).
export const SCHEMA_VERSION = 2;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS orgs (
  id               INTEGER PRIMARY KEY,
  type             TEXT    NOT NULL CHECK (type IN ('warehouse', 'store', 'merchant', 'ngo')),
  name             TEXT    NOT NULL,
  address          TEXT    NOT NULL DEFAULT '',
  lat              REAL    NOT NULL,
  lng              REAL    NOT NULL,
  phone            TEXT    NOT NULL DEFAULT '',
  has_cold_storage INTEGER NOT NULL DEFAULT 0,
  verified         INTEGER NOT NULL DEFAULT 1,
  pickups_total    INTEGER NOT NULL DEFAULT 0,
  pickups_on_time  INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  org_id        INTEGER NOT NULL REFERENCES orgs(id),
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('admin', 'store', 'merchant', 'ngo')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY,
  sku           TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  category      TEXT    NOT NULL,
  unit          TEXT    NOT NULL,
  base_price    REAL    NOT NULL CHECK (base_price >= 0),
  requires_cold INTEGER NOT NULL DEFAULT 0,
  image         TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS batches (
  id            INTEGER PRIMARY KEY,
  org_id        INTEGER NOT NULL REFERENCES orgs(id),
  product_id    INTEGER NOT NULL REFERENCES products(id),
  qty           INTEGER NOT NULL CHECK (qty >= 0),
  daily_sales   REAL    NOT NULL CHECK (daily_sales >= 0),
  expiry_date   TEXT    NOT NULL,
  received_date TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id            INTEGER PRIMARY KEY,
  batch_id      INTEGER REFERENCES batches(id),
  org_id        INTEGER NOT NULL REFERENCES orgs(id),
  product_id    INTEGER NOT NULL REFERENCES products(id),
  qty_initial   INTEGER NOT NULL CHECK (qty_initial > 0),
  qty_available INTEGER NOT NULL CHECK (qty_available >= 0),
  base_price    REAL    NOT NULL,
  expiry_date   TEXT    NOT NULL,
  stage         TEXT    NOT NULL CHECK (stage IN ('merchant', 'ngo', 'closed')),
  closed_reason TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One checkout can produce several orders: one per store in the cart.
CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY,
  buyer_org_id   INTEGER NOT NULL REFERENCES orgs(id),
  store_org_id   INTEGER NOT NULL REFERENCES orgs(id),
  channel        TEXT    NOT NULL CHECK (channel IN ('merchant', 'ngo')),
  fulfilment     TEXT    NOT NULL CHECK (fulfilment IN ('delivery', 'pickup')),
  status         TEXT    NOT NULL CHECK (status IN ('placed', 'packed', 'out_for_delivery', 'ready_for_pickup', 'completed', 'cancelled', 'no_show')),
  item_total     REAL    NOT NULL,
  mrp_total      REAL    NOT NULL,
  delivery_fee   REAL    NOT NULL DEFAULT 0,
  distance_km    REAL    NOT NULL,
  eta_minutes    INTEGER NOT NULL,
  deliver_to     TEXT    NOT NULL DEFAULT '',
  placed_at      TEXT    NOT NULL,
  due_by         TEXT    NOT NULL,
  packed_at      TEXT,
  dispatched_at  TEXT,
  completed_at   TEXT,
  cancelled_at   TEXT
);

CREATE TABLE IF NOT EXISTS claims (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER REFERENCES orders(id),
  listing_id   INTEGER NOT NULL REFERENCES listings(id),
  org_id       INTEGER NOT NULL REFERENCES orgs(id),
  channel      TEXT    NOT NULL CHECK (channel IN ('merchant', 'ngo')),
  qty          INTEGER NOT NULL CHECK (qty > 0),
  unit_price   REAL    NOT NULL CHECK (unit_price >= 0),
  status       TEXT    NOT NULL CHECK (status IN ('claimed', 'picked_up', 'no_show', 'cancelled')),
  pickup_by    TEXT    NOT NULL,
  picked_up_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transfers (
  id            INTEGER PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  from_org_id   INTEGER NOT NULL REFERENCES orgs(id),
  to_org_id     INTEGER NOT NULL REFERENCES orgs(id),
  from_batch_id INTEGER NOT NULL REFERENCES batches(id),
  to_batch_id   INTEGER NOT NULL REFERENCES batches(id),
  qty           INTEGER NOT NULL CHECK (qty > 0),
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recoveries (
  id         INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  org_id     INTEGER NOT NULL REFERENCES orgs(id),
  qty        INTEGER NOT NULL CHECK (qty > 0),
  method     TEXT    NOT NULL CHECK (method IN ('compost', 'animal_feed')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id),
  org_id     INTEGER REFERENCES orgs(id),
  action     TEXT    NOT NULL,
  entity     TEXT    NOT NULL,
  entity_id  INTEGER,
  detail     TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_batches_org      ON batches(org_id);
CREATE INDEX IF NOT EXISTS idx_listings_stage   ON listings(stage);
CREATE INDEX IF NOT EXISTS idx_claims_org       ON claims(org_id);
CREATE INDEX IF NOT EXISTS idx_claims_listing   ON claims(listing_id);
CREATE INDEX IF NOT EXISTS idx_claims_order     ON claims(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_store     ON orders(store_org_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer     ON orders(buyer_org_id);
`;
