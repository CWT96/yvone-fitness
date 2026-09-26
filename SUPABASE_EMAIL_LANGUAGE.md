# 登录邮件固定英文（只适用于 Yvonne Fitness 项目）

用户已确认：Supabase 的注册验证、重置密码和邮箱变更邮件，标题与正文统一英文，不随网站语言切换。如果后台现有邮件已经是英文，保持现状即可，无需替换模板。

网站和预约、购课、训练计划等业务通知仍按学员语言显示。

如需更新品牌文案，可打开 https://supabase.com/dashboard/project/zhyxlzalrpwfsqpxfftt/auth/templates ，在 Authentication → Email / Email Templates 中设置：

| 邮件类型 | Subject（标题） | Body（正文）复制的文件 |
| --- | --- | --- |
| Confirm sign up | Yvonne Fitness · Verify your email | supabase/templates/confirmation.html |
| Reset password | Yvonne Fitness · Reset your password | supabase/templates/recovery.html |
| Change email address | Yvonne Fitness · Confirm email change | supabase/templates/email_change.html |

三份本地模板均为固定英文。需要替换时，复制相应文件全部内容到 Body 并保存，保留 `{{ .ConfirmationURL }}`。不需要改 SMTP、密钥或跳转地址，也不需要重新部署网站。

这里只更新了仓库中的备用模板和说明，没有修改 Supabase 后台现有模板。
