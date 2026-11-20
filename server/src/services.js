// Database-backed helpers shared by several routes.
import { assessBatch, coldChainEligible, daysBetween, dynamicPrice, haversineKm, toISODate } from "./risk.js";
import { notFound } from "./errors.js";

export function getOrg(db, id) {
  const org = db.prepare("SELECT * FROM orgs WHERE id = ?").get(id);
  if (!org) throw notFound("Organisation");
  return org;
}

export function publicOrg(org) {
  return {
    id: org.id,
    type: org.type,
    name: org.name,
    address: org.address,
    lat: org.lat,
    lng: org.lng,
    phone: org.phone,
    hasColdStorage: Boolean(org.has_cold_storage),
    verified: Boolean(org.verified),
    pickupsTotal: org.pickups_total,
    pickupsOnTime: org.pickups_on_time,
    rating: rating(org),
  };
}

/** Reliability rating out of 5, from the share of pickups made on time. */
export function rating(org) {
  if (!org.pickups_total) return null;
  return Math.max(1, Math.round((5 * org.pickups_on_time) / org.pickups_total * 10) / 10);
}

/**
 * Lazy housekeeping, run before listings are read:
 * - merchant listings close to expiry move to the NGO stage
 * - listings past expiry are closed and counted as wasted
 */
export function runHousekeeping(db, policy, today = toISODate()) {
  db.prepare(
    `UPDATE listings SET stage = 'closed', closed_reason = 'expired', updated_at = datetime('now')
     WHERE stage IN ('merchant', 'ngo') AND expiry_date < ?`
  ).run(today);
  db.prepare(
    `UPDATE listings SET stage = 'ngo', updated_at = datetime('now')
     WHERE stage = 'merchant' AND qty_available > 0
       AND julianday(expiry_date) - julianday(?) <= ?`
  ).run(today, policy.ngoEscalationDaysLeft);
  db.prepare(
    `UPDATE listings SET stage = 'closed', closed_reason = 'cleared', updated_at = datetime('now')
     WHERE stage IN ('merchant', 'ngo') AND qty_available = 0
       AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.listing_id = listings.id AND c.status = 'claimed')`
  ).run();
}

export function batchView(row, today, policy) {
  const assessment = assessBatch({ qty: row.qty, dailySales: row.daily_sales, expiryDate: row.expiry_date }, today, policy);
  return {
    id: row.id,
    qty: row.qty,
    dailySales: row.daily_sales,
    expiryDate: row.expiry_date,
    receivedDate: row.received_date,
    product: {
      id: row.product_id,
      sku: row.sku,
      name: row.product_name,
      category: row.category,
      unit: row.unit,
      basePrice: row.base_price,
      requiresCold: Boolean(row.requires_cold),
      image: row.image,
    },
    assessment,
    surplusValue: Math.round(assessment.surplus * row.base_price),
  };
}

export function inventoryRows(db, orgId) {
  return db
    .prepare(
      `SELECT b.*, p.sku, p.name AS product_name, p.category, p.unit, p.base_price, p.requires_cold, p.image
       FROM batches b JOIN products p ON p.id = b.product_id
       WHERE b.org_id = ? AND b.qty > 0
       ORDER BY b.expiry_date ASC, p.name ASC`
    )
    .all(orgId);
}

const LISTING_SELECT = `
  SELECT l.*, p.name AS product_name, p.category, p.unit, p.requires_cold, p.sku, p.image,
         o.name AS org_name, o.address AS org_address, o.lat AS org_lat, o.lng AS org_lng, o.phone AS org_phone
  FROM listings l
  JOIN products p ON p.id = l.product_id
  JOIN orgs o ON o.id = l.org_id`;

export function listingView(row, today, policy, viewer = null) {
  const daysLeft = daysBetween(today, row.expiry_date);
  const price = row.stage === "ngo" ? { unitPrice: 0, discountPct: 100 } : dynamicPrice(row.base_price, daysLeft, policy);
  const tomorrow = row.stage === "merchant" && daysLeft > 0 ? dynamicPrice(row.base_price, daysLeft - 1, policy) : null;
  const view = {
    id: row.id,
    stage: row.stage,
    closedReason: row.closed_reason,
    qtyInitial: row.qty_initial,
    qtyAvailable: row.qty_available,
    basePrice: row.base_price,
    unitPrice: price.unitPrice,
    discountPct: price.discountPct,
    tomorrowPrice: tomorrow && tomorrow.unitPrice < price.unitPrice ? tomorrow.unitPrice : null,
    expiryDate: row.expiry_date,
    daysLeft,
    createdAt: row.created_at,
    product: { id: row.product_id, name: row.product_name, category: row.category, unit: row.unit, sku: row.sku, image: row.image, requiresCold: Boolean(row.requires_cold) },
    source: { id: row.org_id, name: row.org_name, address: row.org_address, phone: row.org_phone },
  };
  if (viewer) {
    view.distanceKm = haversineKm(viewer, { lat: row.org_lat, lng: row.org_lng });
    view.eligible = coldChainEligible(row.requires_cold, viewer.has_cold_storage);
    view.ineligibleReason = view.eligible ? null : "Needs cold storage";
  }
  return view;
}

