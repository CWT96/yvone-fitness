"use client";
import { useEffect, useState, useCallback, useRef } from "react";
const pages = new Set([
  "overview",
  "schedule",
  "bookings",
  "credits",
  "members",
  "member",
  "plans",
  "records",
  "referrals",
  "packages",
  "settings",
]);
export function readNavigation(search: string) {
  const p = new URLSearchParams(search);
  return {
    tab: p.has("payment")
      ? "packages"
      : pages.has(p.get("page") || "")
        ? p.get("page")!
        : "overview",
    filter: p.get("filter") || "all",
    memberFilter: p.get("member") || "all",
    query: p.get("q") || "",
    week: Number.isInteger(Number(p.get("week")))
      ? Math.max(-520, Math.min(520, Number(p.get("week"))))
      : 0,
  };
}
export function useStudioNavigation() {
  const [state, setState] = useState(() => readNavigation(""));
  const current = useRef(state);
  useEffect(() => {
    const restore = () => {
      const next = readNavigation(window.location.search);
      current.current = next;
      setState(next);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const update = useCallback((patch: Partial<typeof state>, push = false) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    setState(next);
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({
      page: next.tab,
      filter: next.filter,
      member: next.memberFilter,
      q: next.query,
      week: String(next.week),
    })) {
      if (!value || value === "all" || (key === "week" && value === "0"))
        url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    if (url.href !== window.location.href)
      window.history[push ? "pushState" : "replaceState"](null, "", url);
  }, []);
  return {
    ...state,
    setTab: (tab: string) => update({ tab }),
    setFilter: (filter: string) => update({ filter }),
    setMemberFilter: (memberFilter: string) => update({ memberFilter }),
    setQuery: (query: string) => update({ query }),
    setWeek: (week: number) => update({ week }),
    go: (tab: string, filter = "all") =>
      update({ tab, filter, memberFilter: "all", query: "", week: 0 }, true),
  };
}
