// Orders: the cart checkout for merchants and NGOs, and the order queue for stores.
//
// A checkout can hold items from several stores. It becomes one order per store,
// each delivered by that store's rider or collected by the buyer.
//
// Store flow:  placed -> packed -> out_for_delivery -> completed   (delivery)
//                             \-> ready_for_pickup  -> completed   (pickup)
//              placed/packed -> cancelled;  ready_for_pickup -> no_show
import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { audit } from "../audit.js";
import { badRequest, forbidden, HttpError, notFound } from "../errors.js";
import { coldChainEligible, daysBetween, dynamicPrice, haversineKm, toISODate } from "../risk.js";
import { getListingRow, getOrg, runHousekeeping } from "../services.js";

const checkoutSchema = z.object({
  items: z.array(z.object({ listingId: z.number().int().positive(), qty: z.number().int().min(1).max(10000) })).min(1).max(50),
  fulfilment: z.enum(["delivery", "pickup"]),
});

const ACTIVE = ["placed", "packed", "out_for_delivery", "ready_for_pickup"];
const round2 = (x) => Math.round(x * 100) / 100;

export function orderView(db, o) {
  const items = db
    .prepare(
      `SELECT c.id, c.listing_id, c.qty, c.unit_price, c.status, l.base_price, p.name, p.unit, p.category, p.image
       FROM claims c JOIN listings l ON l.id = c.listing_id JOIN products p ON p.id = l.product_id
       WHERE c.order_id = ? ORDER BY c.id`
    )
    .all(o.id)
    .map((c) => ({
      claimId: c.id,
      listingId: c.listing_id,
      qty: c.qty,
      unitPrice: c.unit_price,
      mrp: c.base_price,
      total: round2(c.qty * c.unit_price),
      product: { name: c.name, unit: c.unit, category: c.category, image: c.image },
    }));
  const store = getOrg(db, o.store_org_id);
  const buyer = getOrg(db, o.buyer_org_id);
  return {
    id: o.id,
    status: o.status,
    fulfilment: o.fulfilment,
    channel: o.channel,
    itemTotal: o.item_total,
    mrpTotal: o.mrp_total,
    savings: round2(o.mrp_total - o.item_total),
    deliveryFee: o.delivery_fee,
    grandTotal: round2(o.item_total + o.delivery_fee),
    itemCount: items.reduce((s, i) => s + i.qty, 0),
    distanceKm: o.distance_km,
    etaMinutes: o.eta_minutes,
    deliverTo: o.deliver_to,
    placedAt: o.placed_at,
    dueBy: o.due_by,
    packedAt: o.packed_at,
    dispatchedAt: o.dispatched_at,
    completedAt: o.completed_at,
    cancelledAt: o.cancelled_at,
    store: { id: store.id, name: store.name, address: store.address, phone: store.phone },
    buyer: { id: buyer.id, name: buyer.name, address: buyer.address, phone: buyer.phone, type: buyer.type },
    items,
  };
}

/** Put the units of a cancelled or missed order back on their listings. */
function releaseItems(db, orderId, claimStatus) {
  const claims = db.prepare("SELECT * FROM claims WHERE order_id = ?").all(orderId);
  for (const c of claims) {
    db.prepare("UPDATE claims SET status = ? WHERE id = ?").run(claimStatus, c.id);
    db.prepare("UPDATE listings SET qty_available = qty_available + ?, updated_at = datetime('now') WHERE id = ? AND stage != 'closed'").run(c.qty, c.listing_id);
  }
}

