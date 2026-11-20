import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { setup } from "./helpers.js";

test("health check and auth", async () => {
  const { app, login } = await setup();
  assert.equal((await request(app).get("/api/health")).body.status, "ok");
  assert.equal((await request(app).post("/api/auth/login").send({ email: "admin@freshloop.test", password: "wrong" })).status, 401);
  assert.equal((await request(app).get("/api/inventory")).status, 401);
  const store = await login("koramangala@freshloop.test");
  const me = await store.get("/api/auth/me");
  assert.equal(me.body.user.role, "store");
});

test("roles cannot reach each other's endpoints", async () => {
  const { login } = await setup();
  const merchant = await login("lakshmi@kirana.test");
  const store = await login("koramangala@freshloop.test");
  assert.equal((await merchant.get("/api/inventory")).status, 403);
  assert.equal((await merchant.get("/api/admin/orgs")).status, 403);
  assert.equal((await store.get("/api/market")).status, 403);
  assert.equal((await store.get("/api/admin/audit")).status, 403);
});

test("a store cannot touch another store's batch", async () => {
  const { db, login } = await setup();
  const store = await login("koramangala@freshloop.test");
  const other = db.prepare("SELECT b.id FROM batches b JOIN orgs o ON o.id = b.org_id WHERE o.name = 'FreshLoop Indiranagar' LIMIT 1").get();
  assert.equal((await store.post(`/api/inventory/batches/${other.id}/list`).send({ qty: 1 })).status, 403);
});

test("inventory is scored and rebalancing moves stock to a faster store", async () => {
  const { db, login } = await setup();
  const store = await login("koramangala@freshloop.test");
  const inv = await store.get("/api/inventory");
  const milk = inv.body.batches.find((b) => b.product.name.startsWith("Toned Milk"));
  assert.equal(milk.assessment.riskLevel, "high");
  assert.ok(milk.assessment.surplus > 0);

  const reb = await store.get(`/api/inventory/batches/${milk.id}/rebalance`);
  assert.ok(reb.body.suggestions.length > 0);
  const target = reb.body.suggestions[0];
  const res = await store.post(`/api/inventory/batches/${milk.id}/transfer`).send({ toOrgId: target.orgId, qty: target.suggestedQty });
  assert.equal(res.status, 201);
  const after = db.prepare("SELECT qty FROM batches WHERE id = ?").get(milk.id).qty;
  assert.equal(after, milk.qty - target.suggestedQty);
});

test("full cascade: list, merchant checks out at the falling price, store packs and hands over", async () => {
  const { db, login } = await setup();
  const store = await login("koramangala@freshloop.test");
  const merchant = await login("lakshmi@kirana.test");

  const inv = await store.get("/api/inventory");
  const bananas = inv.body.batches.find((b) => b.product.name.startsWith("Bananas"));
  const listed = await store.post(`/api/inventory/batches/${bananas.id}/list`).send({ qty: 10 });
  assert.equal(listed.status, 201);
  assert.equal(listed.body.stage, "merchant");

  const market = await merchant.get("/api/market");
  const offer = market.body.listings.find((l) => l.id === listed.body.id);
  assert.ok(offer, "listing should be visible to a nearby merchant");
  assert.ok(offer.unitPrice < offer.basePrice);
  assert.ok(offer.product.image.endsWith(".svg"));

  const checkout = await merchant.post("/api/orders").send({ items: [{ listingId: offer.id, qty: 4 }], fulfilment: "pickup" });
  assert.equal(checkout.status, 201);
  const order = checkout.body.orders[0];
  assert.equal(order.status, "placed");
  assert.equal(order.itemTotal, Math.round(4 * offer.unitPrice * 100) / 100);
  assert.equal(order.deliveryFee, 0, "pickup is free");

  const before = db.prepare("SELECT pickups_total FROM orgs WHERE name = 'Sri Lakshmi Kirana'").get().pickups_total;
  for (const expected of ["packed", "ready_for_pickup", "completed"]) {
    const r = await store.post(`/api/store-orders/${order.id}/advance`);
    assert.equal(r.body.order.status, expected);
  }
  const after = db.prepare("SELECT pickups_total FROM orgs WHERE name = 'Sri Lakshmi Kirana'").get().pickups_total;
  assert.equal(after, before + 1, "a completed pickup counts towards reliability");
  assert.equal((await store.post(`/api/store-orders/${order.id}/advance`)).status, 400, "a completed order cannot move further");

  const mine = await merchant.get(`/api/orders/${order.id}`);
  assert.equal(mine.body.order.status, "completed");
  assert.ok(mine.body.order.savings > 0);
});

