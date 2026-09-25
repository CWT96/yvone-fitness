"use client";
import { useState } from "react";
import type { Data, MonthlyMembership } from "@/lib/types";
import { entryLabels, memberSessionStats } from "@/lib/session-accounts";
import { displayTime } from "@/lib/time";

type Props = {
  data: Data;
  coach: boolean;
  memberId: string;
  onSelect: (id: string) => void;
  onCredit: (id: string, adjustment?: boolean) => void;
  onMonthly: (id: string) => void;
  onCancelMonthly: (membership: MonthlyMembership) => void;
};
export function SessionAccounts({
  data,
  coach,
  memberId,
  onSelect,
  onCredit,
  onMonthly,
  onCancelMonthly,
}: Props) {
  const [search, setSearch] = useState("");
  const [onlyShort, setOnlyShort] = useState(false);
  const members = data.profiles.filter((p) => p.role === "member");
  const selected = members.find((p) => p.id === memberId);
  const zone = data.settings.timezone;
  const today = displayTime(new Date().toISOString(), zone, "yyyy-MM-dd");
  const stats = selected ? memberSessionStats(data, selected.id) : null;
  const allStats = members.map((m) => memberSessionStats(data, m.id));
  const visibleMembers = members.filter(
    (m, i) =>
      (!onlyShort ||
        allStats[i].balance < 0 ||
        allStats[i].balance < allStats[i].needsCredits) &&
      `${m.full_name} ${m.email}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const money = (amount: number | null, currency: string) =>
    amount == null
      ? "未记录金额"
      : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
          amount,
        );
  if (!data.credits_ready)
    return (
      <section className="panel accounts-panel">
        <h2>课时账户尚未启用</h2>
        <p>
          {coach
            ? "数据库更新完成后，重新加载即可录入购课和查看余额。启用前不要依赖课时余额结算。"
            : "教练正在核对课时账户，启用后可在这里查看余额和明细。"}
        </p>
      </section>
    );
  return (
    <div className="accounts-layout">
      {coach && (
        <div className="toolbar outside">
          <label>
            查看学员{" "}
            <select
              aria-label="查看课时学员"
              value={memberId}
              onChange={(e) => onSelect(e.target.value)}
            >
              <option value="all">全部学员</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                  {m.active ? "" : "（已停用）"}
                </option>
              ))}
            </select>
          </label>
          {!selected && (
            <input
              className="account-search"
              aria-label="搜索课时学员"
              placeholder="搜索姓名或邮箱"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
        </div>
      )}
      {coach && !selected && (
        <>
          <div className="stats-grid account-stats">
            {[
              [
                "累计完成授课",
                `${allStats.reduce((sum, s) => sum + s.completed, 0)} 节`,
                `累计 ${allStats.reduce((sum, s) => sum + s.hours, 0).toFixed(1)} 小时（按排课时长）`,
              ],
              [
                "本月完成",
                `${allStats.reduce((sum, s) => sum + s.thisMonth, 0)} 节`,
                "按上课日期统计，取消不计入",
              ],
              [
                "已预约未上",
                `${allStats.reduce((sum, s) => sum + s.upcoming, 0)} 节`,
                "含进行中课程，尚未扣课",
              ],
              [
                "待确认完成",
                `${data.appointments.filter((b) => b.status === "booked" && Date.parse(b.slots.ends_at) <= Date.now()).length} 节`,
                "确认完成后才计入授课统计",
              ],
            ].map(([label, value, note]) => (
              <div className="stat-card" key={label}>
                <span>{label}</span>
                <div className="stat-value">{value}</div>
                <p>{note}</p>
              </div>
            ))}
          </div>
          <div className="segmented">
            <button
              className={!onlyShort ? "active" : ""}
              onClick={() => setOnlyShort(false)}
            >
              全部课时账户
            </button>
            <button
              className={onlyShort ? "active" : ""}
              onClick={() => setOnlyShort(true)}
            >
              余额不足 / 待核对（
              {
                allStats.filter(
                  (s) => s.balance < 0 || s.balance < s.needsCredits,
                ).length
              }
              ）
            </button>
          </div>
        </>
      )}
      {!selected && coach ? (
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>学员课时总览</h2>
              <p className="muted">
                余额包含已购和手动调整；仅确认完成的按次课程会扣课。已预约另外列出。
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>学员</th>
                  <th>剩余按次</th>
                  <th>已预约未上</th>
                  <th>累计完成 / 时长</th>
                  <th>包月状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleMembers.map((m) => {
                  const s = memberSessionStats(data, m.id);
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.full_name}</strong>
                        <small>{m.active ? "在训" : "已停用"}</small>
                      </td>
                      <td>
                        <strong
                          className={s.balance < 0 ? "account-warning" : ""}
                        >
                          {s.balance} 节
                        </strong>
                        {s.balance < 0 ? (
                          <small>待补录或核对</small>
                        ) : s.balance < s.needsCredits ? (
                          <small>不足覆盖已预约课程</small>
                        ) : null}
                      </td>
                      <td>{s.upcoming} 节</td>
                      <td>
                        {s.completed} 节 / {s.hours.toFixed(1)} 小时
                      </td>
                      <td>
                        {s.membership
                          ? `有效至 ${s.membership.ends_on}`
                          : "当前无有效包月"}
                      </td>
                      <td>
                        <div className="row gap wrap">
                          <button
                            className="text-btn"
                            onClick={() => onSelect(m.id)}
                          >
                            查看明细
                          </button>
                          <button
                            className="text-btn"
                            onClick={() => onCredit(m.id)}
                          >
                            录入购课
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!visibleMembers.length && (
            <p className="accounts-empty">没有符合条件的学员</p>
          )}
        </section>
      ) : selected && stats ? (
        <>
          <div className="account-heading">
            <div>
              <h2>
                {coach ? `${selected.full_name} 的课时账户` : "我的课时账户"}
              </h2>
              <p className="muted">
                一节按次训练扣 1 节；训练时长按实际排课时长另外统计。
              </p>
            </div>
            {coach && (
              <div className="row gap wrap">
                <button className="btn" onClick={() => onCredit(selected.id)}>
                  录入购课
                </button>
                <button
                  className="btn secondary"
                  onClick={() => onMonthly(selected.id)}
                >
                  录入包月
                </button>
                <button
                  className="text-btn"
                  onClick={() => onCredit(selected.id, true)}
                >
                  调整课时
                </button>
              </div>
            )}
          </div>
          <div className="stats-grid account-stats">
            {[
              [
                "剩余按次课时",
                `${stats.balance} 节`,
                stats.balance < 0
                  ? "课时余额待核对"
                  : `购课 ${stats.purchased} + 调整 ${stats.adjusted} − 已扣 ${stats.used}`,
              ],
              [
                "已预约未上",
                `${stats.upcoming} 节`,
                `其中 ${stats.needsCredits} 节需使用按次课时，尚未扣除`,
              ],
              [
                "历史完成",
                `${stats.completed} 节`,
                `累计 ${stats.hours.toFixed(1)} 小时`,
              ],
              [
                "本月完成",
                `${stats.thisMonth} 节`,
                "按工作室时区及上课日期统计",
              ],
            ].map(([title, value, note]) => (
              <div className="stat-card" key={title}>
                <span>{title}</span>
                <div className="stat-value">{value}</div>
                <p>{note}</p>
              </div>
            ))}
          </div>
          {stats.balance < 0 && (
            <div className="notice">
              <p>
                当前欠 {Math.abs(stats.balance)} 节。
                {coach
                  ? "请核对是否遗漏购课，或通过调整课时纠正；历史课程不会因余额不足丢失。"
                  : "请与教练核对购课和上课记录。"}
              </p>
            </div>
          )}
          {stats.balance >= 0 && stats.balance < stats.needsCredits && (
            <div className="notice">
              <p>
                当前按次余额不足覆盖已预约的按次课程，请
                {coach ? "核对并安排续课" : "与教练确认续课"}
                。预约不会提前扣课。
              </p>
            </div>
          )}
          <section className="panel accounts-panel">
            <h2>包月记录</h2>
            <p className="muted">
              有效期内不限次数（含开始日和结束日）。按上课日期判断，包月上课不会消耗按次余额。
            </p>
            {data.monthly_memberships
              .filter((m) => m.member_id === selected.id)
              .sort((a, b) => b.starts_on.localeCompare(a.starts_on))
              .map((m) => (
                <article className="membership-row" key={m.id}>
                  <div>
                    <strong>
                      {m.starts_on} — {m.ends_on}
                    </strong>
                    <p>
                      {m.cancelled_at
                        ? "已作废"
                        : m.starts_on > today
                          ? "尚未开始"
                          : m.ends_on < today
                            ? "已到期"
                            : "有效中 · 不限次数"}{" "}
                      · {money(m.amount, m.currency)}
                    </p>
                    <small>
                      {m.note}
                      {m.cancel_reason ? ` · 作废原因：${m.cancel_reason}` : ""}
                    </small>
                  </div>
                  {coach && !m.cancelled_at && (
                    <button
                      className="text-btn"
                      onClick={() => onCancelMonthly(m)}
                    >
                      作废
                    </button>
                  )}
                </article>
              ))}
            {!data.monthly_memberships.some(
              (m) => m.member_id === selected.id,
            ) && <p className="muted">暂无包月记录。</p>}
          </section>
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>课时流水</h2>
                <p className="muted">
                  每笔购课、调整和完成课程都保留记录；包月上课显示
                  0，不扣按次余额。
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>入账时间</th>
                    <th>类型</th>
                    <th>课时增减</th>
                    <th>金额记录</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {data.session_entries
                    .filter((e) => e.member_id === selected.id)
                    .sort(
                      (a, b) =>
                        b.created_at.localeCompare(a.created_at) ||
                        b.id.localeCompare(a.id),
                    )
                    .map((e) => {
                      const b = data.appointments.find(
                        (b) => b.id === e.appointment_id,
                      );
                      return (
                        <tr key={e.id}>
                          <td>
                            {displayTime(
                              e.created_at,
                              zone,
                              "yyyy.MM.dd HH:mm",
                            )}
                          </td>
                          <td>{entryLabels[e.kind]}</td>
                          <td>
                            <strong>
                              {e.quantity > 0 ? "+" : ""}
                              {e.quantity} 节
                            </strong>
                          </td>
                          <td>
                            {e.kind === "purchase"
                              ? money(e.amount, e.currency)
                              : "—"}
                          </td>
                          <td>
                            {e.note}
                            {b && (
                              <small>
                                上课：
                                {displayTime(
                                  b.slots.starts_at,
                                  zone,
                                  "yyyy.MM.dd HH:mm",
                                )}
                              </small>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {!data.session_entries.some((e) => e.member_id === selected.id) && (
              <p className="accounts-empty">
                暂无流水。
                {coach
                  ? "已有余课请通过「调整课时」录入核对后的期初余额。"
                  : "请教练核对并录入已有课时。"}
              </p>
            )}
          </section>
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>历史上课记录</h2>
                <p className="muted">
                  只统计已确认完成的课程，取消的预约不计入。
                  {stats.legacyCompleted > 0 &&
                    `${stats.legacyCompleted} 节历史课程未计入课时余额，不会自动补扣。`}
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>上课时间</th>
                    <th>时长</th>
                    <th>课时结算</th>
                  </tr>
                </thead>
                <tbody>
                  {data.appointments
                    .filter(
                      (b) =>
                        b.member_id === selected.id && b.status === "completed",
                    )
                    .sort((a, b) =>
                      b.slots.starts_at.localeCompare(a.slots.starts_at),
                    )
                    .map((b) => {
                      const entry = data.session_entries.find(
                        (e) => e.appointment_id === b.id,
                      );
                      return (
                        <tr key={b.id}>
                          <td>
                            {displayTime(
                              b.slots.starts_at,
                              zone,
                              "yyyy.MM.dd EEE HH:mm",
                            )}
                          </td>
                          <td>
                            {Math.round(
                              (Date.parse(b.slots.ends_at) -
                                Date.parse(b.slots.starts_at)) /
                                60000,
                            )}{" "}
                            分钟
                          </td>
                          <td>
                            {entry
                              ? entryLabels[entry.kind]
                              : "历史课程 · 未计入余额"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {!stats.completed && (
              <p className="accounts-empty">
                完成第一节训练后，这里会保留上课记录。
              </p>
            )}
          </section>
        </>
      ) : (
        <p>请选择学员查看课时账户。</p>
      )}
    </div>
  );
}
