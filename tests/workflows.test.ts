import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingMatches, memberNeeds } from "../lib/workflows";
import { demoData } from "../lib/demo";
import type { Appointment } from "../lib/types";

const zone = "America/Los_Angeles";
const booking = {
  status: "booked",
  slots: { starts_at: "2026-09-24T06:00:00Z", ends_at: "2026-09-24T07:00:00Z" },
} as Appointment;
test("ongoing sessions remain upcoming until their end, then become pending", () => {
  const ongoing = Date.parse("2026-09-24T06:30:00Z");
  const ended = Date.parse(booking.slots.ends_at);
  assert.equal(bookingMatches(booking, "upcoming", zone, ongoing), true);
  assert.equal(bookingMatches(booking, "pending", zone, ongoing), false);
  assert.equal(bookingMatches(booking, "upcoming", zone, ended), false);
  assert.equal(bookingMatches(booking, "pending", zone, ended), true);
  for (const status of ["completed", "cancelled"] as const) {
    assert.equal(
      bookingMatches({ ...booking, status }, "pending", zone, ended),
      false,
    );
    assert.equal(
      bookingMatches({ ...booking, status }, "upcoming", zone, ongoing),
      false,
    );
  }
});
test("today uses the studio calendar date even near UTC midnight", () => {
  assert.equal(
    bookingMatches(booking, "today", zone, Date.parse("2026-09-24T06:30:00Z")),
    true,
  );
  assert.equal(
    bookingMatches(booking, "today", zone, Date.parse("2026-09-24T08:00:00Z")),
    false,
  );
  assert.equal(
    bookingMatches(
      { ...booking, status: "cancelled" },
      "today",
      zone,
      Date.parse("2026-09-24T06:30:00Z"),
    ),
    false,
  );
});
test("member setup requires their own published nondeleted plan and accepts zero or one configured price", () => {
  const data = demoData();
  assert.deepEqual(memberNeeds(data, "member-0"), {
    plan: false,
    price: false,
  });
  assert.deepEqual(memberNeeds(data, "member-3"), { plan: true, price: true });
  data.plans[0].deleted_at = "2026-09-24T00:00Z";
  assert.equal(memberNeeds(data, "member-0").plan, true);
  data.plans[0].deleted_at = null;
  for (const status of ["draft", "archived"] as const) {
    data.plans[0].status = status;
    assert.equal(memberNeeds(data, "member-0").plan, true);
  }
  data.member_prices[0].single_price = 0;
  data.member_prices[0].monthly_price = null;
  assert.equal(memberNeeds(data, "member-0").price, false);
  data.member_prices[0].single_price = null;
  assert.equal(memberNeeds(data, "member-0").price, true);
});
