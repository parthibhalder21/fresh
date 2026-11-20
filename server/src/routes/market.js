// The buyer side: local merchants see discounted listings nearby,
// NGOs see free donations. Same code, different stage and radius.
// Buying happens through the cart checkout in routes/orders.js.
import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { audit } from "../audit.js";
import { toISODate } from "../risk.js";
import { getOrg, openListingsForViewer, publicOrg, runHousekeeping } from "../services.js";

const orgPatch = z.object({
  hasColdStorage: z.boolean().optional(),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,20}$/, "is not a valid phone number").optional(),
  address: z.string().trim().min(3).max(200).optional(),
});

export function marketRoutes(db, policy) {
  const r = Router();
  r.use(requireRole("merchant", "ngo"));

  const stageFor = (role) => (role === "merchant" ? "merchant" : "ngo");
  const radiusFor = (role) => (role === "merchant" ? policy.merchantRadiusKm : policy.ngoRadiusKm);

  r.get("/", (req, res) => {
    const today = toISODate();
    runHousekeeping(db, policy, today);
    const viewer = getOrg(db, req.user.orgId);
    res.json({
      today,
      radiusKm: radiusFor(req.user.role),
      verified: Boolean(viewer.verified),
      deliverTo: viewer.address,
      fulfilment: policy.fulfilment,
      listings: openListingsForViewer(db, stageFor(req.user.role), viewer, radiusFor(req.user.role), today, policy),
    });
  });

  return r;
}

export function profileRoutes(db) {
  const r = Router();
  r.use(requireRole("merchant", "ngo"));
  r.patch("/org", (req, res) => {
    const input = orgPatch.parse(req.body);
    const org = getOrg(db, req.user.orgId);
    db.prepare("UPDATE orgs SET has_cold_storage = ?, phone = ?, address = ? WHERE id = ?").run(
      input.hasColdStorage === undefined ? org.has_cold_storage : input.hasColdStorage ? 1 : 0,
      input.phone ?? org.phone,
      input.address ?? org.address,
      org.id
    );
    audit(db, req, "org.update", "org", org.id, JSON.stringify(input));
    res.json({ org: publicOrg(getOrg(db, org.id)) });
  });
  return r;
}
