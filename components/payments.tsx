"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Data, Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { displayTime } from "@/lib/time";
type Order = {
  id: string;
  member_id: string;
  package: "single" | "monthly";
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
      if (!supabase || demo) throw new Error("演示环境不发起付款");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || session.user.id !== current.id)
        throw new Error("登录已变化，请刷新页面");
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
      if (!r.ok) throw new Error(result.error || "付款服务暂不可用");
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
        setError(e instanceof Error ? e.message : "加载失败");
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
        ? "已返回网站。退出付款页不会扣款；待付款订单可以继续支付或关闭。"
        : "已返回网站。请以订单中的付款与入账状态为准；若仍在处理中，请稍后刷新，不要重复购买。",
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
        throw new Error("付款网址无效");
      window.location.assign(url.href);
    } catch (e) {
      await refresh();
      setError(e instanceof Error ? e.message : "无法打开付款页");
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
      {hint && (
        <div className="notice">
          <p>{hint}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="payment-error">
          {error}
        </p>
      )}
      <div className="notice">
        <div>
          <strong>
            {mode === "test"
              ? "支付测试中"
              : mode === "live"
                ? "安全在线购课"
                : "在线支付尚未开放"}
          </strong>
          <p>
            {mode === "test"
              ? coach
                ? "仅教练可测试；请使用 Stripe 测试卡，测试订单不增加真实课时或包月。"
                : "教练正在测试付款功能，完成后开放购买。"
              : "单次按购买数量入账；包月一次付款购买一个月，到期后手动购买，不自动续费。"}
          </p>
        </div>
      </div>
      {coach && mode === "test" && (
        <label>
          选择测试价格的学员
          <select
            aria-label="支付测试学员"
            value={member}
            onChange={(e) => {
              setMember(e.target.value);
              setPage(1);
            }}
          >
            <option value="">请选择学员</option>
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
          {(["single", "monthly"] as const).map((kind) => {
            const unit =
              price?.[kind === "single" ? "single_price" : "monthly_price"];
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
                <h2>{kind === "single" ? "单次训练" : "不限次数包月"}</h2>
                <p>
                  {kind === "single"
                    ? "付款确认后自动增加对应课时，训练时间另行预约。"
                    : "付款当日开始一个月，有效期内不限次数，仍需预约开放时段。"}
                </p>
                <div className="price">
                  {unit == null
                    ? "待教练设置"
                    : money(Math.round(unit * 100), price!.currency)}
                  <small> / {kind === "single" ? "节" : "月"}</small>
                </div>
                {kind === "single" && (
                  <label>
                    购买节数
                    <input
                      aria-label="购买节数"
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
                    本次合计{" "}
                    {money(
                      Math.round(unit * 100) *
                        (kind === "single" ? quantity : 1),
                      price!.currency,
                    )}
                    {kind === "monthly" ? " · 不自动续费" : ""}
                  </p>
                )}
                {kind === "monthly" && covered && (
                  <p>已有包月记录，请到期后再购买。</p>
                )}
                {pending && <p>已有待付款订单，请在下方继续支付或关闭。</p>}
                <button
                  className="btn full"
                  disabled={
                    !enabled ||
                    busy ||
                    !member ||
                    unit == null ||
                    unit <= 0 ||
                    pending ||
                    (kind === "monthly" && covered) ||
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
                    ? "正在打开…"
                    : !enabled
                      ? "在线支付尚未开放"
                      : mode === "test"
                        ? "打开测试付款页"
                        : "前往 Stripe 付款"}
                </button>
                <small>
                  {unit === 0
                    ? "免费课程请联系教练入账。"
                    : "金额只对你和教练可见。"}
                </small>
              </article>
            );
          })}
        </div>
      )}
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>{coach ? "在线付款记录" : "我的付款记录"}</h2>
            <p>每页 10 条。付款、入账与退款状态分别保留。</p>
          </div>
          <button
            className="btn secondary small"
            disabled={loading || busy || demo}
            onClick={() => {
              void refresh();
              void onRefresh().catch(() =>
                setHint("付款记录已刷新；课时余额可稍后重新加载。"),
              );
            }}
          >
            {loading ? "加载中…" : "刷新记录与课时"}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间 / 订单</th>
                {coach && <th>学员</th>}
                <th>购买内容</th>
                <th>金额 / 状态</th>
                <th>入账与操作</th>
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
                      {!o.livemode ? " · 测试" : ""}
                    </small>
                  </td>
                  {coach && (
                    <td>
                      {data.profiles.find((p) => p.id === o.member_id)
                        ?.full_name || "学员"}
                    </td>
                  )}
                  <td>
                    {o.package === "single"
                      ? `${o.quantity} 节训练`
                      : "单月不限次"}
                    {o.starts_on && (
                      <small>
                        {o.starts_on} 至 {o.ends_on}
                      </small>
                    )}
                  </td>
                  <td>
                    {money(o.amount_total, o.currency)}
                    <small>{states[o.status] || o.status}</small>
                    {o.amount_refunded > 0 && (
                      <small>
                        已退款 {money(o.amount_refunded, o.currency)}
                      </small>
                    )}
                  </td>
                  <td>
                    {o.fulfillment === "test"
                      ? "测试成功 · 不计入真实课时"
                      : o.fulfillment === "fulfilled"
                        ? "已入账"
                        : o.fulfillment === "review"
                          ? o.review_note
                          : o.paid_at
                            ? "付款已确认，正在入账"
                            : "尚未入账"}
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
                            继续付款
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
                                  e instanceof Error ? e.message : "操作失败",
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            关闭未付款订单
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
            暂无在线付款记录。教练手动录入的购课在「课时与统计」查看。
          </p>
        )}
        {total > 10 && (
          <nav className="payment-pagination" aria-label="付款记录分页">
            <button
              className="btn secondary small"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </button>
            <span>
              第 {page} / {Math.ceil(total / 10)} 页 · 共 {total} 条
            </span>
            <button
              className="btn secondary small"
              disabled={page * 10 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </nav>
        )}
      </section>
    </section>
  );
}
