"use client";
import { useLanguage } from "@/components/language-provider";

import { localizedSystemNote } from "@/lib/notification-language";
import { Paginated } from "@/components/paginated";
import { useState } from "react";
import type { Data, MonthlyMembership } from "@/lib/types";
import { entryLabels, memberSessionStats } from "@/lib/session-accounts";

type Props = {
  data: Data;
  coach: boolean;
  memberId: string;
  onSelect: (id: string) => void;
  onCredit: (id: string, adjustment?: boolean) => void;
  onMonthly: (id: string) => void;
  onCancelMonthly: (membership: MonthlyMembership) => void;
  onCancelOnline: (membership: MonthlyMembership) => void;
  onOnline: (id: string) => void;
};
export function SessionAccounts({
  data,
  coach,
  memberId,
  onSelect,
  onCredit,
  onMonthly,
  onCancelMonthly,
  onCancelOnline,
  onOnline,
}: Props) {
  const { t, displayTime, language } = useLanguage();
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
      ? t("未记录金额")
      : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
          amount,
        );
  if (!data.credits_ready)
    return (
      <section className="panel accounts-panel">
        <h2>{t("课时账户尚未启用")}</h2>
        <p>
          {coach
            ? t(
                "数据库更新完成后，重新加载即可录入购课和查看余额。启用前不要依赖课时余额结算。",
              )
            : t("教练正在核对课时账户，启用后可在这里查看余额和明细。")}
        </p>
      </section>
    );
  return (
    <div className="accounts-layout">
      {coach && (
        <div className="toolbar outside">
          <label>
            {t("查看学员")}{" "}
            <select
              aria-label={t("查看课时学员")}
              value={memberId}
              onChange={(e) => onSelect(e.target.value)}
            >
              <option value="all">{t("全部学员")}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                  {m.active ? "" : t("（已停用）")}
                </option>
              ))}
            </select>
          </label>
          {!selected && (
            <input
              className="account-search"
              aria-label={t("搜索课时学员")}
              placeholder={t("搜索姓名或邮箱")}
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
                t("累计完成授课"),
                t("{0} 节", [
                  allStats.reduce((sum, s) => sum + s.completed, 0),
                ]),
                t("累计 {0} 小时 · 另有 {1} 次缺席", [
                  allStats.reduce((sum, s) => sum + s.hours, 0).toFixed(1),
                  allStats.reduce((sum, s) => sum + s.noShows, 0),
                ]),
              ],
              [
                t("本月完成"),
                t("{0} 节", [
                  allStats.reduce((sum, s) => sum + s.thisMonth, 0),
                ]),
                t("按上课日期统计，取消及缺席不计入"),
              ],
              [
                t("已预约未上"),
                t("{0} 节", [allStats.reduce((sum, s) => sum + s.upcoming, 0)]),
                t("含进行中课程，尚未扣课"),
              ],
              [
                t("待确认结果"),
                t("{0} 节", [
                  data.appointments.filter(
                    (b) =>
                      b.status === "booked" &&
                      Date.parse(b.slots.ends_at) <= Date.now(),
                  ).length,
                ]),
                t("标记完成或未到场；只有完成计入授课统计"),
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
              {t("全部课时账户")}
            </button>
            <button
              className={onlyShort ? "active" : ""}
              onClick={() => setOnlyShort(true)}
            >
              {t("余额不足 / 待核对（")}
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
              <h2>{t("学员课时总览")}</h2>
              <p className="muted">
                {t(
                  "按次课程完成或未到场均扣 1 节；包月内不扣按次余额。已预约另外列出。",
                )}
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("学员")}</th>
                  <th>{t("剩余按次")}</th>
                  <th>{t("已预约未上")}</th>
                  <th>{t("累计完成 / 时长")}</th>
                  <th>{t("包月状态")}</th>
                  <th>{t("操作")}</th>
                </tr>
              </thead>
              <tbody>
                <Paginated
                  items={visibleMembers}
                  resetKey={[memberId, search, onlyShort]}
                  label={t("课时账户")}
                  tableColumns={6}
                >
                  {(pageItems, pageOffset) =>
                    pageItems.map((m) => {
                      const s = memberSessionStats(data, m.id);
                      return (
                        <tr key={m.id}>
                          <td>
                            <strong>{m.full_name}</strong>
                            <small>{m.active ? t("在训") : t("已停用")}</small>
                          </td>
                          <td>
                            <strong
                              className={s.balance < 0 ? "account-warning" : ""}
                            >
                              {s.balance} {t("节")}
                            </strong>
                            {s.balance < 0 ? (
                              <small>{t("待补录或核对")}</small>
                            ) : s.balance < s.needsCredits ? (
                              <small>{t("不足覆盖已预约课程")}</small>
                            ) : null}
                          </td>
                          <td>
                            {s.upcoming} {t("节")}
                          </td>
                          <td>
                            {s.completed} {t("节 /")}
                            {s.hours.toFixed(1)} {t("小时")}
                            <small>
                              {t("另有")}
                              {s.noShows} {t("次缺席")}
                            </small>
                          </td>
                          <td>
                            {s.membership
                              ? t("有效至 {0}", [s.membership.ends_on])
                              : t("当前无有效包月")}
                          </td>
                          <td>
                            <div className="row gap wrap">
                              <button
                                className="text-btn"
                                onClick={() => onSelect(m.id)}
                              >
                                {t("查看明细")}
                              </button>
                              <button
                                className="text-btn"
                                onClick={() => onCredit(m.id)}
                              >
                                {t("录入购课")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  }
                </Paginated>
              </tbody>
            </table>
          </div>
          {!visibleMembers.length && (
            <p className="accounts-empty">{t("没有符合条件的学员")}</p>
          )}
        </section>
      ) : selected && stats ? (
        <>
          <div className="account-heading">
            <div>
              <h2>
                {coach
                  ? t("{0} 的课时账户", [selected.full_name])
                  : t("我的课时账户")}
              </h2>
              <p className="muted">
                {t(
                  "按次课程完成或未到场各扣 1 节；包月缺席只记次数。缺席不计入训练次数和时长。",
                )}
              </p>
            </div>
            {coach && (
              <div className="row gap wrap">
                <button className="btn" onClick={() => onCredit(selected.id)}>
                  {t("录入购课")}
                </button>
                <button
                  className="btn secondary"
                  onClick={() => onMonthly(selected.id)}
                >
                  {t("录入包月")}
                </button>
                <button
                  className="text-btn"
                  onClick={() => onCredit(selected.id, true)}
                >
                  {t("调整课时")}
                </button>
              </div>
            )}
          </div>
          <div className="stats-grid account-stats">
            {[
              [
                t("剩余按次课时"),
                t("{0} 节", [stats.balance]),
                stats.balance < 0
                  ? t("课时余额待核对")
                  : t("购课 {0} + 调整 {1} − 已扣 {2} − 过期 {3}", [
                      stats.purchased,
                      stats.adjusted,
                      stats.used,
                      stats.expired,
                    ]),
              ],
              [
                t("已预约未上"),
                t("{0} 节", [stats.upcoming]),
                t("其中 {0} 节需使用按次课时，尚未扣除", [stats.needsCredits]),
              ],
              [
                t("历史完成"),
                t("{0} 节", [stats.completed]),
                t("累计 {0} 小时 · 另有 {1} 次缺席", [
                  stats.hours.toFixed(1),
                  stats.noShows,
                ]),
              ],
              [
                t("本月完成"),
                t("{0} 节", [stats.thisMonth]),
                t("按工作室时区及上课日期统计"),
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
                {t("当前欠")}
                {Math.abs(stats.balance)} {t("节。")}
                {coach
                  ? t(
                      "请核对是否遗漏购课，或通过调整课时纠正；历史课程不会因余额不足丢失。",
                    )
                  : t("请与教练核对购课和上课记录。")}
              </p>
            </div>
          )}
          {stats.balance >= 0 && stats.balance < stats.needsCredits && (
            <div className="notice">
              <p>
                {t("当前按次余额不足覆盖已预约的按次课程，请")}
                {coach ? t("核对并安排续课") : t("与教练确认续课")}
                {t("。预约不会提前扣课。")}
              </p>
            </div>
          )}
          <section className="panel accounts-panel">
            <div className="section-head">
              <div>
                <h2>{t("线上指导记录")}</h2>
                <p className="muted">
                  {t("线上服务独立计时，不增加线下课时，也不抵扣线下训练。")}
                </p>
              </div>
              {coach && (
                <button
                  className="btn secondary small"
                  onClick={() => onOnline(selected.id)}
                >
                  {t("录入线上服务")}
                </button>
              )}
            </div>
            <Paginated
              items={(data.online_memberships || [])
                .filter((m) => m.member_id === selected.id)
                .sort((a, b) => b.starts_on.localeCompare(a.starts_on))}
              resetKey={[memberId]}
              label={t("线上指导记录")}
            >
              {(items) =>
                items.map((m) => (
                  <article className="membership-row" key={m.id}>
                    <div>
                      <strong>
                        {m.starts_on} — {m.ends_on}
                      </strong>
                      <p>
                        {m.cancelled_at
                          ? t("已作废")
                          : m.starts_on > today
                            ? t("尚未开始")
                            : m.ends_on < today
                              ? t("已到期")
                              : t("有效中")}{" "}
                        · {money(m.amount, m.currency)}
                      </p>
                      <small>
                        {localizedSystemNote(m.note, language)}
                        {m.cancel_reason
                          ? t(" · 作废原因：{0}", [m.cancel_reason])
                          : ""}
                      </small>
                    </div>
                    {coach && !m.cancelled_at && (
                      <button
                        className="text-btn"
                        onClick={() => onCancelOnline(m)}
                      >
                        {t("作废")}
                      </button>
                    )}
                  </article>
                ))
              }
            </Paginated>
            {!(data.online_memberships || []).some(
              (m) => m.member_id === selected.id,
            ) && <p className="muted">{t("暂无线上服务记录。")}</p>}
          </section>
          {data.session_entries.some(
            (e) => e.member_id === selected.id && e.expires_on,
          ) && (
            <section className="panel accounts-panel">
              <h2>{t("课次套餐有效期")}</h2>
              <p className="muted">
                {t(
                  "结束日当天仍可使用。按上课日期优先消耗即将到期的课时，过期未用课时不计入可用余额。",
                )}
              </p>
              <Paginated
                items={data.session_entries
                  .filter((e) => e.member_id === selected.id && e.expires_on)
                  .sort((a, b) =>
                    (b.expires_on || "").localeCompare(a.expires_on || ""),
                  )}
                resetKey={[memberId]}
                label={t("课次套餐有效期")}
              >
                {(items) =>
                  items.map((e) => (
                    <article className="membership-row" key={e.id}>
                      <div>
                        <strong>
                          {t("{0} 节训练", [e.quantity])} · {e.expires_on}
                        </strong>
                        <p>
                          {e.expires_on! < today
                            ? t("已到期")
                            : t("可用 {0} 节", [
                                stats.lots.find((l) => l.id === e.id)
                                  ?.remaining || 0,
                              ])}
                        </p>
                      </div>
                    </article>
                  ))
                }
              </Paginated>
            </section>
          )}
          <section className="panel accounts-panel">
            <h2>{t("包月记录")}</h2>
            <p className="muted">
              {t(
                "有效期内不限次数（含开始日和结束日）。按上课日期判断，包月上课不会消耗按次余额。",
              )}
            </p>
            <Paginated
              items={data.monthly_memberships
                .filter((m) => m.member_id === selected.id)
                .sort((a, b) => b.starts_on.localeCompare(a.starts_on))}
              resetKey={[memberId, search, onlyShort]}
              label={t("包月记录")}
            >
              {(pageItems, pageOffset) =>
                pageItems.map((m) => (
                  <article className="membership-row" key={m.id}>
                    <div>
                      <strong>
                        {m.starts_on} — {m.ends_on}
                      </strong>
                      <p>
                        {m.cancelled_at
                          ? t("已作废")
                          : m.starts_on > today
                            ? t("尚未开始")
                            : m.ends_on < today
                              ? t("已到期")
                              : t("有效中 · 不限次数")}{" "}
                        · {money(m.amount, m.currency)}
                      </p>
                      <small>
                        {localizedSystemNote(m.note, language)}
                        {m.cancel_reason
                          ? t(" · 作废原因：{0}", [m.cancel_reason])
                          : ""}
                      </small>
                    </div>
                    {coach && !m.cancelled_at && (
                      <button
                        className="text-btn"
                        onClick={() => onCancelMonthly(m)}
                      >
                        {t("作废")}
                      </button>
                    )}
                  </article>
                ))
              }
            </Paginated>
            {!data.monthly_memberships.some(
              (m) => m.member_id === selected.id,
            ) && <p className="muted">{t("暂无包月记录。")}</p>}
          </section>
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>{t("课时流水")}</h2>
                <p className="muted">
                  {t(
                    "每笔购课、调整、完成和缺席都保留记录；包月上课及缺席显示 0，不扣按次余额。",
                  )}
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("入账时间")}</th>
                    <th>{t("类型")}</th>
                    <th>{t("课时增减")}</th>
                    <th>{t("金额记录")}</th>
                    <th>{t("说明")}</th>
                  </tr>
                </thead>
                <tbody>
                  <Paginated
                    items={data.session_entries
                      .filter((e) => e.member_id === selected.id)
                      .sort(
                        (a, b) =>
                          b.created_at.localeCompare(a.created_at) ||
                          b.id.localeCompare(a.id),
                      )}
                    resetKey={[memberId, search, onlyShort]}
                    label={t("课时流水")}
                    tableColumns={5}
                  >
                    {(pageItems, pageOffset) =>
                      pageItems.map((e) => {
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
                            <td>{t(entryLabels[e.kind])}</td>
                            <td>
                              <strong>
                                {e.quantity > 0 ? "+" : ""}
                                {e.quantity} {t("节")}
                              </strong>
                            </td>
                            <td>
                              {e.kind === "purchase"
                                ? money(e.amount, e.currency)
                                : "—"}
                            </td>
                            <td>
                              {e.kind === "adjustment"
                                ? e.note
                                : localizedSystemNote(e.note, language)}
                              {b && (
                                <small>
                                  {t("排课：")}
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
                      })
                    }
                  </Paginated>
                </tbody>
              </table>
            </div>
            {!data.session_entries.some((e) => e.member_id === selected.id) && (
              <p className="accounts-empty">
                {t("暂无流水。")}
                {coach
                  ? t("已有余课请通过「调整课时」录入核对后的期初余额。")
                  : t("请教练核对并录入已有课时。")}
              </p>
            )}
          </section>
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>{t("历史课程记录")}</h2>
                <p className="muted">
                  {t("完成与缺席分别列出；缺席不计入训练次数和时长。")}
                  {stats.legacyCompleted > 0 &&
                    t("{0} 节历史课程未计入课时余额，不会自动补扣。", [
                      stats.legacyCompleted,
                    ])}
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("上课时间")}</th>
                    <th>{t("结果 / 训练时长")}</th>
                    <th>{t("课时结算")}</th>
                  </tr>
                </thead>
                <tbody>
                  <Paginated
                    items={data.appointments
                      .filter(
                        (b) =>
                          b.member_id === selected.id &&
                          (b.status === "completed" || b.status === "no_show"),
                      )
                      .sort((a, b) =>
                        b.slots.starts_at.localeCompare(a.slots.starts_at),
                      )}
                    resetKey={[memberId, search, onlyShort]}
                    label={t("上课历史")}
                    tableColumns={3}
                  >
                    {(pageItems, pageOffset) =>
                      pageItems.map((b) => {
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
                              {b.status === "no_show"
                                ? t("未到场 · No show")
                                : t("已完成 · {0} 分钟", [
                                    Math.round(
                                      (Date.parse(b.slots.ends_at) -
                                        Date.parse(b.slots.starts_at)) /
                                        60000,
                                    ),
                                  ])}
                              {b.status === "no_show" && b.reason && (
                                <small>{b.reason}</small>
                              )}
                            </td>
                            <td>
                              {entry
                                ? t(entryLabels[entry.kind])
                                : t("历史课程 · 未计入余额")}
                            </td>
                          </tr>
                        );
                      })
                    }
                  </Paginated>
                </tbody>
              </table>
            </div>
            {!stats.completed && !stats.noShows && (
              <p className="accounts-empty">
                {t("教练确认课程结果后，这里会保留完成或缺席记录。")}
              </p>
            )}
          </section>
        </>
      ) : (
        <p>{t("请选择学员查看课时账户。")}</p>
      )}
    </div>
  );
}
