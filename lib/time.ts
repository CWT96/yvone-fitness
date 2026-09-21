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
