import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { syncContacts } from "@/lib/contact-sync";
import { emailPolicyReminder } from "@/lib/course-policy";
import { emailContent } from "@/lib/email";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
function secretEqual(a: string, b: string) {
  return Boolean(
    a &&
    b &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b)),
  );
}
async function processJobs(request: Request) {
  const started = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return Response.json({ error: "Supabase 服务端尚未配置" }, { status: 503 });
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const bearer =
    request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const cron = secretEqual(bearer, process.env.CRON_SECRET || "");
  if (!cron) {
    if (request.method !== "POST" || !bearer)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const {
      data: { user },
      error,
    } = await db.auth.getUser(bearer);
    if (error || !user)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await db
      .from("profiles")
      .select("role,active")
      .eq("id", user.id)
      .single();
    if (!profile?.active || profile.role !== "coach")
      return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const apiKey = process.env.RESEND_API_KEY,
    from = process.env.RESEND_FROM,
    site = process.env.SITE_URL;
  if (!apiKey || !from || !site)
    return Response.json(
      { error: "请先配置 Resend API Key、发件地址与 SITE_URL" },
      { status: 503 },
    );
  let siteUrl: URL;
  try {
    siteUrl = new URL(site);
    if (siteUrl.protocol !== "https:") throw new Error();
  } catch {
    return Response.json(
      { error: "SITE_URL 必须是完整的 HTTPS 网站地址" },
      { status: 503 },
    );
  }
  const { data: settings } = await db
    .from("settings")
    .select("studio_name")
    .eq("id", 1)
    .single();
  await db
    .from("email_jobs")
    .update({ state: "failed", last_error: "已达到重试上限，请检查发件配置" })
    .eq("state", "processing")
    .lt("locked_until", new Date().toISOString())
    .gte("attempts", 5);
  const { data: jobs, error } = await db.rpc("claim_email_jobs");
  if (error)
    return Response.json(
      { error: "邮件队列读取失败，请检查数据库迁移" },
      { status: 500 },
    );
  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const job of jobs || []) {
    try {
      const { data: live, error: liveError } = await db
        .from("email_jobs")
        .select("state")
        .eq("id", job.id)
        .single();
      if (liveError) throw liveError;
      const { data: recipient, error: recipientError } = await db
        .from("profiles")
        .select("email,full_name,email_notifications,active,role")
        .eq("id", job.recipient_id)
        .single();
      if (recipientError) throw recipientError;
      let skip =
        live.state !== "processing" ||
        !recipient?.active ||
        !recipient.email_notifications;
      if (job.plan_id) {
        const { data: plan, error: planError } = await db
          .from("plans")
          .select("status,deleted_at")
          .eq("id", job.plan_id)
          .single();
        if (planError) throw planError;
        skip ||= !!plan.deleted_at || plan.status !== "published";
      }
      if (job.kind === "reminder") {
        const { data: appointment, error: appointmentError } = await db
          .from("appointments")
          .select("status,slots(starts_at)")
          .eq("id", job.appointment_id)
          .single();
        if (appointmentError) throw appointmentError;
        const slot = appointment?.slots as unknown as {
          starts_at: string;
        } | null;
        skip ||=
          appointment?.status !== "booked" ||
          !slot ||
          new Date(slot.starts_at) <= new Date();
      }
      if (skip) {
        const { error } = await db
          .from("email_jobs")
          .update({ state: "skipped", locked_until: null })
          .eq("id", job.id)
          .eq("state", "processing");
        if (error) throw error;
        counts.skipped++;
        continue;
      }
      const result = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(4000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `yvone/${job.id}`,
        },
        body: JSON.stringify({
          from,
          to: [recipient.email],
          subject: job.subject,
          text: `${recipient.full_name}，你好：\n${job.body}${emailPolicyReminder(job.subject) ? `\n\n温馨提醒：${emailPolicyReminder(job.subject)}\n完整购课须知：${siteUrl.origin}/?page=packages#course-policy` : ""}\n${siteUrl.origin}\n可在个人设置中关闭提醒。`,
          html: emailContent(
            recipient.full_name,
            job.subject,
            job.body,
            siteUrl.origin,
            settings?.studio_name || "Yvonne Fitness",
          ),
        }),
      });
      if (!result.ok)
        throw new Error(
          `Resend 返回 ${result.status}；请检查域名验证、配额和 API 权限`,
        );
      const { error } = await db
        .from("email_jobs")
        .update({
          state: "sent",
          sent_at: new Date().toISOString(),
          locked_until: null,
          last_error: null,
        })
        .eq("id", job.id)
        .eq("state", "processing");
      if (error) throw error;
      counts.sent++;
    } catch (e) {
      const { error: writeError } = await db
        .from("email_jobs")
        .update({
          state: job.attempts >= 5 ? "failed" : "pending",
          due_at: new Date(
            Date.now() + Math.min(15, 2 ** job.attempts) * 60000,
          ).toISOString(),
          locked_until: null,
          last_error: (e instanceof Error ? e.message : "邮件发送失败").slice(
            0,
            250,
          ),
        })
        .eq("id", job.id)
        .eq("state", "processing");
      if (writeError)
        console.error("Unable to persist email retry state", job.id);
      counts.failed++;
    }
    // Resend's default rate is limited; remain below two requests per second.
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  let contacts;
  if (
    process.env.RESEND_CONTACTS_API_KEY &&
    process.env.RESEND_SEGMENT_ID &&
    Date.now() - started < 20000
  ) {
    try {
      contacts = await syncContacts(db, started + 50000);
    } catch {
      contacts = { error: "联系人同步失败，请检查队列及配置" };
    }
  }
  return Response.json(
    { ...counts, ...(contacts ? { contacts } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export const GET = processJobs;
export const POST = processJobs;
