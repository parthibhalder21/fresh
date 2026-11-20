// Waste simulation used by the CI "waste gate".
//
// It replays a fixed set of synthetic store batches through the risk engine
// and the surplus cascade (rebalance -> local merchants -> NGOs), then reports
// how much food would be wasted and how much demand would go unmet (stockouts).
// The scenario is generated from a fixed seed, so every run gives the same
// numbers and a change in the result can only come from a change in the policy
// or the engine.

import { assessBatch, dynamicPrice } from "./risk.js";

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateScenario({ seed = 42, size = 600 } = {}) {
  const r = rng(seed);
  const between = (lo, hi) => lo + r() * (hi - lo);
  const items = [];
  for (let i = 0; i < size; i++) {
    const forecast = Math.round(between(2, 40));            // what the store thinks it sells per day
    const actual = forecast * between(0.7, 1.3);            // what it really sells (unknown to the engine)
    const shelfDays = Math.floor(between(1, 10));           // days until expiry when received
    const qty = Math.round(forecast * (shelfDays + 1) * between(0.6, 2.2));
    items.push({
      qty,
      forecast,
      actual,
      shelfDays,
      basePrice: Math.round(between(10, 200)),
      requiresCold: r() < 0.4,
      neighbourCapacity: Math.round(qty * between(0, 0.5)), // what other stores could absorb
      merchantDemand: between(0.3, 0.9),                     // appetite of nearby merchants
      coldMerchantShare: between(0.2, 0.8),                  // share of merchants with a fridge
      ngoUptake: between(0.5, 0.95),
    });
  }
  return items;
}

function simulateItem(it, policy) {
  const totalDemand = it.actual * (it.shelfDays + 1);
  const baselineWaste = Math.max(0, it.qty - totalDemand);

  // The engine first looks at a batch when it enters the lookahead window.
  const flagDay = Math.max(0, it.shelfDays - policy.lookaheadDays);
  const soldBefore = Math.min(it.qty, it.actual * flagDay);
  const onHand = it.qty - soldBefore;
  const daysLeft = it.shelfDays - flagDay;
  const demandLeft = it.actual * (daysLeft + 1);

  const today = "2026-01-01";
  const expiry = new Date(Date.UTC(2026, 0, 1 + daysLeft)).toISOString().slice(0, 10);
  const a = assessBatch({ qty: onHand, dailySales: it.forecast, expiryDate: expiry }, today, policy);

  let rebalanced = 0, merchant = 0, ngo = 0;
  if (a.surplus > 0) {
    rebalanced = Math.min(a.surplus, it.neighbourCapacity);
    const offered = a.surplus - rebalanced;
    if (daysLeft > policy.ngoEscalationDaysLeft) {
      const { discountPct } = dynamicPrice(it.basePrice, daysLeft, policy);
      const timeFactor = Math.min(1, (daysLeft + 1) / 3);
      const coldFactor = it.requiresCold ? it.coldMerchantShare : 1;
      const uptake = Math.min(1, it.merchantDemand * timeFactor * coldFactor * (0.6 + discountPct / 100));
      merchant = offered * uptake;
    }
    ngo = (offered - merchant) * it.ngoUptake;
  }
  const kept = onHand - a.surplus;
  const shelfWaste = Math.max(0, kept - demandLeft);
  const listingWaste = Math.max(0, a.surplus - rebalanced - merchant - ngo);
  // Stockouts we caused: demand the store could have met with its own stock, but did not.
  const stockout = Math.max(0, Math.min(onHand, demandLeft) - kept);

  return { qty: it.qty, demand: totalDemand, baselineWaste, waste: shelfWaste + listingWaste, stockout, rebalanced, merchant, ngo };
}

export function simulate(policy, scenario = generateScenario()) {
  const t = { qty: 0, demand: 0, baselineWaste: 0, waste: 0, stockout: 0, rebalanced: 0, merchant: 0, ngo: 0 };
  for (const it of scenario) {
    const s = simulateItem(it, policy);
    for (const k of Object.keys(t)) t[k] += s[k];
  }
  const pct = (x, of) => +((100 * x) / of).toFixed(2);
  return {
    items: scenario.length,
    wastePct: pct(t.waste, t.qty),
    baselineWastePct: pct(t.baselineWaste, t.qty),
    stockoutPct: pct(t.stockout, t.demand),
    rebalancedPct: pct(t.rebalanced, t.qty),
    soldToMerchantsPct: pct(t.merchant, t.qty),
    donatedPct: pct(t.ngo, t.qty),
  };
}
