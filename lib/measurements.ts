export const measurementFields = [
  { key: "height_in", label: "身高", unit: "in", min: 12, max: 108 },
  { key: "waist_in", label: "腰围", unit: "in", min: 1, max: 120 },
  { key: "hips_in", label: "臀围", unit: "in", min: 1, max: 120 },
  { key: "chest_in", label: "胸围", unit: "in", min: 1, max: 120 },
  { key: "arm_in", label: "上臂围", unit: "in", min: 1, max: 50 },
  { key: "thigh_in", label: "大腿围", unit: "in", min: 1, max: 80 },
  { key: "resting_hr", label: "静息心率", unit: "bpm", min: 20, max: 250 },
  { key: "sleep_hours", label: "睡眠时长", unit: "小时", min: 0, max: 24 },
] as const;
export type Measurements = Partial<
  Record<(typeof measurementFields)[number]["key"], number>
>;
export function kgToLb(value: number | null | undefined) {
  return value == null ? null : Math.round((value / 0.45359237) * 10) / 10;
}
export function poundsToStoredKg(
  value: number | null,
  previous?: number | null,
) {
  if (value === null) return null;
  return previous != null && value === kgToLb(previous)
    ? previous
    : value * 0.45359237;
}
export function readMeasurements(values: Record<string, string>): Measurements {
  const result: Measurements = {};
  for (const field of measurementFields) {
    const input = values[field.key];
    if (input == null || input === "") continue;
    const value = Number(input);
    if (!Number.isFinite(value) || value < field.min || value > field.max)
      throw new Error(
        `${field.label}须在 ${field.min}–${field.max} ${field.unit} 之间`,
      );
    result[field.key] = value;
  }
  return result;
}
