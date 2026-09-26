import { translate, type Language } from "./i18n";
// Translate only system-owned fields. Notes and names are retained verbatim.
export function localizedSystemNote(note: string, language: Language) {
  if (language !== "en") return note;
  const membership = note.match(
    /^Stripe 在线购课（(1|3|12) 个月，不自动续费）$/,
  );
  if (membership)
    return `Stripe purchase (${membership[1]} month(s), no automatic renewal)`;
  if (note === "Stripe 在线购课") return "Stripe online purchase";
  return translate(note, language);
}
export function localizedNotificationBody(body: string, language: Language) {
  if (language !== "en") return body;
  let userNote = false;
  const labels: Record<string, string> = {
    学员: "Member",
    原时间: "Previous time",
    新时间: "New time",
    训练时间: "Session time",
    已取消时间: "Cancelled time",
    时区: "Time zone",
    地点: "Location",
    结果: "Result",
    课时结算: "Credits",
    订单: "Order",
    金额: "Amount",
    原因: "Reason",
    留言: "Message",
    缺席备注: "No-show note",
  };
  return body
    .split("\n")
    .map((line) => {
      if (userNote) return line;
      const match = line.match(/^([^：]+)：(.*)$/);
      if (match && labels[match[1]]) {
        const [, key, value] = match;
        if (["原因", "留言", "缺席备注"].includes(key)) userNote = true;
        let localized = ["结果", "课时结算"].includes(key)
          ? localizedSystemNote(value, language)
          : value;
        if (["原时间", "新时间", "训练时间", "已取消时间"].includes(key)) {
          localized = value.replace(
            /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/g,
            (_, y, m, d, hour, minute) =>
              `${m}/${d}/${y} ${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? "AM" : "PM"}`,
          );
        }
        return `${labels[key]}: ${localized}`;
      }
      const bundle = line.match(
        /^线下套餐课时已入账：(\d+) 节，有效至 (\d{4}-\d{2}-\d{2})（含当日）。$/,
      );
      if (bundle)
        return `${bundle[1]} in-person session credits added, valid through ${bundle[2]} (inclusive).`;
      const online = line.match(
        /^线上指导已开通：(\d{4}-\d{2}-\d{2}) 至 (\d{4}-\d{2}-\d{2})（含结束日）。不包含线下课程，不自动续费。$/,
      );
      if (online)
        return `Online coaching activated: ${online[1]} to ${online[2]} (inclusive). No in-person sessions; no automatic renewal.`;
      const credits = line.match(
        /^(?:已增加 (\d+) 节课时。|按次课时已入账：(\d+) 节。)$/,
      );
      if (credits)
        return `${credits[1] || credits[2]} session credit(s) added.`;
      const membership = line.match(
        /^不限次数包月已开通：(\d{4}-\d{2}-\d{2}) 至 (\d{4}-\d{2}-\d{2})（美西日期，含结束日）。到期后需手动购买，不自动续费。$/,
      );
      if (membership)
        return `Unlimited membership activated: ${membership[1]} to ${membership[2]} (Pacific dates, end date included). Renew manually; no automatic renewal.`;
      return translate(line, language);
    })
    .join("\n");
}
