import type { SupabaseClient } from "@supabase/supabase-js";

type SyncJob = {
  id: string;
  member_id: string;
  revision: number;
  lock_token: string;
  attempts: number;
  contact_id: string | null;
  synced_email: string | null;
  segment_id: string | null;
};
type Contact = { id: string; unsubscribed: boolean };
export async function syncContacts(
  db: SupabaseClient,
  deadline = Date.now() + 45000,
) {
  const key = process.env.RESEND_CONTACTS_API_KEY,
    segment = process.env.RESEND_SEGMENT_ID;
  if (!key || !segment) return { synced: 0, failed: 0, configured: false };
  const counts = { synced: 0, failed: 0, configured: true };
  // Validate the configured segment before changing any contact membership.
  async function api(
    path: string,
    method = "GET",
    body?: unknown,
    allow404 = false,
  ) {
    if (Date.now() > deadline - 3500)
      throw new Error("本轮同步时间已用完，将自动重试");
    const response = await fetch(`https://api.resend.com${path}`, {
      method,
      signal: AbortSignal.timeout(3000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    await new Promise((resolve) => setTimeout(resolve, 550));
    if (allow404 && response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        `Resend 联系人接口返回 ${response.status}；请检查 Contacts Key 权限、Segment 和配额`,
      );
    return response.status === 204 ? {} : await response.json();
  }
  await db
    .from("contact_sync")
    .update({
      state: "failed",
      locked_until: null,
      lock_token: null,
      last_error: "同步中断次数过多，请重试",
    })
    .eq("state", "processing")
    .lt("locked_until", new Date().toISOString())
    .gte("attempts", 8);
  const { data, error } = await db.rpc("claim_contact_sync");
  if (error) throw new Error("联系人队列读取失败，请确认已执行更新脚本");
  const jobs = (data || []) as SyncJob[];
  if (!jobs.length) return counts;
  let segmentError: Error | undefined;
  try {
    await api(`/segments/${encodeURIComponent(segment)}`);
  } catch (e) {
    segmentError = e instanceof Error ? e : new Error("分组读取失败");
  }
  for (const job of jobs) {
    try {
      if (segmentError) throw segmentError;
      const { data: p, error: profileError } = await db
        .from("profiles")
        .select("email,full_name,active,email_notifications,role")
        .eq("id", job.member_id)
        .single();
      if (profileError || !p || p.role !== "member")
        throw new Error("找不到对应学员");
      const { data: live, error: liveError } = await db
        .from("contact_sync")
        .select("revision")
        .eq("id", job.id)
        .single();
      if (liveError) throw new Error("无法确认同步版本");
      if (live.revision !== job.revision) {
        await db.rpc("finish_contact_sync", {
          p_id: job.id,
          p_revision: job.revision,
          p_lock: job.lock_token,
        });
        continue;
      }
      // Remove only this app's old membership if the email or target segment changed.
      if (
        job.contact_id &&
        job.segment_id &&
        (job.synced_email !== p.email || job.segment_id !== segment)
      ) {
        await api(
          `/contacts/${encodeURIComponent(job.contact_id)}/segments/${encodeURIComponent(job.segment_id)}`,
          "DELETE",
          undefined,
          true,
        );
      }
      let contact = (await api(
        `/contacts/${encodeURIComponent(p.email)}`,
        "GET",
        undefined,
        true,
      )) as Contact | null;
      if (!contact) {
        try {
          const created = await api("/contacts", "POST", {
            email: p.email,
            first_name: p.full_name,
            unsubscribed: !p.active || !p.email_notifications,
          });
          contact = {
            id: created.id,
            unsubscribed: !p.active || !p.email_notifications,
          };
        } catch (e) {
          // A prior timed-out create or another app may have created this contact.
          contact = (await api(
            `/contacts/${encodeURIComponent(p.email)}`,
            "GET",
            undefined,
            true,
          )) as Contact | null;
          if (!contact) throw e;
        }
      }
      if (!contact?.id) throw new Error("Resend 未返回联系人编号");
      const included = p.active && p.email_notifications;
      // Never PATCH a shared contact or reset its global unsubscribe status.
      await api(
        `/contacts/${encodeURIComponent(contact.id)}/segments/${encodeURIComponent(segment)}`,
        included ? "POST" : "DELETE",
        undefined,
        !included,
      );
      const { error: saveError } = await db.rpc("finish_contact_sync", {
        p_id: job.id,
        p_revision: job.revision,
        p_lock: job.lock_token,
        p_contact: contact.id,
        p_email: p.email,
        p_segment: segment,
        p_in_segment: included,
      });
      if (saveError) throw new Error("联系人同步状态保存失败");
      counts.synced++;
    } catch (e) {
      const { error: saveError } = await db.rpc("finish_contact_sync", {
        p_id: job.id,
        p_revision: job.revision,
        p_lock: job.lock_token,
        p_error: (e instanceof Error ? e.message : "联系人同步失败").slice(
          0,
          250,
        ),
      });
      if (saveError)
        console.error("Unable to persist contact sync state", job.id);
      counts.failed++;
    }
  }
  return counts;
}
