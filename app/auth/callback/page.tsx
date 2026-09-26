"use client";
import { useLanguage } from "@/components/language-provider";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export default function Callback() {
  const { t } = useLanguage();
  const [error, setError] = useState("");
  useEffect(() => {
    async function finish() {
      if (!supabase) {
        setError(t("Supabase 尚未配置"));
        return;
      }
      const query = new URLSearchParams(window.location.search);
      const authError =
        query.get("error_description") ||
        new URLSearchParams(window.location.hash.slice(1)).get(
          "error_description",
        );
      if (authError) {
        setError(authError);
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setError(error.message);
        return;
      }
      if (!data.session) {
        setError(
          t(
            "验证链接已失效，或不是在发起注册/重置的浏览器中打开。请返回登录页重新操作。",
          ),
        );
        return;
      }
      window.location.replace(
        query.get("next") === "recovery" ? "/?recovery=1" : "/",
      );
    }
    finish();
  }, []);
  return (
    <div className="loading">
      <h2>{error ? t("无法完成验证") : t("正在验证账号…")}</h2>
      {error && (
        <>
          <p>{t(error)}</p>
          <a className="btn" href="/">
            {t("返回登录")}
          </a>
        </>
      )}
    </div>
  );
}
