import type { SupabaseClient } from "@supabase/supabase-js";
export type VerificationPurpose = "signup" | "recovery" | "email_change";
export function verificationPurpose(value: string | null): VerificationPurpose {
  return value === "recovery" || value === "email_change" ? value : "signup";
}
export async function verifyEmailCode(
  auth: Pick<SupabaseClient["auth"], "verifyOtp">,
  purpose: VerificationPurpose,
  email: string,
  code: string,
) {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token))
    throw new Error("请输入邮件中的完整数字验证码");
  // Invited signup still happens through signUp. Never create users via signInWithOtp.
  const { data, error } = await auth.verifyOtp({
    email: email.trim(),
    token,
    type: purpose === "signup" ? "email" : purpose,
  });
  if (error) throw error;
  // Secure email change can require a code from each inbox. The first confirmation
  // returns no session; it must not be treated as a completed email change.
  return { complete: !!data.session, recovery: purpose === "recovery" };
}
export async function resendEmailCode(
  auth: Pick<SupabaseClient["auth"], "resend" | "resetPasswordForEmail">,
  purpose: VerificationPurpose,
  email: string,
  origin: string,
) {
  const { error } =
    purpose === "recovery"
      ? await auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${origin}/auth/callback?next=recovery`,
        })
      : await auth.resend({
          type: purpose,
          email: email.trim(),
          options: { emailRedirectTo: `${origin}/auth/callback` },
        });
  if (error) throw error;
}
export function rememberVerificationEmail(email: string) {
  try {
    sessionStorage.setItem("yvonne-verification-email", email.trim());
  } catch {}
}
