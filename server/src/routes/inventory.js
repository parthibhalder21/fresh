// Inventory for supermarkets and the central warehouse: risk scoring,
// rebalancing between our own sites, and listing surplus for local merchants.
import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { audit } from "../audit.js";
import { badRequest, forbidden, HttpError, notFound } from "../errors.js";
import { assessBatch, rebalanceSuggestions, toISODate } from "../risk.js";
import { batchView, getOrg, inventoryRows, riskSummary } from "../services.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date (YYYY-MM-DD)");

const batchSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().min(1).max(100000),
  dailySales: z.number().min(0).max(100000),
  expiryDate: isoDate,
  confirmAnomaly: z.boolean().optional(),
});
const batchPatch = z.object({
  qty: z.number().int().min(0).max(100000).optional(),
  dailySales: z.number().min(0).max(100000).optional(),
});
const transferSchema = z.object({ toOrgId: z.number().int().positive(), qty: z.number().int().min(1) });
const listSchema = z.object({ qty: z.number().int().min(1) });

export default function inventoryRoutes(db, policy) {
  const r = Router();
  r.use(requireRole("store", "admin"));

  const loadBatch = (req) => {
    const row = db
      .prepare(
        `SELECT b.*, p.sku, p.name AS product_name, p.category, p.unit, p.base_price, p.requires_cold, p.image
         FROM batches b JOIN products p ON p.id = b.product_id WHERE b.id = ?`
      )
      .get(Number(req.params.id));
    if (!row) throw notFound("Batch");
    if (row.org_id !== req.user.orgId) throw forbidden("This batch belongs to another site");
    return row;
  };

  r.get("/", (req, res) => {
    const today = toISODate();
    const batches = inventoryRows(db, req.user.orgId).map((row) => batchView(row, today, policy));
    res.json({ today, org: getOrg(db, req.user.orgId).name, summary: riskSummary(batches), batches });
  });

  r.post("/batches", (req, res) => {
    const input = batchSchema.parse(req.body);
    if (!db.prepare("SELECT 1 FROM products WHERE id = ?").get(input.productId)) throw notFound("Product");
    if (input.expiryDate < toISODate()) throw badRequest("expiryDate: is in the past");

    // Data screen: a sales rate far from this site's own history may be a typo or
    // a poisoned input, and it would skew every risk score for this batch.
    const history = db
      .prepare("SELECT daily_sales FROM batches WHERE org_id = ? AND product_id = ? AND daily_sales > 0 ORDER BY id DESC LIMIT 20")
      .all(req.user.orgId, input.productId)
      .map((r) => r.daily_sales)
      .sort((a, b) => a - b);
    if (history.length && !input.confirmAnomaly) {
      const median = history[Math.floor((history.length - 1) / 2)]; // lower median: one outlier cannot shift it
      if (input.dailySales > median * 3 || input.dailySales < median / 3) {
        audit(db, req, "data.anomaly_flagged", "product", input.productId, `dailySales ${input.dailySales} vs median ${median}`);
        throw new HttpError(409, `A sales rate of ${input.dailySales}/day is far from this store's usual ${median}/day for this product. Check the figure, or confirm to save it anyway.`);
      }
    }
    const info = db
      .prepare("INSERT INTO batches (org_id, product_id, qty, daily_sales, expiry_date, received_date) VALUES (?, ?, ?, ?, ?, ?)")
      .run(req.user.orgId, input.productId, input.qty, input.dailySales, input.expiryDate, toISODate());
    audit(db, req, input.confirmAnomaly ? "batch.create_override" : "batch.create", "batch", Number(info.lastInsertRowid), `qty ${input.qty}, ${input.dailySales}/day`);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  r.patch("/batches/:id", (req, res) => {
    const batch = loadBatch(req);
    const input = batchPatch.parse(req.body);
    db.prepare("UPDATE batches SET qty = ?, daily_sales = ? WHERE id = ?").run(input.qty ?? batch.qty, input.dailySales ?? batch.daily_sales, batch.id);
    audit(db, req, "batch.update", "batch", batch.id, JSON.stringify(input));
    res.json({ ok: true });
  });

  r.get("/batches/:id/rebalance", (req, res) => {
    const batch = loadBatch(req);
    const today = toISODate();
    const assessment = assessBatch({ qty: batch.qty, dailySales: batch.daily_sales, expiryDate: batch.expiry_date }, today, policy);
    const source = getOrg(db, req.user.orgId);
    const candidates = db
      .prepare(
        `SELECT o.id AS orgId, o.name, o.lat, o.lng,
                COALESCE(SUM(CASE WHEN b.expiry_date >= ? THEN b.qty END), 0) AS qty,
                COALESCE(SUM(CASE WHEN b.expiry_date >= ? THEN b.daily_sales END), 0) AS dailySales
         FROM orgs o JOIN batches b ON b.org_id = o.id AND b.product_id = ?
         WHERE o.type = 'store' AND o.id != ?
         GROUP BY o.id`
      )
      .all(today, today, batch.product_id, source.id);
    res.json({ assessment, suggestions: rebalanceSuggestions(source, assessment, candidates) });
  });

  r.post("/batches/:id/transfer", (req, res) => {
    const batch = loadBatch(req);
    const { toOrgId, qty } = transferSchema.parse(req.body);
    if (qty > batch.qty) throw badRequest(`Only ${batch.qty} units in this batch`);
    const dest = getOrg(db, toOrgId);
    if (!["store", "warehouse"].includes(dest.type) || dest.id === batch.org_id) throw badRequest("Stock can only move to another of our own sites");
    const today = toISODate();
    if (batch.expiry_date < today) throw badRequest("This batch has expired");

    const move = db.transaction(() => {
      db.prepare("UPDATE batches SET qty = qty - ? WHERE id = ?").run(qty, batch.id);
      const existing = db.prepare("SELECT id FROM batches WHERE org_id = ? AND product_id = ? AND expiry_date = ?").get(dest.id, batch.product_id, batch.expiry_date);
      let toBatchId;
      if (existing) {
        db.prepare("UPDATE batches SET qty = qty + ? WHERE id = ?").run(qty, existing.id);
        toBatchId = existing.id;
      } else {
        // The receiving store sells at its own rate; we only move the stock.
        const rate = db.prepare("SELECT daily_sales FROM batches WHERE org_id = ? AND product_id = ? ORDER BY id DESC LIMIT 1").get(dest.id, batch.product_id);
        toBatchId = Number(
          db
            .prepare("INSERT INTO batches (org_id, product_id, qty, daily_sales, expiry_date, received_date) VALUES (?, ?, ?, ?, ?, ?)")
            .run(dest.id, batch.product_id, qty, rate ? rate.daily_sales : batch.daily_sales, batch.expiry_date, today).lastInsertRowid
        );
      }
      const t = db
        .prepare("INSERT INTO transfers (product_id, from_org_id, to_org_id, from_batch_id, to_batch_id, qty, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(batch.product_id, batch.org_id, dest.id, batch.id, toBatchId, qty, req.user.id);
      return Number(t.lastInsertRowid);
    });
    const transferId = move();
    audit(db, req, "transfer.create", "transfer", transferId, `${qty} x ${batch.product_name} to ${dest.name}`);
    res.status(201).json({ id: transferId });
  });

  r.post("/batches/:id/list", (req, res) => {
    const batch = loadBatch(req);
    const { qty } = listSchema.parse(req.body);
    if (qty > batch.qty) throw badRequest(`Only ${batch.qty} units in this batch`);
    const today = toISODate();
    const a = assessBatch({ qty: batch.qty, dailySales: batch.daily_sales, expiryDate: batch.expiry_date }, today, policy);
    if (a.daysLeft < 0) throw badRequest("Expired stock cannot be listed. Send it to compost or animal feed instead.");
    const stage = a.daysLeft <= policy.ngoEscalationDaysLeft ? "ngo" : "merchant";
    const create = db.transaction(() => {
      db.prepare("UPDATE batches SET qty = qty - ? WHERE id = ?").run(qty, batch.id);
      return Number(
        db
          .prepare("INSERT INTO listings (batch_id, org_id, product_id, qty_initial, qty_available, base_price, expiry_date, stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(batch.id, batch.org_id, batch.product_id, qty, qty, batch.base_price, batch.expiry_date, stage).lastInsertRowid
      );
    });
    const listingId = create();
    audit(db, req, "listing.create", "listing", listingId, `${qty} x ${batch.product_name} (${stage})`);
    res.status(201).json({ id: listingId, stage });
  });

  return r;
}

