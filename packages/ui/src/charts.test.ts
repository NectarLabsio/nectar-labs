// node --test packages/ui/src/charts.test.ts — geometry matches the artboards' renderVals for the PRD §4 demo state.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { donutArcs, gaugeFill, gaugePoint, healthTone, inSession, ladderWidths, meterShares, niceCeil, nyHourOfWeek, sliderFill, stressBars, weekChart } from "./charts.ts";

test("health tone thresholds (Borrow artboard hc())", () => {
  assert.equal(healthTone(2.22), "pos");
  assert.equal(healthTone(1.5), "pos");
  assert.equal(healthTone(1.49), "warn");
  assert.equal(healthTone(1.1), "warn");
  assert.equal(healthTone(1.09), "neg");
});

test("gauge fill: health 2.22 of 3 → 74%; capped at 100; zero for no loan", () => {
  assert.equal(gaugeFill(2.22), 74);
  assert.equal(gaugeFill(5), 100);
  assert.equal(gaugeFill(0), 0);
  assert.equal(gaugeFill(Number.NaN), 0);
  const left = gaugePoint(0);
  const top = gaugePoint(0.5);
  assert.deepEqual(left, { x: 20, y: 120 });
  assert.deepEqual(top, { x: 120, y: 20 });
});

test("stress bars: −10/−20/−30/−50 % of health 2.22, floored at 4 px", () => {
  const b = stressBars(2.22);
  assert.deepEqual(b.map((x) => x.label), ["−10%", "−20%", "−30%", "−50%"]);
  assert.equal(b[0]!.value.toFixed(2), "2.00");
  assert.equal(b[3]!.value.toFixed(2), "1.11");
  assert.equal(b[3]!.tone, "warn");
  assert.equal(stressBars(0)[0]!.height, 4);
});

test("week chart: $78,720 in session / $61,600 closed on a $90k axis (Main artboard)", () => {
  const g = weekChart(78720, 61600, 35, 90000);
  assert.ok(g.line.startsWith("M44.0 70.5 H75.0 V40.1 H96.2 V70.5"), g.line);
  assert.ok(g.line.endsWith("H592.0"));
  assert.ok(g.area.endsWith("V180 H44 Z"));
  assert.deepEqual(g.hatches[0], [44, 31]);
  assert.equal(g.hatches[1]![0], 409.3);
  assert.equal(g.now!.x, 158.2);
  assert.equal(g.now!.y, 40.1);
  assert.deepEqual(g.ticks.map((t) => t.value), [0, 30000, 60000, 90000]);
  assert.equal(g.days.length, 7);
  assert.equal(weekChart(78720, 61600, 132, 90000).now!.y, 70.5);
  assert.equal(weekChart(1, 1, null).now, null);
});

test("session hours and nice axis", () => {
  assert.equal(inSession(9.5), true);
  assert.equal(inSession(16), false);
  assert.equal(inSession(4 * 24 + 15.9), true);
  assert.equal(inSession(5 * 24 + 12), false);
  assert.equal(niceCeil(86592), 90000);
  assert.equal(niceCeil(1), 1);
  // 2026-11-10 is a Tuesday; 15:00 UTC = 10:00 New York (EST)
  assert.equal(nyHourOfWeek(new Date("2026-11-10T15:00:00Z")), 34);
});

test("donut arcs: Q $65,000, R $5,000, D $12,000", () => {
  const a = donutArcs([{ key: "q", value: 65000 }, { key: "r", value: 5000 }, { key: "d", value: 12000 }]);
  assert.deepEqual(a.map((x) => x.pct), [79.3, 6.1, 14.6]);
  assert.equal(a[0]!.offset, "0.0");
  assert.equal(a[1]!.offset, "-79.3");
  assert.equal(a[2]!.dash, "14.6 85.4");
  assert.deepEqual(donutArcs([{ key: "q", value: 0 }]).map((x) => x.pct), [0]);
});

test("ladder widths, slider fill, meter shares", () => {
  assert.deepEqual(ladderWidths([40000, 25000, 5000]), [100, 62.5, 12.5]);
  assert.deepEqual(ladderWidths([]), []);
  assert.equal(sliderFill(20000, 0, 33600), 59.5);
  assert.equal(sliderFill(50, 0, 0), 0);
  assert.deepEqual(meterShares([65000, 5000, 12000, 3280], 82000), [79.27, 6.1, 14.63, 4]);
  assert.deepEqual(meterShares([1, 3]), [25, 75]);
});
