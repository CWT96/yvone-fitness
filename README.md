# Yvone Fitness

邀请制的一对一私教工作室。教练后台和学员端共用一个网址，根据真实账号角色显示对应功能。

## 已实现

- 单教练最高权限；停用/恢复学员。
- 邀请码注册、邮箱验证、登录、密码重置、修改邮箱及密码。
- 教练邀请码支持绑定邮箱、次数、有效期、停用；学员拥有固定推荐码。
- 个人资料、训练目标、邮件提醒开关。
- 训练档案，教练决定是否向所属学员共享。
- 开放时间表、预约、代预约、改期、取消、课后完成确认、留言与完整变更记录。
- 原子化预约操作、全局排课锁、时段唯一占用和重叠检查。
- 专属训练计划，支持草稿、发布和历史归档，数据库阻止学员访问他人计划。
- 推荐汇总、每位学员明细、邮箱验证后计成功、CSV 导出。
- 课程方案和价格编辑，Stripe 未连接时不启用支付。
- Resend 通知队列、幂等投递、重试、投递状态、24 小时前提醒；Supabase Cron 定时触发。
- 美西时区与夏令时；响应式页面。

## 本地使用

要求 Node.js 24。执行 `npm ci`，复制 `.env.example` 为 `.env.local` 并填写配置，执行 `npm run dev`。

未填写 Supabase 的两项公开配置时，页面进入清楚标识的演示模式。示例数据只在浏览器内存中，刷新恢复；演示不会创建账号、发送邮件或处理付款。部署后需配置真实 Supabase 才能投入使用。

- `npm run typecheck`：类型检查。
- `npm test`：在本地 PGlite/PostgreSQL 中实际执行 SQL，测试权限与业务规则；外加时区、导出和邮件转义检查。
- `npm run build`：正式部署构建。
- `scripts/github-actions-ci.yml`：GitHub 自动检查模板。当前账号缺少 workflow 权限，尚未启用；后续在 GitHub 网页把它保存为 `.github/workflows/ci.yml` 即可。

详细连接步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)，操作验收见 [ACCEPTANCE.md](ACCEPTANCE.md)。

## 架构

Next.js + React 部署于 Vercel；Supabase Auth 提供账号与会话；Postgres 存储业务数据。网页使用公开 key 与用户 JWT，在数据库 RLS 约束下读取数据。角色、排课、邀请码、计划、档案等敏感写操作使用带权限检查的事务函数，客户端不持有服务密钥。

`/api/notifications` 是服务端邮件处理入口，仅接受 Cron secret 或有效教练身份。Supabase Cron 每分钟调用一次，最多领取 10 封到期邮件；它不依赖 Vercel Hobby 的每日 Cron。发件人域名需在 Resend 验证；注册、找回密码由 Supabase 的 Resend SMTP 发送。

Auth 注册触发器在创建用户的同一事务内校验邀请码，包括直接调用 Supabase Auth API 的请求。教练注册通过邮箱绑定、一次性的特殊邀请码完成。用户提交的 `role` 元数据不会赋予权限。

## 范围与验收边界

本地数据库测试不能替代真实 Supabase Auth、PostgREST、Resend、Cron 和 Vercel 的联调。上线前应完成 ACCEPTANCE.md 中的真实双学员验收。Stripe 只预留购买界面，尚无收款、订单、课时余额、退款或自动扣课逻辑。

不包含多教练、训练文件上传、短信、视频或群课；它们不是当前请求的一部分。仅支持一位教练，每个开放时段一位学员。预约目前不设提前取消罚则或最短提前时间；开始前学员可改期/取消，开始后由教练处理。

Supabase、Vercel 和 Resend 的生产套餐、额度和域名费用由各平台计费。不会自动购买付费服务。
