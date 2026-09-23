# Yvone Fitness：逐步连接与部署

网站名称：Yvone Fitness；初始教练邮箱：wt.cong96@gmail.com；预约时区：America/Los_Angeles。
先使用 Vercel 的默认域名。后续换域名无需重建数据库或重新注册学员。

## 1. 创建 Supabase 项目

1. 登录 https://supabase.com/dashboard → New project。
2. 名称 `yvone-fitness`，设置并保存数据库密码，选择美国西部附近的地区。
3. 从 Connect 或 Settings → API 获取 Project URL 和 Publishable key（旧版 anon key 也可）。这两个配置可以放到网页。不要混用 Secret / service_role key。
4. SQL Editor → New query，复制 `supabase/migrations/202609200001_initial.sql` 全文，执行一次。不要重复执行整个初始化文件。
   然后执行 `supabase/migrations/202609220001_booking_email_details.sql`，为通知增加完整日期、原时间、新时间、时区及原因。已上线项目只需运行这个新增文件，既有预约保持不变。
5. 再执行 `supabase/setup/01-coach-invite.sql`。保存返回的教练邀请码，七天有效且仅能使用一次，只能注册指定邮箱。
6. Authentication → Providers / Sign In：开启 Email 注册、保留 Confirm email；关闭 Anonymous sign-ins，不启用未用到的 OAuth。邀请码约束由数据库触发器执行，不是前端控制。
7. 暂不要在 Auth 后台直接新增用户：本项目的注册触发器会拒绝没有邀请码的创建请求。

## 已有网站：内容、价格和联系人更新

只运行 `supabase/migrations/202609220002_content_pricing_contacts.sql`，不要重跑初始化或 Cron。运行后再发布配套网页。迁移保留旧套餐数据，但只允许教练读取；每位学员的新价格需单独设置，不自动沿用公共价格。

新增 Production 变量：`RESEND_CONTACTS_API_KEY`（独立 Full access Key，保密）和 `RESEND_SEGMENT_ID`（工作室分组 ID）。原 `RESEND_API_KEY` 继续负责发信。联系人同步复用现有每分钟任务，每轮最多处理两位已验证学员；失败会重试并在后台显示。Full access 是账号范围权限，只放在服务端。

只同步学员姓名、邮箱及分组归属，不同步价格、训练计划或档案。已有联系人不改姓名和全局退订状态；通知关闭/停用仅移出工作室分组。不会发送营销广播。`/api/contacts` 仅允许有效教练手动触发。

## 2. 配置 Resend 和注册验证邮件

网页可以使用 Vercel 默认网址，但对真实学员发邮件需要你控制的发信域名。可以先借用已有域名的子域名，例如 `notify.你的域名`，不必把整个网站搬过去。

1. 在 https://resend.com/domains 添加发信域名或子域名。
2. 到域名服务商添加 Resend 当前页面要求的 DNS 记录。照页面填写；不要删除原有邮箱的 MX 记录。验证通过后继续。
3. 创建 Send access API key，仅保存在 Supabase SMTP 和 Vercel 环境变量中。不要放入 GitHub，也不要把截图或密钥发到聊天里。
4. Supabase → Authentication → Email / SMTP Settings → Enable Custom SMTP。
5. 填写：

| 设置         | 值                                |
| ------------ | --------------------------------- |
| Sender email | `appointments@你已验证的发信域名` |
| Sender name  | `Yvonne Fitness`                  |
| Host         | `smtp.resend.com`                 |
| Port         | `465`                             |
| Username     | `resend`                          |
| Password     | 你的 Resend API key               |

6. 使用 Supabase 默认包含 `{{ .ConfirmationURL }}` 的确认/恢复模板即可。不要手写包含客户端密钥的邮件链接。
7. 核对 Supabase Auth 邮件速率限制和 Resend 配额是否满足实际学员量。

