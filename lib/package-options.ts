export const packageOptions = {
  single: {
    label: "单次训练",
    months: 0,
    priceKey: "single_price",
    unit: "节",
  },
  monthly: {
    label: "1 个月不限次",
    months: 1,
    priceKey: "monthly_price",
    unit: "1 个月",
  },
  quarterly: {
    label: "3 个月不限次",
    months: 3,
    priceKey: "quarterly_price",
    unit: "3 个月",
  },
  annual: {
    label: "12 个月不限次",
    months: 12,
    priceKey: "annual_price",
    unit: "12 个月",
  },
} as const;
export type PackageKind = keyof typeof packageOptions;
