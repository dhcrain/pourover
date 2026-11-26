// Run with: node --test
// recipes.js is a browser script (globals, no exports), so load it in a vm context.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "public", "recipes.js"), "utf8"),
  ctx
);
const get = (name) => vm.runInContext(name, ctx);
const getRecipe = get("getRecipe");
const scaleRecipe = get("scaleRecipe");
const buildFourSixBreakpoints = get("buildFourSixBreakpoints");
const BALANCE_OPTIONS = get("BALANCE_OPTIONS");
const STRENGTH_OPTIONS = get("STRENGTH_OPTIONS");

test("getRecipe finds known ids and returns null otherwise", () => {
  assert.equal(getRecipe("foursix").id, "foursix");
  assert.equal(getRecipe("v60-hoffmann").id, "v60-hoffmann");
  assert.equal(getRecipe("nope"), null);
});

test("4:6 breakpoints: count, order, and end at 100%", () => {
  for (const b of BALANCE_OPTIONS) {
    for (const s of STRENGTH_OPTIONS) {
      const bps = buildFourSixBreakpoints(b.id, s.id);
      assert.equal(bps.length, 2 + s.pours, `${b.id}/${s.id} length`);
      assert.equal(bps[bps.length - 1].percent, 1);
      for (let i = 1; i < bps.length; i++) {
        assert.ok(bps[i].percent > bps[i - 1].percent, `${b.id}/${s.id} increasing`);
      }
    }
  }
});

test("4:6 first 40% splits per balance", () => {
  const even = buildFourSixBreakpoints("even", "medium");
  assert.ok(Math.abs(even[0].percent - 0.2) < 1e-9);
  assert.ok(Math.abs(even[1].percent - 0.4) < 1e-9);
  const sweet = buildFourSixBreakpoints("sweet", "medium");
  assert.ok(sweet[0].percent < 0.2);
  const acidic = buildFourSixBreakpoints("acidic", "medium");
  assert.ok(acidic[0].percent > 0.2);
});

test("4:6 unknown balance/strength fall back to even/medium", () => {
  // JSON round-trip: objects built inside the vm context have a different realm's prototypes.
  assert.deepEqual(
    JSON.parse(JSON.stringify(buildFourSixBreakpoints("x", "y"))),
    JSON.parse(JSON.stringify(buildFourSixBreakpoints("even", "medium")))
  );
});

test("scaleRecipe 4:6: total water, pours sum to total, last step final", () => {
  const scaled = scaleRecipe(getRecipe("foursix"), 20, "even", "medium");
  assert.equal(scaled.totalWater, 300);
  const last = scaled.steps[scaled.steps.length - 1];
  assert.equal(last.totalWeight, 300);
  assert.equal(last.isFinal, true);
  assert.equal(scaled.steps.filter((s) => s.isFinal).length, 1);
  assert.equal(scaled.steps.reduce((n, s) => n + s.pourAmount, 0), 300);
});

test("scaleRecipe 4:6: timing", () => {
  const scaled = scaleRecipe(getRecipe("foursix"), 20, "even", "medium");
  assert.equal(scaled.steps.length, 5);
  assert.equal(scaled.totalEstimateSeconds, 4 * 45 + 30);
  scaled.steps.forEach((s, i) => assert.equal(s.atSeconds, i * 45));
  assert.equal(scaled.steps[4].durationSeconds, 30);
});

test("scaleRecipe V60: fixed schedule scaled by dose", () => {
  const scaled = scaleRecipe(getRecipe("v60-hoffmann"), 15);
  assert.equal(scaled.totalWater, 250);
  assert.equal(scaled.totalEstimateSeconds, 180);
  assert.deepEqual(
    Array.from(scaled.steps, (s) => s.totalWeight),
    [50, 100, 150, 200, 250]
  );
  assert.deepEqual(
    Array.from(scaled.steps, (s) => s.atSeconds),
    [0, 45, 70, 90, 110]
  );
  assert.equal(scaled.steps[4].durationSeconds, 70);
});

test("step durations add up to the total estimate", () => {
  for (const id of ["foursix", "v60-hoffmann"]) {
    const scaled = scaleRecipe(getRecipe(id), 22, "acidic", "strong");
    assert.equal(
      scaled.steps.reduce((n, s) => n + s.durationSeconds, 0),
      scaled.totalEstimateSeconds
    );
  }
});
