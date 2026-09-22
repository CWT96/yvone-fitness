import { createClient } from "@supabase/supabase-js";
import { syncContacts } from "@/lib/contact-sync";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return Response.json({ error: "服务端尚未配置" }, { status: 503 });
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!bearer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await db.auth.getUser(bearer);
  if (error || !user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: p } = await db
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();
  if (!p?.active || p.role !== "coach")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    return Response.json(await syncContacts(db), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "联系人同步失败，请查看同步记录或确认更新脚本已执行" },
      { status: 500 },
    );
  }
}
