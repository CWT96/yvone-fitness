-- Run AFTER the migration, once only. The generated code is returned below.
-- This email-bound, one-use invitation creates the only coach account.
insert into public.invites(email,max_uses,expires_at,invite_role)
values ('wt.cong96@gmail.com',1,now()+interval '7 days','coach')
returning code as coach_invitation_code;
