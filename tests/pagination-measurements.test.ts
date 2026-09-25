import { test } from "node:test";
import assert from "node:assert/strict";
import { pageWindow } from "../lib/pagination";
import {
  kgToLb,
  poundsToStoredKg,
  readMeasurements,
} from "../lib/measurements";
test("pagination uses ten rows, handles empty data and clamps a removed last page", () => {
  assert.deepEqual(pageWindow(0, 1), { page: 1, pages: 1, start: 0, end: 0 });
  assert.deepEqual(pageWindow(10, 2), { page: 1, pages: 1, start: 0, end: 10 });
  assert.deepEqual(pageWindow(11, 2), {
    page: 2,
    pages: 2,
    start: 10,
    end: 11,
  });
  assert.deepEqual(pageWindow(25, 3), {
    page: 3,
    pages: 3,
    start: 20,
    end: 25,
  });
  const rows = Array.from({ length: 25 }, (_, i) => i);
  const pages = [1, 2, 3].flatMap((n) => {
    const p = pageWindow(rows.length, n);
    return rows.slice(p.start, p.end);
  });
  assert.deepEqual(pages, rows);
});
test("US measurements convert historical values without repeated rounding drift", () => {
  assert.equal(kgToLb(62.5), 137.8);
  assert.equal(kgToLb(null), null);
  assert.equal(poundsToStoredKg(137.8, 62.5), 62.5);
  assert.equal(poundsToStoredKg(150), 68.0388555);
  assert.equal(poundsToStoredKg(null, 62.5), null);
  assert.deepEqual(
    readMeasurements({
      waist_in: "32.5",
      height_in: "70",
      sleep_hours: "0",
      resting_hr: "",
    }),
    { height_in: 70, waist_in: 32.5, sleep_hours: 0 },
  );
  assert.throws(() => readMeasurements({ waist_in: "-1" }));
  assert.throws(() => readMeasurements({ sleep_hours: "25" }));
  assert.throws(() => readMeasurements({ resting_hr: "Infinity" }));
});