test("a cart with items from two stores becomes two delivery orders", async () => {
  const { login } = await setup();
  const ngo = await login("annadaana@ngo.test");
  const market = await ngo.get("/api/market");
  const stores = [...new Set(market.body.listings.map((l) => l.source.id))];
  assert.ok(stores.length >= 2);
  const items = stores.slice(0, 2).map((id) => ({ listingId: market.body.listings.find((l) => l.source.id === id).id, qty: 2 }));
  const res = await ngo.post("/api/orders").send({ items, fulfilment: "delivery" });
  assert.equal(res.status, 201);
  assert.equal(res.body.orders.length, 2);
  for (const o of res.body.orders) {
    assert.equal(o.grandTotal, 0, "donations and their delivery are free for NGOs");
    assert.ok(o.etaMinutes > 0);
  }
});

test("delivery fee applies to small merchant orders only", async () => {
  const { policy, login } = await setup();
  const merchant = await login("lakshmi@kirana.test");
  const market = await merchant.get("/api/market");
  const cheap = market.body.listings.find((l) => l.eligible && l.unitPrice * 2 < policy.fulfilment.freeDeliveryAbove);
  const res = await merchant.post("/api/orders").send({ items: [{ listingId: cheap.id, qty: 1 }], fulfilment: "delivery" });
  assert.equal(res.body.orders[0].deliveryFee, policy.fulfilment.deliveryFee);
});

test("over-ordering fails and takes nothing from stock", async () => {
  const { db, login } = await setup();
  const merchant = await login("lakshmi@kirana.test");
  const market = await merchant.get("/api/market");
  const [a, b] = market.body.listings.filter((l) => l.eligible);
  const res = await merchant.post("/api/orders").send({ items: [{ listingId: a.id, qty: 1 }, { listingId: b.id, qty: b.qtyAvailable + 1 }], fulfilment: "pickup" });
  assert.equal(res.status, 409);
  assert.equal(db.prepare("SELECT qty_available FROM listings WHERE id = ?").get(a.id).qty_available, a.qtyAvailable, "the first line was rolled back");
});

test("cold-chain items are locked for merchants without a fridge", async () => {
  const { login } = await setup();
  const bakery = await login("annapoorna@bakery.test"); // no cold storage
  const market = await bakery.get("/api/market");
  const chicken = market.body.listings.find((l) => l.product.requiresCold);
  assert.ok(chicken);
  assert.equal(chicken.eligible, false);
  assert.equal((await bakery.post("/api/orders").send({ items: [{ listingId: chicken.id, qty: 1 }], fulfilment: "pickup" })).status, 403);
});

test("unverified merchants can browse but not order", async () => {
  const { login } = await setup();
  const fresh = await login("freshbasket@veg.test");
  const market = await fresh.get("/api/market");
  assert.equal(market.body.verified, false);
  const open = market.body.listings.find((l) => l.eligible);
  assert.equal((await fresh.post("/api/orders").send({ items: [{ listingId: open.id, qty: 1 }], fulfilment: "pickup" })).status, 403);
});

