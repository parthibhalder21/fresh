// The store side of a listing: escalate to NGOs, withdraw, or recover.
// Orders against listings are handled in routes/orders.js.
import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { audit } from "../audit.js";
import { badRequest, forbidden } from "../errors.js";
import { toISODate } from "../risk.js";
import { getListingRow, listingsForOrg, runHousekeeping } from "../services.js";

const recoverSchema = z.object({ method: z.enum(["compost", "animal_feed"]) });

export function listingRoutes(db, policy) {
  const r = Router();
  r.use(requireRole("store", "admin"));

  const own = (req) => {
    const row = getListingRow(db, Number(req.params.id));
    if (row.org_id !== req.user.orgId) throw forbidden("This listing belongs to another site");
    return row;
  };
  const hasPendingClaims = (id) => Boolean(db.prepare("SELECT 1 FROM claims WHERE listing_id = ? AND status = 'claimed'").get(id));

  r.get("/", (req, res) => {
    const today = toISODate();
    runHousekeeping(db, policy, today);
    res.json({ today, listings: listingsForOrg(db, req.user.orgId, today, policy) });
  });

  r.post("/:id/escalate", (req, res) => {
    const l = own(req);
    if (l.stage !== "merchant") throw badRequest("Only listings still open to merchants can be sent to NGOs");
    db.prepare("UPDATE listings SET stage = 'ngo', updated_at = datetime('now') WHERE id = ?").run(l.id);
    audit(db, req, "listing.escalate", "listing", l.id);
    res.json({ ok: true });
  });

  r.post("/:id/withdraw", (req, res) => {
    const l = own(req);
    if (l.stage === "closed") throw badRequest("This listing is already closed");
    if (hasPendingClaims(l.id)) throw badRequest("Confirm or cancel pending pickups first");
    db.transaction(() => {
      if (l.batch_id && l.qty_available > 0) db.prepare("UPDATE batches SET qty = qty + ? WHERE id = ?").run(l.qty_available, l.batch_id);
      db.prepare("UPDATE listings SET stage = 'closed', closed_reason = 'withdrawn', qty_available = 0, updated_at = datetime('now') WHERE id = ?").run(l.id);
    })();
    audit(db, req, "listing.withdraw", "listing", l.id, `${l.qty_available} units back to shelf`);
    res.json({ ok: true });
  });

  r.post("/:id/recover", (req, res) => {
    const l = own(req);
    const { method } = recoverSchema.parse(req.body);
    if (l.stage === "closed" && l.closed_reason !== "expired") throw badRequest("This listing is already closed");
    if (hasPendingClaims(l.id)) throw badRequest("Confirm or cancel pending pickups first");
    if (l.qty_available <= 0) throw badRequest("Nothing left to recover");
    db.transaction(() => {
      db.prepare("INSERT INTO recoveries (listing_id, org_id, qty, method) VALUES (?, ?, ?, ?)").run(l.id, l.org_id, l.qty_available, method);
      db.prepare("UPDATE listings SET stage = 'closed', closed_reason = ?, qty_available = 0, updated_at = datetime('now') WHERE id = ?").run(method, l.id);
    })();
    audit(db, req, "listing.recover", "listing", l.id, `${l.qty_available} units to ${method}`);
    res.json({ ok: true });
  });

  return r;
}
