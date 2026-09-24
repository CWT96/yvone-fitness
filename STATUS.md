# 交接状态 · 2026-09-22

## 2026-09-23 全站检查

- 本轮修复与验证记录见 `QA_AUDIT_20260923.md`。核心修复包括筛选后新建归属、保存后刷新失败的重复提交风险、读取重试、过期账号请求回写、预约排序、表单限制、手机菜单与错误提示。
- 56 项本地规则/回归测试、类型检查和正式构建通过。没有改动生产测试学员或发送测试邮件；真实登录后的邮箱确认链路未由代理复测。
- 无数据库更新。配套界面由此提交部署，生产结果以 Vercel READY 及域名部署编号核实。

## 本次新增功能

- 训练计划/档案增加删除和恢复草稿；草稿/发布改成独立按钮。
- 两种学员专属价格：单次训练、不限次数包月。RLS 阻止读取他人价格，旧公共价格只对教练可见。Stripe 仍未连接。
- 已加入 Resend 联系人同步队列、自动重试及教练查看状态；只处理专属分组，不改已有全局退订状态或其他业务分组。
- 用户已确认执行 `202609220002_content_pricing_contacts.sql` 成功，已在 Vercel 保存专用 Full access `RESEND_CONTACTS_API_KEY`。已添加 `RESEND_SEGMENT_ID=1b66d482-f5bb-4c9f-bc3c-efbfe72acafc`，复用原 Cron。
- 本地 51 项测试、类型检查、正式构建通过。浏览器演示验证保存草稿、删除、恢复草稿、金额保存及学员仅显示本人两种价格。
- 本次功能提交 `c9e30a6456612b49460c34746f9438bbe64ea5b9` 已自动部署为 `dpl_8NFnss6rr5cKhR6NgSjTxF1r5cSJ`，READY、source=git；正式域名 HTML 返回 200 并匹配此部署。匿名联系人接口返回 401。授权通知任务返回 200，contacts.configured=true、本轮 synced=0/failed=0（无到期队列，不代表所有历史记录均已成功；分组人数等待用户后台核对）。

## 当前服务

- 正式网址：https://www.yvonnefitness.com 。https://yvonnefitness.com 已正确 308 跳转至 www；用户确认旧缓存问题已解决。备用：https://yvone-fitness.vercel.app 。
- Vercel：https://vercel.com/vinclo/yvone-fitness 。独立项目，未修改原 vinclo 项目的代码、域名或配置。
- 已验证的 Git 自动部署：dpl_2CZbn3qURHHNf2TE6yzyYXLavwNv（READY、production、source=git），对应 main 提交 663e7dc2a8a45e0d36da9b0e6f5b4b25c04b5b53。
- GitHub：https://github.com/CWT96/yvone-fitness 。用户明确要求暂时 Public，之后自行改 Private，仍为待办。
- 源码备份：../Yvone-Fitness-source.zip（Git archive，不含密钥及依赖）。
- 工作室名称 Yvone Fitness；教练初始邮箱 wt.cong96@gmail.com；业务时区 America/Los_Angeles。

## 已连接的平台

- Supabase 项目 zhyxlzalrpwfsqpxfftt，URL https://zhyxlzalrpwfsqpxfftt.supabase.co 。初始迁移及 202609220001_booking_email_details.sql 均已由用户执行。
- 注册开启邮箱验证，邀请码校验在数据库注册触发器执行；学员推荐码可直接用于注册。Supabase Auth Site URL 和主域名、www、备用域名的 callback/recovery 地址均由用户保存。
- Vercel Production 七项变量已齐全：NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY、SUPABASE_SERVICE_ROLE_KEY、RESEND_API_KEY、RESEND_FROM、SITE_URL、CRON_SECRET。用户私密 Key 直接填入平台，未读取其内容。
- Resend 使用 contact.yvonnefitness.com；用户于 2026-09-23 确认正确发件人名称为 Yvonne Fitness。已更新 Production `RESEND_FROM` 为 `Yvonne Fitness <appointments@contact.yvonnefitness.com>`，此文档提交触发重新部署以应用环境变量。使用独立 Key，未改 vinclo 原 Key。用户已自行修改 Supabase SMTP Sender name；预约通知的发件人由 Vercel 单独控制。既有已收邮件不会更新。
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

- Vercel Git 连接已完成：CWT96/yvone-fitness，生产分支 main；已通过普通文档提交验证 Git 自动生产部署 READY。后续数据库迁移仍需单独运行。
- GitHub Actions：当前凭据缺 workflow 权限，模板在 scripts/github-actions-ci.yml，尚未启用；不是现有网站运行的前提。
- ACCEPTANCE.md 中其余远端验收未全部覆盖，例如密码恢复、真实教练代预约、同一时段并发预约、账号停用/恢复、课前提醒及手机布局。不要将本地测试宣称为云端这些项目已通过。
- Stripe 按用户要求只做购买页面，未接入收款。
- 之后将 GitHub 仓库改 Private（用户明确说晚点改，未授权现在更改）。

## 下一步

核心业务实际验收及 Git 自动部署验证通过；操作说明在 操作说明.md。其余尚未覆盖的远端验收范围已在上方列明，不能宣称全部完成。避免重复已通过的手工测试。所有私密 Key 直接填平台，不在聊天里发送。
