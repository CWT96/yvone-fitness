# 英文验证码邮件：避免邮箱扫描提前消耗链接

网站已提供验证码输入页。**必须在 Supabase 替换以下 3 份邮件正文后，新邮件才会改发验证码。** 原有纯英文邮件如果仍含一次性验证链接，也必须替换。无需改密钥、SMTP 或数据库。

打开 Yvonne Fitness 项目：https://supabase.com/dashboard/project/zhyxlzalrpwfsqpxfftt/auth/templates ，在 Authentication → Email / Email Templates 找到以下三项。

| 邮件类型 | Subject（标题） | Body（正文）复制的文件 |
| --- | --- | --- |
| Confirm sign up | Yvonne Fitness · Verify your email | supabase/templates/confirmation.html |
| Reset password | Yvonne Fitness · Reset your password | supabase/templates/recovery.html |
| Change email address | Yvonne Fitness · Confirm email change | supabase/templates/email_change.html |

逐项用文件的**全部内容**替换 Body 并保存。三份正文都是英文，显示 `{{ .Token }}` 数字验证码。按钮只打开固定的输入页面，不带凭证，不会自动验证。

不要在这些邮件中保留 `{{ .ConfirmationURL }}`、`{{ .TokenHash }}` 或把验证码放进链接里，否则邮箱扫描仍可能提前访问验证入口。不要关闭邮箱验证或新旧邮箱双重确认。

## 学员使用

- 注册：按原流程填写邀请码、邮箱和密码，然后选择「已有邮件验证码？前往验证」。输入邮箱和验证码。
- 忘记密码：先请求重置邮件，再输入验证码；验证成功后网站会打开设置新密码页面。
- 更改邮箱：先在个人设置申请变更；在「输入邮箱验证码」中填写**接收当前这封邮件的邮箱**：旧邮箱收到的代码配旧邮箱，新邮箱收到的代码配新邮箱。如果两边都收到代码，分别提交。第一封确认不等于邮箱变更已完成。
- 验证码页面：https://www.yvonnefitness.com/auth/verify 。可以在另一台设备上输入，不要求与发起操作时使用同一浏览器。只打开页面不发邮件、不消耗验证码。

## 配置后的验证

1. 用 iCloud 或 Outlook 的测试学员注册，等待邮件送达，再手动输入代码。
2. 确认重复使用同一个代码被拒绝；注册或重置验证码失效时使用「重新发送验证码」；邮箱变更失效时返回个人设置重新申请。
3. 用测试账号检查密码重置和新旧邮箱确认，不要误改真实学员的登录邮箱。

本次不新增无密码登录，不绕过邀请注册。已发出的旧链接仍走原回调页；被消耗的旧链接无法恢复，需要重新发信。后台模板修改须手动完成，代码部署本身不会替换它们。

参考：https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching
