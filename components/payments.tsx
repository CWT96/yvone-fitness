"use client";
import { useLanguage } from "@/components/language-provider";

import { packageOptions, type PackageKind } from "@/lib/package-options";
import { CoursePolicy } from "@/components/course-policy";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Data, Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
type Order = {
  id: string;
  member_id: string;
  package: PackageKind;
  quantity: number;
  amount_total: number;
  currency: string;
  livemode: boolean;
  status: string;
  created_at: string;
  paid_at: string | null;
  starts_on: string | null;
  ends_on: string | null;
  fulfillment: string;
  review_note: string;
  amount_refunded: number;
};
const states: Record<string, string> = {
  pending: "待付款",
  paid: "已付款",
  expired: "已关闭",
  refunded: "已退款",
  partial_refund: "部分退款",
};
export function Payments({
  data,
  current,
  demo,
  onRefresh,
}: {
  data: Data;
  current: Profile;
  demo: boolean;
  onRefresh: () => Promise<void>;
}) {
  const { t, displayTime, language } = useLanguage();
  const coach = current.role === "coach";
  const [mode, setMode] = useState("disabled"),
    [orders, setOrders] = useState<Order[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1);
  const [member, setMember] = useState(coach ? "" : current.id),
    [quantity, setQuantity] = useState(1),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [hint, setHint] = useState("");
  const generation = useRef(0);
  const [opening, setOpening] = useState<string | null>(null);
  const price = data.member_prices.find((p) => p.member_id === member);
  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      minor / 100,
    );
  const api = useCallback(
    async (method: string, body?: unknown) => {
      if (!supabase || demo) throw new Error(t("演示环境不发起付款"));
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || session.user.id !== current.id)
        throw new Error(t("登录已变化，请刷新页面"));
      const r = await fetch(
        `/api/payments${method === "GET" ? `?page=${page}${coach && member ? `&member=${encodeURIComponent(member)}` : ""}` : ""}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || t("付款服务暂不可用"));
      return result;
    },
    [demo, current.id, page, coach, member],
  );
  const refresh = useCallback(async () => {
    if (demo) return;
    const n = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const r = await api("GET");
      if (n !== generation.current) return;
      setMode(r.mode);
      setOrders(r.orders);
      setTotal(r.total);
      if (page > 1 && r.total <= (page - 1) * 10)
        setPage(Math.max(1, Math.ceil(r.total / 10)));
    } catch (e) {
      if (n === generation.current)
        setError(e instanceof Error ? e.message : t("加载失败"));
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }, [demo, api, page]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("payment")) return;
    setHint(
      url.searchParams.get("payment") === "cancel"
        ? t("已返回网站。退出付款页不会扣款；待付款订单可以继续支付或关闭。")
        : t(
            "已返回网站。请以订单中的付款与入账状态为准；若仍在处理中，请稍后刷新，不要重复购买。",
          ),
    );
    url.searchParams.delete("payment");
    url.searchParams.delete("order");
    window.history.replaceState(null, "", url);
  }, []);
  async function checkout(body: {
    package?: string;
    orderId?: string;
    memberId?: string;
    quantity?: number;
    expectedUnit?: number;
  }) {
    if (busy) return;
    setBusy(true);
    setOpening(body.package || body.orderId || null);
    setError("");
    try {
      const r = await api("POST", body);
      const url = new URL(r.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
        throw new Error(t("付款网址无效"));
      window.location.assign(url.href);
    } catch (e) {
      await refresh();
      setError(e instanceof Error ? e.message : t("无法打开付款页"));
      setBusy(false);
      setOpening(null);
    }
  }
  const today = displayTime(
    new Date().toISOString(),
    data.settings.timezone,
    "yyyy-MM-dd",
  );
  const covered = data.monthly_memberships.some(
    (m) => m.member_id === member && !m.cancelled_at && m.ends_on >= today,
  );
  return (
    <section className="payments-layout">
      <a className="policy-jump" href="#course-policy">
        {t("购课须知：有效期 · 请假改期 · 迟到与缺席 ↓")}
      </a>
      {hint && (
        <div className="notice">
          <p>{t(hint)}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="payment-error">
          {t(error)}
        </p>
      )}
      <div className="notice">
        <div>
          <strong>
            {mode === "test"
              ? t("支付测试中")
              : mode === "live"
                ? t("安全在线购课")
                : t("在线支付尚未开放")}
          </strong>
          <p>
            {mode === "test"
              ? coach
                ? t(
                    "仅教练可测试；请使用 Stripe 测试卡，测试订单不增加真实课时或包月。",
                  )
                : t("教练正在测试付款功能，完成后开放购买。")
              : t(
                  "单次按购买数量入账；期限套餐一次付款购买 1、3 或 12 个月，到期后手动购买，不自动续费。",
                )}
          </p>
        </div>
      </div>
      {coach && mode === "test" && (
        <label>
          {t("选择测试价格的学员")}
          <select
            aria-label={t("支付测试学员")}
            value={member}
            onChange={(e) => {
              setMember(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("请选择学员")}</option>
            {data.profiles
              .filter((p) => p.role === "member" && p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
        </label>
      )}
      {(!coach || mode === "test") && (
        <div className="package-grid">
          {(Object.keys(packageOptions) as PackageKind[]).map((kind) => {
            const unit = price?.[packageOptions[kind].priceKey];
            const pending = orders.some(
              (o) =>
                o.member_id === member &&
                o.package === kind &&
                o.status === "pending" &&
                o.livemode === (mode === "live"),
            );
            const enabled =
              (mode === "live" && !coach) || (mode === "test" && coach);
            return (
              <article className="package-card" key={kind}>
                <h2>{t(packageOptions[kind].label)}</h2>
                <p>
                  {kind === "single"
                    ? t("付款确认后自动增加对应课时，训练时间另行预约。")
                    : t(
                        "付款当日开始 {0} 个月，有效期内不限次数，仍需预约开放时段。",
                        [packageOptions[kind].months],
                      )}
                </p>
                <div className="price">
                  {unit == null
                    ? t("待教练设置")
                    : money(Math.round(unit * 100), price!.currency)}
                  <small>
                    {" "}
                    /{" "}
                    {language === "en" && kind === "single"
                      ? "session"
                      : t(packageOptions[kind].unit)}
                  </small>
                </div>
                {kind === "single" && (
                  <label>
                    {t("购买节数")}
                    <input
                      aria-label={t("购买节数")}
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                    />
                  </label>
                )}
                {unit != null && (
                  <p>
                    {t("本次合计")}{" "}
                    {money(
                      Math.round(unit * 100) *
                        (kind === "single" ? quantity : 1),
                      price!.currency,
                    )}
                    {kind !== "single" ? t(" · 不自动续费") : ""}
                  </p>
                )}
                {kind !== "single" && covered && (
                  <p>{t("已有包月记录，请到期后再购买。")}</p>
                )}
                {pending && (
                  <p>{t("已有待付款订单，请在下方继续支付或关闭。")}</p>
                )}
                <button
                  className="btn full"
                  disabled={
                    !enabled ||
                    busy ||
                    !member ||
                    unit == null ||
                    unit <= 0 ||
                    pending ||
                    (kind !== "single" && covered) ||
                    !Number.isInteger(quantity) ||
                    quantity < 1 ||
                    quantity > 100
                  }
                  onClick={() =>
                    void checkout({
                      memberId: member,
                      package: kind,
                      quantity: kind === "single" ? quantity : 1,
                      expectedUnit: Math.round(unit! * 100),
                    })
                  }
                >
                  {busy && opening === kind
                    ? t("正在打开…")
                    : !enabled
                      ? t("在线支付尚未开放")
                      : mode === "test"
                        ? t("打开测试付款页")
                        : t("前往 Stripe 付款")}
                </button>
                <small>
                  {unit === 0
                    ? t("免费课程请联系教练入账。")
                    : t("购买前请阅读本页购课须知，并在套餐有效期内安排训练。")}
                </small>
              </article>
            );
          })}
        </div>
      )}
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>{coach ? t("在线付款记录") : t("我的付款记录")}</h2>
            <p>{t("每页 10 条。付款、入账与退款状态分别保留。")}</p>
          </div>
          <button
            className="btn secondary small"
            disabled={loading || busy || demo}
            onClick={() => {
              void refresh();
              void onRefresh().catch(() =>
                setHint(t("付款记录已刷新；课时余额可稍后重新加载。")),
              );
            }}
          >
            {loading ? t("加载中…") : t("刷新记录与课时")}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("时间 / 订单")}</th>
                {coach && <th>{t("学员")}</th>}
                <th>{t("购买内容")}</th>
                <th>{t("金额 / 状态")}</th>
                <th>{t("入账与操作")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    {displayTime(
                      o.created_at,
                      data.settings.timezone,
                      "yyyy.MM.dd HH:mm",
                    )}
                    <small>
                      {o.id.slice(0, 8)}
                      {!o.livemode ? t(" · 测试") : ""}
                    </small>
                  </td>
                  {coach && (
                    <td>
                      {data.profiles.find((p) => p.id === o.member_id)
                        ?.full_name || t("学员")}
                    </td>
                  )}
                  <td>
                    {o.package === "single"
                      ? t("{0} 节训练", [o.quantity])
                      : t(packageOptions[o.package].label)}
                    {o.starts_on && (
                      <small>
                        {o.starts_on} {t("至")}
                        {o.ends_on}
                      </small>
                    )}
                  </td>
                  <td>
                    {money(o.amount_total, o.currency)}
                    <small>{t(states[o.status] || o.status)}</small>
                    {o.amount_refunded > 0 && (
                      <small>
                        {t("已退款")}
                        {money(o.amount_refunded, o.currency)}
                      </small>
                    )}
                  </td>
                  <td>
                    {o.fulfillment === "test"
                      ? t("测试成功 · 不计入真实课时")
                      : o.fulfillment === "fulfilled"
                        ? t("已入账")
                        : o.fulfillment === "review"
                          ? t(o.review_note)
                          : o.paid_at
                            ? t("付款已确认，正在入账")
                            : t("尚未入账")}
                    {o.status === "pending" &&
                      o.livemode === (mode === "live") &&
                      mode !== "disabled" &&
                      (!coach || mode === "test") && (
                        <div className="row gap wrap">
                          <button
                            className="text-btn"
                            disabled={busy}
                            onClick={() => void checkout({ orderId: o.id })}
                          >
                            {t("继续付款")}
                          </button>
                          <button
                            className="text-btn muted"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError("");
                              try {
                                await api("DELETE", { orderId: o.id });
                                await refresh();
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : t("操作失败"),
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {t("关闭未付款订单")}
                          </button>
                        </div>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!orders.length && !loading && (
          <p className="accounts-empty">
            {t("暂无在线付款记录。教练手动录入的购课在「课时与统计」查看。")}
          </p>
        )}
        {total > 10 && (
          <nav className="payment-pagination" aria-label={t("付款记录分页")}>
            <button
              className="btn secondary small"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              {t("上一页")}
            </button>
            <span>
              {t("第")}
              {page} / {Math.ceil(total / 10)} {t("页 · 共")}
              {total} {t("条")}
            </span>
            <button
              className="btn secondary small"
              disabled={page * 10 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("下一页")}
            </button>
          </nav>
        )}
      </section>
      <CoursePolicy />
    </section>
  );
}
