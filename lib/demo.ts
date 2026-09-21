import type { Data, Profile } from "./types";
const future = (day: number, hour: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + day);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const base = {
  active: true,
  phone: "",
  goals: "建立稳定训练习惯，提升力量与体能",
  timezone: "America/Los_Angeles",
  email_notifications: true,
  created_at: future(-40, 0),
};
export const demoProfiles: Profile[] = [
  {
    ...base,
    id: "coach",
    full_name: "Yvone",
    email: "coach@example.com",
    role: "coach",
    referral_code: "COACH",
  },
  ...["林予安", "陈以宁", "周亦辰", "李沐晴"].map((name, i) => ({
    ...base,
    id: `member-${i}`,
    full_name: name,
    email: `member${i + 1}@example.com`,
    role: "member" as const,
    referral_code: `YVONE-DEMO-${i + 1}`,
  })),
];
export function demoData(): Data {
  const slots = Array.from({ length: 14 }, (_, i) => ({
    id: `slot-${i}`,
    starts_at: future(Math.floor(i / 2) + 1, 16 + (i % 2) * 2),
    ends_at: future(Math.floor(i / 2) + 1, 17 + (i % 2) * 2),
    available: ![0, 3, 6].includes(i),
  }));
  return {
    profiles: demoProfiles,
    slots,
    appointments: [0, 3, 6].map((n, i) => ({
      id: `booking-${i}`,
      member_id: `member-${i}`,
      slot_id: `slot-${n}`,
      status: "booked",
      message: i === 0 ? "这次想重点练习深蹲动作。" : "",
      reason: "",
      created_at: future(-2, 0),
      slots: slots[n],
    })),
    plans: [
      {
        id: "plan-0",
        member_id: "member-0",
        title: "力量基础 · 第 1–4 周",
        content:
          "训练频率：每周 3 次，每次 60 分钟\n\nDAY A · 下肢力量\n热身与髋关节活动 8 分钟\n高脚杯深蹲 3 组 × 10 次\n罗马尼亚硬拉 3 组 × 10 次\n臀桥 3 组 × 12 次\n平板支撑 3 组 × 30 秒\n\nDAY B · 上肢与核心\n坐姿划船 3 组 × 12 次\n哑铃卧推 3 组 × 10 次\n哑铃肩推 3 组 × 10 次\n死虫式 3 组 × 12 次\n\n训练提示\n优先保证动作质量，组间休息 60–90 秒。每次训练后记录感受，下次一起复盘。",
        status: "published",
        created_at: future(-4, 0),
      },
    ],
    records: [
      {
        id: "record-0",
        member_id: "member-0",
        recorded_on: future(-4, 0).slice(0, 10),
        weight: 62.5,
        body_fat: 24,
        notes:
          "动作控制有进步，深蹲能够保持更好的躯干稳定。下次继续巩固呼吸节奏。",
        shared: true,
      },
    ],
    invites: [],
    referrals: [
      {
        id: "ref-0",
        referrer_id: "member-0",
        referred_id: "member-1",
        status: "confirmed",
        created_at: future(-12, 0),
        confirmed_at: future(-12, 0),
      },
    ],
    events: [],
    email_jobs: [],
    packages: [
      {
        id: "pack-1",
        title: "初次体验",
        sessions: 1,
        price: null,
        currency: "USD",
        description: "认识你的身体，和教练一起找到训练方向。",
        active: true,
      },
      {
        id: "pack-2",
        title: "规律进步",
        sessions: 10,
        price: null,
        currency: "USD",
        description: "建立稳定训练节奏，让每一次投入都有回报。",
        active: true,
      },
      {
        id: "pack-3",
        title: "长期蜕变",
        sessions: 24,
        price: null,
        currency: "USD",
        description: "以长期计划，走向更强健、更自信的自己。",
        active: true,
      },
    ],
    settings: {
      id: 1,
      studio_name: "Yvone Fitness",
      timezone: "America/Los_Angeles",
      allow_referral_signup: true,
      location: "训练地点由教练确认",
    },
  };
}
