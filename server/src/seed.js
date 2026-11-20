// Demo data for Bengaluru: one central warehouse, three FreshLoop supermarkets,
// eight local merchants and two NGOs. Dates are relative to today so the demo
// always shows stock that is about to expire.
import bcrypt from "bcryptjs";
import { addDays, haversineKm, toISODate } from "./risk.js";

export const DEMO_PASSWORD = "Demo@1234";

const ORGS = [
  { key: "wh", type: "warehouse", name: "FreshLoop Central Warehouse", address: "Hosur Road, Bommanahalli", lat: 12.9081, lng: 77.6237, phone: "080 4000 1000", cold: 1 },
  { key: "kor", type: "store", name: "FreshLoop Koramangala", address: "80 Feet Road, Koramangala 4th Block", lat: 12.9352, lng: 77.6245, phone: "080 4000 1101", cold: 1 },
  { key: "ind", type: "store", name: "FreshLoop Indiranagar", address: "100 Feet Road, Indiranagar", lat: 12.9719, lng: 77.6412, phone: "080 4000 1102", cold: 1 },
  { key: "jay", type: "store", name: "FreshLoop Jayanagar", address: "11th Main, Jayanagar 4th Block", lat: 12.925, lng: 77.5938, phone: "080 4000 1103", cold: 1 },
  { key: "m1", type: "merchant", name: "Sri Lakshmi Kirana", address: "6th Cross, Koramangala", lat: 12.938, lng: 77.62, phone: "98450 11201", cold: 1, total: 14, onTime: 13 },
  { key: "m2", type: "merchant", name: "Annapoorna Bakery", address: "1st Main, Koramangala 5th Block", lat: 12.931, lng: 77.629, phone: "98450 11202", cold: 0, total: 9, onTime: 9 },
  { key: "m3", type: "merchant", name: "Green Leaf Juice Centre", address: "CMH Road, Indiranagar", lat: 12.975, lng: 77.638, phone: "98450 11203", cold: 1, total: 6, onTime: 5 },
  { key: "m4", type: "merchant", name: "Raju Provision Store", address: "12th Main, HAL 2nd Stage", lat: 12.969, lng: 77.648, phone: "98450 11204", cold: 0, total: 11, onTime: 8 },
  { key: "m5", type: "merchant", name: "Shanthi Milk Centre", address: "9th Block, Jayanagar", lat: 12.928, lng: 77.59, phone: "98450 11205", cold: 1, total: 5, onTime: 5 },
  { key: "m6", type: "merchant", name: "Sagar Sweets", address: "South End Circle, Jayanagar", lat: 12.922, lng: 77.599, phone: "98450 11206", cold: 1, total: 7, onTime: 6 },
  { key: "m7", type: "merchant", name: "Hotel Udupi Upahar", address: "27th Main, HSR Layout", lat: 12.9116, lng: 77.6474, phone: "98450 11207", cold: 1, total: 12, onTime: 12 },
  { key: "m8", type: "merchant", name: "Fresh Basket Vegetables", address: "BTM 2nd Stage", lat: 12.9166, lng: 77.6101, phone: "98450 11208", cold: 0, verified: 0 },
  { key: "n1", type: "ngo", name: "Annadaana Food Bank", address: "Ejipura Main Road", lat: 12.95, lng: 77.61, phone: "98450 22301", cold: 1, total: 8, onTime: 8 },
  { key: "n2", type: "ngo", name: "Hope Community Kitchen", address: "Basavanagudi", lat: 12.96, lng: 77.58, phone: "98450 22302", cold: 0, total: 3, onTime: 3 },
];

const USERS = [
  { org: "wh", role: "admin", name: "Asha Rao (HQ Operations)", email: "admin@freshloop.test" },
  { org: "kor", role: "store", name: "Vikram Shetty", email: "koramangala@freshloop.test" },
  { org: "ind", role: "store", name: "Meera Iyer", email: "indiranagar@freshloop.test" },
  { org: "jay", role: "store", name: "Karthik Gowda", email: "jayanagar@freshloop.test" },
  { org: "m1", role: "merchant", name: "Lakshmi Narayan", email: "lakshmi@kirana.test" },
  { org: "m2", role: "merchant", name: "Joseph D'Souza", email: "annapoorna@bakery.test" },
  { org: "m3", role: "merchant", name: "Imran Khan", email: "greenleaf@juice.test" },
  { org: "m4", role: "merchant", name: "Raju Reddy", email: "raju@provision.test" },
  { org: "m5", role: "merchant", name: "Shanthi Kumar", email: "shanthi@milk.test" },
  { org: "m6", role: "merchant", name: "Prakash Sagar", email: "sagar@sweets.test" },
  { org: "m7", role: "merchant", name: "Ganesh Bhat", email: "udupi@hotel.test" },
  { org: "m8", role: "merchant", name: "Sunil Patil", email: "freshbasket@veg.test" },
  { org: "n1", role: "ngo", name: "Fatima Sheikh", email: "annadaana@ngo.test" },
  { org: "n2", role: "ngo", name: "Arun Thomas", email: "hope@ngo.test" },
];