test("cancelled orders and no-shows put the units back", async () => {
  const { db, login } = await setup();
  const ngo = await login("annadaana@ngo.test");
  const store = await login("indiranagar@freshloop.test");
  const donations = await ngo.get("/api/market");
  const item = donations.body.listings.find((l) => l.source.name === "FreshLoop Indiranagar");
  assert.ok(item, "expiring listing should be offered to NGOs");
  assert.equal(item.unitPrice, 0);
  const qty = () => db.prepare("SELECT qty_available FROM listings WHERE id = ?").get(item.id).qty_available;
  const start = qty();

  const o1 = (await ngo.post("/api/orders").send({ items: [{ listingId: item.id, qty: 5 }], fulfilment: "pickup" })).body.orders[0];
  assert.equal(qty(), start - 5);
  assert.equal((await ngo.post(`/api/orders/${o1.id}/cancel`)).body.order.status, "cancelled");
  assert.equal(qty(), start);

  const o2 = (await ngo.post("/api/orders").send({ items: [{ listingId: item.id, qty: 3 }], fulfilment: "pickup" })).body.orders[0];
  await store.post(`/api/store-orders/${o2.id}/advance`);
  await store.post(`/api/store-orders/${o2.id}/advance`);
  assert.equal((await store.post(`/api/store-orders/${o2.id}/no-show`)).body.order.status, "no_show");
  assert.equal(qty(), start);
});

test("stores only see and change their own orders", async () => {
  const { login } = await setup();
  const kor = await login("koramangala@freshloop.test");
  const ind = await login("indiranagar@freshloop.test");
  const korOrders = (await kor.get("/api/store-orders")).body.orders;
  assert.ok(korOrders.length > 0);
  assert.ok(korOrders.every((o) => o.store.name === "FreshLoop Koramangala"));
  assert.equal((await ind.post(`/api/store-orders/${korOrders[0].id}/advance`)).status, 403);
});

test("new partners register unverified; HQ verifies them", async () => {
  const { app, login } = await setup();
  const reg = await request(app).post("/api/auth/register").send({
    name: "Test Owner", email: "new@shop.test", password: "longenough1", role: "merchant", orgName: "New Shop",
    address: "1 Test Road", phone: "98450 00000", lat: 12.93, lng: 77.62, hasColdStorage: true,
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.org.verified, false);
  assert.equal((await request(app).post("/api/auth/register").send({ name: "x", email: "bad", password: "short", role: "store" })).status, 400, "stores cannot self-register");

  const admin = await login("admin@freshloop.test");
  const v = await admin.post(`/api/admin/orgs/${reg.body.org.id}/verify`).send({ verified: true });
  assert.equal(v.body.org.verified, true);
  const audit = await admin.get("/api/admin/audit");
  assert.ok(audit.body.entries.some((e) => e.action === "org.verify"));
});

test("dashboard reports network outcomes for HQ", async () => {
  const { login } = await setup();
  const admin = await login("admin@freshloop.test");
  const d = await admin.get("/api/dashboard");
  assert.equal(d.body.scope, "network");
  assert.ok(d.body.outcomes.rescuedUnits > 0);
  assert.equal(d.body.sites.length, 4);
});

test("data screen flags a sales rate far from the store's history", async () => {
  const { db, login } = await setup();
  const store = await login("koramangala@freshloop.test");
  const milk = db.prepare("SELECT id FROM products WHERE sku = 'MILK-TND-500'").get().id;
  const expiry = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const body = { productId: milk, qty: 50, dailySales: 400, expiryDate: expiry };
  assert.equal((await store.post("/api/inventory/batches").send(body)).status, 409);
  assert.equal((await store.post("/api/inventory/batches").send({ ...body, confirmAnomaly: true })).status, 201);
  assert.equal((await store.post("/api/inventory/batches").send({ ...body, dailySales: 38 })).status, 201);
});

test("no customer personal data is stored (DPDP check)", async () => {
  const { db } = await setup();
  const columns = db.prepare("SELECT name FROM pragma_table_info('claims') UNION SELECT name FROM pragma_table_info('listings') UNION SELECT name FROM pragma_table_info('batches')").all().map((c) => c.name);
  for (const pii of ["customer_name", "customer_phone", "customer_email", "aadhaar", "customer_address"]) assert.ok(!columns.includes(pii), `unexpected PII column ${pii}`);
});