Supabase 默认邮件服务限制收件人为项目团队成员，不能作为面向真实学员的正式发信服务。Resend 的测试域名也不能向任意学员邮箱发信。参见官方 [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)、[Resend SMTP](https://resend.com/docs/send-with-smtp)。

## 3. GitHub 存档

已存档到 https://github.com/CWT96/yvone-fitness 。用户确认暂时 Public，之后自行改为 Private。只上传本文件所在项目目录内被 Git 跟踪的文件。`.env.local`、`node_modules`、`.next` 和 `.vercel` 都已被忽略。

本地尚未建 Git 仓库时，执行：

```sh
git init -b main
git add .
git commit -m "Build Yvone Fitness coaching studio"
git remote add origin https://github.com/你的账号/yvone-fitness.git
git push -u origin main
```

不要上传任何真实学员数据和生产数据库备份。自动检查模板位于 `scripts/github-actions-ci.yml`。当前凭据无 workflow 权限，因此还没有启用 GitHub Actions。需要时可在 GitHub 网页把模板内容保存为 `.github/workflows/ci.yml`。

## 4. Vercel 部署

1. 当前已建立独立项目 https://vercel.com/vinclo/yvone-fitness ，演示网址为 https://yvone-fitness.vercel.app 。Git 自动部署连接未能通过当前账号授权，需要在该项目 Settings → Git → Connect Git Repository 选择 `CWT96/yvone-fitness`，必要时允许 Vercel GitHub App 访问这一个仓库。不要改动原 `vinclo` 项目。
2. Framework 为 Next.js；若仓库根目录就是本项目，Root Directory 保持默认。
3. Node.js 选 24，Build command `npm run build`，Install command `npm ci`。
4. 添加以下环境变量（Production；测试环境使用单独测试项目时再填写 Preview）：

| 名称                                   | 值                                                           | 是否保密                |
| -------------------------------------- | ------------------------------------------------------------ | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase Project URL                                         | 公开                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key 或 anon key                                  | 公开                    |
| `SUPABASE_SERVICE_ROLE_KEY`            | Supabase 服务端 service_role key / secret key                | 保密，勿加 NEXT_PUBLIC_ |
| `RESEND_API_KEY`                       | Resend Send access key                                       | 保密                    |
| `RESEND_FROM`                          | `Yvonne Fitness <appointments@已验证域名>`                   | 发信身份                |
| `SITE_URL`                             | Vercel 最终生产网址，形如 `https://yvone-fitness.vercel.app` | 公开                    |
| `CRON_SECRET`                          | 至少 32 字节随机值，在本机生成并直接保存到平台               | 保密                    |

可在本机运行 `openssl rand -hex 32` 生成 Cron secret，然后填入 Vercel。不要提交到仓库。5. 点击 Deploy。首次网址确定后补上/核对 `SITE_URL`，然后 Redeploy。6. 每次更改环境变量都需要重新部署。尤其 `NEXT_PUBLIC_` 值在构建时写入前端。7. 尚未配置 Supabase 时只是演示站；配置之后必须显示登录界面，不能把演示站当作正式可预约网站。

官方：[Git 仓库部署](https://vercel.com/docs/git)、[环境变量](https://vercel.com/docs/environment-variables)。

## 5. 设置登录跳转

Supabase → Authentication → URL Configuration：

- Site URL：Vercel 生产网址。
- Redirect URLs：`https://你的生产网址/auth/callback` 和 `https://你的生产网址/auth/callback?next=recovery`。
- 本地调试额外加入 `http://127.0.0.1:3000/auth/callback` 和 `http://127.0.0.1:3000/auth/callback?next=recovery`。
- 不要为生产放行任意陌生域名。后续换域名时补充新域名。

当前采用 PKCE：请在发起注册或重置密码的同一浏览器中打开邮件链接。若手机邮件内置浏览器打不开，复制链接到原浏览器。过期或已使用的链接需要重新请求。

## 6. 创建教练账号

1. 打开网站 → 注册。
2. 邮箱使用 `wt.cong96@gmail.com`，姓名可填 Yvone，输入步骤 1 生成的教练邀请码。
3. 自己设置密码，并点击收到的验证邮件。
4. 登录后应看到「学员管理」、全部邀请码、工作室设置和邮件投递记录。
5. 后续改邮箱：个人与设置 → 修改邮箱，按邮件提示完成新旧邮箱验证。不要在 profiles 表直接修改邮箱。

如果教练邀请码过期且尚未注册，可由项目拥有者在 SQL Editor 重新执行 `01-coach-invite.sql`；数据库始终限制只存在一位教练。

## 7. 开启邮件自动处理

1. 编辑 `supabase/setup/02-email-cron.sql` 中两处占位符：真实 Vercel 生产网址和与 Vercel 一致的 Cron secret。
2. 把替换后的内容仅粘贴到 Supabase SQL Editor 执行，不保存进仓库。
3. 该脚本启用 pg_cron/pg_net，把 secret 保存在 Supabase Vault，每分钟调用邮件端点。
4. 不要重复创建同名 Vault secrets；域名变更使用文件底部的 update_secret 示例。
5. 课程变化自动排队；预定时间超过 24 小时的课程，在开始前 24 小时发送提醒；不足 24 小时的预约至少延迟 1 分钟提醒。
6. 教练可在「个人与设置 → 邮件投递记录」检查结果，并手动处理到期邮件。失败会退避重试最多五次；修复配置后终态 failed 不自动重复发送，必要时联系维护者核对收件与幂等时间窗再补发。
7. 学员/教练关闭邮件开关后，待发训练邮件会跳过；账号验证、密码恢复邮件始终由 Auth 处理。

不依赖 Vercel Hobby 的每日 Cron。若使用商业网站，请自行确认适用的 Vercel 套餐；本项目不会自动开通付费计划。参考 [Supabase Cron](https://supabase.com/docs/guides/cron)、[Resend 幂等](https://resend.com/docs/dashboard/emails/idempotency-keys)。

## 8. 正式使用前验收

执行 `ACCEPTANCE.md`：用两个你控制的不同学员邮箱验证隔离与完整预约邮件闭环。只有这些远端检查完成后，才把网站发给真实学员。

## 9. 以后换域名

1. Vercel → Project Settings → Domains 添加你买的新域名，按提示配置 DNS 并等待 HTTPS 生效。
2. 更新 Vercel `SITE_URL`，重新部署。
3. 更新 Supabase Site URL 和 Redirect URLs。保留旧域名的跳转过渡期。
4. 更新 Vault 的 `yvone_site_url`，保持原 Cron job。
5. 更新你对外分享的邀请链接。已有学员的推荐码本身不会改变。
6. 发信域名可继续使用旧域名。若也要更换，先在 Resend 验证新域名，再更新 Vercel `RESEND_FROM` 与 Supabase SMTP Sender email。
7. 数据、账号、预约、计划和推荐记录保持不变。

## 10. 以后启用 Stripe

当前仅展示课程窗口、价格与方案，不创建真实付款。下一阶段需增加服务端 Checkout Session、签名验证的 webhook、订单表、幂等履约与退款处理，再根据你的规则加入课时余额和扣课逻辑。前端支付成功页面不能单独作为到账依据。未完成这些步骤前不开放收款按钮。
