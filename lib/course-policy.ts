export const coursePolicy = [
  {
    title: "课程有效期",
    text: "购买套餐自即日起计算有效期：入门包/标准包/优选包有效期为3个月，线上套餐按购买周期计算（1个月/3个月/12个月），超出有效期未使用的课时将自动作废，请合理安排训练时间。",
  },
  {
    title: "请假/改期规则",
    text: "如需请假或改期，请至少提前12小时通知教练，以便合理安排课表；提前12小时以上通知可免费改期，逾期申请视具体情况酌情处理。",
  },
  {
    title: "迟到/爽约规则",
    text: "迟到时间将从原定课程时长中扣除，不另行补时；如未提前通知且无故缺席（爽约），该节课时将正常扣除，不予补课或退还。",
  },
];
export const policyClosing =
  "如有特殊情况，请及时与教练沟通，我们会尽量为您协调安排。";
export const changeReminder =
  "请至少提前12小时联系教练请假或改期；提前12小时以上通知可免费改期，逾期申请请与教练协商。";
export const attendanceReminder =
  "请准时到场：迟到不补时；未提前通知且无故缺席，按规则扣除该节课时，不补课或退还。";
export function emailPolicyReminder(subject: string) {
  if (/取消|改期/.test(subject)) return changeReminder + " " + policyClosing;
  if (/预约已确认|训练提醒/.test(subject))
    return changeReminder + "\n" + attendanceReminder;
  if (/未到场|缺席/.test(subject))
    return attendanceReminder + " " + policyClosing;
  if (/购课|购买|付款/.test(subject))
    return "请在所购套餐有效期内安排训练。包月到期后需手动购买，不自动续费。完整购课须知可随时在网站「购买课程」查看。";
  return "";
}
