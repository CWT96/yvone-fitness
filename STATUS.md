# 交接状态 · 2026-09-21

## 当前可查看

- 已发布真实登录入口：https://yvone-fitness.vercel.app （教练账号及邮件连接仍待完成）
- Vercel 项目：https://vercel.com/vinclo/yvone-fitness
- 部署状态：READY；独立项目 `yvone-fitness`，未修改原 `vinclo` 项目的代码、域名或配置。
- 源码已上传 https://github.com/CWT96/yvone-fitness ，并本地 Git 提交；`../Yvone-Fitness-source.zip` 是不含密钥和依赖文件的源码备份。
- 35 项本地数据库/辅助规则测试通过，Next.js 正式构建通过；云端正式构建通过；已在浏览器打开公网网址确认页面。
- 已通过演示操作验证教练代预约、留言保存、预约计数更新、学员端专属计划展示。

## 尚未完成的外部连接

- Supabase 项目已创建：zhyxlzalrpwfsqpxfftt；Project URL 为 https://zhyxlzalrpwfsqpxfftt.supabase.co 。用户提供的 Publishable key 已验证有效并保存至被 Git 忽略的 .env.local，未写入源码。
- 用户已执行初始化 SQL。只读抽查 profiles、settings、plans 表均已存在，未登录请求返回 42501 权限拒绝。Email 注册和 Confirm email 均开启。
- 已在独立 Vercel 项目 yvone-fitness 的 Production 环境保存 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 和 SITE_URL。重新部署状态 READY（dpl_FDRyuA9RW6APxbYwYn6NY7Z1YwJT），已在浏览器确认公网显示真实登录界面。
- 数据库迁移已由用户执行；用户确认教练邀请码已生成并自行保存。教练账号、Auth Site URL 与 Redirect URLs 配置尚待完成。
- 用户已在 Squarespace 购买域名，并纠正其拼写为 yvonnefitness.com（不是 yonnefitness.com，也不是项目名 yvone-fitness）。用户报告 Resend 域名已 Verified，并开启 Receive。
- 已将 yvonnefitness.com 和 www.yvonnefitness.com 添加至独立 Vercel 项目 yvone-fitness。公开 DNS 仍指向 Squarespace 默认网站，尚未验证 HTTPS 生效。
- Vercel domains verify 返回的推荐记录为：A @ → 216.150.1.1；A @ → 216.150.16.1；CNAME www → 217075c645c4eec7.vercel-dns-016.com。使用这组具体推荐值，而非 inspect 输出的旧通用地址。
- 待用户在 Squarespace 替换 @ 的四条默认网站 A 记录及 www 的 ext-sq.squarespace.com CNAME。保留 Squarespace Nameservers 和 Resend TXT/MX。待 DNS 验证后才更新 SITE_URL 及 Supabase 登录回调配置。
- Resend API key、Auth SMTP 和定时邮件任务尚未配置。
- GitHub 源码已上传；用户明确确认暂时 Public，之后自行改为 Private（待办）。
- Vercel 自动 Git 连接未获当前集成访问权限，需在新项目 Settings → Git 授权这个仓库；现有网站通过 CLI 已部署，不受影响。
- GitHub workflow 权限缺失，自动检查尚未启用；模板保存在 scripts/github-actions-ci.yml。
- Stripe 按要求只完成购买窗口，尚未接入收款。

公网已切换真实 Supabase 登录模式；尚未创建教练账号，也未完成邮件联调，因此还不能作为完成验收的正式服务交付。需继续完成 ACCEPTANCE.md 的真实双账号和邮件验收。响应式 CSS 已实现；浏览器工具的手机视口设置没有实际生效，尚未声称真实手机验收通过。

## 下一步

教练邀请码已生成，不需重新生成。下一步先绑定 yvonnefitness.com 并配置网站 DNS，再配置 Supabase Auth Site URL、Redirect URLs 和 Resend SMTP，随后完成教练注册与邮箱验证。服务端密钥直接填入平台，不在聊天里发送。之后继续预约邮件联调，并补充 GitHub 自动部署授权。
