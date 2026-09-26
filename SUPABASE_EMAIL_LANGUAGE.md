# 登录邮件的中英文设置（只改 Yvonne Fitness 项目）

网站和预约/购课/训练计划邮件已经支持语言切换。Supabase 直接发送的账号验证、密码重置和邮箱变更邮件，需要在其后台更新下面 3 个模板。无需改 SMTP、密钥、收款配置或跳转地址。

打开 https://supabase.com/dashboard/project/zhyxlzalrpwfsqpxfftt/auth/templates 。如菜单名称不同，在 Authentication → Email / Email Templates 中找这三项。

| 邮件类型 | Subject（标题） | Body（正文）复制的文件 |
| --- | --- | --- |
| Confirm sign up | Yvonne Fitness · Verify your email / 验证邮箱 | supabase/templates/confirmation.html |
| Reset password | Yvonne Fitness · Reset your password / 重置密码 | supabase/templates/recovery.html |
| Change email address | Yvonne Fitness · Confirm email change / 确认邮箱变更 | supabase/templates/email_change.html |

逐项用文件的**全部内容**替换 Body 并保存。保留 `{{ .ConfirmationURL }}` 和条件语句，不要改成固定网站首页。

标题为双语；正文按学员账号保存的语言发送。新学员注册时会保存选择，老学员可在网站右上角选择 English。未设置语言的旧账号默认中文。教练界面保持中文。

保存后用英文模式注册测试学员、请求密码重置，检查邮件为英文、链接可以完成操作；不要在真实账号上误改密码。

模板使用 Supabase 官方提供的 `.Data` 用户元数据和 `.ConfirmationURL`：https://supabase.com/docs/guides/auth/auth-email-templates 。这些文件不含密钥。
