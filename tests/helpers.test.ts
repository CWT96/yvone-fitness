import { test } from "node:test";
import assert from "node:assert/strict";
import { localToISO, displayTime, csvCell } from "../lib/time";
import { escapeHtml, emailContent } from "../lib/email";
import { availableBookingSlots } from "../lib/booking";
test("Pacific timezone follows daylight saving time", () => {
  assert.equal(
    localToISO("2026-01-10T09:00", "America/Los_Angeles"),
    "2026-01-10T17:00:00.000Z",
  );
  assert.equal(
    localToISO("2026-07-10T09:00", "America/Los_Angeles"),
    "2026-07-10T16:00:00.000Z",
  );
  assert.equal(
    displayTime("2026-07-10T16:00:00Z", "America/Los_Angeles", "HH:mm"),
    "09:00",
  );
});
test("nonexistent spring-forward times are rejected", () => {
  assert.throws(
    () => localToISO("2026-03-08T02:30", "America/Los_Angeles"),
    /不存在/,
  );
});
test("CSV export quotes content and prevents formula execution", () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell("a,b"), '"a,b"');
});
test("email content escapes all user controlled text", () => {
  assert.equal(escapeHtml('<script>"&'), "&lt;script&gt;&quot;&amp;");
  assert.ok(
    !emailContent(
      "<img onerror=x>",
      "Test",
      "<script>x</script>",
      "https://example.com",
      "Yvone",
    ).includes("<script>"),
  );
});
test("multiline notification details remain readable and escaped", () => {
  const html = emailContent(
    "A",
    "改期",
    "原时间：09:00\n新时间：10:00\n原因：<script>bad</script>",
    "https://example.com",
    "Yvone",
  );
  assert.ok(html.includes("原时间：09:00<br />新时间：10:00"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
});
test("reschedule choices exclude current, occupied, closed and past slots", () => {
  const now = Date.parse("2026-09-22T00:00:00Z");
  const slot = (id: string, hour: number, available = true) => ({
    id,
    available,
    starts_at: new Date(now + hour * 3600000).toISOString(),
    ends_at: new Date(now + (hour + 1) * 3600000).toISOString(),
  });
  assert.deepEqual(
    availableBookingSlots(
      [
        slot("later", 8),
        slot("current", 2),
        slot("taken", 3, false),
        slot("past", -2),
        { ...slot("closed", 5), active: false },
        slot("earlier", 6),
      ],
      "current",
      now,
    ).map((s) => s.id),
    ["earlier", "later"],
  );
  assert.deepEqual(
    availableBookingSlots(
      [slot("current", 2), slot("taken", 3, false)],
      "current",
      now,
    ),
    [],
  );
});
