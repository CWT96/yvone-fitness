# 交接状态 · 2026-09-20

## 当前可查看

- 已发布演示网站：https://yvone-fitness.vercel.app
- Vercel 项目：https://vercel.com/vinclo/yvone-fitness
- 部署状态：READY；独立项目 `yvone-fitness`，未修改原 `vinclo` 项目的代码、域名或配置。
- 源码已上传 https://github.com/CWT96/yvone-fitness ，并本地 Git 提交；`../Yvone-Fitness-source.zip` 是不含密钥和依赖文件的源码备份。
- 35 项本地数据库/辅助规则测试通过，Next.js 正式构建通过；云端正式构建通过；已在浏览器打开公网网址确认页面。
- 已通过演示操作验证教练代预约、留言保存、预约计数更新、学员端专属计划展示。

## 尚未完成的外部连接

- 用户正在创建 Supabase 项目，等待 Project URL 与 Publishable key。
- 尚未对远端数据库执行 migration 或创建教练账号。
- Resend 发信域名、API key、Auth SMTP 和定时邮件任务尚未配置。
- GitHub 源码已上传；用户明确确认暂时 Public，之后自行改为 Private（待办）。
- Vercel 自动 Git 连接未获当前集成访问权限，需在新项目 Settings → Git 授权这个仓库；现有网站通过 CLI 已部署，不受影响。
- GitHub workflow 权限缺失，自动检查尚未启用；模板保存在 scripts/github-actions-ci.yml。
- Stripe 按要求只完成购买窗口，尚未接入收款。

因此目前公网网址是明确标注的演示站，不能用于接收真实学员注册和预约。接入后需完成 ACCEPTANCE.md 的真实双账号和邮件验收。响应式 CSS 已实现；浏览器工具的手机视口设置没有实际生效，尚未声称真实手机验收通过。

## 下一步

先完成 DEPLOYMENT.md 第 1 步并获得 Supabase 两项公开配置，再初始化数据库。按照说明把服务端密钥直接填入平台，不在聊天里发送。之后继续 Resend 和生产环境联调，并补充 GitHub 自动部署授权。