export function openListingsForViewer(db, stage, viewer, radiusKm, today, policy) {
  return db
    .prepare(`${LISTING_SELECT} WHERE l.stage = ? AND l.qty_available > 0 AND l.expiry_date >= ? ORDER BY l.expiry_date ASC`)
    .all(stage, today)
    .map((r) => listingView(r, today, policy, viewer))
    .filter((l) => l.distanceKm <= radiusKm)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.distanceKm - b.distanceKm);
}

export function getListingRow(db, id) {
  const row = db.prepare(`${LISTING_SELECT} WHERE l.id = ?`).get(id);
  if (!row) throw notFound("Listing");
  return row;
}

export function listingsForOrg(db, orgId, today, policy) {
  const rows = db.prepare(`${LISTING_SELECT} WHERE l.org_id = ? ORDER BY l.stage = 'closed', l.expiry_date ASC, l.id DESC`).all(orgId);
  const claimStmt = db.prepare(
    `SELECT c.*, o.name AS org_name, o.phone AS org_phone, o.type AS org_type
     FROM claims c JOIN orgs o ON o.id = c.org_id WHERE c.listing_id = ? ORDER BY c.id DESC`
  );
  return rows.map((r) => ({
    ...listingView(r, today, policy),
    claims: claimStmt.all(r.id).map(claimView),
  }));
}

export function claimView(c) {
  return {
    id: c.id,
    listingId: c.listing_id,
    channel: c.channel,
    qty: c.qty,
    unitPrice: c.unit_price,
    total: Math.round(c.qty * c.unit_price * 100) / 100,
    status: c.status,
    pickupBy: c.pickup_by,
    pickedUpAt: c.picked_up_at,
    createdAt: c.created_at,
    claimant: c.org_name ? { id: c.org_id, name: c.org_name, phone: c.org_phone, type: c.org_type } : undefined,
  };
}

/** Outcome totals. Pass orgId to scope to one store, or null for the whole network. */
export function outcomes(db, orgId = null) {
  const scope = " AND (@orgId IS NULL OR l.org_id = @orgId)";
  const p = { orgId };
  const transfers = db
    .prepare(`SELECT COALESCE(SUM(qty),0) AS units FROM transfers WHERE (@orgId IS NULL OR from_org_id = @orgId)`)
    .get(p).units;
  const merchant = db
    .prepare(
      `SELECT COALESCE(SUM(c.qty),0) AS units, COALESCE(SUM(c.qty * c.unit_price),0) AS revenue
       FROM claims c JOIN listings l ON l.id = c.listing_id
       WHERE c.status = 'picked_up' AND c.channel = 'merchant'${scope}`
    )
    .get(p);
  const ngo = db
    .prepare(
      `SELECT COALESCE(SUM(c.qty),0) AS units FROM claims c JOIN listings l ON l.id = c.listing_id
       WHERE c.status = 'picked_up' AND c.channel = 'ngo'${scope}`
    )
    .get(p).units;
  const recovered = db
    .prepare(`SELECT COALESCE(SUM(r.qty),0) AS units FROM recoveries r JOIN listings l ON l.id = r.listing_id WHERE 1=1${scope}`)
    .get(p).units;
  const expired = db
    .prepare(`SELECT COALESCE(SUM(l.qty_available),0) AS units FROM listings l WHERE l.stage = 'closed' AND l.closed_reason = 'expired'${scope}`)
    .get(p).units;
  return {
    rebalancedUnits: transfers,
    soldToMerchantsUnits: merchant.units,
    merchantRevenue: Math.round(merchant.revenue),
    donatedUnits: ngo,
    compostedUnits: recovered,
    expiredUnits: expired,
    rescuedUnits: transfers + merchant.units + ngo,
  };
}

export function riskSummary(batches) {
  const atRisk = batches.filter((b) => ["high", "medium"].includes(b.assessment.riskLevel));
  return {
    batches: batches.length,
    atRiskBatches: atRisk.length,
    highRiskBatches: batches.filter((b) => b.assessment.riskLevel === "high").length,
    surplusUnits: atRisk.reduce((s, b) => s + b.assessment.surplus, 0),
    surplusValue: atRisk.reduce((s, b) => s + b.surplusValue, 0),
    expiredUnits: batches.filter((b) => b.assessment.riskLevel === "expired").reduce((s, b) => s + b.qty, 0),
  };
}
