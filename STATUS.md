# 交接状态 · 2026-09-22

## 当前服务

- 正式网址：https://www.yvonnefitness.com 。https://yvonnefitness.com 已正确 308 跳转至 www；用户确认旧缓存问题已解决。备用：https://yvone-fitness.vercel.app 。
- Vercel：https://vercel.com/vinclo/yvone-fitness 。独立项目，未修改原 vinclo 项目的代码、域名或配置。
- 当前已验证部署：dpl_EJD6dGtNGzpVfy9fLtyZJrMGHVTT（READY）。
- GitHub：https://github.com/CWT96/yvone-fitness 。用户明确要求暂时 Public，之后自行改 Private，仍为待办。
- 源码备份：../Yvone-Fitness-source.zip（Git archive，不含密钥及依赖）。
- 工作室名称 Yvone Fitness；教练初始邮箱 wt.cong96@gmail.com；业务时区 America/Los_Angeles。

## 已连接的平台

- Supabase 项目 zhyxlzalrpwfsqpxfftt，URL https://zhyxlzalrpwfsqpxfftt.supabase.co 。初始迁移及 202609220001_booking_email_details.sql 均已由用户执行。
- 注册开启邮箱验证，邀请码校验在数据库注册触发器执行；学员推荐码可直接用于注册。Supabase Auth Site URL 和主域名、www、备用域名的 callback/recovery 地址均由用户保存。
- Vercel Production 七项变量已齐全：NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY、SUPABASE_SERVICE_ROLE_KEY、RESEND_API_KEY、RESEND_FROM、SITE_URL、CRON_SECRET。用户私密 Key 直接填入平台，未读取其内容。
- Resend 使用 contact.yvonnefitness.com；发件人为 Yvone Fitness <appointments@contact.yvonnefitness.com>。使用独立 Key，未改 vinclo 原 Key。Supabase SMTP 已连接，教练/学员验证邮件成功。
- Supabase Cron 每分钟调用 https://www.yvonnefitness.com/api/notifications。用户确认 SQL 执行成功，后续真实预约自动邮件成功。
- 本机私密 .env.cron-secret 和 .env.email-cron.sql 权限 0600，Git 和 Vercel 均排除；禁止打印到聊天或提交。不要重复执行 Cron 初始化脚本。
- 网站 DNS 保留 Squarespace Nameservers：A @ → 216.150.1.1 和 216.150.16.1；www CNAME → 217075c645c4eec7.vercel-dns-016.com。

## 已验证的功能

以下云端结果来自用户实际操作反馈，不冒充自动端到端测试：

- 教练注册、邮箱验证、登录后台成功。
- 测试学员注册、真实预约、教练和学员自动收件成功。
- 改期、取消、邮件开关均通过；关闭学员通知后，教练仍可收到通知。
- 改期界面修复后复测通过：直接列出时段，必须手动选择，打开时刷新空闲时间，无时段时有明确提示。
- 新改期邮件包含原时间、新时间、时区和原因，用户确认复测通过。数据库保存操作时的时间内容；旧邮件不补发。
- 用户确认 A 推荐码注册 B、邮箱验证后推荐数和教练后台记录通过。
- 用户确认 A 的专属训练计划可查看并收到通知，B 不可见。
- 用户确认 A 的私密档案对 A/B 都不可见，共享后只有 A 可见。
- 本地 38 项测试通过：SQL 权限/隔离、预约规则、时间/夏令时、推荐、邮件授权/重试/开关、历史通知内容等。类型检查和 Vercel 正式构建通过。
- 内置浏览器已验证本机演示的改期选项、不选择时阻止提交、选择后正确保存；正式站未登录，不掌握用户密码。

## 仍待完成或确认

- Vercel Git 连接：已通过 API 确认连接 CWT96/yvone-fitness，生产分支 main；正以本次操作说明和验收记录提交验证自动部署。
- GitHub Actions：当前凭据缺 workflow 权限，模板在 scripts/github-actions-ci.yml，尚未启用；不是现有网站运行的前提。
- ACCEPTANCE.md 中其余远端验收未全部覆盖，例如密码恢复、真实教练代预约、同一时段并发预约、账号停用/恢复、课前提醒及手机布局。不要将本地测试宣称为云端这些项目已通过。
- Stripe 按用户要求只做购买页面，未接入收款。
- 之后将 GitHub 仓库改 Private（用户明确说晚点改，未授权现在更改）。

## 下一步

推荐与训练计划/档案隔离已获用户确认。GitHub → Vercel 仓库连接已核实，正在验证自动部署；操作说明在 操作说明.md。随后说明剩余验收范围，避免继续重复已通过的手工测试。所有私密 Key 直接填平台，不在聊天里发送。
