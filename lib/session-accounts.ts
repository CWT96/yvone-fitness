import type { Data, MonthlyMembership } from "./types";
import { displayTime } from "./time";

export function defaultMonthlyEnd(start: string) {
  const [year, month, day] = start.split("-").map(Number);
  const nextMonthLast = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, nextMonthLast) - 1))
    .toISOString()
    .slice(0, 10);
}

export function membershipForDate(
  memberships: MonthlyMembership[],
  member: string,
  day: string,
) {
  return memberships.find(
    (m) =>
      m.member_id === member &&
      !m.cancelled_at &&
      m.starts_on <= day &&
      m.ends_on >= day,
  );
}
export function memberSessionStats(
  data: Data,
  member: string,
  now = new Date(),
) {
  const zone = data.settings.timezone;
  const today = displayTime(now.toISOString(), zone, "yyyy-MM-dd");
  const entries = data.session_entries.filter((e) => e.member_id === member);
  const bookings = data.appointments.filter((b) => b.member_id === member);
  const completed = bookings.filter((b) => b.status === "completed");
  const upcoming = bookings.filter(
    (b) => b.status === "booked" && Date.parse(b.slots.ends_at) > now.getTime(),
  );
  return {
    balance: entries.reduce((sum, e) => sum + e.quantity, 0),
    purchased: entries
      .filter((e) => e.kind === "purchase")
      .reduce((sum, e) => sum + e.quantity, 0),
    adjusted: entries
      .filter((e) => e.kind === "adjustment")
      .reduce((sum, e) => sum + e.quantity, 0),
    used: entries.filter((e) => e.kind === "lesson").length,
    monthlyUsed: entries.filter((e) => e.kind === "monthly_lesson").length,
    completed: completed.length,
    hours: completed.reduce(
      (sum, b) =>
        sum +
        (Date.parse(b.slots.ends_at) - Date.parse(b.slots.starts_at)) / 3600000,
      0,
    ),
    thisMonth: completed.filter(
      (b) =>
        displayTime(b.slots.starts_at, zone, "yyyy-MM") === today.slice(0, 7),
    ).length,
    upcoming: upcoming.length,
    needsCredits: upcoming.filter(
      (b) =>
        !membershipForDate(
          data.monthly_memberships,
          member,
          displayTime(b.slots.starts_at, zone, "yyyy-MM-dd"),
        ),
    ).length,
    legacyCompleted: completed.filter(
      (b) => !entries.some((e) => e.appointment_id === b.id),
    ).length,
    membership: membershipForDate(data.monthly_memberships, member, today),
  };
}

export const entryLabels = {
  purchase: "购课入账",
  adjustment: "课时调整",
  lesson: "完成扣课",
  monthly_lesson: "包月上课",
};

// Same numeric rules as the database; used before demo or real mutations.
export function validateCredit(quantity: number, kind: string, note: string) {
  if (
    !Number.isInteger(quantity) ||
    !quantity ||
    Math.abs(quantity) > 10000 ||
    (kind === "purchase" && quantity < 0)
  )
    throw new Error("请输入有效的整数课次（最多 10000 节）");
  if (!note.trim() || note.length > 2000)
    throw new Error("请填写说明或调整原因（最多 2000 字）");
}
