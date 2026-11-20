#!/usr/bin/env node
// Waste gate (Novelty 1): a release check on outcomes, not on accuracy.
//
// The current risk policy is replayed on a fixed scenario. The build fails if
// simulated food waste or stockouts are worse than the approved baseline.
//
//   npm run waste-gate                    check the policy against the baseline
//   npm run waste-gate:update             accept the current results as the new baseline
import fs from "node:fs";
import path from "node:path";
import { loadPolicy, SERVER_ROOT } from "../src/config.js";
import { simulate } from "../src/sim.js";

const BASELINE = path.join(SERVER_ROOT, "config", "waste-gate-baseline.json");
const TOLERANCE_PP = 0.25; // percentage points of slack for rounding

const policy = loadPolicy();
const result = simulate(policy);

if (process.argv.includes("--update-baseline")) {
  fs.writeFileSync(BASELINE, `${JSON.stringify({ policyVersion: policy.version, updatedAt: new Date().toISOString().slice(0, 10), ...result }, null, 2)}\n`);
  console.log(`Baseline updated for policy v${policy.version}.`);
  console.table(result);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const rows = [
  ["Food wasted (% of stock)", base.wastePct, result.wastePct],
  ["Stockouts caused (% of demand)", base.stockoutPct, result.stockoutPct],
  ["Rebalanced to other stores (%)", base.rebalancedPct, result.rebalancedPct],
  ["Sold to local merchants (%)", base.soldToMerchantsPct, result.soldToMerchantsPct],
  ["Donated to NGOs (%)", base.donatedPct, result.donatedPct],
];

console.log(`\nWaste gate: policy v${policy.version} vs approved baseline (policy v${base.policyVersion})`);
console.log(`Scenario: ${result.items} synthetic batches. With no system at all, ${result.baselineWastePct}% of stock would be wasted.\n`);
console.log(`${"Metric".padEnd(34)}${"Baseline".padStart(10)}${"Candidate".padStart(11)}`);
for (const [label, b, c] of rows) console.log(`${label.padEnd(34)}${String(b).padStart(10)}${String(c).padStart(11)}`);

const failures = [];
if (result.wastePct > base.wastePct + TOLERANCE_PP) failures.push(`food waste rose from ${base.wastePct}% to ${result.wastePct}%`);
if (result.stockoutPct > base.stockoutPct + TOLERANCE_PP) failures.push(`stockouts rose from ${base.stockoutPct}% to ${result.stockoutPct}%`);

if (failures.length) {
  console.error(`\nFAILED: ${failures.join("; ")}.`);
  console.error("This policy would waste more food or empty more shelves than the one in production, so it cannot ship.");
  process.exit(1);
}
console.log("\nPASSED: no increase in food waste or stockouts.");
