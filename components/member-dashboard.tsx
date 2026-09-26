"use client";
import type { ReactNode } from "react";
import type { Data, Appointment } from "@/lib/types";
import { memberSessionStats } from "@/lib/session-accounts";
import { displayTime } from "@/lib/time";
import { kgToLb, measurementFields } from "@/lib/measurements";
export function MemberDashboard({
  data,
  memberId,
  onOpen,
  onBook,
  onPlan,
  onRecord,
  bookings,
}: {
  data: Data;
  memberId: string;
  onOpen: (tab: string) => void;
  onBook: () => void;
  onPlan: () => void;
  onRecord: () => void;
  bookings: (items: Appointment[]) => ReactNode;
}) {
  const m = data.profiles.find((p) => p.id === memberId && p.role === "member");
  if (!m)
    return (
      <section className="panel">
        <p>找不到此学员，或没有查看权限。</p>
        <button className="btn secondary" onClick={() => onOpen("members")}>
          返回学员管理
        </button>
      </section>
    );
  const stats = memberSessionStats(data, m.id),
    zone = data.settings.timezone;
  const plan = data.plans.find(
    (p) => p.member_id === m.id && !p.deleted_at && p.status === "published",
  );
  const record = data.records
    .filter((r) => r.member_id === m.id && !r.deleted_at)
    .sort((a, b) => b.recorded_on.localeCompare(a.recorded_on))[0];
  const appointments = data.appointments
    .filter((a) => a.member_id === m.id && a.status === "booked")
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  const pending = appointments.filter(
    (a) => Date.parse(a.slots.ends_at) <= Date.now(),
  );
  const upcoming = appointments.filter(
    (a) => Date.parse(a.slots.ends_at) > Date.now(),
  );
  const price = data.member_prices.find((p) => p.member_id === m.id);
  const money = (v: number | null | undefined) =>
    v == null
      ? "未设置"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: price?.currency || "USD",
        }).format(v);
  return (
    <div className="member-dashboard">
      <section className="panel member-hero">
        <div className="section-head">
          <div>
            <span className="member-avatar" aria-hidden="true">
              {m.full_name.slice(0, 1)}
            </span>
            <h2>{m.full_name}</h2>
            <p>
              {m.active ? "在训" : "已停用"} · 加入于{" "}
              {displayTime(m.created_at, zone, "yyyy.MM.dd")}
            </p>
          </div>
          <button className="text-btn" onClick={() => onOpen("members")}>
            返回学员管理
          </button>
        </div>
        <p>
          {m.email} · {m.phone || "未填写电话"}
        </p>
        <p className="member-goal">
          <span>训练目标</span>
          {m.goals || "尚未填写"}
        </p>
        <div className="row wrap gap">
          <button className="btn" disabled={!m.active} onClick={onBook}>
            为学员预约
          </button>
          <button
            className="btn secondary"
            disabled={!m.active}
            onClick={onPlan}
          >
            制定计划
          </button>
          <button
            className="btn secondary"
            disabled={!m.active}
            onClick={onRecord}
          >
            新增档案
          </button>
          <button className="btn secondary" onClick={() => onOpen("credits")}>
            课时流水与包月
          </button>
        </div>
      </section>
      <div className="member-metrics">
        {[
          [
            "剩余按次课时",
            data.credits_ready ? `${stats.balance} 节` : "未启用",
          ],
          ["已完成训练", `${stats.completed} 次`],
          ["累计训练", `${stats.hours.toFixed(1)} 小时`],
          ["接下来课程", `${stats.upcoming} 次`],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <small>{label}</small>
            <h2>{value}</h2>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="section-head">
          <h2>账户与训练状态</h2>
          <button className="text-btn" onClick={() => onOpen("credits")}>
            查看明细 →
          </button>
        </div>
        <div className="member-detail-stats">
          <span>
            累计购课 <strong>{stats.purchased} 节</strong>
          </span>
          <span>
            本月完成 <strong>{stats.thisMonth} 次</strong>
          </span>
          <span>
            未到场 <strong>{stats.noShows} 次</strong>
          </span>
          <span>
            待标记 <strong>{pending.length} 次</strong>
          </span>
        </div>
        <p>
          {stats.membership
            ? `包月有效：${stats.membership.starts_on} 至 ${stats.membership.ends_on}（含结束日）`
            : "当前没有有效包月"}
        </p>
        <p>
          专属价格：单次 {money(price?.single_price)} · 包月{" "}
          {money(price?.monthly_price)} · 3 个月 {money(price?.quarterly_price)}{" "}
          · 12 个月 {money(price?.annual_price)}
        </p>
        <p>
          邮件通知：{m.email_notifications ? "开启" : "关闭"} · 成功推荐{" "}
          {
            data.referrals.filter(
              (r) => r.referrer_id === m.id && r.status === "confirmed",
            ).length
          }{" "}
          人
        </p>
        {stats.balance < 1 && !stats.membership && (
          <p>按次课时不足，请核对购课记录。</p>
        )}
      </section>
      <div className="member-content">
        <section className="panel">
          <div className="section-head">
            <h2>当前训练计划</h2>
            <button className="text-btn" onClick={() => onOpen("plans")}>
              全部计划
            </button>
          </div>
          {plan ? (
            <>
              <h3>{plan.title}</h3>
              <p className="pre-wrap">{plan.content}</p>
            </>
          ) : (
            <p>尚未发布当前计划。</p>
          )}
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>最新训练档案</h2>
            <button className="text-btn" onClick={() => onOpen("records")}>
              全部档案
            </button>
          </div>
          {record ? (
            <>
              <p>
                {record.recorded_on} ·{" "}
                {record.shared ? "已发布" : "草稿（仅教练可见）"}
              </p>
              <p>
                体重{" "}
                {record.weight == null
                  ? "未记录"
                  : `${kgToLb(record.weight)} lb`}{" "}
                · 体脂{" "}
                {record.body_fat == null ? "未记录" : `${record.body_fat}%`}
              </p>
              {measurementFields
                .filter((f) => record.measurements?.[f.key] != null)
                .map((f) => (
                  <p key={f.key}>
                    {f.label}：{record.measurements![f.key]} {f.unit}
                  </p>
                ))}
              <p className="pre-wrap">{record.notes || "暂无备注"}</p>
            </>
          ) : (
            <p>尚无训练档案。</p>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-head">
          <h2>
            待标记课程结果 <span className="count">{pending.length}</span>
          </h2>
        </div>
        <p>
          结束后选择「标记完成」或「No show」。按次各扣 1 节；包月内只记结果。
        </p>
        {bookings(pending)}
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>接下来课程</h2>
          <button className="text-btn" onClick={() => onOpen("bookings")}>
            预约记录
          </button>
        </div>
        {bookings(upcoming)}
      </section>
    </div>
  );
}
