import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import english from "../lib/en.json";
import { preferredLanguage, translate } from "../lib/i18n";
import { displayTime } from "../lib/time";
import { localizedNotificationBody } from "../lib/notification-language";
import { emailContent, emailText } from "../lib/email";

test("language preferences and interpolation preserve member-authored text", () => {
  assert.equal(preferredLanguage(null, "en-US"), "en");
  assert.equal(preferredLanguage("zh", "en-US"), "zh");
  assert.equal(preferredLanguage("en", "zh-CN"), "en");
  assert.equal(
    translate("{0}，今天也要向前一步。", "en", ["训练计划"]),
    "训练计划, let's take another step forward.",
  );
  assert.equal(translate("unknown user content", "en"), "unknown user content");
});
test("English times use the studio zone, AM/PM and English weekdays; date keys remain stable", () => {
  assert.equal(
    displayTime("2026-09-27T16:00:00Z", "America/Los_Angeles", undefined, "en"),
    "Sun, Sep 27 · 9:00 AM",
  );
  for (const language of ["zh", "en"] as const)
    assert.equal(
      displayTime(
        "2026-09-27T01:00:00Z",
        "America/Los_Angeles",
        "yyyy-MM-dd",
        language,
      ),
      "2026-09-26",
    );
});
test("English notifications retain snapshot times, user names and multiline notes", () => {
  const body =
    "学员：训练计划\n原时间：2026-09-27 09:00 – 2026-09-27 10:00\n新时间：2026-09-28 09:00 – 2026-09-28 10:00\n时区：America/Los_Angeles\n地点：Studio A\n原因：保持原文\n训练时间：这是用户的备注";
  const localized = localizedNotificationBody(body, "en");
  assert.match(localized, /Member: 训练计划/);
  assert.match(localized, /Previous time: 09\/27\/2026 9:00 AM/);
  assert.match(localized, /New time: 09\/28\/2026 9:00 AM/);
  assert.match(localized, /Reason: 保持原文\n训练时间：这是用户的备注/);
  assert.equal(localizedNotificationBody(body, "zh"), body);
  for (const subject of [
    "预约已确认",
    "预约已改期",
    "预约已取消",
    "课程未到场（No show）",
    "训练提醒",
    "购课付款已确认",
  ]) {
    const html = emailContent(
      "<Member>",
      subject,
      "",
      "https://www.yvonnefitness.com",
      "Yvonne Fitness",
      "en",
    );
    const text = emailText(
      "Member",
      subject,
      "",
      "https://www.yvonnefitness.com",
      "en",
    );
    assert.doesNotMatch(html + text, /[\u3400-\u9fff]/);
    assert.match(html, /&lt;Member&gt;/);
    assert.match(html, /page=packages#course-policy/);
  }
  assert.equal(
    localizedNotificationBody("按次课时已入账：3 节。", "en"),
    "3 session credit(s) added.",
  );
  assert.match(
    localizedNotificationBody(
      "不限次数包月已开通：2026-09-26 至 2026-12-25（美西日期，含结束日）。到期后需手动购买，不自动续费。",
      "en",
    ),
    /2026-12-25.*no automatic renewal/,
  );
});
test("all localized UI messages have English translations and matching placeholders", async () => {
  const dictionary: Record<string, string> = english;
  for (const [key, value] of Object.entries(dictionary)) {
    assert.deepEqual(
      [...key.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
      [...value.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
      key,
    );
  }
  for (const file of [
    "components/studio.tsx",
    "components/payments.tsx",
    "components/session-accounts.tsx",
    "components/paginated.tsx",
    "components/course-policy.tsx",
    "app/auth/callback/page.tsx",
    "app/auth/verify/page.tsx",
  ]) {
    const source = ts.createSourceFile(
      file,
      await readFile(new URL("../" + file, import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function walk(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const key = node.arguments[0].text;
        assert.ok(
          dictionary[key] != null ||
            dictionary[key.trim().replace(/\s+/g, " ")] != null,
          file + ": " + key,
        );
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
});
