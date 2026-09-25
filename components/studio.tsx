"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Ticket,
  Users,
  Wallet,
  X,
  FileText,
  Send,
  RefreshCw,
  UserRound,
  Link2,
  Mail,
  CircleHelp,
} from "lucide-react";
import { configured, supabase } from "@/lib/supabase";
import { demoData } from "@/lib/demo";
import { availableBookingSlots, compareBookings } from "@/lib/booking";
import { bookingMatches, memberNeeds } from "@/lib/workflows";
import { SessionAccounts } from "@/components/session-accounts";
import {
  memberSessionStats,
  membershipForDate,
  validateCredit,
  defaultMonthlyEnd,
} from "@/lib/session-accounts";
import {
  fieldLimits,
  initialMember,
  LatestRead,
  saveThenRefresh,
} from "@/lib/forms";
import type {
  Data,
  Profile,
  Slot,
  Appointment,
  Plan,
  RecordEntry,
  MonthlyMembership,
} from "@/lib/types";
import { displayTime, localToISO, csvCell, scheduleDays } from "@/lib/time";
import type { Session } from "@supabase/supabase-js";

type Field = {
  name: string;
  label: string;
  type?: string;
  value?: string | number | boolean;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
};
type Dialog = {
  title: string;
  description?: string;
  fields: Field[];
  submit?: string;
  publication?: boolean;
  readOnly?: boolean;
  success?: string;
  action: (values: Record<string, string>) => Promise<void>;
};
const tabs = [
  ["overview", "训练概览", LayoutDashboard],
  ["schedule", "教练时间表", CalendarDays],
  ["bookings", "课程预约", Clock3],
  ["credits", "课时与统计", Activity],
  ["members", "学员管理", Users],
  ["plans", "训练计划", Dumbbell],
  ["records", "训练档案", FileText],
  ["referrals", "邀请与推荐", Ticket],
  ["packages", "购买课程", Wallet],
  ["settings", "个人与设置", Settings2],
] as const;
const zones = [
  "America/Los_Angeles",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Europe/London",
  "Australia/Sydney",
  "UTC",
];
const statusNames: Record<string, string> = {
  booked: "已预约",
  cancelled: "已取消",
  completed: "已完成",
  draft: "草稿",
  published: "当前计划",
  archived: "历史计划",
  confirmed: "推荐成功",
  pending: "等待处理",
  processing: "发送中",
  sent: "已发送",
  synced: "已同步",
  skipped: "已跳过",
  failed: "发送失败",
};
const actionNames: Record<string, string> = {
  book: "预约",
  reschedule: "改期",
  cancel: "取消",
  complete: "完成",
};
const emptyData = (): Data => ({
  ...demoData(),
  profiles: [],
  slots: [],
  appointments: [],
  plans: [],
  records: [],
  invites: [],
  referrals: [],
  events: [],
  email_jobs: [],
  packages: [],
  member_prices: [],
  contact_sync: [],
  session_entries: [],
  monthly_memberships: [],
  credits_ready: false,
});
function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`badge ${value}`}>
      {label || statusNames[value] || value}
    </span>
  );
}
function Empty({
  text = "暂时还没有记录",
  action,
}: {
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Activity size={28} />
      <p>{text}</p>
      {action}
    </div>
  );
}
function Avatar({ name }: { name: string }) {
  return <span className="avatar">{name.slice(0, 1)}</span>;
}
function DialogView({
  dialog,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  dialog: Dialog;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    if (error)
      ref.current
        ?.querySelector(".inline-error")
        ?.scrollIntoView({ block: "nearest" });
  }, [error]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <span className="eyebrow">YVONE FITNESS</span>
          <h2 id="dialog-title">{dialog.title}</h2>
        </div>
        <button
          className="icon-btn"
          aria-label="关闭"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {dialog.description && (
        <p className="muted pre-wrap">{dialog.description}</p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={onSubmit}>
        {dialog.fields.map((f) =>
          f.type === "slots" ? (
            <fieldset className="slot-choices" key={f.name}>
              <legend>
                {f.label}
                {f.required && " *"}
              </legend>
              {f.options?.length ? (
                <div className="slot-choice-list">
                  {f.options.map((o) => (
                    <label className="slot-choice" key={o.value}>
                      <input
                        type="radio"
                        name={f.name}
                        value={o.value}
                        required={f.required}
                        defaultChecked={f.value === o.value}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p role="status" className="empty-slots">
                  {f.hint}
                </p>
              )}
              {!!f.options?.length && (
                <small>请选择一个时段，再确认保存。</small>
              )}
            </fieldset>
          ) : (
            <label
              className={`field ${f.type === "checkbox" ? "check-field" : ""}`}
              key={f.name}
            >
              {f.type === "checkbox" ? (
                <>
                  <input
                    name={f.name}
                    type="checkbox"
                    defaultChecked={Boolean(f.value)}
                  />
                  <span>{f.label}</span>
                </>
              ) : (
                <>
                  <span>
                    {f.label}
                    {f.required && " *"}
                  </span>
                  {f.type === "textarea" ? (
                    <textarea
                      name={f.name}
                      defaultValue={String(f.value ?? "")}
                      required={f.required}
                      rows={7}
                      maxLength={fieldLimits[f.name] || 30000}
                    />
                  ) : f.type === "select" ? (
                    <select
                      name={f.name}
                      defaultValue={String(f.value ?? "")}
                      required={f.required}
                    >
                      <option value="" disabled>
                        请选择
                      </option>
                      {f.options?.map((o) => (
                        <option value={o.value} key={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={f.name}
                      type={f.type || "text"}
                      defaultValue={String(f.value ?? "")}
                      required={f.required}
                      min={f.min}
                      max={f.max}
                      step={f.type === "number" ? f.step || "any" : undefined}
                      minLength={f.minLength}
                      maxLength={fieldLimits[f.name] || 2000}
                    />
                  )}
                </>
              )}
              {f.hint && <small>{f.hint}</small>}
            </label>
          ),
        )}
        <div className="modal-footer">
          {!dialog.readOnly && (
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={onClose}
            >
              返回
            </button>
          )}
          {dialog.publication && (
            <button
              type="submit"
              name="intent"
              value="draft"
              className="btn secondary"
              disabled={busy}
            >
              保存草稿（仅教练）
            </button>
          )}
          <button
            name={dialog.publication ? "intent" : undefined}
            value={dialog.publication ? "publish" : undefined}
            className="btn"
            disabled={
              busy ||
              dialog.fields.some(
                (f) =>
                  (f.type === "slots" || (f.type === "select" && f.required)) &&
                  !f.options?.length,
              )
            }
          >
            {busy ? "正在保存…" : dialog.submit || "保存"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function Studio() {
  const [demo, setDemo] = useState(!configured);
  const [demoRole, setDemoRole] = useState<"coach" | "member">("coach");
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Data>(() =>
    configured ? emptyData() : demoData(),
  );
  const [loading, setLoading] = useState(configured);
  const [tab, setTab] = useState("overview");
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [week, setWeek] = useState(0);
  const [memberFilter, setMemberFilter] = useState("all");
  const [authMode, setAuthMode] = useState<
    "login" | "register" | "reset" | "password"
  >("login");
  const [showAuth, setShowAuth] = useState(false);
  const [authHint, setAuthHint] = useState("");
  const [loadError, setLoadError] = useState("");
  const latestRead = useRef(new LatestRead());
  const sessionOwner = useRef<string | null>(null);
  const sessionId = session?.user.id;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const current = data.profiles.find(
    (p) =>
      p.id ===
      (demo ? (demoRole === "coach" ? "coach" : "member-0") : session?.user.id),
  );
  const coach = current?.role === "coach";
  const zone = data.settings.timezone;
  const members = data.profiles.filter((p) => p.role === "member");
  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const load = useCallback(async () => {
    if (!supabase) return;
    const isLatest = latestRead.current.begin();
    const read = async (table: string, columns = "*") => {
      const rows: unknown[] = [];
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase!
          .from(table)
          .select(columns)
          .order("id")
          .range(from, from + 499);
        if (error) throw error;
        rows.push(...(page || []));
        if (!page || page.length < 500) return rows;
        from += 500;
      }
    };
    const readAccounts = async () => {
      try {
        const [session_entries, monthly_memberships] = await Promise.all([
          read("session_entries"),
          read("monthly_memberships"),
        ]);
        return { session_entries, monthly_memberships, credits_ready: true };
      } catch (e) {
        if (["42P01", "PGRST205"].includes((e as { code?: string }).code || ""))
          return {
            session_entries: [],
            monthly_memberships: [],
            credits_ready: false,
          };
        throw e;
      }
    };
    const [
      profiles,
      slots,
      appointments,
      plans,
      records,
      invites,
      referrals,
      events,
      email_jobs,
      packages,
      member_prices,
      contact_sync,
      settings,
      accounts,
    ] = await Promise.all([
      read("profiles"),
      supabase.rpc("get_schedule"),
      read("appointments", "*, slots(starts_at,ends_at)"),
      read("plans"),
      read("records"),
      read("invites"),
      read("referrals"),
      read("appointment_events"),
      read("email_jobs"),
      read("packages"),
      read("member_prices"),
      read("contact_sync"),
      read("settings"),
      readAccounts(),
    ]);
    if (slots.error) throw slots.error;
    if (!isLatest()) return;
    setLoadError("");
    setData({
      ...accounts,
      profiles,
      slots: slots.data || [],
      appointments,
      plans,
      records,
      invites,
      referrals,
      events,
      email_jobs,
      packages,
      member_prices,
      contact_sync,
      settings: settings[0] || emptyData().settings,
    } as Data);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (sessionOwner.current !== (s?.user.id || null)) {
        latestRead.current.invalidate();
        sessionOwner.current = s?.user.id || null;
        setData(emptyData());
        setDialog(null);
        setTab("overview");
        setFilter("all");
        setQuery("");
        setMemberFilter("all");
        setError("");
        setLoadError("");
        setLoading(!!s);
      }
      setSession(s);
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("password");
        setShowAuth(true);
      }
      if (!s) setLoading(false);
    });
    // onAuthStateChange delivers INITIAL_SESSION; avoid a competing stale getSession.
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (sessionId && !demo) {
      let active = true;
      setLoading(true);
      load()
        .catch(() => {
          if (active) setLoadError("暂时无法读取数据，请检查网络后重试。");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
        latestRead.current.invalidate();
      };
    }
  }, [sessionId, demo, load]);
  useEffect(() => {
    setError("");
  }, [dialog]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("ref") || params.has("invite")) {
      setAuthMode("register");
      setShowAuth(true);
    }
    if (params.has("recovery")) {
      setAuthMode("password");
      setShowAuth(true);
    }
  }, []);
  useEffect(() => {
    if (!sessionId || demo) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "visible")
        load().catch(() => {
          if (active) setLoadError("自动刷新未成功，当前显示上次读取的数据。");
        });
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [sessionId, demo, load]);
  async function retryLoad() {
    setBusy(true);
    try {
      await load();
    } catch {
      setLoadError("暂时无法读取数据，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  }
  function changeAuthMode(mode: typeof authMode) {
    setAuthMode(mode);
    setError("");
    setAuthHint("");
  }
  const formatPrice = (value: number | null | undefined, currency = "USD") =>
    value == null
      ? "待教练设置"
      : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
          value,
        );
  const name = (id: string) =>
    data.profiles.find((p) => p.id === id)?.full_name || "学员";
  const navigate = (next: string) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setTab(next);
    setQuery("");
    setFilter(
      next === "plans" && !coach
        ? "published"
        : next === "bookings"
          ? "upcoming"
          : "all",
    );
    setMenu(false);
    setMemberFilter("all");
  };
  const memberOptions = members
    .filter((m) => m.active)
    .map((m) => ({ value: m.id, label: m.full_name }));
  const memberField = (id?: string): Field => ({
    name: "p_member",
    label: "指定学员",
    type: "select",
    value: initialMember(
      id,
      memberFilter,
      memberOptions.map((m) => m.value),
    ),
    required: true,
    options: memberOptions,
    hint: memberOptions.length
      ? "请确认内容归属的学员。"
      : "暂无可用学员，请先邀请学员注册或恢复学员账号。",
  });
  async function mutate(fn: string, args: Record<string, unknown>) {
    if (demo) {
      demoMutate(fn, args);
      return;
    }
    if (!supabase) throw new Error("请先连接 Supabase");
    const refreshed = await saveThenRefresh(async () => {
      const { error } = await supabase!.rpc(fn, args);
      if (error) throw error;
    }, load);
    if (!refreshed)
      setLoadError(
        "操作已保存，但页面刷新失败。请点击重新加载，不要重复提交。",
      );
  }
  function demoMutate(fn: string, a: Record<string, unknown>) {
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    setData((d) => {
      const n = structuredClone(d);
      if (
        fn === "record_session_credit" &&
        !n.session_entries.some((e) => e.id === a.p_id)
      )
        n.session_entries.push({
          id: String(a.p_id),
          member_id: String(a.p_member),
          kind: a.p_kind as "purchase" | "adjustment",
          quantity: Number(a.p_quantity),
          note: String(a.p_note),
          amount: a.p_amount == null ? null : Number(a.p_amount),
          currency: String(a.p_currency),
          appointment_id: null,
          membership_id: null,
          created_at: now,
        });
      if (
        fn === "record_monthly_membership" &&
        !n.monthly_memberships.some((m) => m.id === a.p_id)
      )
        n.monthly_memberships.push({
          id: String(a.p_id),
          member_id: String(a.p_member),
          starts_on: String(a.p_start),
          ends_on: String(a.p_end),
          note: String(a.p_note),
          amount: a.p_amount == null ? null : Number(a.p_amount),
          currency: String(a.p_currency),
          created_at: now,
          cancelled_at: null,
          cancel_reason: null,
        });
      if (fn === "cancel_monthly_membership")
        n.monthly_memberships = n.monthly_memberships.map((m) =>
          m.id === a.p_id
            ? { ...m, cancelled_at: now, cancel_reason: String(a.p_reason) }
            : m,
        );
      if (fn === "save_profile")
        Object.assign(
          n.profiles.find((p) => p.id === current!.id)!,
          {
            full_name: a.p_name,
            phone: a.p_phone,
            goals: a.p_goals,
            timezone: a.p_timezone,
            email_notifications: a.p_notifications,
          },
        );
      if (fn === "save_settings")
        Object.assign(n.settings, {
          studio_name: a.p_name,
          timezone: a.p_timezone,
          allow_referral_signup: a.p_referrals,
          location: a.p_location,
        });
      if (fn === "create_invite")
        n.invites.unshift({
          id,
          code: `DEMO-${id.slice(0, 8).toUpperCase()}`,
          email: String(a.p_email || ""),
          max_uses: Number(a.p_max_uses),
          uses: 0,
          active: true,
          expires_at: new Date(
            Date.now() + Number(a.p_days) * 86400000,
          ).toISOString(),
          created_at: now,
        });
      if (fn === "revoke_invite")
        n.invites = n.invites.map((i) =>
          i.id === a.p_id ? { ...i, active: false } : i,
        );
      if (fn === "set_member_active")
        n.profiles = n.profiles.map((p) =>
          p.id === a.p_id ? { ...p, active: Boolean(a.p_active) } : p,
        );
      if (fn === "save_slot") {
        if (a.p_id) n.slots = n.slots.filter((s) => s.id !== a.p_id);
        else
          n.slots.push({
            id,
            starts_at: String(a.p_start),
            ends_at: String(a.p_end),
            available: true,
          });
      }
      if (fn === "manage_booking") {
        const slot = n.slots.find((s) => s.id === a.p_slot);
        let booking = n.appointments.find((b) => b.id === a.p_appointment);
        if (a.p_action === "book" && slot) {
          booking = {
            id,
            member_id: String(a.p_member || current!.id),
            slot_id: slot.id,
            status: "booked",
            message: String(a.p_message || ""),
            reason: "",
            created_at: now,
            slots: { starts_at: slot.starts_at, ends_at: slot.ends_at },
          };
          n.appointments.unshift(booking);
          slot.available = false;
        } else if (booking) {
          const oldId = booking.slot_id;
          const old = n.slots.find((s) => s.id === oldId);
          if (a.p_action === "cancel") {
            booking.status = "cancelled";
            if (old) old.available = true;
          }
          if (a.p_action === "complete" && booking.status === "booked") {
            booking.status = "completed";
            const monthly = membershipForDate(
              n.monthly_memberships,
              booking.member_id,
              displayTime(booking.slots.starts_at, zone, "yyyy-MM-dd"),
            );
            if (
              !n.session_entries.some((e) => e.appointment_id === booking!.id)
            )
              n.session_entries.push({
                id,
                member_id: booking.member_id,
                kind: monthly ? "monthly_lesson" : "lesson",
                quantity: monthly ? 0 : -1,
                note: monthly
                  ? "包月内完成课程，不扣按次课时"
                  : "完成课程，扣除 1 节",
                amount: null,
                currency: "USD",
                appointment_id: booking.id,
                membership_id: monthly?.id || null,
                created_at: now,
              });
          }
          if (a.p_action === "reschedule" && slot) {
            if (old) old.available = true;
            slot.available = false;
            booking.slot_id = slot.id;
            booking.slots = {
              starts_at: slot.starts_at,
              ends_at: slot.ends_at,
            };
          }
          booking.reason = String(a.p_message || "");
        }
        if (booking)
          n.events.unshift({
            id,
            appointment_id: booking.id,
            actor_id: current!.id,
            action: String(a.p_action),
            message: String(a.p_message || ""),
            details: {},
            created_at: now,
          });
      }
      if (fn === "save_plan") {
        if (a.p_publish)
          n.plans = n.plans.map((p) =>
            p.member_id === a.p_member && p.status === "published"
              ? { ...p, status: "archived" }
              : p,
          );
        n.plans = n.plans.filter((p) => p.id !== a.p_id);
        n.plans.unshift({
          id: String(a.p_id || id),
          member_id: String(a.p_member),
          title: String(a.p_title),
          content: String(a.p_content),
          status: a.p_publish ? "published" : "draft",
          created_at: now,
        });
      }
      if (fn === "save_record") {
        n.records = n.records.filter((r) => r.id !== a.p_id);
        n.records.unshift({
          id: String(a.p_id || id),
          member_id: String(a.p_member),
          recorded_on: String(a.p_date),
          weight: a.p_weight === null ? null : Number(a.p_weight),
          body_fat: a.p_fat === null ? null : Number(a.p_fat),
          notes: String(a.p_notes),
          shared: Boolean(a.p_shared),
        });
      }
      if (fn === "set_training_deleted") {
        if (a.p_kind === "plan")
          n.plans = n.plans.map((p) =>
            p.id === a.p_id
              ? { ...p, deleted_at: a.p_deleted ? now : null, status: "draft" }
              : p,
          );
        else
          n.records = n.records.map((r) =>
            r.id === a.p_id
              ? { ...r, deleted_at: a.p_deleted ? now : null, shared: false }
              : r,
          );
      }
      if (fn === "save_member_prices") {
        n.member_prices = n.member_prices.filter(
          (p) => p.member_id !== a.p_member,
        );
        n.member_prices.push({
          id,
          member_id: String(a.p_member),
          single_price: a.p_single === null ? null : Number(a.p_single),
          monthly_price: a.p_monthly === null ? null : Number(a.p_monthly),
          currency: String(a.p_currency),
          updated_at: now,
        });
      }
      return n;
    });
  }
  const commit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!dialog || busy) return;
    const formData = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name)
      formData.set(submitter.name, submitter.value);
    const values = Object.fromEntries(formData) as Record<string, string>;
    setBusy(true);
    setError("");
    try {
      if (dialog.readOnly) {
        setDialog(null);
        return;
      }
      for (const f of dialog.fields) {
        if (f.required && f.type !== "checkbox" && !values[f.name]?.trim())
          throw new Error(`请填写${f.label}`);
      }
      await dialog.action(values);
      setDialog(null);
      notify(
        demo
          ? "已更新演示数据（刷新后恢复）"
          : dialog.success ||
              (dialog.publication
                ? values.intent === "publish"
                  ? "已发布给指定学员"
                  : "已保存草稿，仅教练可见"
                : "保存成功"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  async function book(slot?: Slot, existing?: Appointment, member?: string) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      let latestSlots = data.slots;
      if (!demo && supabase) {
        const { data: schedule, error } = await supabase.rpc("get_schedule");
        if (error) throw error;
        latestSlots = schedule || [];
        setData((previous) => ({ ...previous, slots: latestSlots }));
      }
      const available = availableBookingSlots(latestSlots, existing?.slot_id);
      setDialog({
        title: existing
          ? "调整预约时间"
          : coach
            ? "为学员预约"
            : "预约下一次训练",
        description: `${existing ? `当前预约：${displayTime(existing.slots.starts_at, zone, "yyyy年MM月dd日 EEE HH:mm")} – ${displayTime(existing.slots.ends_at, zone, "HH:mm")}。请选择新的训练时间。` : "请选择训练时间。"} 所有课程时间均为 ${zone}。`,
        fields: [
          ...(coach && !existing ? [memberField(member)] : []),
          {
            name: "p_slot",
            label: "训练时间",
            type: "slots",
            required: true,
            value: existing ? "" : slot?.id || "",
            hint: coach
              ? "暂无其他可预约时段。请先返回「教练时间表」开放新的时段，再来预约或改期。"
              : "教练暂未开放其他可预约时段。请联系教练增加时间后重试；当前预约保持不变。",
            options: available.map((s) => ({
              value: s.id,
              label: `${displayTime(s.starts_at, zone, "yyyy年MM月dd日 EEE HH:mm")} – ${displayTime(s.ends_at, zone, "HH:mm")}`,
            })),
          },
          {
            name: "p_message",
            label: existing
              ? "改期原因（选填）"
              : coach
                ? "预约备注（学员可见，选填）"
                : "给教练的留言（选填）",
            type: "textarea",
          },
        ],
        submit: existing ? "确认改期" : "确认预约",
        action: async (v) => {
          if (!available.some((s) => s.id === v.p_slot))
            throw new Error("请选择一个可预约的训练时间。");
          await mutate("manage_booking", {
            p_action: existing ? "reschedule" : "book",
            p_slot: v.p_slot,
            p_appointment: existing?.id || null,
            p_member: existing?.member_id || v.p_member || current!.id,
            p_message: v.p_message,
          });
        },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "暂时无法获取可预约时段，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  function cancelBooking(b: Appointment) {
    setDialog({
      title: "取消这次预约",
      description: `${name(b.member_id)} · ${displayTime(b.slots.starts_at, zone)}。取消后，这个时间将重新开放。`,
      fields: [
        { name: "p_message", label: "取消原因（选填）", type: "textarea" },
      ],
      submit: "确认取消",
      action: (v) =>
        mutate("manage_booking", {
          p_action: "cancel",
          p_appointment: b.id,
          p_message: v.p_message,
        }),
    });
  }
  function addSlot() {
    setDialog({
      title: "开放可预约时间",
      description: `按 ${zone} 输入时间。每个时段可预约一位学员。`,
      fields: [
        {
          name: "start",
          label: "开始时间",
          type: "datetime-local",
          required: true,
        },
        {
          name: "end",
          label: "结束时间",
          type: "datetime-local",
          required: true,
        },
      ],
      submit: "开放时段",
      action: async (v) => {
        const start = localToISO(v.start, zone),
          end = localToISO(v.end, zone);
        if (
          new Date(start) <= new Date() ||
          end <= start ||
          new Date(end).getTime() - new Date(start).getTime() > 14400000
        )
          throw new Error("请选择未来的有效时段（最长 4 小时）");
        if (data.slots.some((s) => s.starts_at < end && s.ends_at > start))
          throw new Error("时间段与现有安排重叠");
        await mutate("save_slot", { p_start: start, p_end: end });
      },
    });
  }
  function editPlan(plan?: Plan, member?: string) {
    setDialog({
      title: plan ? "编辑训练计划" : "制定专属训练计划",
      publication: true,
      submit: plan?.status === "published" ? "更新并发布" : "发布给学员",
      description: plan
        ? `归属学员：${name(plan.member_id)}。保存草稿仅教练可见；发布后学员可见并收到通知。已发布内容保存为草稿后将对学员隐藏。`
        : "每份计划仅对指定学员开放。发布新计划后，旧计划自动归档。",
      fields: [
        ...(!plan ? [memberField(member)] : []),
        {
          name: "p_title",
          label: "计划名称",
          value: plan?.title,
          required: true,
        },
        {
          name: "p_content",
          label: "训练内容",
          type: "textarea",
          value: plan?.content,
          required: true,
          hint: "可按训练日填写动作、组数、次数、休息时间和注意事项。",
        },
      ],
      action: (v) =>
        mutate("save_plan", {
          p_member: plan?.member_id || v.p_member,
          p_id: plan?.id || null,
          p_title: v.p_title,
          p_content: v.p_content,
          p_publish: v.intent === "publish",
        }),
    });
  }
  function editRecord(record?: RecordEntry, member?: string, date?: string) {
    setDialog({
      title: record ? "编辑训练档案" : "添加训练档案",
      publication: true,
      submit: record?.shared ? "更新并发布" : "发布给学员",
      description: record
        ? `归属学员：${name(record.member_id)}。保存草稿仅教练可见，发布后只有这位学员可见。已发布内容保存为草稿后将对学员隐藏。`
        : "保存草稿仅教练可见；发布后只有指定学员可见。",
      fields: [
        ...(!record ? [memberField(member)] : []),
        {
          name: "p_date",
          label: "记录日期",
          type: "date",
          value:
            record?.recorded_on ||
            date ||
            displayTime(new Date().toISOString(), zone, "yyyy-MM-dd"),
          required: true,
        },
        {
          name: "p_weight",
          label: "体重 / kg（选填）",
          type: "number",
          value: record?.weight ?? "",
          min: 1,
          max: 499,
        },
        {
          name: "p_fat",
          label: "体脂率 / %（选填）",
          type: "number",
          value: record?.body_fat ?? "",
          min: 0,
          max: 100,
        },
        {
          name: "p_notes",
          label: "训练表现、目标或身体情况",
          type: "textarea",
          value: record?.notes,
        },
      ],
      action: (v) =>
        mutate("save_record", {
          p_id: record?.id || null,
          p_member: record?.member_id || v.p_member,
          p_date: v.p_date,
          p_weight: v.p_weight ? Number(v.p_weight) : null,
          p_fat: v.p_fat ? Number(v.p_fat) : null,
          p_notes: v.p_notes,
          p_shared: v.intent === "publish",
        }),
    });
  }
  function setTrainingDeleted(
    kind: "plan" | "record",
    id: string,
    deleted: boolean,
  ) {
    setDialog({
      title: deleted ? "删除这份内容" : "恢复为草稿",
      description: deleted
        ? "删除后学员将无法查看，可在「已删除」中恢复为草稿。"
        : "恢复后只有教练可见，需要再次发布才会对学员显示。",
      fields: [],
      submit: deleted ? "确认删除" : "恢复为草稿",
      action: () =>
        mutate("set_training_deleted", {
          p_kind: kind,
          p_id: id,
          p_deleted: deleted,
        }),
    });
  }
  function creditFields(memberId: string): Field[] {
    return [
      {
        name: "p_amount",
        label: "本次金额记录（选填，不会发起扣款）",
        type: "number",
        min: 0,
        max: 999999.99,
        step: 0.01,
      },
      {
        name: "p_currency",
        label: "币种",
        type: "select",
        required: true,
        value:
          data.member_prices.find((p) => p.member_id === memberId)?.currency ||
          "USD",
        options: ["USD", "CNY", "CAD", "AUD", "EUR", "GBP"].map((v) => ({
          value: v,
          label: v,
        })),
      },
    ];
  }
  function recordCredit(memberId: string, adjustment = false) {
    const request = crypto.randomUUID();
    setDialog({
      title: `${adjustment ? "调整课时" : "录入购课"} · ${name(memberId)}`,
      description: adjustment
        ? "期初余课、补课、退课或纠错请在这里录入。正数增加，负数扣减；必须说明原因，学员可以查看。不改动历史上课次数。"
        : "录入本次购买的课次数量，例如 3 节。只做课时与金额记录，不会发起支付；旧课程不会补扣。",
      fields: [
        {
          name: "p_quantity",
          label: adjustment ? "课时增减（如 +2 或 -1）" : "购买课次数",
          type: "number",
          required: true,
          min: adjustment ? -10000 : 1,
          max: 10000,
          step: 1,
          value: adjustment ? "" : 1,
        },
        ...(!adjustment ? creditFields(memberId) : []),
        {
          name: "p_note",
          label: "说明 / 原因（学员可见）",
          type: "textarea",
          required: true,
        },
      ],
      submit: adjustment ? "确认调整" : "确认入账",
      success: "课时已入账，可在流水中查看",
      action: async (v) => {
        validateCredit(
          Number(v.p_quantity),
          adjustment ? "adjustment" : "purchase",
          v.p_note,
        );
        await mutate("record_session_credit", {
          p_id: request,
          p_member: memberId,
          p_kind: adjustment ? "adjustment" : "purchase",
          p_quantity: Number(v.p_quantity),
          p_note: v.p_note,
          p_amount: v.p_amount ? Number(v.p_amount) : null,
          p_currency: v.p_currency || "USD",
        });
      },
    });
  }
  function recordMonthly(memberId: string) {
    const request = crypto.randomUUID();
    const start = displayTime(new Date().toISOString(), zone, "yyyy-MM-dd");
    setDialog({
      title: `录入包月 · ${name(memberId)}`,
      description: `按 ${zone} 记录有效期，含开始和结束日。有效期内不限次数；以后确认完成的课程按上课日期判断是否属于包月。不会回改已经扣课的流水，如有误请另作课时调整。不会发起支付。`,
      fields: [
        {
          name: "p_start",
          label: "开始日期",
          type: "date",
          required: true,
          value: start,
        },
        {
          name: "p_end",
          label: "结束日期（含当天）",
          type: "date",
          required: true,
          value: defaultMonthlyEnd(start),
        },
        ...creditFields(memberId),
        {
          name: "p_note",
          label: "包月说明（学员可见）",
          type: "textarea",
          required: true,
        },
      ],
      submit: "确认录入包月",
      success: "包月已录入",
      action: async (v) => {
        if (
          !v.p_start ||
          !v.p_end ||
          v.p_end < v.p_start ||
          (Date.parse(v.p_end) - Date.parse(v.p_start)) / 86400000 > 366
        )
          throw new Error("请选择有效日期，最长 366 天");
        if (
          data.monthly_memberships.some(
            (m) =>
              m.member_id === memberId &&
              !m.cancelled_at &&
              m.starts_on <= v.p_end &&
              m.ends_on >= v.p_start,
          )
        )
          throw new Error("有效期与已有包月重叠，请核对日期");
        await mutate("record_monthly_membership", {
          p_id: request,
          p_member: memberId,
          p_start: v.p_start,
          p_end: v.p_end,
          p_note: v.p_note,
          p_amount: v.p_amount ? Number(v.p_amount) : null,
          p_currency: v.p_currency,
        });
      },
    });
  }
  function cancelMonthly(m: MonthlyMembership) {
    setDialog({
      title: `作废包月 · ${name(m.member_id)}`,
      description: `${m.starts_on} 至 ${m.ends_on}。作废后保留原始记录，不再覆盖之后确认完成的课程，也不会重算已完成课程或自动退款。录错可作废后重新录入。`,
      fields: [
        {
          name: "p_reason",
          label: "作废原因（学员可见）",
          type: "textarea",
          required: true,
        },
      ],
      submit: "确认作废",
      action: (v) =>
        mutate("cancel_monthly_membership", {
          p_id: m.id,
          p_reason: v.p_reason,
        }),
    });
  }
  function editMemberPrice(memberId: string) {
    const price = data.member_prices.find((p) => p.member_id === memberId);
    setDialog({
      title: `设置 ${name(memberId)} 的专属价格`,
      description:
        "只有你和这位学员能看到。包月不限次数；留空表示尚未设置。当前不会收款。",
      submit: "保存专属价格",
      fields: [
        {
          name: "single",
          label: "单次训练金额",
          type: "number",
          value: price?.single_price ?? "",
          min: 0,
          max: 999999.99,
          step: 0.01,
        },
        {
          name: "monthly",
          label: "包月金额（不限次数）",
          type: "number",
          value: price?.monthly_price ?? "",
          min: 0,
          max: 999999.99,
          step: 0.01,
        },
        {
          name: "currency",
          label: "币种",
          type: "select",
          value: price?.currency || "USD",
          required: true,
          options: ["USD", "CNY", "CAD", "AUD", "EUR", "GBP"].map((v) => ({
            value: v,
            label: v,
          })),
        },
      ],
      action: (v) =>
        mutate("save_member_prices", {
          p_member: memberId,
          p_single: v.single === "" ? null : Number(v.single),
          p_monthly: v.monthly === "" ? null : Number(v.monthly),
          p_currency: v.currency,
        }),
    });
  }
  function createInvite() {
    setDialog({
      title: "生成专属邀请码",
      description: "可以限定注册邮箱，或创建允许多人使用的邀请码。",
      fields: [
        { name: "p_email", label: "限定邮箱（选填）", type: "email" },
        {
          name: "p_max_uses",
          label: "最多使用次数",
          type: "number",
          value: 1,
          min: 1,
          max: 10000,
          step: 1,
          required: true,
        },
        {
          name: "p_days",
          label: "有效天数",
          type: "number",
          value: 30,
          min: 1,
          max: 365,
          step: 1,
          required: true,
        },
      ],
      submit: "生成邀请码",
      action: (v) =>
        mutate("create_invite", {
          p_email: v.p_email || null,
          p_max_uses: Number(v.p_max_uses),
          p_days: Number(v.p_days),
        }),
    });
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("已复制");
    } catch {
      setError("复制失败，请手动选择并复制。");
    }
  }
  function exportReferrals() {
    const rows = [
      ["推荐人", "新学员", "状态", "注册时间", "成功时间"],
      ...data.referrals
        .filter(
          (r) =>
            (coach || r.referrer_id === current?.id) &&
            (memberFilter === "all" || r.referrer_id === memberFilter) &&
            (filter === "all" || r.status === filter),
        )
        .map((r) => [
          name(r.referrer_id),
          coach ? name(r.referred_id) : "新学员",
          statusNames[r.status],
          r.created_at,
          r.confirmed_at || "",
        ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8;" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "Yvone-Fitness-推荐记录.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function signOut() {
    if (demo) {
      setShowAuth(true);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase!.auth.signOut();
      if (error) throw error;
      setData(emptyData());
      setSession(null);
      setShowAuth(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function authSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) {
      setError("请先按部署说明连接 Supabase。演示模式不创建真实账号。");
      return;
    }
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    setAuthHint("");
    try {
      const email = String(f.email || "").trim(),
        password = String(f.password || "");
      if (
        (authMode === "register" || authMode === "password") &&
        password !== String(f.confirm_password || "")
      )
        throw new Error("两次输入的密码不一致");
      if (authMode === "register") {
        if (!String(f.full_name || "").trim()) throw new Error("请填写姓名");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: String(f.full_name || "").trim(),
              invite_code: String(f.invite_code || "").trim(),
              referral_code: String(f.referral_code || "").trim(),
            },
          },
        });
        if (error) throw error;
        setAuthHint(
          "请查收验证邮件，并在发起注册的同一个浏览器中打开链接。如果没有收到，请检查垃圾邮件或联系教练确认邀请码。",
        );
      }
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setShowAuth(false);
      }
      if (authMode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=recovery`,
        });
        if (error) throw error;
        setAuthHint(
          "如果该邮箱已注册，你会收到密码重置邮件。请在当前浏览器中打开邮件链接。",
        );
      }
      if (authMode === "password") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setShowAuth(false);
        setAuthMode("login");
        notify("密码已更新");
        window.history.replaceState({}, "", "/");
      }
    } catch (e) {
      const message = (e as Error).message;
      setError(
        message.includes("Database error")
          ? "注册未完成：请检查邀请码、绑定邮箱、有效期及剩余次数；仍失败时请教练检查数据库日志。"
          : message === "Invalid login credentials"
            ? "邮箱或密码不正确"
            : message,
      );
    } finally {
      setBusy(false);
    }
  }
  const flash = (
    <>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {error && !dialog && !showAuth && (demo || session) && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="关闭提示">
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
  if (loading)
    return (
      <div className="loading">
        <Dumbbell size={38} />
        <p>正在打开你的训练空间…</p>
        {flash}
      </div>
    );
  if ((!demo && !session) || showAuth) {
    const ref =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    return (
      <div className="auth-layout">
        <section className="auth-brand">
          <div className="brand">
            <span className="brand-symbol">
              <Dumbbell />
            </span>
            <span>
              Yvone Fitness<small>PERSONAL TRAINING</small>
            </span>
          </div>
          <div>
            <span className="eyebrow">YOUR SPACE TO GROW</span>
            <h1>
              每一次训练，
              <br />
              更靠近自己。
            </h1>
            <p>
              预约你的专属时间，跟随自己的节奏。
              <br />
              与教练一起，把进步变成日常。
            </p>
            <div className="auth-line" />
            <span className="auth-caption">
              专属计划 · 一对一训练 · 持续进步
            </span>
          </div>
          <p className="auth-foot">YVONE FITNESS / MEMBER STUDIO</p>
        </section>
        <section className="auth-form">
          <div className="auth-box">
            <span className="eyebrow">WELCOME TO YOUR STUDIO</span>
            <h2>
              {
                {
                  login: "欢迎回来",
                  register: "开启你的训练旅程",
                  reset: "找回密码",
                  password: "设置新密码",
                }[authMode]
              }
            </h2>
            <p className="muted">
              {authMode === "register"
                ? "仅接受邀请注册。请输入教练邀请码或学员推荐码。"
                : "你的训练安排，都在这里。"}
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <form key={authMode} onSubmit={authSubmit}>
              {authMode === "register" && (
                <label className="field">
                  姓名
                  <input
                    name="full_name"
                    required
                    maxLength={80}
                    autoComplete="name"
                  />
                </label>
              )}
              {authMode !== "password" && (
                <label className="field">
                  邮箱
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </label>
              )}
              {authMode !== "reset" && (
                <label className="field">
                  密码
                  <input
                    name="password"
                    type="password"
                    minLength={8}
                    required
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    placeholder="至少 8 位字符"
                  />
                </label>
              )}
              {(authMode === "register" || authMode === "password") && (
                <label className="field">
                  确认密码
                  <input
                    name="confirm_password"
                    type="password"
                    minLength={8}
                    required
                    autoComplete="new-password"
                  />
                </label>
              )}
              {authMode === "register" && (
                <>
                  <label className="field">
                    邀请码 / 学员推荐码
                    <input
                      name="invite_code"
                      required
                      defaultValue={ref.get("invite") || ref.get("ref") || ""}
                      maxLength={128}
                    />
                  </label>
                  <label className="field">
                    推荐码（选填）
                    <input
                      name="referral_code"
                      defaultValue={ref.get("ref") || ""}
                      maxLength={128}
                    />
                    <small>
                      使用教练邀请码注册时，可在这里另外填写推荐人的代码。
                    </small>
                  </label>
                </>
              )}
              <button className="btn full" disabled={busy}>
                {busy
                  ? "请稍候…"
                  : {
                      login: "登录",
                      register: "创建账号",
                      reset: "发送重置邮件",
                      password: "保存新密码",
                    }[authMode]}
                <ArrowRight size={18} />
              </button>
            </form>
            {authHint && <p className="success-box">{authHint}</p>}
            <div className="auth-links">
              <button
                disabled={busy}
                onClick={() => {
                  changeAuthMode(
                    authMode === "register" ? "login" : "register",
                  );
                }}
              >
                {authMode === "register" ? "已有账号？登录" : "有邀请码？注册"}
              </button>
              {authMode === "login" && (
                <button disabled={busy} onClick={() => changeAuthMode("reset")}>
                  忘记密码
                </button>
              )}
              {authMode === "reset" && (
                <button disabled={busy} onClick={() => changeAuthMode("login")}>
                  返回登录
                </button>
              )}
            </div>
            {!configured && (
              <div className="setup-note">
                <strong>外部平台尚未连接</strong>
                <p>
                  可以先预览页面。真实注册、预约和邮件将在连接 Supabase 和
                  Resend 后启用。
                </p>
                <button
                  className="btn secondary full"
                  onClick={() => {
                    setDemo(true);
                    setShowAuth(false);
                  }}
                >
                  查看网站演示
                </button>
              </div>
            )}
          </div>
        </section>
        {flash}
      </div>
    );
  }
  if (!current || !current.active)
    return (
      <div className="loading">
        <ShieldCheck size={36} />
        <h2>{current ? "账号已停用" : "无法读取个人资料"}</h2>
        <p>
          {current
            ? "请联系教练恢复账号。"
            : loadError ||
              "个人资料暂时不可用，请重新加载；仍有问题时联系教练。"}
        </p>
        {!current && (
          <button className="btn" disabled={busy} onClick={retryLoad}>
            重新加载
          </button>
        )}
        <button className="btn secondary" disabled={busy} onClick={signOut}>
          退出登录
        </button>
        {flash}
      </div>
    );
  const ownAppointments = data.appointments.filter(
    (b) => coach || b.member_id === current.id,
  );
  const upcoming = ownAppointments
    .filter((b) => bookingMatches(b, "upcoming", zone))
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  const ownPlans = data.plans.filter(
    (p) =>
      coach ||
      (!p.deleted_at && p.member_id === current.id && p.status !== "draft"),
  );
  const ownRecords = data.records.filter(
    (r) => coach || (!r.deleted_at && r.member_id === current.id && r.shared),
  );
  const recordMatchesFilter = (r: RecordEntry) =>
    filter === "deleted"
      ? !!r.deleted_at
      : !r.deleted_at &&
        (filter === "all" || (filter === "published" ? r.shared : !r.shared));
  const visibleReferrals = data.referrals.filter(
    (r) => coach || r.referrer_id === current.id,
  );
  const next = upcoming[0];
  const todayBookings = ownAppointments
    .filter((b) => bookingMatches(b, "today", zone))
    .sort((a, b) => compareBookings(a, b));
  const pendingBookings = ownAppointments.filter((b) =>
    bookingMatches(b, "pending", zone),
  );
  const needsPlan = members.filter(
    (m) => m.active && memberNeeds(data, m.id).plan,
  );
  const needsPrice = members.filter(
    (m) => m.active && memberNeeds(data, m.id).price,
  );
  const visibleMembers = members.filter(
    (m) =>
      (filter === "needs-plan"
        ? needsPlan.some((p) => p.id === m.id)
        : filter === "needs-price"
          ? needsPrice.some((p) => p.id === m.id)
          : true) &&
      `${m.full_name} ${m.email}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const openBookings = (view: string) => {
    navigate("bookings");
    setFilter(view);
  };
  const openMembers = (view: string) => {
    navigate("members");
    setFilter(view);
  };
  const bookingCards = (
    items: Appointment[],
    emptyText = "还没有课程安排",
    showBookingAction = true,
  ) =>
    items.length ? (
      <div className="booking-list">
        {items.map((b) => (
          <article className="booking-row" key={b.id}>
            <div className="date-block">
              <strong>{displayTime(b.slots.starts_at, zone, "dd")}</strong>
              <span>{displayTime(b.slots.starts_at, zone, "yyyy.MM EEE")}</span>
            </div>
            <div className="booking-main">
              <div className="row gap">
                <h3>{coach ? name(b.member_id) : "一对一私教训练"}</h3>
                <Badge
                  value={
                    b.status === "booked" &&
                    Date.parse(b.slots.ends_at) <= Date.now()
                      ? "待确认完成"
                      : b.status === "booked" &&
                          Date.parse(b.slots.starts_at) <= Date.now()
                        ? "进行中"
                        : b.status
                  }
                />
              </div>
              <p>
                <Clock3 size={14} />
                {displayTime(b.slots.starts_at, zone, "HH:mm")} –{" "}
                {displayTime(b.slots.ends_at, zone, "HH:mm")}
                <span className="separator">·</span>
                {data.settings.location}
              </p>
              {b.message && <small>预约留言：{b.message}</small>}
              {b.reason && <small>最近变更原因：{b.reason}</small>}
            </div>
            <div className="booking-actions">
              {coach &&
                members.some((m) => m.id === b.member_id && m.active) &&
                b.status !== "cancelled" &&
                Date.parse(b.slots.starts_at) <= Date.now() && (
                  <button
                    className="btn secondary small"
                    onClick={() =>
                      editRecord(
                        undefined,
                        b.member_id,
                        displayTime(b.slots.starts_at, zone, "yyyy-MM-dd"),
                      )
                    }
                  >
                    写记录
                  </button>
                )}
              {b.status === "booked" &&
                (coach || new Date(b.slots.starts_at) > new Date()) && (
                  <>
                    <button
                      className="btn secondary small"
                      onClick={() => book(undefined, b)}
                    >
                      改期
                    </button>
                    <button
                      className="text-btn muted"
                      onClick={() => cancelBooking(b)}
                    >
                      取消
                    </button>
                  </>
                )}
              {coach &&
                b.status === "booked" &&
                new Date(b.slots.ends_at) <= new Date() && (
                  <button
                    className="btn small"
                    onClick={() =>
                      setDialog({
                        title: "确认课程完成",
                        description: `${name(b.member_id)} · ${displayTime(b.slots.starts_at, zone)}。${data.credits_ready ? (membershipForDate(data.monthly_memberships, b.member_id, displayTime(b.slots.starts_at, zone, "yyyy-MM-dd")) ? "此课程在包月有效期内，确认后记录上课次数，不扣按次课时。" : `确认后扣除 1 节按次课时，预计余额 ${memberSessionStats(data, b.member_id).balance - 1} 节。余额不足也会记录完成，请核对是否遗漏购课。`) : "课时账户尚未启用，本次仅记录课程完成。"}`,
                        fields: [],
                        submit: "标记完成",
                        action: () =>
                          mutate("manage_booking", {
                            p_action: "complete",
                            p_appointment: b.id,
                          }),
                      })
                    }
                  >
                    完成
                  </button>
                )}
              <button
                className="text-btn muted"
                onClick={() => {
                  setDialog({
                    title: "预约变更记录",
                    readOnly: true,
                    description:
                      data.events
                        .filter((e) => e.appointment_id === b.id)
                        .sort((a, b) =>
                          a.created_at.localeCompare(b.created_at),
                        )
                        .map(
                          (e) =>
                            `${displayTime(e.created_at, zone)} · ${actionNames[e.action]} · ${e.actor_id === current.id ? "我" : data.profiles.some((p) => p.id === e.actor_id) ? name(e.actor_id) : "教练"}${e.details.old_start ? " · 原时间 " + displayTime(e.details.old_start, zone) : ""}${e.details.new_start ? " → " + displayTime(e.details.new_start, zone) : ""}${e.message ? "\n" + e.message : ""}`,
                        )
                        .join("\n\n") || "暂无变更记录",
                    fields: [],
                    submit: "关闭",
                    action: async () => {},
                  });
                }}
              >
                详情
              </button>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <Empty
        text={emptyText}
        action={
          showBookingAction && (
            <button
              className="btn secondary"
              onClick={() => navigate("schedule")}
            >
              查看可预约时间
              <ArrowRight size={16} />
            </button>
          )
        }
      />
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-symbol">
            <Dumbbell size={25} />
          </span>
          <span>
            {data.settings.studio_name}
            <small>PERSONAL TRAINING</small>
          </span>
        </a>
        <div className="workspace-label">
          {coach ? "COACH WORKSPACE" : "MEMBER WORKSPACE"}
        </div>
        <nav>
          {tabs
            .filter((t) => coach || t[0] !== "members")
            .map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => navigate(id)}
                className={tab === id ? "active" : ""}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "bookings" && upcoming.length > 0 && (
                  <b>{upcoming.length}</b>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={20} />
            <p>
              专属的训练空间
              <small>
                {coach
                  ? "每一位学员，都值得被认真对待。"
                  : "你的计划与档案，仅你和教练可见。"}
              </small>
            </p>
          </div>
          <button className="user-button" onClick={() => navigate("settings")}>
            <Avatar name={current.full_name} />
            <span>
              {current.full_name}
              <small>{coach ? "主教练 / 管理员" : "会员"}</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="backdrop"
          aria-label="收起菜单"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="row gap">
            <button
              className="icon-btn mobile-menu"
              aria-label={menu ? "关闭菜单" : "打开菜单"}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              我的工作室 <ChevronRight size={14} />
              <strong>{tabs.find((t) => t[0] === tab)?.[1]}</strong>
            </span>
          </div>
          <div className="row gap">
            <span className="time-zone">
              {zone === "America/Los_Angeles" ? "美西时间" : zone}
            </span>
            <button
              className="icon-btn"
              aria-label="通知设置"
              onClick={() => navigate("settings")}
            >
              <Bell size={19} />
            </button>
            <button
              className="icon-btn"
              aria-label="退出登录"
              disabled={busy}
              onClick={signOut}
            >
              <LogOut size={19} />
            </button>
            <Avatar name={current.full_name} />
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <strong>演示预览</strong> ·
              示例数据，刷新后恢复；尚未连接真实账号和邮件。
            </span>
            <button
              onClick={() => {
                setDemoRole(demoRole === "coach" ? "member" : "coach");
                navigate("overview");
              }}
            >
              切换到{coach ? "学员" : "教练"}端 <ArrowRight size={14} />
            </button>
          </div>
        )}
        <main>
          {loadError && (
            <div className="reload-notice" role="status">
              <p>{loadError}</p>
              <button
                className="btn secondary small"
                disabled={busy}
                onClick={retryLoad}
              >
                重新加载
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {displayTime(new Date().toISOString(), zone, "yyyy / MM / dd")}{" "}
                · {coach ? "COACH STUDIO" : "MY TRAINING"}
              </span>
              <h1>
                {tab === "overview"
                  ? `${current.full_name}，今天也要向前一步。`
                  : tabs.find((t) => t[0] === tab)?.[1]}
              </h1>
              <p>
                {
                  (
                    {
                      overview: coach
                        ? "把时间留给训练，把日常安排交给这里。"
                        : "你的下一次训练、专属计划和每一点进步。",
                      schedule: "找到合适的时间，为下一次进步留出位置。",
                      bookings: "查看课程安排，轻松处理预约与变更。",
                      credits: coach
                        ? "掌握每位学员的余课、包月期限和上课历史。"
                        : "查看剩余课时、上课统计及每笔增减明细。",
                      members: "了解每一位学员，让训练更有针对性。",
                      plans: "有方向地练习，有节奏地进步。",
                      records: "记录身体变化，也记录每一步成长。",
                      referrals: "和信任的人一起，把训练变成生活的一部分。",
                      packages: "选择适合自己的训练节奏。",
                      settings: "让你的训练空间，更适合你。",
                    } as Record<string, string>
                  )[tab]
                }
              </p>
            </div>
            <div className="heading-action">
              {["overview", "bookings"].includes(tab) && (
                <button className="btn" onClick={() => book()}>
                  <Plus size={18} />
                  {coach ? "添加预约" : "预约训练"}
                </button>
              )}
              {tab === "schedule" && coach && (
                <button className="btn" onClick={addSlot}>
                  <Plus size={18} />
                  开放时段
                </button>
              )}
              {tab === "members" && (
                <button
                  className="btn"
                  onClick={() => {
                    navigate("referrals");
                    createInvite();
                  }}
                >
                  <Plus size={18} />
                  邀请学员
                </button>
              )}
              {tab === "plans" && coach && (
                <button className="btn" onClick={() => editPlan()}>
                  <Plus size={18} />
                  新建计划
                </button>
              )}
              {tab === "records" && coach && (
                <button className="btn" onClick={() => editRecord()}>
                  <Plus size={18} />
                  添加记录
                </button>
              )}
              {tab === "referrals" && coach && (
                <button className="btn" onClick={createInvite}>
                  <Plus size={18} />
                  生成邀请码
                </button>
              )}
            </div>
          </div>
          {tab === "overview" && (
            <>
              <div className="account-overview notice">
                <div>
                  <strong>
                    {coach
                      ? "课时账户与上课统计"
                      : data.credits_ready
                        ? `剩余按次课时：${memberSessionStats(data, current.id).balance} 节`
                        : "课时账户待启用"}
                  </strong>
                  <p>
                    {coach
                      ? "录入购课、查看余课和历史；已预约与已扣课分开计算。"
                      : data.credits_ready &&
                          memberSessionStats(data, current.id).membership
                        ? `包月有效至 ${memberSessionStats(data, current.id).membership!.ends_on}，有效期内不限次数。`
                        : "确认完成课程后扣课，预约和改期不提前扣除。"}
                  </p>
                </div>
                <button
                  className="btn secondary small"
                  onClick={() => navigate("credits")}
                >
                  {coach ? "管理课时" : "查看课时明细"}
                </button>
              </div>
              {coach && (
                <section className="work-queue" aria-label="待办事项">
                  <button onClick={() => openBookings("pending")}>
                    <strong>{pendingBookings.length}</strong>
                    <span>
                      课程待确认完成<small>课后确认，顺手写记录</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => openMembers("needs-plan")}>
                    <strong>{needsPlan.length}</strong>
                    <span>
                      学员待制定计划<small>仅统计在训学员</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => openMembers("needs-price")}>
                    <strong>{needsPrice.length}</strong>
                    <span>
                      学员待设置价格<small>金额仅对应学员可见</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                </section>
              )}
              <div className="dashboard-grid">
                <section className="panel schedule-panel">
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">UP NEXT</span>
                      <h2>
                        {coach
                          ? todayBookings.length
                            ? "今天的训练"
                            : "接下来的训练"
                          : next &&
                              Date.parse(next.slots.starts_at) <= Date.now()
                            ? "正在进行的训练"
                            : "你的下一次训练"}
                      </h2>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => openBookings("all")}
                    >
                      全部预约 <ArrowRight size={16} />
                    </button>
                  </div>
                  {bookingCards(
                    coach
                      ? (todayBookings.length ? todayBookings : upcoming).slice(
                          0,
                          3,
                        )
                      : upcoming.slice(0, 1),
                    coach
                      ? "暂无接下来的训练，可为学员添加预约"
                      : "你还没有预约，选择时间即可安排下一次训练",
                  )}
                  {coach && todayBookings.length > 3 && (
                    <button
                      className="text-btn agenda-more"
                      onClick={() => openBookings("today")}
                    >
                      查看今天全部 {todayBookings.length} 节课程{" "}
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {!coach && next && (
                    <p className="session-guidance">
                      {displayTime(
                        next.slots.starts_at,
                        zone,
                        "yyyy年MM月dd日 EEEE",
                      )}{" "}
                      · {data.settings.location || "训练地点请与教练确认"}
                      <br />
                      {Date.parse(next.slots.starts_at) > Date.now()
                        ? "需要调整时，可直接使用上方的改期或取消按钮。"
                        : "课程已开始，如需调整请联系教练。"}
                    </p>
                  )}
                  <div className="panel-bottom">
                    <span>
                      <Clock3 size={15} />
                      所有时间均以
                      {zone === "America/Los_Angeles" ? "美西时区" : zone}显示
                    </span>
                    <button
                      className="text-btn"
                      onClick={() => navigate("schedule")}
                    >
                      查看时间表
                    </button>
                  </div>
                </section>
                <section className="focus-card">
                  <span className="eyebrow">
                    {coach ? "QUICK ACTIONS" : "YOUR CURRENT PLAN"}
                  </span>
                  <div className="focus-icon">
                    <Dumbbell size={42} />
                  </div>
                  <h2>
                    {coach
                      ? "常用操作"
                      : ownPlans.find((p) => p.status === "published")?.title ||
                        "训练计划准备中"}
                  </h2>
                  <p>
                    {coach
                      ? "开放时间、记录训练，都可以从这里开始。"
                      : ownPlans.some((p) => p.status === "published")
                        ? "这是教练当前为你安排的计划，点击查看完整训练内容。"
                        : "教练发布后会显示在这里，你无需进行额外操作。"}
                  </p>
                  <button onClick={() => navigate("plans")}>
                    {coach ? "管理训练计划" : "查看训练计划"}{" "}
                    <ArrowRight size={18} />
                  </button>
                  {coach && (
                    <div className="quick-actions">
                      <button onClick={addSlot}>
                        开放时间 <Plus size={17} />
                      </button>
                      <button onClick={() => editRecord()}>
                        添加训练记录 <Plus size={17} />
                      </button>
                    </div>
                  )}
                </section>
              </div>
              <div className="stats-grid">
                {[
                  {
                    label: coach ? "在训学员" : "已完成训练",
                    value: coach
                      ? members.filter((m) => m.active).length
                      : ownAppointments.filter((a) => a.status === "completed")
                          .length,
                    unit: coach ? "位" : "次",
                    icon: Users,
                    note: coach ? "持续陪伴每一份改变" : "坚持，都有迹可循",
                  },
                  {
                    label: "接下来的训练",
                    value: upcoming.length,
                    unit: "节",
                    icon: CalendarDays,
                    note: "包含正在进行中的课程",
                  },
                  {
                    label: coach ? "已发布计划" : "当前训练计划",
                    value: ownPlans.filter(
                      (p) => !p.deleted_at && p.status === "published",
                    ).length,
                    unit: "份",
                    icon: Dumbbell,
                    note: "专属安排，循序渐进",
                  },
                  {
                    label: "成功推荐",
                    value: visibleReferrals.filter(
                      (r) => r.status === "confirmed",
                    ).length,
                    unit: "人",
                    icon: Ticket,
                    note: "完成邮箱验证的新学员",
                  },
                ].map((s, i) => (
                  <div className={`stat-card stat-${i}`} key={s.label}>
                    <div className="row between">
                      <span>{s.label}</span>
                      <s.icon size={20} />
                    </div>
                    <div className="stat-value">
                      {s.value}
                      <small>{s.unit}</small>
                    </div>
                    <p>{s.note}</p>
                  </div>
                ))}
              </div>
              <div className="dashboard-lower">
                <section className="panel">
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">
                        {coach ? "MEMBER MOMENTS" : "YOUR NEXT SESSION"}
                      </span>
                      <h2>{coach ? "学员近况" : "训练准备"}</h2>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => navigate(coach ? "members" : "records")}
                    >
                      {coach ? "学员管理" : "查看档案"} <ArrowRight size={16} />
                    </button>
                  </div>
                  {coach ? (
                    <div className="mini-members">
                      {members
                        .filter((m) => m.active)
                        .slice(0, 4)
                        .map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              navigate("records");
                              setMemberFilter(m.id);
                            }}
                          >
                            <Avatar name={m.full_name} />
                            <span>
                              <strong>{m.full_name}</strong>
                              <small>
                                {data.plans.find(
                                  (p) =>
                                    p.member_id === m.id &&
                                    !p.deleted_at &&
                                    p.status === "published",
                                )?.title || "尚未指定训练计划"}
                              </small>
                            </span>
                            <ChevronRight size={17} />
                          </button>
                        ))}
                      {!members.length && (
                        <Empty text="生成邀请码，迎接第一位学员" />
                      )}
                    </div>
                  ) : (
                    <div className="prep">
                      <p>
                        <CheckCircle2 size={18} />{" "}
                        {next
                          ? `${displayTime(next.slots.starts_at, zone)} · 记得预留出行时间`
                          : "选择一个适合自己的训练时间"}
                      </p>
                      <p>
                        <CheckCircle2 size={18} /> 穿着舒适的运动服，带好水杯
                      </p>
                      <p>
                        <CheckCircle2 size={18} />{" "}
                        身体状态有变化时，提前告诉教练
                      </p>
                    </div>
                  )}
                </section>
                <section className="referral-mini">
                  <div className="row gap">
                    <span className="small-icon">
                      <Ticket />
                    </span>
                    <h3>把好的改变，分享出去。</h3>
                  </div>
                  <p>
                    {coach
                      ? "查看学员推荐记录，让每一份信任都被看见。"
                      : "分享你的专属推荐码，邀请朋友一起开始训练。"}
                  </p>
                  <button
                    className="text-btn"
                    onClick={() => navigate("referrals")}
                  >
                    {coach ? "查看推荐记录" : "查看我的推荐码"}
                    <ArrowRight size={17} />
                  </button>
                </section>
              </div>
            </>
          )}
          {tab === "schedule" &&
            (() => {
              const days = scheduleDays(zone, week);
              const available = availableBookingSlots(data.slots).filter((s) =>
                days.includes(displayTime(s.starts_at, zone, "yyyy-MM-dd")),
              );
              return (
                <section className="panel calendar-panel">
                  <div className="section-head">
                    <div>
                      <h2>
                        {days[0].replaceAll("-", ".")} —{" "}
                        {days[6].slice(5).replace("-", ".")}
                      </h2>
                      <p className="muted">{zone} · 每个时段仅接受一位学员</p>
                    </div>
                    <div className="row gap">
                      <button
                        className="icon-btn bordered"
                        aria-label="上一周"
                        disabled={week === 0}
                        onClick={() => setWeek(Math.max(0, week - 1))}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        className="btn secondary small"
                        onClick={() => setWeek(0)}
                      >
                        回到今天
                      </button>
                      <button
                        className="icon-btn bordered"
                        aria-label="下一周"
                        onClick={() => setWeek(week + 1)}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                  {!coach ? (
                    <div className="available-agenda">
                      <p className="muted">
                        只显示可以预约的时间。选择时段后，还可以给教练留言。
                      </p>
                      {days.map((day) => {
                        const slots = available.filter(
                          (s) =>
                            displayTime(s.starts_at, zone, "yyyy-MM-dd") ===
                            day,
                        );
                        if (!slots.length) return null;
                        return (
                          <section className="agenda-day" key={day}>
                            <h3>
                              {displayTime(
                                localToISO(day + "T12:00", zone),
                                zone,
                                "MM月dd日 EEEE",
                              )}
                              <small>
                                {day === scheduleDays(zone, 0)[0]
                                  ? "今天 · "
                                  : ""}
                                {slots.length} 个可选时段
                              </small>
                            </h3>
                            <div className="agenda-times">
                              {slots.map((s) => (
                                <button
                                  className="btn secondary"
                                  key={s.id}
                                  onClick={() => book(s)}
                                  aria-label={`预约 ${displayTime(s.starts_at, zone)} 至 ${displayTime(s.ends_at, zone, "HH:mm")}`}
                                >
                                  <Clock3 size={16} />
                                  {displayTime(
                                    s.starts_at,
                                    zone,
                                    "HH:mm",
                                  )} – {displayTime(s.ends_at, zone, "HH:mm")}
                                </button>
                              ))}
                            </div>
                          </section>
                        );
                      })}
                      {!available.length && (
                        <Empty
                          text="这 7 天暂无可预约时段。可以查看下一周，或联系教练开放时间。"
                          action={
                            <button
                              className="btn secondary"
                              onClick={() => setWeek(week + 1)}
                            >
                              查看下一周 <ArrowRight size={16} />
                            </button>
                          }
                        />
                      )}
                    </div>
                  ) : (
                    <div className="calendar-grid">
                      {days.map((day) => (
                        <div className="calendar-day" key={day}>
                          <div className="day-heading">
                            <span>
                              {displayTime(
                                localToISO(day + "T12:00", zone),
                                zone,
                                "EEE",
                              )}
                            </span>
                            <strong>{day.slice(8)}</strong>
                          </div>
                          {data.slots
                            .filter(
                              (s) =>
                                displayTime(s.starts_at, zone, "yyyy-MM-dd") ===
                                day,
                            )
                            .map((s) => (
                              <div
                                className={`slot ${s.available ? "available" : "taken"}`}
                                key={s.id}
                              >
                                <span>
                                  {displayTime(s.starts_at, zone, "HH:mm")} –{" "}
                                  {displayTime(s.ends_at, zone, "HH:mm")}
                                </span>
                                <strong>
                                  {s.available ? "可预约" : "已预约"}
                                </strong>
                                {s.available && (
                                  <button onClick={() => book(s)}>
                                    {coach ? "代预约" : "预约"}{" "}
                                    <Plus size={13} />
                                  </button>
                                )}
                                {coach && s.available && (
                                  <button
                                    className="slot-remove"
                                    onClick={() =>
                                      setDialog({
                                        title: "关闭此时段",
                                        description: displayTime(
                                          s.starts_at,
                                          zone,
                                        ),
                                        fields: [],
                                        submit: "关闭时段",
                                        action: () =>
                                          mutate("save_slot", { p_id: s.id }),
                                      })
                                    }
                                  >
                                    关闭时段
                                  </button>
                                )}
                              </div>
                            ))}
                          {!data.slots.some(
                            (s) =>
                              displayTime(s.starts_at, zone, "yyyy-MM-dd") ===
                              day,
                          ) && <span className="no-slot">暂无开放时段</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="panel-bottom">
                    <span>预约后可在「课程预约」中改期或取消。</span>
                    {coach && (
                      <button className="text-btn" onClick={addSlot}>
                        <Plus size={15} />
                        开放时间
                      </button>
                    )}
                  </div>
                </section>
              );
            })()}
          {tab === "bookings" && (
            <section className="panel">
              <div className="toolbar">
                <div className="segmented">
                  {[
                    ["upcoming", "接下来"],
                    ["today", "今天"],
                    ...(coach ? [["pending", "待确认完成"]] : []),
                    ["all", "全部"],
                    ["completed", "已完成"],
                    ["cancelled", "已取消"],
                  ].map(([id, label]) => (
                    <button
                      className={filter === id ? "active" : ""}
                      onClick={() => setFilter(id)}
                      key={id}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {coach && (
                  <label className="search">
                    <Search size={17} />
                    <input
                      placeholder="搜索学员"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                )}
              </div>
              {bookingCards(
                ownAppointments
                  .filter(
                    (b) =>
                      bookingMatches(b, filter, zone) &&
                      name(b.member_id)
                        .toLowerCase()
                        .includes(query.trim().toLowerCase()),
                  )
                  .sort((a, b) => compareBookings(a, b)),
                filter === "pending"
                  ? "没有待确认完成的课程"
                  : filter === "today"
                    ? "今天没有符合条件的课程"
                    : query
                      ? "没有找到这位学员的预约"
                      : filter === "upcoming"
                        ? "暂无接下来的训练"
                        : "当前筛选下没有预约",
                filter === "upcoming" && !query.trim(),
              )}
            </section>
          )}
          {tab === "members" && coach && (
            <section className="panel">
              <div className="toolbar">
                <h2>
                  {filter === "needs-plan"
                    ? "待制定计划"
                    : filter === "needs-price"
                      ? "待设置价格"
                      : "学员列表"}{" "}
                  <span className="count">{visibleMembers.length}</span>
                </h2>
                <select
                  aria-label="筛选待办学员"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">全部学员</option>
                  <option value="needs-plan">
                    待制定计划（{needsPlan.length}）
                  </option>
                  <option value="needs-price">
                    待设置价格（{needsPrice.length}）
                  </option>
                </select>
                <label className="search">
                  <Search size={17} />
                  <input
                    placeholder="搜索姓名或邮箱"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>学员</th>
                      <th>当前计划</th>
                      <th>课程 / 完成</th>
                      <th>成功推荐</th>
                      <th>状态</th>
                      <th>管理</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMembers.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <div className="row gap">
                            <Avatar name={m.full_name} />
                            <div>
                              <strong>{m.full_name}</strong>
                              <small>{m.email}</small>
                              <small>{m.phone || "未填写电话"}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {data.plans.find(
                            (p) =>
                              p.member_id === m.id &&
                              !p.deleted_at &&
                              p.status === "published",
                          )?.title || "尚未指定"}
                          <small>{m.goals}</small>
                        </td>
                        <td>
                          {
                            data.appointments.filter(
                              (a) =>
                                a.member_id === m.id && a.status === "booked",
                            ).length
                          }{" "}
                          /{" "}
                          {
                            data.appointments.filter(
                              (a) =>
                                a.member_id === m.id &&
                                a.status === "completed",
                            ).length
                          }
                        </td>
                        <td>
                          {
                            data.referrals.filter(
                              (r) =>
                                r.referrer_id === m.id &&
                                r.status === "confirmed",
                            ).length
                          }{" "}
                          人
                        </td>
                        <td>
                          <span
                            className={`badge ${m.active ? "confirmed" : "cancelled"}`}
                          >
                            {m.active ? "在训" : "已停用"}
                          </span>
                        </td>
                        <td>
                          <div className="row wrap gap">
                            <button
                              className="text-btn"
                              onClick={() => {
                                navigate("credits");
                                setMemberFilter(m.id);
                              }}
                            >
                              课时
                            </button>
                            {m.active && (
                              <button
                                className="text-btn"
                                onClick={() => book(undefined, undefined, m.id)}
                              >
                                预约
                              </button>
                            )}
                            <button
                              className="text-btn"
                              onClick={() => {
                                navigate("records");
                                setMemberFilter(m.id);
                              }}
                            >
                              档案
                            </button>
                            <button
                              className="text-btn"
                              onClick={() => {
                                if (memberNeeds(data, m.id).plan)
                                  editPlan(
                                    data.plans.find(
                                      (p) =>
                                        !p.deleted_at &&
                                        p.member_id === m.id &&
                                        p.status === "draft",
                                    ),
                                    m.id,
                                  );
                                else {
                                  navigate("plans");
                                  setMemberFilter(m.id);
                                }
                              }}
                            >
                              {memberNeeds(data, m.id).plan
                                ? "制定计划"
                                : "查看计划"}
                            </button>
                            <button
                              className="text-btn"
                              onClick={() => editMemberPrice(m.id)}
                            >
                              专属价格
                            </button>
                            <button
                              className="text-btn muted"
                              onClick={() =>
                                setDialog({
                                  title: m.active
                                    ? "停用学员账号"
                                    : "恢复学员账号",
                                  description: `${m.full_name}：停用后无法读取训练资料或操作预约。已有预约仍保留，可由教练处理。`,
                                  fields: [],
                                  submit: "确认",
                                  action: () =>
                                    mutate("set_member_active", {
                                      p_id: m.id,
                                      p_active: !m.active,
                                    }),
                                })
                              }
                            >
                              {m.active ? "停用" : "恢复"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!members.length && <Empty text="还没有学员，先生成一个邀请码" />}
              {!!members.length && !visibleMembers.length && (
                <Empty
                  text={
                    query ? "没有符合搜索条件的学员" : "这项待办已全部处理完成"
                  }
                />
              )}
            </section>
          )}
          {tab === "plans" && (
            <>
              <div className="toolbar outside">
                <div className="segmented">
                  {[
                    ["all", "全部计划"],
                    ["published", "当前计划"],
                    ["archived", "历史计划"],
                    ...(coach
                      ? [
                          ["draft", "草稿"],
                          ["deleted", "已删除"],
                        ]
                      : []),
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setFilter(id)}
                      className={filter === id ? "active" : ""}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {coach && (
                  <select
                    aria-label="按学员筛选计划"
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                  >
                    <option value="all">全部学员</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="plan-grid">
                {ownPlans
                  .filter(
                    (p) =>
                      (filter === "deleted"
                        ? !!p.deleted_at
                        : !p.deleted_at &&
                          (filter === "all" || p.status === filter)) &&
                      (memberFilter === "all" || p.member_id === memberFilter),
                  )
                  .map((p) => (
                    <article className="panel plan-card" key={p.id}>
                      <div className="row between">
                        <span className="small-icon">
                          <Dumbbell />
                        </span>
                        <Badge value={p.deleted_at ? "已删除" : p.status} />
                      </div>
                      <h2>{p.title}</h2>
                      <p className="muted">
                        {name(p.member_id)} ·{" "}
                        {displayTime(p.created_at, zone, "yyyy.MM.dd")}
                      </p>
                      <pre className="plan-content">{p.content}</pre>
                      <div className="plan-footer">
                        <span>
                          <ShieldCheck size={14} />
                          {p.deleted_at || p.status === "draft"
                            ? "仅教练可见"
                            : "专属计划 · 仅指定学员可见"}
                        </span>
                        {coach && (
                          <div className="row gap wrap">
                            {!p.deleted_at && (
                              <button
                                className="text-btn"
                                onClick={() => editPlan(p)}
                              >
                                编辑计划
                              </button>
                            )}
                            <button
                              className="text-btn"
                              onClick={() =>
                                setTrainingDeleted("plan", p.id, !p.deleted_at)
                              }
                            >
                              {p.deleted_at ? "恢复为草稿" : "删除"}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
              </div>
              {!ownPlans.some(
                (p) =>
                  (filter === "deleted"
                    ? !!p.deleted_at
                    : !p.deleted_at &&
                      (filter === "all" || p.status === filter)) &&
                  (memberFilter === "all" || p.member_id === memberFilter),
              ) && (
                <div className="panel">
                  <Empty
                    text={
                      !coach && filter === "published"
                        ? "教练尚未发布当前计划，发布后会自动显示在这里。之前的计划可在「历史计划」查看。"
                        : filter !== "all" || memberFilter !== "all"
                          ? "当前筛选下没有训练计划"
                          : coach
                            ? "还没有训练计划，为学员制定第一份计划吧"
                            : "教练发布计划后，你会在这里看到"
                    }
                  />
                </div>
              )}
            </>
          )}
          {tab === "records" && (
            <>
              <div className="toolbar outside">
                <p className="muted">
                  {coach
                    ? "草稿仅你可见；发布后只有对应学员可见。"
                    : "以下为教练发布给你的训练记录。"}
                </p>
                {coach && (
                  <select
                    aria-label="按学员筛选档案"
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                  >
                    <option value="all">全部学员</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {coach && (
                <div className="segmented spaced">
                  {[
                    ["all", "全部档案"],
                    ["draft", "草稿"],
                    ["published", "已发布"],
                    ["deleted", "已删除"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={filter === value ? "active" : ""}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="records-list">
                {ownRecords
                  .filter(
                    (r) =>
                      (memberFilter === "all" ||
                        r.member_id === memberFilter) &&
                      recordMatchesFilter(r),
                  )
                  .sort((a, b) => b.recorded_on.localeCompare(a.recorded_on))
                  .map((r) => (
                    <article className="panel record-card" key={r.id}>
                      <div className="record-side">
                        <span className="eyebrow">{r.recorded_on}</span>
                        <h2>{name(r.member_id)}</h2>
                        <span
                          className={`badge ${r.shared ? "confirmed" : "draft"}`}
                        >
                          {r.deleted_at
                            ? "已删除"
                            : r.shared
                              ? "已发布"
                              : "草稿 · 仅教练"}
                        </span>
                      </div>
                      <div className="record-body">
                        <div className="record-metrics">
                          <div>
                            <span>体重</span>
                            <strong>
                              {r.weight ?? "—"}
                              <small>kg</small>
                            </strong>
                          </div>
                          <div>
                            <span>体脂率</span>
                            <strong>
                              {r.body_fat ?? "—"}
                              <small>%</small>
                            </strong>
                          </div>
                        </div>
                        <p className="pre-wrap">
                          {r.notes || "本次未填写备注。"}
                        </p>
                      </div>
                      {coach && (
                        <div className="row gap wrap">
                          {!r.deleted_at && (
                            <button
                              className="text-btn"
                              onClick={() => editRecord(r)}
                            >
                              编辑
                            </button>
                          )}
                          <button
                            className="text-btn"
                            onClick={() =>
                              setTrainingDeleted("record", r.id, !r.deleted_at)
                            }
                          >
                            {r.deleted_at ? "恢复为草稿" : "删除"}
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
              </div>
              {!ownRecords.some(
                (r) =>
                  (memberFilter === "all" || r.member_id === memberFilter) &&
                  recordMatchesFilter(r),
              ) && (
                <div className="panel">
                  <Empty
                    text={
                      filter !== "all" || memberFilter !== "all"
                        ? "当前筛选下没有训练记录"
                        : "还没有训练记录"
                    }
                  />
                </div>
              )}
            </>
          )}
          {tab === "referrals" && (
            <>
              <div className="referral-top">
                <section className="invite-hero">
                  <Ticket size={32} />
                  <h2>
                    {coach
                      ? "一起，把好的改变传递出去。"
                      : "你的朋友，也是未来的训练伙伴。"}
                  </h2>
                  <p>
                    {coach
                      ? "教练邀请码和学员推荐码的注册记录，都在这里。"
                      : data.settings.allow_referral_signup
                        ? "朋友使用你的代码注册，验证邮箱后即可计为成功推荐。"
                        : "分享推荐码给朋友，注册时还需教练邀请码。"}
                  </p>
                  {!coach && (
                    <div className="ref-code">
                      <code>{current.referral_code}</code>
                      <button
                        className="icon-btn"
                        aria-label="复制推荐码"
                        onClick={() => copy(current.referral_code)}
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                  )}
                  <button
                    className="btn light"
                    onClick={() =>
                      coach
                        ? createInvite()
                        : copy(
                            `${window.location.origin}/?ref=${current.referral_code}`,
                          )
                    }
                  >
                    {coach ? <Plus size={17} /> : <Link2 size={17} />}
                    {coach ? "创建邀请码" : "复制邀请链接"}
                  </button>
                </section>
                <section className="panel referral-total">
                  <span className="eyebrow">GROW TOGETHER</span>
                  <span>成功推荐</span>
                  <strong>
                    {
                      visibleReferrals.filter((r) => r.status === "confirmed")
                        .length
                    }
                    <small> 人</small>
                  </strong>
                  <p>
                    {
                      visibleReferrals.filter((r) => r.status === "pending")
                        .length
                    }{" "}
                    人等待邮箱验证
                  </p>
                </section>
              </div>
              {coach && (
                <section className="panel spaced">
                  <div className="section-head">
                    <h2>邀请码管理</h2>
                    <button className="text-btn" onClick={createInvite}>
                      <Plus size={16} />
                      创建邀请码
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>邀请码</th>
                          <th>限定邮箱</th>
                          <th>使用次数</th>
                          <th>到期日</th>
                          <th>状态</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.invites.map((i) => (
                          <tr key={i.id}>
                            <td>
                              <button
                                className="code-btn"
                                onClick={() => copy(i.code)}
                              >
                                <code>{i.code}</code>
                                <Copy size={13} />
                              </button>
                            </td>
                            <td>{i.email || "不限"}</td>
                            <td>
                              {i.uses} / {i.max_uses}
                            </td>
                            <td>
                              {i.expires_at
                                ? displayTime(i.expires_at, zone, "yyyy.MM.dd")
                                : "不限"}
                            </td>
                            <td>
                              {!i.active
                                ? "已停用"
                                : i.uses >= i.max_uses
                                  ? "已用完"
                                  : i.expires_at &&
                                      new Date(i.expires_at) < new Date()
                                    ? "已过期"
                                    : "可使用"}
                            </td>
                            <td>
                              <div className="row gap">
                                <button
                                  className="text-btn"
                                  onClick={() =>
                                    copy(
                                      `${window.location.origin}/?invite=${i.code}`,
                                    )
                                  }
                                >
                                  复制链接
                                </button>
                                {i.active && (
                                  <button
                                    className="text-btn muted"
                                    onClick={() =>
                                      setDialog({
                                        title: "停用邀请码",
                                        description:
                                          "停用后，新用户无法再使用此邀请码注册。",
                                        fields: [],
                                        submit: "停用",
                                        action: () =>
                                          mutate("revoke_invite", {
                                            p_id: i.id,
                                          }),
                                      })
                                    }
                                  >
                                    停用
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.invites.length && <Empty text="尚未创建邀请码" />}
                </section>
              )}
              {coach && (
                <section className="panel spaced">
                  <div className="section-head">
                    <h2>各学员推荐汇总</h2>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>学员</th>
                          <th>固定推荐码</th>
                          <th>总注册</th>
                          <th>成功推荐</th>
                          <th>待验证</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => {
                          const rows = data.referrals.filter(
                            (r) => r.referrer_id === m.id,
                          );
                          return (
                            <tr key={m.id}>
                              <td>{m.full_name}</td>
                              <td>
                                <button
                                  className="code-btn"
                                  onClick={() => copy(m.referral_code)}
                                >
                                  <code>{m.referral_code}</code>
                                  <Copy size={13} />
                                </button>
                              </td>
                              <td>{rows.length}</td>
                              <td>
                                {
                                  rows.filter((r) => r.status === "confirmed")
                                    .length
                                }
                              </td>
                              <td>
                                {
                                  rows.filter((r) => r.status === "pending")
                                    .length
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              <section className="panel">
                <div className="section-head">
                  <h2>推荐明细</h2>
                  <button
                    className="btn secondary small"
                    onClick={exportReferrals}
                  >
                    <ArrowDownToLine size={15} />
                    导出 CSV
                  </button>
                </div>
                {coach && (
                  <div className="toolbar">
                    <select
                      aria-label="按推荐人筛选"
                      value={memberFilter}
                      onChange={(e) => setMemberFilter(e.target.value)}
                    >
                      <option value="all">全部推荐人</option>
                      {members.map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="按推荐状态筛选"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">全部状态</option>
                      <option value="confirmed">推荐成功</option>
                      <option value="pending">待验证</option>
                    </select>
                  </div>
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {coach && <th>推荐人</th>}
                        <th>新学员</th>
                        <th>注册时间</th>
                        <th>状态</th>
                        <th>成功时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleReferrals
                        .filter(
                          (r) =>
                            (memberFilter === "all" ||
                              r.referrer_id === memberFilter) &&
                            (filter === "all" || r.status === filter),
                        )
                        .map((r, i) => (
                          <tr key={r.id}>
                            {coach && <td>{name(r.referrer_id)}</td>}
                            <td>
                              {coach
                                ? name(r.referred_id)
                                : `受邀学员 ${i + 1}`}
                            </td>
                            <td>
                              {displayTime(
                                r.created_at,
                                zone,
                                "yyyy.MM.dd HH:mm",
                              )}
                            </td>
                            <td>
                              <Badge
                                value={
                                  r.status === "pending" ? "待验证" : r.status
                                }
                              />
                            </td>
                            <td>
                              {r.confirmed_at
                                ? displayTime(
                                    r.confirmed_at,
                                    zone,
                                    "yyyy.MM.dd HH:mm",
                                  )
                                : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!visibleReferrals.length && (
                  <Empty text="暂时还没有推荐记录" />
                )}
              </section>
            </>
          )}
          {tab === "credits" && (
            <SessionAccounts
              data={data}
              coach={coach}
              memberId={coach ? memberFilter : current.id}
              onSelect={setMemberFilter}
              onCredit={recordCredit}
              onMonthly={recordMonthly}
              onCancelMonthly={cancelMonthly}
            />
          )}
          {tab === "packages" && (
            <>
              <div className="notice">
                <Wallet size={20} />
                <div>
                  <strong>
                    {coach ? "按学员设置专属价格" : "你的专属课程方案"}
                  </strong>
                  <p>
                    单次训练与不限次数包月。金额只对本人和教练可见，在线支付尚未开放。
                  </p>
                </div>
              </div>
              {coach ? (
                <section className="panel">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>学员</th>
                          <th>单次训练</th>
                          <th>不限次数包月</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => {
                          const p = data.member_prices.find(
                            (p) => p.member_id === m.id,
                          );
                          return (
                            <tr key={m.id}>
                              <td>{m.full_name}</td>
                              <td>
                                {formatPrice(p?.single_price, p?.currency)}
                              </td>
                              <td>
                                {formatPrice(p?.monthly_price, p?.currency)}
                              </td>
                              <td>
                                <button
                                  className="text-btn"
                                  onClick={() => editMemberPrice(m.id)}
                                >
                                  设置价格
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!members.length && (
                    <Empty text="学员注册后，可在这里分别设置价格" />
                  )}
                </section>
              ) : (
                <div className="package-grid">
                  {[
                    {
                      title: "单次训练",
                      key: "single_price" as const,
                      unit: "次",
                      description: "一次专属私教训练",
                    },
                    {
                      title: "不限次数包月",
                      key: "monthly_price" as const,
                      unit: "月",
                      description: "包月内不限训练次数，仍需预约教练开放的时段",
                    },
                  ].map((plan) => {
                    const p = data.member_prices.find(
                      (p) => p.member_id === current.id,
                    );
                    return (
                      <article key={plan.key} className="package-card">
                        <h2>{plan.title}</h2>
                        <p>{plan.description}</p>
                        <div className="price">
                          {formatPrice(p?.[plan.key], p?.currency)}
                          <small> / {plan.unit}</small>
                        </div>
                        <p>
                          {p?.[plan.key] == null
                            ? "教练会为你单独设置金额，请联系教练。"
                            : "这是教练为你设置的专属金额。"}
                        </p>
                        <button className="btn full" disabled>
                          在线支付尚未开放
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {tab === "settings" && (
            <div className="settings-grid">
              <section className="panel settings-card">
                <div className="row gap">
                  <UserRound size={22} />
                  <h2>个人资料</h2>
                </div>
                <dl>
                  <dt>姓名</dt>
                  <dd>{current.full_name}</dd>
                  <dt>登录邮箱</dt>
                  <dd>{current.email}</dd>
                  <dt>联系电话</dt>
                  <dd>{current.phone || "未填写"}</dd>
                  <dt>训练目标</dt>
                  <dd>{current.goals || "未填写"}</dd>
                  <dt>个人时区</dt>
                  <dd>{current.timezone}</dd>
                </dl>
                <button
                  className="btn secondary"
                  onClick={() =>
                    setDialog({
                      title: "编辑个人资料",
                      fields: [
                        {
                          name: "p_name",
                          label: "姓名",
                          value: current.full_name,
                          required: true,
                        },
                        {
                          name: "p_phone",
                          label: "电话",
                          value: current.phone,
                        },
                        {
                          name: "p_goals",
                          label: "训练目标",
                          type: "textarea",
                          value: current.goals,
                        },
                        {
                          name: "p_timezone",
                          label: "个人时区",
                          type: "select",
                          value: current.timezone,
                          options: zones.map((z) => ({ value: z, label: z })),
                          required: true,
                        },
                        {
                          name: "p_notifications",
                          label: "接收预约更新、训练计划和课前提醒邮件",
                          type: "checkbox",
                          value: current.email_notifications,
                        },
                      ],
                      action: (v) =>
                        mutate("save_profile", {
                          ...v,
                          p_notifications: v.p_notifications === "on",
                        }),
                    })
                  }
                >
                  编辑资料
                </button>
                <div className="setting-line">
                  <Bell size={18} />
                  <div>
                    <strong>
                      邮件提醒
                      {current.email_notifications ? "已开启" : "已关闭"}
                    </strong>
                    <p>
                      预约、改期、取消、训练计划及课前提醒。账号验证和密码重置邮件不受此开关影响。
                    </p>
                  </div>
                </div>
                <div className="row wrap gap">
                  <button
                    className="text-btn"
                    onClick={() =>
                      setDialog({
                        title: "修改登录邮箱",
                        description:
                          "新旧邮箱可能都需要验证；完成后才会更新登录邮箱。",
                        fields: [
                          {
                            name: "email",
                            label: "新邮箱",
                            type: "email",
                            required: true,
                          },
                        ],
                        submit: "发送验证邮件",
                        success:
                          "请检查新旧邮箱中的验证邮件，并在当前浏览器完成验证。",
                        action: async (v) => {
                          if (demo)
                            throw new Error("演示模式不发送真实验证邮件");
                          const { error } = await supabase!.auth.updateUser(
                            { email: v.email },
                            {
                              emailRedirectTo: `${window.location.origin}/auth/callback`,
                            },
                          );
                          if (error) throw error;
                        },
                      })
                    }
                  >
                    修改邮箱
                  </button>
                  <button
                    className="text-btn"
                    onClick={() =>
                      setDialog({
                        title: "修改密码",
                        fields: [
                          {
                            name: "password",
                            label: "新密码（至少 8 位）",
                            type: "password",
                            minLength: 8,
                            required: true,
                          },
                          {
                            name: "confirm_password",
                            label: "确认新密码",
                            type: "password",
                            minLength: 8,
                            required: true,
                          },
                        ],
                        action: async (v) => {
                          if (v.password.length < 8)
                            throw new Error("密码至少需要 8 位");
                          if (v.password !== v.confirm_password)
                            throw new Error("两次输入的密码不一致");
                          if (demo) throw new Error("演示模式不修改真实密码");
                          const { error } = await supabase!.auth.updateUser({
                            password: v.password,
                          });
                          if (error) throw error;
                        },
                      })
                    }
                  >
                    修改密码
                  </button>
                </div>
              </section>
              {coach && (
                <section className="panel settings-card">
                  <div className="row gap">
                    <Settings2 size={22} />
                    <h2>工作室设置</h2>
                  </div>
                  <dl>
                    <dt>网站名称</dt>
                    <dd>{data.settings.studio_name}</dd>
                    <dt>预约时区</dt>
                    <dd>{zone}</dd>
                    <dt>训练地点</dt>
                    <dd>{data.settings.location}</dd>
                    <dt>推荐码注册</dt>
                    <dd>
                      {data.settings.allow_referral_signup
                        ? "允许学员推荐码直接注册"
                        : "需要教练邀请码"}
                    </dd>
                  </dl>
                  <button
                    className="btn secondary"
                    onClick={() =>
                      setDialog({
                        title: "工作室设置",
                        description:
                          "时区变更只改变显示方式，已预约课程的实际时刻不变。",
                        fields: [
                          {
                            name: "p_name",
                            label: "网站名称",
                            value: data.settings.studio_name,
                            required: true,
                          },
                          {
                            name: "p_timezone",
                            label: "预约时区",
                            type: "select",
                            value: zone,
                            options: zones.map((z) => ({ value: z, label: z })),
                            required: true,
                          },
                          {
                            name: "p_location",
                            label: "训练地点",
                            value: data.settings.location,
                            required: true,
                          },
                          {
                            name: "p_referrals",
                            label: "允许学员推荐码直接用于注册",
                            type: "checkbox",
                            value: data.settings.allow_referral_signup,
                          },
                        ],
                        action: (v) =>
                          mutate("save_settings", {
                            ...v,
                            p_referrals: v.p_referrals === "on",
                          }),
                      })
                    }
                  >
                    编辑工作室
                  </button>
                  <div className="setting-line">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>教练最高管理权限</strong>
                      <p>
                        学员不能修改角色、邀请码额度或他人的训练计划。所有权限均由数据库验证。
                      </p>
                    </div>
                  </div>
                </section>
              )}
              {coach && (
                <section className="panel settings-card full-span">
                  <div className="section-head">
                    <div>
                      <h2>Resend 联系人同步</h2>
                      <p className="muted">
                        系统每分钟自动检查，无需手动同步。邮箱验证后加入专属分组；关闭通知或停用账号会移出。不会更改其他业务的全局退订设置。
                      </p>
                    </div>
                    <button
                      className="btn secondary small"
                      disabled={busy}
                      onClick={async () => {
                        if (demo) {
                          notify("演示模式不同步联系人");
                          return;
                        }
                        setBusy(true);
                        setError("");
                        try {
                          await mutate("retry_contact_sync", {});
                          const {
                            data: { session: s },
                          } = await supabase!.auth.getSession();
                          const response = await fetch("/api/contacts", {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${s?.access_token}`,
                            },
                          });
                          const result = await response.json();
                          if (!response.ok)
                            throw new Error(result.error || "同步失败");
                          if (!result.configured)
                            throw new Error(
                              "请先在 Vercel 配置联系人管理 Key 和 Segment ID",
                            );
                          notify(
                            `本轮同步 ${result.synced} 位，失败 ${result.failed} 位。其余将自动继续。`,
                          );
                          await load();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "同步失败");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      同步 / 重试
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>学员</th>
                          <th>同步状态</th>
                          <th>分组</th>
                          <th>最近同步</th>
                          <th>说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.contact_sync.map((c) => (
                          <tr key={c.id}>
                            <td>{name(c.member_id)}</td>
                            <td>
                              <Badge
                                value={c.state}
                                label={
                                  (
                                    {
                                      pending: "等待自动同步",
                                      processing: "同步中",
                                      failed: "同步失败",
                                      synced: "已同步",
                                    } as Record<string, string>
                                  )[c.state]
                                }
                              />
                            </td>
                            <td>
                              {c.in_segment ? "已加入" : "未加入 / 已移出"}
                            </td>
                            <td>
                              {c.synced_at
                                ? displayTime(c.synced_at, zone, "MM.dd HH:mm")
                                : "—"}
                            </td>
                            <td>{c.last_error || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.contact_sync.length && (
                    <Empty text="学员验证邮箱后，会在这里显示同步进度" />
                  )}
                </section>
              )}
              {coach && (
                <section className="panel settings-card full-span">
                  <div className="section-head">
                    <div>
                      <h2>邮件投递记录</h2>
                      <p className="muted">
                        预约通知自动入队，定时任务负责投递；提醒将在课程开始前
                        24 小时进入发送时间。
                      </p>
                    </div>
                    <button
                      className="btn secondary small"
                      disabled={busy}
                      onClick={async () => {
                        if (demo) {
                          notify("演示模式不发送邮件");
                          return;
                        }
                        setBusy(true);
                        try {
                          const {
                            data: { session: s },
                          } = await supabase!.auth.getSession();
                          const r = await fetch("/api/notifications", {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${s?.access_token}`,
                            },
                          });
                          const result = await r.json();
                          if (!r.ok)
                            throw new Error(result.error || "处理失败");
                          notify(
                            `本轮已发送 ${result.sent} 封，跳过 ${result.skipped} 封，失败 ${result.failed} 封`,
                          );
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <RefreshCw size={15} />
                      处理待发邮件
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>收件人</th>
                          <th>主题</th>
                          <th>计划发送时间</th>
                          <th>状态</th>
                          <th>尝试次数</th>
                          <th>失败说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.email_jobs]
                          .sort((a, b) =>
                            b.created_at.localeCompare(a.created_at),
                          )
                          .slice(0, 100)
                          .map((j) => (
                            <tr key={j.id}>
                              <td>{name(j.recipient_id)}</td>
                              <td>{j.subject}</td>
                              <td>
                                {displayTime(j.due_at, zone, "MM.dd HH:mm")}
                              </td>
                              <td>
                                <Badge value={j.state} />
                              </td>
                              <td>{j.attempts}</td>
                              <td>{j.last_error || "—"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.email_jobs.length && (
                    <Empty text="还没有邮件投递记录" />
                  )}
                </section>
              )}
            </div>
          )}
          <footer className="page-footer">
            <span>
              {data.settings.studio_name} <span className="separator">/</span>{" "}
              每一次进步，都算数。
            </span>
            <span>
              <ShieldCheck size={13} /> 私密 · 专属 · 有序
            </span>
          </footer>
        </main>
      </div>
      {dialog && (
        <DialogView
          dialog={dialog}
          busy={busy}
          error={error}
          onClose={() => {
            setDialog(null);
            setError("");
          }}
          onSubmit={commit}
        />
      )}{" "}
      {flash}
    </div>
  );
}
