// Risk engine: pure functions with no database access, so they are easy to test
// and are shared by the API and by the waste-gate simulation in CI.

const DAY_MS = 86_400_000;

/** Local calendar date as YYYY-MM-DD. */
export function toISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso, n) {
  return new Date(parseISO(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso` (0 = same day, negative = in the past). */
export function daysBetween(fromIso, toIso) {
  return Math.round((parseISO(toIso) - parseISO(fromIso)) / DAY_MS);
}

/**
 * Assess one batch of stock.
 *
 * daysLeft      days until the expiry date (0 = expires today)
 * sellableDays  days the store can still sell it, counting today
 * expectedSales what the store should sell before expiry at its normal rate
 * keepQty       expected sales plus a safety buffer, so moving stock out does
 *               not cause stockouts
 * surplus       what is left over: the stock at risk of being wasted
 */
export function assessBatch({ qty, dailySales, expiryDate }, today, policy) {
  const daysLeft = daysBetween(today, expiryDate);
  if (daysLeft < 0) {
    return { daysLeft, sellableDays: 0, expectedSales: 0, keepQty: 0, surplus: qty, riskScore: qty > 0 ? 1 : 0, riskLevel: "expired" };
  }
  const sellableDays = daysLeft + 1;
  const expectedSales = dailySales * sellableDays;
  const keepQty = Math.ceil(expectedSales * (1 + policy.safetyBuffer));
  const surplus = Math.max(0, qty - keepQty);
  const riskScore = qty > 0 ? +(surplus / qty).toFixed(3) : 0;

  let riskLevel = "ok";
  if (surplus > 0) {
    if (daysLeft <= policy.highRiskDays) riskLevel = "high";
    else if (daysLeft <= policy.lookaheadDays) riskLevel = "medium";
    else riskLevel = "watch";
  }
  return { daysLeft, sellableDays, expectedSales: +expectedSales.toFixed(1), keepQty, surplus, riskScore, riskLevel };
}

/** Price falls as expiry gets closer, following the policy's discount schedule. */
export function dynamicPrice(basePrice, daysLeft, policy) {
  const schedule = [...policy.discountSchedule].sort((a, b) => b.minDaysLeft - a.minDaysLeft);
  const step = schedule.find((s) => daysLeft >= s.minDaysLeft) ?? schedule[schedule.length - 1];
  const unitPrice = Math.round(basePrice * (1 - step.discountPct / 100) * 100) / 100;
  return { unitPrice, discountPct: step.discountPct };
}

/** Great-circle distance in km. */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return +(2 * R * Math.asin(Math.sqrt(h))).toFixed(2);
}

/**
 * Rebalancing: which of our own stores could sell some of this surplus before it
 * expires? A store can absorb stock up to what it expects to sell in the
 * remaining days, minus what it already holds.
 *
 * candidates: [{ orgId, name, lat, lng, qty, dailySales }]
 *   qty and dailySales are that store's current holdings of the same product.
 */
export function rebalanceSuggestions(source, assessment, candidates) {
  if (assessment.surplus <= 0 || assessment.daysLeft < 0) return [];
  return candidates
    .map((c) => {
      const capacity = Math.max(0, Math.floor(c.dailySales * assessment.sellableDays) - c.qty);
      return {
        orgId: c.orgId,
        name: c.name,
        distanceKm: haversineKm(source, c),
        theirQty: c.qty,
        theirDailySales: c.dailySales,
        suggestedQty: Math.min(assessment.surplus, capacity),
      };
    })
    .filter((s) => s.suggestedQty > 0)
    .sort((a, b) => b.suggestedQty - a.suggestedQty || a.distanceKm - b.distanceKm);
}

/** Can this organisation safely take this product? Dairy and meat need a fridge. */
export function coldChainEligible(requiresCold, hasColdStorage) {
  return !requiresCold || Boolean(hasColdStorage);
}
