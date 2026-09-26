import english from "./en.json";
export type Language = "zh" | "en";
const dictionary: Record<string, string> = english;
export function translate(
  text: string | null | undefined,
  language: Language,
  values: unknown[] = [],
) {
  const source = text ?? "";
  const key = source.trim().replace(/\s+/g, " ");
  let result =
    language === "en"
      ? (dictionary[source] ?? dictionary[key] ?? source)
      : source;
  if (
    language === "en" &&
    Number(values[0]) === 1 &&
    [
      "{0} 节",
      "{0} 节训练",
      "付款当日开始 {0} 个月，有效期内不限次数，仍需预约开放时段。",
    ].includes(key)
  ) {
    result =
      key === "付款当日开始 {0} 个月，有效期内不限次数，仍需预约开放时段。"
        ? result.replace("months", "month")
        : result.replace("sessions", "session");
  }
  return result.replace(/\{(\d+)\}/g, (match, i) =>
    Number(i) < values.length ? String(values[Number(i)] ?? "") : match,
  );
}
export function preferredLanguage(saved: unknown, browser = ""): Language {
  return saved === "en" || saved === "zh"
    ? saved
    : browser.toLowerCase().startsWith("en")
      ? "en"
      : "zh";
}
