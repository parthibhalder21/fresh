import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, assessBatch, coldChainEligible, daysBetween, dynamicPrice, haversineKm, rebalanceSuggestions } from "../src/risk.js";
import { loadPolicy } from "../src/config.js";

const policy = loadPolicy();
const today = "2026-03-10";

test("dates: daysBetween and addDays", () => {
  assert.equal(daysBetween(today, "2026-03-12"), 2);
  assert.equal(daysBetween(today, "2026-03-09"), -1);
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});

test("surplus is stock above expected sales plus the safety buffer", () => {
  // 2 days left -> 3 sellable days x 10/day = 30 expected, keep ceil(30 x 1.15) = 35
  const a = assessBatch({ qty: 50, dailySales: 10, expiryDate: "2026-03-12" }, today, policy);
  assert.equal(a.sellableDays, 3);
  assert.equal(a.keepQty, 35);
  assert.equal(a.surplus, 15);
  assert.equal(a.riskLevel, "high");
});

test("risk levels follow the policy windows", () => {
  const level = (qty, days) => assessBatch({ qty, dailySales: 1, expiryDate: addDays(today, days) }, today, policy).riskLevel;
  assert.equal(level(100, 1), "high");
  assert.equal(level(100, policy.lookaheadDays), "medium");
  assert.equal(level(100, policy.lookaheadDays + 3), "watch");
  assert.equal(level(1, 3), "ok");
  assert.equal(level(5, -1), "expired");
});

test("no surplus when stock will sell in time", () => {
  const a = assessBatch({ qty: 20, dailySales: 10, expiryDate: "2026-03-12" }, today, policy);
  assert.equal(a.surplus, 0);
  assert.equal(a.riskLevel, "ok");
});

test("price falls as expiry approaches", () => {
  const prices = [4, 3, 2, 1, 0].map((d) => dynamicPrice(100, d, policy).unitPrice);
  for (let i = 1; i < prices.length; i++) assert.ok(prices[i] < prices[i - 1], `price should drop: ${prices}`);
  assert.equal(dynamicPrice(100, 9, policy).discountPct, 30);
  assert.equal(dynamicPrice(100, 0, policy).discountPct, 85);
});

test("cold chain: dairy and meat only go to partners with a fridge", () => {
  assert.equal(coldChainEligible(true, false), false);
  assert.equal(coldChainEligible(true, true), true);
  assert.equal(coldChainEligible(false, false), true);
});

test("haversine distance is sensible", () => {
  const d = haversineKm({ lat: 12.9352, lng: 77.6245 }, { lat: 12.9719, lng: 77.6412 });
  assert.ok(d > 4 && d < 5, `got ${d}`);
});

test("rebalancing never sends more than a store can sell", () => {
  const a = assessBatch({ qty: 100, dailySales: 10, expiryDate: "2026-03-11" }, today, policy); // 2 sellable days
  const s = rebalanceSuggestions({ lat: 0, lng: 0 }, a, [
    { orgId: 1, name: "Busy", lat: 0, lng: 0.01, qty: 10, dailySales: 30 }, // can take 60 - 10 = 50
    { orgId: 2, name: "Full", lat: 0, lng: 0.02, qty: 100, dailySales: 20 }, // already full
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].orgId, 1);
  assert.equal(s[0].suggestedQty, Math.min(a.surplus, 50));
});