const PRODUCTS = [
  ["MILK-TND-500", "Toned Milk 500 ml", "Dairy", "pouch", 27, 1, "/img/milk.svg"],
  ["CURD-400", "Fresh Curd 400 g", "Dairy", "cup", 40, 1, "/img/curd.svg"],
  ["PANEER-200", "Paneer 200 g", "Dairy", "pack", 90, 1, "/img/paneer.svg"],
  ["BREAD-WW-400", "Whole Wheat Bread 400 g", "Bakery", "loaf", 45, 0, "/img/bread.svg"],
  ["PAV-6", "Pav Buns (pack of 6)", "Bakery", "pack", 35, 0, "/img/pav.svg"],
  ["CAKE-FRT-250", "Fruit Cake 250 g", "Bakery", "pack", 80, 0, "/img/cake.svg"],
  ["BANANA-DZ", "Bananas (Robusta)", "Fruits", "dozen", 60, 0, "/img/banana.svg"],
  ["PAPAYA-1KG", "Papaya", "Fruits", "kg", 50, 0, "/img/papaya.svg"],
  ["GRAPES-500", "Green Grapes 500 g", "Fruits", "box", 80, 0, "/img/grapes.svg"],
  ["TOMATO-1KG", "Tomatoes", "Vegetables", "kg", 40, 0, "/img/tomato.svg"],
  ["SPINACH-BN", "Spinach", "Vegetables", "bunch", 25, 0, "/img/spinach.svg"],
  ["CORIANDER-BN", "Coriander", "Vegetables", "bunch", 15, 0, "/img/coriander.svg"],
  ["CHICKEN-500", "Chicken Curry Cut 500 g", "Meat", "pack", 160, 1, "/img/chicken.svg"],
  ["IDLI-BTR-1KG", "Idli Batter 1 kg", "Ready to cook", "pack", 70, 1, "/img/idli.svg"],
];

// [store, sku, qty, dailySales, daysToExpiry]
const BATCHES = [
  ["kor", "MILK-TND-500", 120, 40, 1], ["kor", "CURD-400", 60, 12, 2], ["kor", "PANEER-200", 25, 6, 4],
  ["kor", "BREAD-WW-400", 70, 15, 2], ["kor", "PAV-6", 40, 14, 1], ["kor", "BANANA-DZ", 50, 6, 3],
  ["kor", "PAPAYA-1KG", 30, 3, 4], ["kor", "TOMATO-1KG", 80, 20, 5], ["kor", "SPINACH-BN", 45, 10, 1],
  ["kor", "CHICKEN-500", 30, 5, 2], ["kor", "IDLI-BTR-1KG", 40, 6, 3], ["kor", "GRAPES-500", 35, 4, 7],
  ["kor", "CORIANDER-BN", 8, 5, -1],
  ["ind", "MILK-TND-500", 60, 45, 1], ["ind", "CURD-400", 20, 14, 2], ["ind", "BREAD-WW-400", 30, 18, 2],
  ["ind", "BANANA-DZ", 20, 10, 3], ["ind", "TOMATO-1KG", 150, 18, 3], ["ind", "CORIANDER-BN", 60, 12, 0],
  ["ind", "PANEER-200", 10, 8, 4], ["ind", "GRAPES-500", 60, 5, 2], ["ind", "CHICKEN-500", 12, 7, 2],
  ["jay", "MILK-TND-500", 100, 30, 2], ["jay", "IDLI-BTR-1KG", 70, 8, 2], ["jay", "PAV-6", 15, 12, 1],
  ["jay", "SPINACH-BN", 10, 9, 1], ["jay", "PAPAYA-1KG", 10, 5, 4], ["jay", "CAKE-FRT-250", 40, 3, 6],
  ["jay", "TOMATO-1KG", 50, 22, 4], ["jay", "BREAD-WW-400", 25, 14, 3], ["jay", "CURD-400", 30, 6, 0],
  ["wh", "TOMATO-1KG", 400, 60, 6], ["wh", "BANANA-DZ", 200, 25, 3], ["wh", "MILK-TND-500", 300, 150, 2],
  ["wh", "PANEER-200", 120, 15, 5],
];

