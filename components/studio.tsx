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
import type {
  Data,
  Profile,
  Slot,
  Appointment,
  Plan,
  RecordEntry,
  Package,
} from "@/lib/types";
import { displayTime, localToISO, csvCell } from "@/lib/time";
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
};
type Dialog = {
  title: string;
  description?: string;
  fields: Field[];
  submit?: string;
  action: (values: Record<string, string>) => Promise<void>;
};
const tabs = [
  ["overview", "训练概览", LayoutDashboard],
  ["schedule", "教练时间表", CalendarDays],
  ["bookings", "课程预约", Clock3],
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
});
function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value}`}>{statusNames[value] || value}</span>
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
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <span className="eyebrow">YVONE FITNESS</span>
          <h2>{dialog.title}</h2>
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
      {dialog.description && <p className="muted">{dialog.description}</p>}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={onSubmit}>
        {dialog.fields.map((f) => (
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
                    maxLength={30000}
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
                    step={f.type === "number" ? "any" : undefined}
                    maxLength={f.name === "p_name" ? 80 : 2000}
                  />
                )}
              </>
            )}
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
        <div className="modal-footer">
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={onClose}
          >
            返回
          </button>
          <button className="btn" disabled={busy}>
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
  const current = data.profiles.find(
    (p) =>
      p.id ===
      (demo ? (demoRole === "coach" ? "coach" : "member-0") : session?.user.id),
  );
  const coach = current?.role === "coach";
  const zone = data.settings.timezone;
  const members = data.profiles.filter((p) => p.role === "member");
  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 4500);
  }, []);
  const load = useCallback(async () => {
    if (!supabase) return;
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
      settings,
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
      read("settings"),
    ]);
    if (slots.error) throw slots.error;
    setData({
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
      settings: settings[0] || emptyData().settings,
    } as Data);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("password");
        setShowAuth(true);
      }
      if (!s) setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) setError(error.message);
      setSession(session);
      if (!session) setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session && !demo) {
      setLoading(true);
      load()
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [session, demo, load]);
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
    if (!session || demo) return;
    const refresh = () => {
      if (document.visibilityState === "visible") load().catch(() => {});
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [session, demo, load]);
  const name = (id: string) =>
    data.profiles.find((p) => p.id === id)?.full_name || "学员";
  const navigate = (next: string) => {
    setTab(next);
    setQuery("");
    setFilter("all");
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
    value: id || memberOptions[0]?.value,
    required: true,
    options: memberOptions,
  });
  async function mutate(fn: string, args: Record<string, unknown>) {
    if (demo) {
      demoMutate(fn, args);
      return;
    }
    if (!supabase) throw new Error("请先连接 Supabase");
    const { error } = await supabase.rpc(fn, args);
    if (error) throw error;
    await load();
  }
  function demoMutate(fn: string, a: Record<string, unknown>) {
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    setData((d) => {
      const n = structuredClone(d);
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
          if (a.p_action === "complete") booking.status = "completed";
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
      return n;
    });
  }
  const commit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!dialog || busy) return;
    const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<
      string,
      string
    >;
    setBusy(true);
    setError("");
    try {
      await dialog.action(values);
      setDialog(null);
      notify(demo ? "已更新演示数据（刷新后恢复）" : "保存成功");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  function book(slot?: Slot, existing?: Appointment) {
    const available = data.slots.filter(
      (s) => s.available && s.id !== existing?.slot_id,
    );
    setDialog({
      title: existing
        ? "调整预约时间"
        : coach
          ? "为学员预约"
          : "预约下一次训练",
      description: `所有课程时间均为 ${zone}。`,
      fields: [
        ...(coach && !existing ? [memberField()] : []),
        {
          name: "p_slot",
          label: "训练时间",
          type: "select",
          required: true,
          value: slot?.id || available[0]?.id,
          options: available.map((s) => ({
            value: s.id,
            label: `${displayTime(s.starts_at, zone)} – ${displayTime(s.ends_at, zone, "HH:mm")}`,
          })),
        },
        {
          name: "p_message",
          label: existing ? "改期原因（选填）" : "给教练的留言（选填）",
          type: "textarea",
        },
      ],
      submit: existing ? "确认改期" : "确认预约",
      action: async (v) => {
        await mutate("manage_booking", {
          p_action: existing ? "reschedule" : "book",
          p_slot: v.p_slot,
          p_appointment: existing?.id || null,
          p_member: existing?.member_id || v.p_member || current!.id,
          p_message: v.p_message,
        });
      },
    });
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
      description: plan
        ? `归属学员：${name(plan.member_id)}。发布后，学员会看到此计划。`
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
        {
          name: "p_publish",
          label: "立即发布给学员，并加入邮件通知队列",
          type: "checkbox",
          value: plan?.status === "published",
        },
      ],
      action: (v) =>
        mutate("save_plan", {
          p_member: plan?.member_id || v.p_member,
          p_id: plan?.id || null,
          p_title: v.p_title,
          p_content: v.p_content,
          p_publish: v.p_publish === "on",
        }),
    });
  }
  function editRecord(record?: RecordEntry, member?: string) {
    setDialog({
      title: record ? "编辑训练档案" : "添加训练档案",
      description: record
        ? `归属学员：${name(record.member_id)}`
        : "未勾选共享时，记录仅教练可见。",
      fields: [
        ...(!record ? [memberField(member)] : []),
        {
          name: "p_date",
          label: "记录日期",
          type: "date",
          value:
            record?.recorded_on ||
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
        {
          name: "p_shared",
          label: "共享给这位学员",
          type: "checkbox",
          value: record?.shared || false,
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
          p_shared: v.p_shared === "on",
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
          required: true,
        },
        {
          name: "p_days",
          label: "有效天数",
          type: "number",
          value: 30,
          min: 1,
          max: 365,
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
      ...data.referrals.map((r) => [
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
      const email = String(f.email || ""),
        password = String(f.password || "");
      if (authMode === "register") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: f.full_name,
              invite_code: f.invite_code,
              referral_code: f.referral_code || "",
            },
          },
        });
        if (error) throw error;
        setAuthHint(
          "请查收验证邮件，点击链接完成注册。如果没有收到，请检查垃圾邮件或联系教练确认邀请码。",
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
        setAuthHint("如果该邮箱已注册，你会收到密码重置邮件。");
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
      {error && (
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
            <form onSubmit={authSubmit}>
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
                onClick={() => {
                  setAuthMode(authMode === "register" ? "login" : "register");
                  setAuthHint("");
                }}
              >
                {authMode === "register" ? "已有账号？登录" : "有邀请码？注册"}
              </button>
              {authMode === "login" && (
                <button onClick={() => setAuthMode("reset")}>忘记密码</button>
              )}
              {authMode === "reset" && (
                <button onClick={() => setAuthMode("login")}>返回登录</button>
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
        <p>请联系教练，或检查数据库是否完成初始化。</p>
        <button className="btn" onClick={signOut}>
          退出登录
        </button>
        {flash}
      </div>
    );
  const ownAppointments = data.appointments.filter(
    (b) => coach || b.member_id === current.id,
  );
  const upcoming = ownAppointments
    .filter(
      (b) => b.status === "booked" && new Date(b.slots.starts_at) > new Date(),
    )
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  const ownPlans = data.plans.filter(
    (p) => coach || (p.member_id === current.id && p.status !== "draft"),
  );
  const ownRecords = data.records.filter(
    (r) => coach || (r.member_id === current.id && r.shared),
  );
  const visibleReferrals = data.referrals.filter(
    (r) => coach || r.referrer_id === current.id,
  );
  const next = upcoming[0];
  const bookingCards = (items: Appointment[]) =>
    items.length ? (
      <div className="booking-list">
        {items.map((b) => (
          <article className="booking-row" key={b.id}>
            <div className="date-block">
              <strong>{displayTime(b.slots.starts_at, zone, "dd")}</strong>
              <span>{displayTime(b.slots.starts_at, zone, "MM月 EEE")}</span>
            </div>
            <div className="booking-main">
              <div className="row gap">
                <h3>{coach ? name(b.member_id) : "一对一私教训练"}</h3>
                <Badge value={b.status} />
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
                        description: `${name(b.member_id)} · ${displayTime(b.slots.starts_at, zone)}`,
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
                    description:
                      data.events
                        .filter((e) => e.appointment_id === b.id)
                        .sort((a, b) =>
                          a.created_at.localeCompare(b.created_at),
                        )
                        .map(
                          (e) =>
                            `${displayTime(e.created_at, zone)} · ${actionNames[e.action]} · ${name(e.actor_id)}${e.details.old_start ? " · 原时间 " + displayTime(e.details.old_start, zone) : ""}${e.details.new_start ? " → " + displayTime(e.details.new_start, zone) : ""}${e.message ? "\n" + e.message : ""}`,
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
        text="还没有课程安排"
        action={
          <button
            className="btn secondary"
            onClick={() => navigate("schedule")}
          >
            查看可预约时间
            <ArrowRight size={16} />
          </button>
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
              aria-label="打开菜单"
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
                    label: "即将开始",
                    value: upcoming.length,
                    unit: "节",
                    icon: CalendarDays,
                    note: "已确认的未来课程",
                  },
                  {
                    label: coach ? "已发布计划" : "当前训练计划",
                    value: ownPlans.filter((p) => p.status === "published")
                      .length,
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
              <div className="dashboard-grid">
                <section className="panel schedule-panel">
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">UP NEXT</span>
                      <h2>接下来的训练</h2>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => navigate("bookings")}
                    >
                      全部预约 <ArrowRight size={16} />
                    </button>
                  </div>
                  {bookingCards(upcoming.slice(0, 3))}
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
                  <span className="eyebrow">STAY CONSISTENT</span>
                  <div className="focus-icon">
                    <Dumbbell size={42} />
                  </div>
                  <h2>
                    {coach
                      ? "好的训练，\n从好的计划开始。"
                      : "专属于你，\n每一步都有方向。"}
                  </h2>
                  <p>
                    {coach
                      ? "用清晰的计划和及时的反馈，\n陪伴学员走得更远。"
                      : ownPlans.find((p) => p.status === "published")?.title ||
                        "等待教练为你制定专属训练计划。"}
                  </p>
                  <button onClick={() => navigate("plans")}>
                    查看训练计划 <ArrowRight size={18} />
                  </button>
                </section>
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
                      {members.slice(0, 4).map((m) => (
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
              const now = new Date();
              now.setDate(now.getDate() + week * 7);
              const days = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(now);
                d.setDate(d.getDate() + i);
                return displayTime(d.toISOString(), zone, "yyyy-MM-dd");
              });
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
                        本周
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
                                  {coach ? "代预约" : "预约"} <Plus size={13} />
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
                    ["all", "全部"],
                    ["booked", "已预约"],
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
                      (filter === "all" || b.status === filter) &&
                      name(b.member_id).includes(query),
                  )
                  .sort((a, b) =>
                    b.slots.starts_at.localeCompare(a.slots.starts_at),
                  ),
              )}
            </section>
          )}
          {tab === "members" && coach && (
            <section className="panel">
              <div className="toolbar">
                <h2>
                  全部学员 <span className="count">{members.length}</span>
                </h2>
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
                    {members
                      .filter((m) =>
                        `${m.full_name} ${m.email}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((m) => (
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
                                  navigate("records");
                                  setMemberFilter(m.id);
                                }}
                              >
                                档案
                              </button>
                              <button
                                className="text-btn"
                                onClick={() => editPlan(undefined, m.id)}
                              >
                                计划
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
                    ...(coach ? [["draft", "草稿"]] : []),
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
                      (filter === "all" || p.status === filter) &&
                      (memberFilter === "all" || p.member_id === memberFilter),
                  )
                  .map((p) => (
                    <article className="panel plan-card" key={p.id}>
                      <div className="row between">
                        <span className="small-icon">
                          <Dumbbell />
                        </span>
                        <Badge value={p.status} />
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
                          专属计划 · 仅指定学员可见
                        </span>
                        {coach && (
                          <button
                            className="text-btn"
                            onClick={() => editPlan(p)}
                          >
                            编辑计划
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
              </div>
              {!ownPlans.some(
                (p) =>
                  (filter === "all" || p.status === filter) &&
                  (memberFilter === "all" || p.member_id === memberFilter),
              ) && (
                <div className="panel">
                  <Empty
                    text={
                      coach
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
                    ? "训练档案默认仅你可见，可选择共享给对应学员。"
                    : "以下为教练共享给你的训练记录。"}
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
              <div className="records-list">
                {ownRecords
                  .filter(
                    (r) =>
                      memberFilter === "all" || r.member_id === memberFilter,
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
                          {r.shared ? "已与学员共享" : "仅教练可见"}
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
                        <button
                          className="text-btn"
                          onClick={() => editRecord(r)}
                        >
                          编辑
                        </button>
                      )}
                    </article>
                  ))}
              </div>
              {!ownRecords.some(
                (r) => memberFilter === "all" || r.member_id === memberFilter,
              ) && (
                <div className="panel">
                  <Empty text="还没有训练记录" />
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
          {tab === "packages" && (
            <>
              <div className="notice">
                <Wallet size={20} />
                <div>
                  <strong>在线支付即将开放</strong>
                  <p>
                    目前可查看课程方案；价格及购买安排请与教练确认。Stripe
                    连接完成前，本页面不会收取任何费用。
                  </p>
                </div>
              </div>
              <div className="package-grid">
                {data.packages
                  .filter((p) => coach || p.active)
                  .map((p, i) => (
                    <article
                      key={p.id}
                      className={`package-card ${i === 1 ? "featured" : ""}`}
                    >
                      <span className="eyebrow">
                        {String(p.sessions).padStart(2, "0")} SESSIONS
                      </span>
                      <h2>{p.title}</h2>
                      <p>{p.description}</p>
                      <div className="price">
                        {p.price === null
                          ? "价格待定"
                          : new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: p.currency,
                            }).format(p.price)}
                        <small> / {p.sessions} 节</small>
                      </div>
                      <div className="package-benefits">
                        <span>
                          <Check size={17} />
                          一对一私教指导
                        </span>
                        <span>
                          <Check size={17} />
                          个人训练计划
                        </span>
                        <span>
                          <Check size={17} />
                          专属训练档案
                        </span>
                      </div>
                      <button className="btn full" disabled>
                        在线支付尚未开放
                      </button>
                      {coach && (
                        <button
                          className="text-btn full"
                          onClick={() => editPackage(p)}
                        >
                          编辑课程方案{!p.active ? "（已隐藏）" : ""}
                        </button>
                      )}
                    </article>
                  ))}
              </div>
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
                          notify("请检查新旧邮箱中的验证邮件");
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
                            required: true,
                          },
                        ],
                        action: async (v) => {
                          if (v.password.length < 8)
                            throw new Error("密码至少需要 8 位");
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
  function editPackage(p: Package) {
    setDialog({
      title: "编辑课程方案",
      description: "Stripe 尚未连接，保存价格不会触发收款。",
      fields: [
        { name: "title", label: "方案名称", value: p.title, required: true },
        {
          name: "sessions",
          label: "课时数",
          type: "number",
          value: p.sessions,
          min: 1,
          max: 999,
          required: true,
        },
        {
          name: "price",
          label: "方案总价（留空显示价格待定）",
          type: "number",
          value: p.price ?? "",
          min: 0,
        },
        {
          name: "currency",
          label: "币种",
          type: "select",
          value: p.currency,
          options: ["USD", "CNY", "CAD", "AUD", "EUR", "GBP"].map((z) => ({
            value: z,
            label: z,
          })),
          required: true,
        },
        {
          name: "description",
          label: "方案说明",
          type: "textarea",
          value: p.description,
        },
        {
          name: "active",
          label: "向学员展示",
          type: "checkbox",
          value: p.active,
        },
      ],
      action: async (v) => {
        const patch = {
          title: v.title,
          sessions: Number(v.sessions),
          price: v.price === "" ? null : Number(v.price),
          currency: v.currency,
          description: v.description,
          active: v.active === "on",
        };
        if (!Number.isInteger(patch.sessions) || patch.sessions <= 0)
          throw new Error("课时数必须是正整数");
        if (demo) {
          setData((d) => ({
            ...d,
            packages: d.packages.map((x) =>
              x.id === p.id ? { ...x, ...patch } : x,
            ),
          }));
          return;
        }
        const { error } = await supabase!
          .from("packages")
          .update(patch)
          .eq("id", p.id);
        if (error) throw error;
        await load();
      },
    });
  }
}
