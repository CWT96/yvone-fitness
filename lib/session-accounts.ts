import type {
  Data,
  MonthlyMembership,
  SessionEntry,
  Appointment,
} from "./types";
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
// Replay the immutable journal. Expiring purchases are used first; expired unused
// credits never pay for a later debit. Existing undated credits retain their meaning.
export function sessionCreditBalance(
  entries: SessionEntry[],
  today: string,
  zone: string,
) {
  const lots: { id: string; remaining: number; expires_on: string | null }[] =
    [];
  let debt = 0,
    expired = 0;
  function expire(day: string) {
    for (const lot of lots)
      if (lot.expires_on && lot.expires_on < day) {
        expired += lot.remaining;
        lot.remaining = 0;
      }
  }
  for (const e of [...entries].sort(
    (a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      b.quantity - a.quantity ||
      a.id.localeCompare(b.id),
  )) {
    const day = displayTime(e.created_at, zone, "yyyy-MM-dd");
    if (day > today) continue;
    expire(day);
    if (e.quantity > 0) {
      const repaid = Math.min(debt, e.quantity);
      debt -= repaid;
      lots.push({
        id: e.id,
        remaining: e.quantity - repaid,
        expires_on: e.expires_on || null,
      });
    } else if (e.quantity < 0) {
      let needed = -e.quantity;
      for (const lot of [...lots].sort((a, b) =>
        (a.expires_on || "9999-12-31").localeCompare(
          b.expires_on || "9999-12-31",
        ),
      )) {
        const used = Math.min(needed, lot.remaining);
        lot.remaining -= used;
        needed -= used;
        if (!needed) break;
      }
      debt += needed;
    }
  }
  expire(today);
  return {
    balance: lots.reduce((n, l) => n + l.remaining, 0) - debt,
    expired,
    lots,
  };
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
    ...sessionCreditBalance(
      entries.map((e) => {
        const lesson = e.appointment_id
          ? bookings.find((b) => b.id === e.appointment_id)
          : undefined;
        // Late coach marking must still honor credits valid on the actual lesson date.
        return lesson && e.quantity < 0
          ? { ...e, created_at: lesson.slots.starts_at }
          : e;
      }),
      today,
      zone,
    ),
    online: membershipForDate(data.online_memberships || [], member, today),
    purchased: entries
      .filter((e) => e.kind === "purchase")
      .reduce((sum, e) => sum + e.quantity, 0),
    adjusted: entries
      .filter((e) => e.kind === "adjustment")
      .reduce((sum, e) => sum + e.quantity, 0),
    used: entries.filter((e) => e.kind === "lesson" || e.kind === "no_show")
      .length,
    noShows: bookings.filter((b) => b.status === "no_show").length,
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
  no_show: "未到场扣课",
  monthly_no_show: "包月缺席（不扣课）",
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

export function balanceAfterLesson(data: Data, lesson: Appointment) {
  if (data.session_entries.some((e) => e.appointment_id === lesson.id))
    return memberSessionStats(data, lesson.member_id).balance;
  return memberSessionStats(
    {
      ...data,
      session_entries: [
        ...data.session_entries,
        {
          id: `preview-${lesson.id}`,
          member_id: lesson.member_id,
          kind: "lesson",
          quantity: -1,
          note: "",
          amount: null,
          currency: "USD",
          appointment_id: lesson.id,
          membership_id: null,
          created_at: new Date().toISOString(),
        },
      ],
    },
    lesson.member_id,
  ).balance;
}
