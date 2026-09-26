// Stable keys preserve the meaning of existing orders. PDF prices are never defaults.
export const packageOptions = {
  single: {
    label: "线下 1 对 1",
    months: 0,
    sessions: 1,
    category: "offline",
    priceKey: "single_price",
    unit: "节",
  },
  starter: {
    label: "入门包 · 5 节",
    months: 3,
    sessions: 5,
    category: "package",
    priceKey: "starter_price",
    unit: "套",
  },
  standard: {
    label: "标准包 · 10 节",
    months: 3,
    sessions: 10,
    category: "package",
    priceKey: "standard_price",
    unit: "套",
  },
  premium: {
    label: "优选包 · 20 节",
    months: 3,
    sessions: 20,
    category: "package",
    priceKey: "premium_price",
    unit: "套",
  },
  monthly: {
    label: "线下不限次包月",
    months: 1,
    sessions: 0,
    category: "package",
    priceKey: "monthly_price",
    unit: "1 个月",
  },
  online_monthly: {
    label: "线上指导 · 1 个月",
    months: 1,
    sessions: 0,
    category: "online",
    priceKey: "online_monthly_price",
    unit: "1 个月",
  },
  online_quarterly: {
    label: "线上指导 · 3 个月",
    months: 3,
    sessions: 0,
    category: "online",
    priceKey: "online_quarterly_price",
    unit: "3 个月",
  },
  online_annual: {
    label: "线上指导 · 12 个月",
    months: 12,
    sessions: 0,
    category: "online",
    priceKey: "online_annual_price",
    unit: "12 个月",
  },
  quarterly: {
    label: "3 个月不限次（原套餐）",
    months: 3,
    sessions: 0,
    category: "legacy",
    priceKey: "quarterly_price",
    unit: "3 个月",
  },
  annual: {
    label: "12 个月不限次（原套餐）",
    months: 12,
    sessions: 0,
    category: "legacy",
    priceKey: "annual_price",
    unit: "12 个月",
  },
} as const;
export type PackageKind = keyof typeof packageOptions;
export const salePackages = (
  Object.keys(packageOptions) as PackageKind[]
).filter((k) => packageOptions[k].category !== "legacy");
export const courseCategories = [
  {
    id: "offline",
    label: "Offline · 线下单次",
    description: "线下 1 对 1 私教，每节 1 小时。",
  },
  {
    id: "package",
    label: "Package · 线下套餐",
    description: "按课次选择 5、10 或 20 节，或选择包含饮食指导的不限次包月。",
  },
  {
    id: "online",
    label: "Online · 线上指导",
    description: "线上训练与饮食指导，不包含线下课程。",
  },
] as const;
export const onlineBenefits = [
  "专属训练计划：根据身材、目标和可用器械定制，每两周更新一次。",
  "专属饮食计划：根据体重、体脂和生活习惯制定三餐及加餐，可按口味和预算调整。",
  "每日饮食打卡：以照片记录三餐，教练每日汇总点评。",
  "每周训练打卡：以视频提交动作，教练纠正动作细节。",
  "线上答疑：训练、饮食问题随时提交，教练晚间统一回复。",
] as const;
export function packageDescription(kind: PackageKind) {
  const p = packageOptions[kind];
  if (kind === "single")
    return "每节 1 小时。付款确认后增加对应线下课时，训练时间另行预约。";
  if (p.category === "online")
    return "线上服务从付款当日开始，包含本页列出的全部指导内容；不增加线下课时，不自动续费。";
  if (p.sessions)
    return "付款后增加套餐课时，购买日起 3 个月内使用；优先使用即将到期的课时。";
  return "付款当日开始，有效期内线下训练不限次数，包含饮食指导；仍需预约，不自动续费。";
}