export function buyerOrderRoutes(db, policy) {
  const r = Router();
  r.use(requireRole("merchant", "ngo"));
  const stageFor = (role) => (role === "merchant" ? "merchant" : "ngo");
  const radiusFor = (role) => (role === "merchant" ? policy.merchantRadiusKm : policy.ngoRadiusKm);
  const f = policy.fulfilment;

  r.post("/", (req, res) => {
    const input = checkoutSchema.parse(req.body);
    const today = toISODate();
    runHousekeeping(db, policy, today);
    const buyer = getOrg(db, req.user.orgId);
    if (!buyer.verified) throw forbidden("Your account is waiting for verification by FreshLoop before you can order");
    const ngo = req.user.role === "ngo";

    // Merge repeated lines, then check every item before touching stock.
    const wanted = new Map();
    for (const it of input.items) wanted.set(it.listingId, (wanted.get(it.listingId) ?? 0) + it.qty);
    const lines = [...wanted].map(([listingId, qty]) => {
      const l = getListingRow(db, listingId);
      if (l.stage !== stageFor(req.user.role) || l.qty_available <= 0) throw new HttpError(409, `${l.product_name} is no longer available`);
      if (!coldChainEligible(l.requires_cold, buyer.has_cold_storage)) throw forbidden(`${l.product_name} needs cold storage, which your profile does not have`);
      const distanceKm = haversineKm(buyer, { lat: l.org_lat, lng: l.org_lng });
      if (distanceKm > radiusFor(req.user.role)) throw forbidden(`${l.org_name} is outside your area`);
      const unitPrice = ngo ? 0 : dynamicPrice(l.base_price, daysBetween(today, l.expiry_date), policy).unitPrice;
      return { l, qty, unitPrice, distanceKm };
    });

    const byStore = new Map();
    for (const line of lines) {
      if (!byStore.has(line.l.org_id)) byStore.set(line.l.org_id, []);
      byStore.get(line.l.org_id).push(line);
    }

    const now = Date.now();
    const ids = db.transaction(() => {
      const created = [];
      for (const [storeId, group] of byStore) {
        const itemTotal = round2(group.reduce((s, x) => s + x.qty * x.unitPrice, 0));
        const mrpTotal = round2(group.reduce((s, x) => s + x.qty * x.l.base_price, 0));
        const distanceKm = group[0].distanceKm;
        const delivery = input.fulfilment === "delivery";
        const fee = delivery && !ngo && itemTotal < f.freeDeliveryAbove ? f.deliveryFee : 0;
        const eta = delivery ? Math.round(f.deliveryBaseMinutes + f.deliveryMinutesPerKm * distanceKm) : f.pickupReadyMinutes;
        const dueBy = new Date(now + (delivery ? eta * 60_000 : policy.pickupWindowHours * 3600_000)).toISOString();
        const orderId = Number(
          db
            .prepare(
              `INSERT INTO orders (buyer_org_id, store_org_id, channel, fulfilment, status, item_total, mrp_total, delivery_fee, distance_km, eta_minutes, deliver_to, placed_at, due_by)
               VALUES (?, ?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(buyer.id, storeId, stageFor(req.user.role), input.fulfilment, itemTotal, mrpTotal, fee, distanceKm, eta, delivery ? buyer.address : "", new Date(now).toISOString(), dueBy).lastInsertRowid
        );
        for (const x of group) {
          // Re-check inside the transaction so two buyers cannot take the same units.
          const upd = db.prepare("UPDATE listings SET qty_available = qty_available - ?, updated_at = datetime('now') WHERE id = ? AND qty_available >= ?").run(x.qty, x.l.id, x.qty);
          if (upd.changes === 0) {
            const left = db.prepare("SELECT qty_available FROM listings WHERE id = ?").get(x.l.id).qty_available;
            throw new HttpError(409, `Only ${left} of ${x.l.product_name} left. Update your cart and try again.`);
          }
          db.prepare("INSERT INTO claims (order_id, listing_id, org_id, channel, qty, unit_price, status, pickup_by) VALUES (?, ?, ?, ?, ?, ?, 'claimed', ?)").run(
            orderId, x.l.id, buyer.id, stageFor(req.user.role), x.qty, x.unitPrice, dueBy
          );
        }
        created.push(orderId);
      }
      return created;
    })();

    for (const id of ids) audit(db, req, "order.create", "order", id, `${input.fulfilment}, ${lines.length} item(s)`);
    res.status(201).json({ orders: ids.map((id) => orderView(db, db.prepare("SELECT * FROM orders WHERE id = ?").get(id))) });
  });

  r.get("/", (req, res) => {
    const rows = db.prepare("SELECT * FROM orders WHERE buyer_org_id = ? ORDER BY id DESC LIMIT 100").all(req.user.orgId);
    res.json({ orders: rows.map((o) => orderView(db, o)) });
  });

  const own = (req) => {
    const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(req.params.id));
    if (!o) throw notFound("Order");
    if (o.buyer_org_id !== req.user.orgId) throw forbidden("This is not your order");
    return o;
  };

  r.get("/:id", (req, res) => res.json({ order: orderView(db, own(req)) }));

  r.post("/:id/cancel", (req, res) => {
    const o = own(req);
    if (o.status !== "placed") throw badRequest("The store has already started packing this order");
    db.transaction(() => {
      releaseItems(db, o.id, "cancelled");
      db.prepare("UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(new Date().toISOString(), o.id);
    })();
    audit(db, req, "order.cancel", "order", o.id, "by buyer");
    res.json({ order: orderView(db, db.prepare("SELECT * FROM orders WHERE id = ?").get(o.id)) });
  });

  return r;
}

export function storeOrderRoutes(db) {
  const r = Router();
  r.use(requireRole("store", "admin"));

  const own = (req) => {
    const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(req.params.id));
    if (!o) throw notFound("Order");
    if (o.store_org_id !== req.user.orgId) throw forbidden("This order is for another site");
    return o;
  };
  const reload = (id) => orderView(db, db.prepare("SELECT * FROM orders WHERE id = ?").get(id));

  r.get("/", (req, res) => {
    const rows = db
      .prepare(`SELECT * FROM orders WHERE store_org_id = ? ORDER BY CASE WHEN status IN ('${ACTIVE.join("','")}') THEN 0 ELSE 1 END, id DESC LIMIT 200`)
      .all(req.user.orgId);
    res.json({ orders: rows.map((o) => orderView(db, o)) });
  });

  r.post("/:id/advance", (req, res) => {
    const o = own(req);
    const now = new Date().toISOString();
    let next;
    db.transaction(() => {
      if (o.status === "placed") {
        next = "packed";
        db.prepare("UPDATE orders SET status = ?, packed_at = ? WHERE id = ?").run(next, now, o.id);
      } else if (o.status === "packed") {
        next = o.fulfilment === "delivery" ? "out_for_delivery" : "ready_for_pickup";
        db.prepare("UPDATE orders SET status = ?, dispatched_at = ? WHERE id = ?").run(next, now, o.id);
      } else if (o.status === "out_for_delivery" || o.status === "ready_for_pickup") {
        next = "completed";
        db.prepare("UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?").run(now, o.id);
        db.prepare("UPDATE claims SET status = 'picked_up', picked_up_at = ? WHERE order_id = ?").run(now, o.id);
        // Reliability only measures buyers who collect for themselves.
        if (o.fulfilment === "pickup") {
          const onTime = now <= o.due_by ? 1 : 0;
          db.prepare("UPDATE orgs SET pickups_total = pickups_total + 1, pickups_on_time = pickups_on_time + ? WHERE id = ?").run(onTime, o.buyer_org_id);
        }
      } else {
        throw badRequest("This order is already closed");
      }
    })();
    audit(db, req, `order.${next}`, "order", o.id);
    res.json({ order: reload(o.id) });
  });

  r.post("/:id/cancel", (req, res) => {
    const o = own(req);
    if (!["placed", "packed"].includes(o.status)) throw badRequest("Only orders that have not left the store can be cancelled");
    db.transaction(() => {
      releaseItems(db, o.id, "cancelled");
      db.prepare("UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(new Date().toISOString(), o.id);
    })();
    audit(db, req, "order.cancel", "order", o.id, "by store");
    res.json({ order: reload(o.id) });
  });

  r.post("/:id/no-show", (req, res) => {
    const o = own(req);
    if (o.status !== "ready_for_pickup") throw badRequest("Only pickup orders waiting at the counter can be marked as no-show");
    db.transaction(() => {
      releaseItems(db, o.id, "no_show");
      db.prepare("UPDATE orders SET status = 'no_show', cancelled_at = ? WHERE id = ?").run(new Date().toISOString(), o.id);
      db.prepare("UPDATE orgs SET pickups_total = pickups_total + 1 WHERE id = ?").run(o.buyer_org_id);
    })();
    audit(db, req, "order.no_show", "order", o.id);
    res.json({ order: reload(o.id) });
  });

  return r;
}

export { ACTIVE as ACTIVE_ORDER_STATUSES };
