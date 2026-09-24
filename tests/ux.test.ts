import { test } from "node:test";
import assert from "node:assert/strict";
import { initialMember, LatestRead, saveThenRefresh } from "../lib/forms";
import { compareBookings } from "../lib/booking";
import { scheduleDays } from "../lib/time";
import type { Appointment } from "../lib/types";

test("new content respects the selected student and never defaults to an unrelated student", () => {
  assert.equal(initialMember(undefined, "b", ["a", "b"]), "b");
  assert.equal(initialMember(undefined, "all", ["a", "b"]), "");
  assert.equal(initialMember("b", "a", ["a", "b"]), "b");
  assert.equal(initialMember(undefined, "disabled", ["a", "b"]), "");
});
test("logout and newer reads invalidate old account responses", () => {
  const reads = new LatestRead();
  const accountA = reads.begin();
  reads.invalidate();
  assert.equal(accountA(), false);
  const firstB = reads.begin();
  const latestB = reads.begin();
  assert.equal(firstB(), false);
  assert.equal(latestB(), true);
});
test("successful writes are not reported as failed when only the refresh fails", async () => {
  let writes = 0;
  const result = await saveThenRefresh(
    async () => {
      writes++;
    },
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(result, false);
  assert.equal(writes, 1);
  let read = false;
  await assert.rejects(
    saveThenRefresh(
      async () => {
        throw new Error("permission denied");
      },
      async () => {
        read = true;
      },
    ),
    /permission denied/,
  );
  assert.equal(read, false);
  assert.equal(
    await saveThenRefresh(
      async () => {},
      async () => {},
    ),
    true,
  );
});
test("upcoming and ongoing bookings precede history, closest first", () => {
  const make = (
    id: string,
    start: string,
    status: Appointment["status"] = "booked",
  ) =>
    ({
      id,
      status,
      slots: {
        starts_at: start,
        ends_at: new Date(Date.parse(start) + 3600000).toISOString(),
      },
    }) as Appointment;
  const bookings = [
    make("far", "2026-09-29T16:00Z"),
    make("past", "2026-09-20T16:00Z"),
    make("near", "2026-09-24T16:00Z"),
    make("ongoing", "2026-09-23T16:00Z"),
    make("cancelled", "2026-09-30T16:00Z", "cancelled"),
  ];
  assert.deepEqual(
    bookings
      .sort((a, b) => compareBookings(a, b, Date.parse("2026-09-23T16:30Z")))
      .map((b) => b.id),
    ["ongoing", "near", "far", "cancelled", "past"],
  );
});
test("calendar advances studio dates continuously across DST and distant viewer timezones", () => {
  const old = process.env.TZ;
  try {
    for (const viewer of ["Pacific/Auckland", "America/New_York", "UTC"]) {
      process.env.TZ = viewer;
      const dates = scheduleDays(
        "America/Los_Angeles",
        0,
        new Date("2026-03-08T07:30:00Z"),
      );
      assert.deepEqual(dates, [
        "2026-03-07",
        "2026-03-08",
        "2026-03-09",
        "2026-03-10",
        "2026-03-11",
        "2026-03-12",
        "2026-03-13",
      ]);
      assert.equal(
        scheduleDays(
          "America/Los_Angeles",
          1,
          new Date("2026-12-29T02:00Z"),
        )[0],
        "2027-01-04",
      );
    }
  } finally {
    if (old === undefined) delete process.env.TZ;
    else process.env.TZ = old;
  }
});
