import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { audit } from "../audit.js";
import { badRequest } from "../errors.js";
import { toISODate } from "../risk.js";
import { batchView, getOrg, inventoryRows, outcomes, publicOrg, riskSummary, runHousekeeping } from "../services.js";

const verifySchema = z.object({ verified: z.boolean() });

/** KPIs for one site (stores) or the whole network (HQ). */
export function dashboardRoutes(db, policy) {
  const r = Router();
  r.use(requireRole("store", "admin"));

  r.get("/", (req, res) => {
    const today = toISODate();
    runHousekeeping(db, policy, today);
    const network = req.user.role === "admin";
    const sites = network
      ? db.prepare("SELECT * FROM orgs WHERE type IN ('warehouse', 'store') ORDER BY type DESC, name").all()
      : [getOrg(db, req.user.orgId)];

    const siteRows = sites.map((o) => {
      const batches = inventoryRows(db, o.id).map((row) => batchView(row, today, policy));
      const active = db.prepare("SELECT COUNT(*) AS n FROM listings WHERE org_id = ? AND stage IN ('merchant', 'ngo')").get(o.id).n;
      const orders = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE store_org_id = ? AND status IN ('placed', 'packed', 'out_for_delivery', 'ready_for_pickup')").get(o.id).n;
      return { id: o.id, name: o.name, type: o.type, risk: riskSummary(batches), activeListings: active, activeOrders: orders, outcomes: outcomes(db, o.id) };
    });

    const totalRisk = siteRows.reduce(
      (acc, s) => ({ atRiskBatches: acc.atRiskBatches + s.risk.atRiskBatches, surplusUnits: acc.surplusUnits + s.risk.surplusUnits, surplusValue: acc.surplusValue + s.risk.surplusValue }),
      { atRiskBatches: 0, surplusUnits: 0, surplusValue: 0 }
    );

    const recent = db
      .prepare(
        `SELECT a.action, a.detail, a.created_at, u.name AS user_name, o.name AS org_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN orgs o ON o.id = a.org_id
         WHERE a.action != 'auth.login' AND (@all = 1 OR a.org_id = @org OR (a.entity = 'order' AND a.entity_id IN (SELECT id FROM orders WHERE store_org_id = @org)))
         ORDER BY a.id DESC LIMIT 8`
      )
      .all({ all: network ? 1 : 0, org: req.user.orgId });

    const merchants = network
      ? db.prepare("SELECT * FROM orgs WHERE type = 'merchant' ORDER BY pickups_total DESC LIMIT 6").all().map(publicOrg)
      : [];

    res.json({
      today,
      scope: network ? "network" : "site",
      risk: totalRisk,
      outcomes: outcomes(db, network ? null : req.user.orgId),
      sites: siteRows,
      merchants,
      recent,
    });
  });
  return r;
}

export function adminRoutes(db) {
  const r = Router();
  r.use(requireRole("admin"));

  r.get("/orgs", (req, res) => {
    const type = typeof req.query.type === "string" ? req.query.type : null;
    const rows = type ? db.prepare("SELECT * FROM orgs WHERE type = ? ORDER BY name").all(type) : db.prepare("SELECT * FROM orgs ORDER BY type, name").all();
    res.json({ orgs: rows.map(publicOrg) });
  });

  r.post("/orgs/:id/verify", (req, res) => {
    const org = getOrg(db, Number(req.params.id));
    if (!["merchant", "ngo"].includes(org.type)) throw badRequest("Only merchants and NGOs need verification");
    const { verified } = verifySchema.parse(req.body);
    db.prepare("UPDATE orgs SET verified = ? WHERE id = ?").run(verified ? 1 : 0, org.id);
    audit(db, req, verified ? "org.verify" : "org.unverify", "org", org.id, org.name);
    res.json({ org: publicOrg(getOrg(db, org.id)) });
  });

  r.get("/audit", (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const rows = db
      .prepare(
        `SELECT a.*, u.name AS user_name, u.role AS user_role, o.name AS org_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN orgs o ON o.id = a.org_id
         ORDER BY a.id DESC LIMIT ?`
      )
      .all(limit);
    res.json({ entries: rows });
  });

  return r;
}
