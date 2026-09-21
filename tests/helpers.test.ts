import { test } from "node:test";
import assert from "node:assert/strict";
import { localToISO, displayTime, csvCell } from "../lib/time";
import { escapeHtml, emailContent } from "../lib/email";
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
