import { zhCN } from "date-fns/locale";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
export function localToISO(value: string, zone: string) {
  const date = fromZonedTime(value, zone);
  if (
    !Number.isFinite(date.getTime()) ||
    formatInTimeZone(date, zone, "yyyy-MM-dd'T'HH:mm") !== value
  )
    throw new Error("这个时间不存在（可能处于夏令时切换）。请选择其他时间。");
  return date.toISOString();
}
export function displayTime(
  value: string,
  zone: string,
  format = "MM月dd日 EEE HH:mm",
) {
  return formatInTimeZone(new Date(value), zone, format, { locale: zhCN });
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function scheduleDays(zone: string, week: number, now = new Date()) {
  // Add calendar days independently of the viewer's timezone and DST changes.
  const today = formatInTimeZone(now, zone, "yyyy-MM-dd");
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(`${today}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + week * 7 + i);
    return day.toISOString().slice(0, 10);
  });
}
