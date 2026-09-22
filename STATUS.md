# 交接状态 · 2026-09-21

## 当前可查看

- 已发布真实登录入口：https://yvonnefitness.com （备用：https://yvone-fitness.vercel.app；教练账号及邮件连接仍待完成）
- Vercel 项目：https://vercel.com/vinclo/yvone-fitness
- 部署状态：READY；独立项目 `yvone-fitness`，未修改原 `vinclo` 项目的代码、域名或配置。
- 源码已上传 https://github.com/CWT96/yvone-fitness ，并本地 Git 提交；`../Yvone-Fitness-source.zip` 是不含密钥和依赖文件的源码备份。
- 35 项本地数据库/辅助规则测试通过，Next.js 正式构建通过；云端正式构建通过；已在浏览器打开公网网址确认页面。
- 已通过演示操作验证教练代预约、留言保存、预约计数更新、学员端专属计划展示。

## 尚未完成的外部连接

- Supabase 项目已创建：zhyxlzalrpwfsqpxfftt；Project URL 为 https://zhyxlzalrpwfsqpxfftt.supabase.co 。用户提供的 Publishable key 已验证有效并保存至被 Git 忽略的 .env.local，未写入源码。
- 用户已执行初始化 SQL。只读抽查 profiles、settings、plans 表均已存在，未登录请求返回 42501 权限拒绝。Email 注册和 Confirm email 均开启。
- 已在独立 Vercel 项目 yvone-fitness 的 Production 环境保存 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 和 SITE_URL。重新部署状态 READY（dpl_FDRyuA9RW6APxbYwYn6NY7Z1YwJT），已在浏览器确认公网显示真实登录界面。
- 数据库迁移已由用户执行；用户确认教练邀请码已生成并自行保存。用户已确认保存 Auth Site URL 与六个 Redirect URLs，并报告教练注册及验证成功。
- 用户已在 Squarespace 购买域名，并纠正其拼写为 yvonnefitness.com（不是 yonnefitness.com，也不是项目名 yvone-fitness）。用户报告 Resend 域名已 Verified，并开启 Receive。
- 已将 yvonnefitness.com 和 www.yvonnefitness.com 添加至独立 Vercel 项目 yvone-fitness。两者均通过 Vercel domains verify；权威 DNS 已确认 www 的新记录。直接访问新服务器已验证主域名 HTTPS 证书有效、HTTP 200 且内容为本站；部分本地 DNS 缓存仍可能暂时指向 Squarespace。
- Vercel domains verify 返回的推荐记录为：A @ → 216.150.1.1；A @ → 216.150.16.1；CNAME www → 217075c645c4eec7.vercel-dns-016.com。使用这组具体推荐值，而非 inspect 输出的旧通用地址。
- 用户已更新 Squarespace 网站 DNS。Production 的 SITE_URL 已改为 https://yvonnefitness.com，并重新部署成功：dpl_CbV3xE5fE3MQu9jrFJmCR9LpCfan（READY）。当前公网主域名返回 308 跳转至 https://www.yvonnefitness.com/，www 返回 HTTP 200，证书验证成功。
- 用户已确认 Resend 使用 contact.yvonnefitness.com 子域名。权威 DNS 已查到 resend._domainkey.contact.yvonnefitness.com 的 DKIM 公钥，以及 send.contact.yvonnefitness.com 指向 send.forge.rmta.net 的记录。发件地址应使用 appointments@contact.yvonnefitness.com；用户此前报告 Verified，实际发信测试仍待完成。
- 用户已确认完成 Yvone Fitness 专用 Resend API Key 及 Supabase Auth SMTP 设置，并报告教练注册验证成功。Vercel Production 已保存全部七项环境变量（只核对名称，未读取用户密钥），包括 RESEND_API_KEY、SUPABASE_SERVICE_ROLE_KEY、RESEND_FROM 和 CRON_SECRET。最新部署 dpl_AMFNhJvHo2pV1iQKTpimdWfQmUyt 为 READY。使用专用任务密钥测试通知接口返回 200，sent/skipped/failed 均为 0，确认数据库队列调用成功；实际预约邮件收取仍待测试。vinclo 原有 Key 和项目配置保持不变。
- Cron 私密设置已在本机准备：.env.cron-secret 与 .env.email-cron.sql（权限 0600、Git 忽略，禁止打印到聊天或提交）。后者使用 https://www.yvonnefitness.com 以避免定时请求经过域名跳转。已向用户打开文件并要求复制到 Supabase SQL Editor 执行一次，待确认。新增 .vercelignore 排除 .env* 等本机文件，已部署。
- 用户报告主域名仍显示 Squarespace；2026-09-22 03:08 UTC 实测权威 DNS、Cloudflare 和 Google DNS 均为 Vercel 两条 A，无 AAAA。HTTP 跳转 HTTPS；HTTPS 返回 308 至 www，最终 200。当前未发现服务器配置问题，推测用户侧旧缓存；已建议无痕窗口及手机移动网络对照。
- 用户随后确认主域名访问问题已解决。
- GitHub 源码已上传；用户明确确认暂时 Public，之后自行改为 Private（待办）。
- Vercel 自动 Git 连接未获当前集成访问权限，需在新项目 Settings → Git 授权这个仓库；现有网站通过 CLI 已部署，不受影响。
- GitHub workflow 权限缺失，自动检查尚未启用；模板保存在 scripts/github-actions-ci.yml。
- Stripe 按要求只完成购买窗口，尚未接入收款。

公网已切换真实 Supabase 登录模式；用户报告教练注册验证成功，预约通知尚未完成联调，因此还不能作为完成验收的正式服务交付。需继续完成 ACCEPTANCE.md 的真实双账号和邮件验收。响应式 CSS 已实现；浏览器工具的手机视口设置没有实际生效，尚未声称真实手机验收通过。

## 下一步

用户报告教练注册验证成功，域名访问问题已解决。所有邮件环境变量已保存并部署，通知接口已通过空队列检查。下一步等用户确认在 Supabase 执行本机私密 .env.email-cron.sql（只运行一次），然后完成真实学员预约、改期、取消、开关与邮件联调，再补充 GitHub 自动部署授权。SMTP 参数为 smtp.resend.com、465、用户名 resend、发件人 Yvone Fitness <appointments@contact.yvonnefitness.com>。服务端密钥直接填入平台，不在聊天里发送。
