import { test } from "node:test";
import assert from "node:assert/strict";
import {
  packageOptions,
  salePackages,
  onlineBenefits,
  courseCategories,
  packageDescription,
} from "../lib/package-options";
import {
  sessionCreditBalance,
  memberSessionStats,
} from "../lib/session-accounts";
import { demoData } from "../lib/demo";
import type { SessionEntry } from "../lib/types";
import { translate } from "../lib/i18n";
import { localizedNotificationBody } from "../lib/notification-language";
const entry = (
  id: string,
  day: string,
  quantity: number,
  expiry: string | null = null,
): SessionEntry => ({
  id,
  member_id: "m",
  created_at: day + "T20:00:00Z",
  quantity,
  expires_on: expiry,
  kind: quantity > 0 ? "purchase" : "lesson",
  note: "",
  amount: null,
  currency: "USD",
  appointment_id: null,
  membership_id: null,
});
test("expiring credits are spent before undated balances; expiry is inclusive and does not pay later lessons", () => {
  const rows = [
    entry("1", "2026-01-01", 3),
    entry("2", "2026-02-01", 5, "2026-04-30"),
    entry("3", "2026-03-01", -1),
    entry("4", "2026-04-30", -1),
    entry("5", "2026-05-01", -1),
  ];
  assert.equal(
    sessionCreditBalance(rows, "2026-04-30", "America/Los_Angeles").balance,
    6,
  );
  const result = sessionCreditBalance(
    rows,
    "2026-05-01",
    "America/Los_Angeles",
  );
  assert.equal(result.balance, 2);
  assert.equal(result.expired, 3);
  assert.equal(result.lots.find((x) => x.id === "1")?.remaining, 2);
  const exhausted = sessionCreditBalance(
    [entry("a", "2026-01-01", 5, "2026-01-31"), entry("b", "2026-02-01", -1)],
    "2026-02-01",
    "America/Los_Angeles",
  );
  assert.equal(exhausted.balance, -1);
  assert.equal(exhausted.expired, 5);
});
test("legacy debts, adjustments and multiple expiry dates reconcile without changing historic usage", () => {
  const rows = [
    entry("1", "2026-01-01", -2),
    entry("2", "2026-01-02", 5, "2026-02-28"),
    entry("3", "2026-01-03", 5, "2026-01-31"),
    entry("4", "2026-01-04", -1),
  ];
  const result = sessionCreditBalance(
    rows,
    "2026-02-01",
    "America/Los_Angeles",
  );
  assert.equal(result.balance, 3);
  assert.equal(result.expired, 4);
  const snapshot = JSON.stringify(rows);
  sessionCreditBalance(rows, "2026-03-01", "America/Los_Angeles");
  assert.equal(JSON.stringify(rows), snapshot);
  const data = demoData();
  data.session_entries = rows;
  data.appointments = [];
  data.monthly_memberships = [];
  data.online_memberships = [
    {
      id: "online",
      member_id: "m",
      starts_on: "2026-01-01",
      ends_on: "2026-12-31",
      note: "",
      amount: 100,
      currency: "USD",
      created_at: "2026-01-01",
      cancelled_at: null,
      cancel_reason: null,
    },
  ];
  const stats = memberSessionStats(data, "m", new Date("2026-02-01T20:00Z"));
  assert.equal(stats.balance, 3);
  assert.equal(stats.membership, undefined);
  assert.equal(stats.online?.id, "online");
});
test("the eight sale plans and included services are bilingual with no imported public prices", () => {
  assert.equal(salePackages.length, 8);
  assert.equal(salePackages.includes("quarterly"), false);
  assert.equal(salePackages.includes("annual"), false);
  assert.deepEqual(
    [
      packageOptions.starter.sessions,
      packageOptions.standard.sessions,
      packageOptions.premium.sessions,
    ],
    [5, 10, 20],
  );
  for (const k of salePackages) {
    assert.equal("price" in packageOptions[k], false);
    assert.doesNotMatch(
      translate(packageOptions[k].label, "en"),
      /[\u3400-\u9fff]/,
    );
    assert.doesNotMatch(
      translate(packageDescription(k), "en"),
      /[\u3400-\u9fff]/,
    );
  }
  for (const text of [
    ...onlineBenefits,
    ...courseCategories.flatMap((c) => [c.label, c.description]),
  ])
    assert.doesNotMatch(translate(text, "en"), /[\u3400-\u9fff]/);
  for (const body of [
    "线下套餐课时已入账：5 节，有效至 2026-12-25（含当日）。",
    "线上指导已开通：2026-09-26 至 2026-12-25（含结束日）。不包含线下课程，不自动续费。",
  ]) {
    const en = localizedNotificationBody(body, "en");
    assert.doesNotMatch(en, /[\u3400-\u9fff]/);
    assert.match(en, /2026-12-25/);
  }
});

test("late completion marking uses the lesson date for expiring credits", () => {
  const data = demoData();
  data.monthly_memberships = [];
  data.online_memberships = [];
  const purchase = entry("purchase", "2026-01-01", 5, "2026-03-31");
  const debit = {
    ...entry("debit", "2026-04-02", -1),
    appointment_id: "lesson",
  };
  data.session_entries = [purchase, debit];
  data.appointments = [
    {
      id: "lesson",
      member_id: "m",
      slot_id: "s",
      status: "completed",
      message: "",
      reason: "",
      created_at: "2026-03-01T20:00:00Z",
      slots: {
        starts_at: "2026-03-31T18:00:00Z",
        ends_at: "2026-03-31T19:00:00Z",
      },
    },
  ];
  const result = memberSessionStats(
    data,
    "m",
    new Date("2026-04-02T20:00:00Z"),
  );
  assert.equal(result.balance, 0);
  assert.equal(result.expired, 4);
  assert.equal(result.used, 1);
});