// Open listings so the merchant marketplace has stock on first run: [store, sku, qty]
const OPEN_LISTINGS = [
  ["kor", "BREAD-WW-400", 15], ["kor", "CHICKEN-500", 8], ["kor", "CURD-400", 15], ["kor", "PAV-6", 6],
  ["kor", "SPINACH-BN", 20], ["kor", "PAPAYA-1KG", 10], ["kor", "IDLI-BTR-1KG", 10],
  ["ind", "GRAPES-500", 30], ["ind", "CORIANDER-BN", 25], ["ind", "TOMATO-1KG", 50],
  ["jay", "IDLI-BTR-1KG", 30], ["jay", "CURD-400", 20], ["jay", "CAKE-FRT-250", 12],
  ["wh", "BANANA-DZ", 60], ["wh", "PANEER-200", 16],
];

export function seed(db, { today = toISODate() } = {}) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const ids = {};
  const sku = {};

  db.transaction(() => {
    const insOrg = db.prepare(
      "INSERT INTO orgs (type, name, address, lat, lng, phone, has_cold_storage, verified, pickups_total, pickups_on_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const o of ORGS) {
      ids[o.key] = Number(insOrg.run(o.type, o.name, o.address, o.lat, o.lng, o.phone, o.cold, o.verified ?? 1, o.total ?? 0, o.onTime ?? 0).lastInsertRowid);
    }
    const insUser = db.prepare("INSERT INTO users (org_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)");
    const userIds = {};
    for (const u of USERS) userIds[u.org] = Number(insUser.run(ids[u.org], u.name, u.email, hash, u.role).lastInsertRowid);

    const insProd = db.prepare("INSERT INTO products (sku, name, category, unit, base_price, requires_cold, image) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const p of PRODUCTS) sku[p[0]] = { id: Number(insProd.run(...p).lastInsertRowid), price: p[4], name: p[1] };

    const insBatch = db.prepare("INSERT INTO batches (org_id, product_id, qty, daily_sales, expiry_date, received_date) VALUES (?, ?, ?, ?, ?, ?)");
    const batchIds = {};
    for (const [org, s, qty, rate, days] of BATCHES) {
      batchIds[`${org}:${s}`] = Number(insBatch.run(ids[org], sku[s].id, qty, rate, addDays(today, days), addDays(today, -2)).lastInsertRowid);
    }

    const insListing = db.prepare(
      "INSERT INTO listings (batch_id, org_id, product_id, qty_initial, qty_available, base_price, expiry_date, stage, closed_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insClaim = db.prepare(
      "INSERT INTO claims (order_id, listing_id, org_id, channel, qty, unit_price, status, pickup_by, picked_up_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insOrder = db.prepare(
      `INSERT INTO orders (buyer_org_id, store_org_id, channel, fulfilment, status, item_total, mrp_total, delivery_fee, distance_km, eta_minutes, deliver_to, placed_at, due_by, packed_at, dispatched_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    // Timestamps are stored in UTC, like SQLite's datetime('now').
    const ago = (hours) => new Date(Date.now() - hours * 3600_000).toISOString().slice(0, 19).replace("T", " ");
    const isoAgo = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();
    const orgRow = (key) => db.prepare("SELECT * FROM orgs WHERE id = ?").get(ids[key]);

    /** One order of one or more listing lines, at any point in its life. */
    const order = (buyerKey, storeKey, fulfilment, status, lines, placedHoursAgo) => {
      const buyer = orgRow(buyerKey);
      const store = orgRow(storeKey);
      const channel = buyer.type === "ngo" ? "ngo" : "merchant";
      const distanceKm = haversineKm(buyer, store);
      const delivery = fulfilment === "delivery";
      const eta = delivery ? Math.round(12 + 4 * distanceKm) : 15;
      const itemTotal = Math.round(lines.reduce((t, [, q, p]) => t + q * p, 0) * 100) / 100;
      const mrpTotal = Math.round(lines.reduce((t, [l, q]) => t + q * db.prepare("SELECT base_price FROM listings WHERE id = ?").get(l).base_price, 0) * 100) / 100;
      const fee = delivery && channel === "merchant" && itemTotal < 199 ? 25 : 0;
      const placed = placedHoursAgo;
      const dueBy = isoAgo(placed - (delivery ? eta / 60 : 6));
      const step = (n) => (["packed", "out_for_delivery", "ready_for_pickup", "completed"].indexOf(status) >= n ? isoAgo(Math.max(0, placed - (n + 1) * 0.15)) : null);
      const packedAt = status === "placed" ? null : step(0);
      const dispatchedAt = ["out_for_delivery", "ready_for_pickup", "completed"].includes(status) ? isoAgo(Math.max(0, placed - 0.3)) : null;
      const completedAt = status === "completed" ? isoAgo(Math.max(0, placed - 0.5)) : null;
      const id = Number(insOrder.run(buyer.id, store.id, channel, fulfilment, status, itemTotal, mrpTotal, fee, distanceKm, eta, delivery ? buyer.address : "", isoAgo(placed), dueBy, packedAt, dispatchedAt, completedAt).lastInsertRowid);
      for (const [listingId, qty, price] of lines) {
        insClaim.run(id, listingId, buyer.id, channel, qty, price, status === "completed" ? "picked_up" : "claimed", dueBy, completedAt, ago(placed));
        if (status !== "completed") db.prepare("UPDATE listings SET qty_available = qty_available - ? WHERE id = ?").run(qty, listingId);
      }
      return id;
    };

    // Open listings (stock moves out of the batch into the listing).
    const listingIds = {};
    for (const [org, s, qty] of OPEN_LISTINGS) {
      const b = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchIds[`${org}:${s}`]);
      db.prepare("UPDATE batches SET qty = qty - ? WHERE id = ?").run(qty, b.id);
      const days = Math.round((Date.parse(b.expiry_date) - Date.parse(today)) / 86_400_000);
      const stage = days <= 0 ? "ngo" : "merchant";
      listingIds[`${org}:${s}`] = Number(insListing.run(b.id, ids[org], sku[s].id, qty, qty, sku[s].price, b.expiry_date, stage, null, ago(3)).lastInsertRowid);
    }

    // Live orders, so the store queue and the order tracker have something to show.
    const liveOrder = order("m1", "kor", "delivery", "placed", [[listingIds["kor:BREAD-WW-400"], 5, 20.25]], 0.15);
    order("m7", "kor", "pickup", "packed", [[listingIds["kor:CHICKEN-500"], 3, 72]], 0.6);
    order("m3", "ind", "delivery", "out_for_delivery", [[listingIds["ind:GRAPES-500"], 10, 36]], 0.5);

    // History from the last week, so the dashboards show outcomes.
    const past = (org, s, qty, daysAgo, reason, claims = [], rec = null) => {
      const b = Number(insBatch.run(ids[org], sku[s].id, 0, 0, addDays(today, -daysAgo), addDays(today, -daysAgo - 4)).lastInsertRowid);
      const left = qty - claims.reduce((a, c) => a + c[2], 0) - (rec ? rec[0] : 0);
      const l = Number(insListing.run(b, ids[org], sku[s].id, qty, reason === "expired" ? left : 0, sku[s].price, addDays(today, -daysAgo), "closed", reason, ago((daysAgo + 2) * 24)).lastInsertRowid);
      for (const [who, , n, price] of claims) order(who, org, who === "n1" ? "pickup" : "delivery", "completed", [[l, n, price]], (daysAgo + 1) * 24);
      if (rec) db.prepare("INSERT INTO recoveries (listing_id, org_id, qty, method, created_at) VALUES (?, ?, ?, ?, ?)").run(l, ids[org], rec[0], rec[1], ago(daysAgo * 24));
    };
    past("kor", "BANANA-DZ", 30, 3, "cleared", [["m2", "merchant", 20, 27], ["n1", "ngo", 10, 0]]);
    past("ind", "BREAD-WW-400", 25, 4, "cleared", [["m4", "merchant", 25, 13.5]]);
    past("jay", "TOMATO-1KG", 40, 2, "cleared", [["m7", "merchant", 40, 24]]);
    past("kor", "CURD-400", 12, 5, "compost", [["m1", "merchant", 8, 18]], [4, "compost"]);
    past("ind", "SPINACH-BN", 15, 1, "expired");
    past("jay", "PANEER-200", 18, 6, "cleared", [["m5", "merchant", 12, 40.5], ["n1", "ngo", 6, 0]]);

    const insTransfer = db.prepare("INSERT INTO transfers (product_id, from_org_id, to_org_id, from_batch_id, to_batch_id, qty, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    insTransfer.run(sku["MILK-TND-500"].id, ids.kor, ids.ind, batchIds["kor:MILK-TND-500"], batchIds["ind:MILK-TND-500"], 24, userIds.kor, ago(2 * 24 + 5));
    insTransfer.run(sku["BANANA-DZ"].id, ids.wh, ids.kor, batchIds["wh:BANANA-DZ"], batchIds["kor:BANANA-DZ"], 40, userIds.wh, ago(4 * 24 + 6));

    const insAudit = db.prepare("INSERT INTO audit_log (user_id, org_id, action, entity, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    insAudit.run(userIds.wh, ids.wh, "transfer.create", "transfer", 2, "40 x Bananas (Robusta) to FreshLoop Koramangala", ago(4 * 24 + 6));
    insAudit.run(userIds.kor, ids.kor, "transfer.create", "transfer", 1, "24 x Toned Milk 500 ml to FreshLoop Indiranagar", ago(2 * 24 + 5));
    insAudit.run(userIds.kor, ids.kor, "listing.create", "listing", listingIds["kor:BREAD-WW-400"], "15 x Whole Wheat Bread 400 g (merchant)", ago(3));
    insAudit.run(userIds.m1, ids.m1, "order.create", "order", liveOrder, "delivery, 1 item(s)", ago(0.15));
  })();

  return ids;
}
