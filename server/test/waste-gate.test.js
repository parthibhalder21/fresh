import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPolicy } from "../src/config.js";
import { generateScenario, simulate } from "../src/sim.js";

const policy = loadPolicy();

test("simulation is deterministic", () => {
  assert.deepEqual(simulate(policy), simulate(policy));
  assert.deepEqual(generateScenario({ seed: 7, size: 5 }), generateScenario({ seed: 7, size: 5 }));
});

test("the network wastes far less than doing nothing", () => {
  const r = simulate(policy);
  assert.ok(r.wastePct < r.baselineWastePct / 2, JSON.stringify(r));
});

test("the gate sees the trade-off: no buffer causes stockouts, a big buffer causes waste", () => {
  const current = simulate(policy);
  const noBuffer = simulate({ ...policy, safetyBuffer: 0 });
  const bigBuffer = simulate({ ...policy, safetyBuffer: 0.6 });
  assert.ok(noBuffer.stockoutPct > current.stockoutPct);
  assert.ok(bigBuffer.wastePct > current.wastePct);
});
