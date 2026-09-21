begin;
create table public.settings (
 id integer primary key check (id=1), studio_name text not null default 'Yvone Fitness', timezone text not null default 'America/Los_Angeles',
 allow_referral_signup boolean not null default true, location text not null default '请与教练确认训练地点'
);
insert into public.settings(id) values(1);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade, full_name text not null check(length(full_name) between 1 and 80),
 email text not null, role text not null default 'member' check(role in ('coach','member')), active boolean not null default true,
 phone text not null default '', goals text not null default '', timezone text not null default 'America/Los_Angeles',
 email_notifications boolean not null default true, referral_code text not null unique default upper(replace(gen_random_uuid()::text,'-','')),
 created_at timestamptz not null default now()
);
create unique index one_coach on public.profiles(role) where role='coach';
create table public.invites (
 id uuid primary key default gen_random_uuid(), code text not null unique default upper(replace(gen_random_uuid()::text,'-','')),
 email text, max_uses integer not null default 1 check(max_uses between 1 and 10000), uses integer not null default 0 check(uses>=0),
 active boolean not null default true, expires_at timestamptz default now()+interval '30 days',
 invite_role text not null default 'member' check(invite_role in ('member','coach')), created_at timestamptz not null default now()
);
create table public.referrals (
 id uuid primary key default gen_random_uuid(), referrer_id uuid not null references public.profiles(id),
 referred_id uuid not null unique references public.profiles(id), status text not null default 'pending' check(status in ('pending','confirmed')),
 created_at timestamptz not null default now(), confirmed_at timestamptz, check(referrer_id<>referred_id)
);
create table public.slots (
 id uuid primary key default gen_random_uuid(), starts_at timestamptz not null, ends_at timestamptz not null,
 active boolean not null default true, created_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '4 hours')
);
create index slots_dates on public.slots(starts_at,ends_at);
create table public.appointments (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.profiles(id), slot_id uuid not null references public.slots(id),
 status text not null default 'booked' check(status in ('booked','cancelled','completed')), message text not null default '' check(length(message)<=2000),
 reason text not null default '' check(length(reason)<=2000), created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create unique index one_booking_per_slot on public.appointments(slot_id) where status in ('booked','completed');
create index appointments_member on public.appointments(member_id);
create table public.appointment_events (
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments(id), actor_id uuid not null references public.profiles(id),
 action text not null, message text not null default '', details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index events_appointment on public.appointment_events(appointment_id);
create table public.plans (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.profiles(id), title text not null check(length(title) between 1 and 160),
 content text not null check(length(content)<=30000), status text not null default 'draft' check(status in ('draft','published','archived')),
 created_at timestamptz not null default now()
);
create unique index one_current_plan on public.plans(member_id) where status='published';
create table public.records (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.profiles(id), recorded_on date not null default current_date,
 weight numeric check(weight>0 and weight<500), body_fat numeric check(body_fat>=0 and body_fat<=100), notes text not null default '' check(length(notes)<=10000),
 shared boolean not null default false, created_at timestamptz not null default now()
);
create index records_member on public.records(member_id);
create table public.packages (
 id uuid primary key default gen_random_uuid(), title text not null, sessions integer not null check(sessions>0), price numeric check(price>=0),
 currency text not null default 'USD' check(currency in ('CNY','USD','CAD','AUD','EUR','GBP')), description text not null default '', active boolean not null default true
);
insert into public.packages(title,sessions,description) values('初次体验',1,'认识你的身体，和教练一起找到训练方向。'),('规律进步',10,'建立稳定训练节奏，让每一次投入都有回报。'),('长期蜕变',24,'以长期计划，走向更强健、更自信的自己。');
create table public.email_jobs (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id), appointment_id uuid references public.appointments(id),
 subject text not null, body text not null, kind text not null default 'event', due_at timestamptz not null default now(),
 state text not null default 'pending' check(state in ('pending','processing','sent','skipped','failed')), attempts integer not null default 0,
 locked_until timestamptz, last_error text, created_at timestamptz not null default now(), sent_at timestamptz
);
create index email_due on public.email_jobs(state,due_at);

create function public.is_active() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles where id=auth.uid() and active);
$$;
create function public.is_coach() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles where id=auth.uid() and role='coach' and active);
$$;

-- Registration is checked in the same transaction as auth.users insertion. Direct Auth API calls cannot bypass it.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare supplied_code text; ref text; invitation invites%rowtype; owner_id uuid; assigned_role text:='member'; has_invite boolean:=false;
begin
 supplied_code:=upper(trim(coalesce(new.raw_user_meta_data->>'invite_code','')));
 ref:=upper(trim(coalesce(new.raw_user_meta_data->>'referral_code','')));
 if supplied_code='' or length(supplied_code)>128 then raise exception '需要有效的邀请码'; end if;
 select * into invitation from invites where invites.code=supplied_code for update;
 if found then
  if not invitation.active or invitation.uses>=invitation.max_uses or (invitation.expires_at is not null and invitation.expires_at<=now())
   or (invitation.email is not null and lower(invitation.email)<>lower(new.email)) then raise exception '邀请码无效、已过期或不适用于此邮箱'; end if;
  assigned_role:=invitation.invite_role; has_invite:=true;
  update invites set uses=uses+1 where id=invitation.id;
 else
  if not (select allow_referral_signup from settings where id=1) then raise exception '需要教练发放的邀请码'; end if;
  select id into owner_id from profiles where referral_code=supplied_code and role='member' and active;
  if owner_id is null then raise exception '邀请码无效'; end if;
  ref:=supplied_code;
 end if;
 if ref<>'' then
  select id into owner_id from profiles where referral_code=ref and role='member' and active;
  if owner_id is null then raise exception '推荐码无效'; end if;
 end if;
 insert into profiles(id,full_name,email,role,timezone) values(new.id,
  left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'新学员'),80),new.email,assigned_role,(select timezone from settings where id=1));
 if owner_id is not null then
  insert into referrals(referrer_id,referred_id,status,confirmed_at) values(owner_id,new.id,
   case when new.email_confirmed_at is not null then 'confirmed' else 'pending' end,new.email_confirmed_at);
 end if;
 return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.sync_auth_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.email is distinct from old.email then update profiles set email=new.email where id=new.id; end if;
 if old.email_confirmed_at is null and new.email_confirmed_at is not null then
  update referrals set status='confirmed',confirmed_at=now() where referred_id=new.id and status='pending';
 end if;
 return new;
end; $$;
create trigger on_auth_user_updated after update of email,email_confirmed_at on auth.users for each row execute function public.sync_auth_user();

create function public.save_profile(p_name text,p_phone text,p_goals text,p_timezone text,p_notifications boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_active() then raise exception '请登录有效账号'; end if;
 if length(trim(p_name)) not between 1 and 80 or length(p_phone)>50 or length(p_goals)>5000 then raise exception '个人资料格式不正确'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception '时区无效'; end if;
 update profiles set full_name=trim(p_name),phone=p_phone,goals=p_goals,timezone=p_timezone,email_notifications=p_notifications where id=auth.uid();
end; $$;
create function public.save_settings(p_name text,p_timezone text,p_referrals boolean,p_location text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 if length(trim(p_name)) not between 1 and 80 or length(p_location)>300 then raise exception '名称或地点格式不正确'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception '时区无效'; end if;
 update settings set studio_name=trim(p_name),timezone=p_timezone,allow_referral_signup=p_referrals,location=p_location where id=1;
end; $$;
create function public.create_invite(p_email text default null,p_max_uses integer default 1,p_days integer default 30) returns text language plpgsql security definer set search_path=public as $$
declare result text;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 if p_days not between 1 and 365 then raise exception '有效期需为 1–365 天'; end if;
 insert into invites(email,max_uses,expires_at) values(nullif(lower(trim(p_email)),''),p_max_uses,now()+make_interval(days=>p_days)) returning code into result;
 return result;
end; $$;
create function public.revoke_invite(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 update invites set active=false where id=p_id;
end; $$;
create function public.set_member_active(p_id uuid,p_active boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 update profiles set active=p_active where id=p_id and role='member';
end; $$;

create function public.save_slot(p_start timestamptz default null,p_end timestamptz default null,p_id uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 perform pg_advisory_xact_lock(9012026);
 if p_id is not null then
  if exists(select 1 from appointments where slot_id=p_id and status='booked') then raise exception '请先取消或改期该时段内的预约'; end if;
  update slots set active=false where id=p_id; return p_id;
 end if;
 if p_start is null or p_end is null or p_start<=now() or p_end<=p_start or p_end>p_start+interval '4 hours' then raise exception '请选择未来的有效时间段（最长 4 小时）'; end if;
 if exists(select 1 from slots where active and starts_at<p_end and ends_at>p_start) then raise exception '该时间段与已有时间段重叠'; end if;
 insert into slots(starts_at,ends_at) values(p_start,p_end) returning id into result;
 return result;
end; $$;
create function public.get_schedule() returns table(id uuid,starts_at timestamptz,ends_at timestamptz,available boolean) language sql stable security definer set search_path=public as $$
 select s.id,s.starts_at,s.ends_at,not exists(select 1 from appointments a where a.slot_id=s.id and a.status in ('booked','completed'))
 from slots s where is_active() and s.active and s.starts_at>now() order by s.starts_at;
$$;
create function public.manage_booking(p_action text,p_slot uuid default null,p_appointment uuid default null,p_member uuid default null,p_message text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid; result uuid; existing appointments%rowtype; selected slots%rowtype; old_slot slots%rowtype; coach_id uuid; title text;
begin
 if not is_active() then raise exception '请登录有效账号'; end if;
 if length(p_message)>2000 then raise exception '留言不可超过 2000 字'; end if;
 perform pg_advisory_xact_lock(9012026);
 if p_action='book' then
  target:=coalesce(p_member,auth.uid());
  if target<>auth.uid() and not is_coach() then raise exception '无权为其他学员预约'; end if;
  if not exists(select 1 from profiles where id=target and role='member' and active) then raise exception '请选择有效学员'; end if;
 else
  select * into existing from appointments where id=p_appointment for update;
  if not found or (existing.member_id<>auth.uid() and not is_coach()) then raise exception '找不到预约或无权操作'; end if;
  if existing.status<>'booked' then raise exception '预约已取消或已完成'; end if;
  select * into old_slot from slots where id=existing.slot_id;
  if old_slot.starts_at<=now() and not is_coach() then raise exception '课程已开始，请联系教练'; end if;
  target:=existing.member_id;
 end if;
 if p_action in ('book','reschedule') then
  select * into selected from slots where id=p_slot and active for update;
  if not found or selected.starts_at<=now() then raise exception '时间段不可预约'; end if;
  if p_action='reschedule' and p_slot=existing.slot_id then raise exception '请选择不同的时间段'; end if;
  if exists(select 1 from appointments where slot_id=p_slot and status in ('booked','completed')) then raise exception '这个时间已被预约，请选择其他时段'; end if;
  if p_action='book' then
   insert into appointments(member_id,slot_id,message,created_by) values(target,p_slot,p_message,auth.uid()) returning id into result;
   title:='预约已确认';
  else
   update appointments set slot_id=p_slot,reason=p_message where id=p_appointment returning id into result;
   title:='预约已改期';
  end if;
 elsif p_action='cancel' then
  update appointments set status='cancelled',reason=p_message where id=p_appointment returning id into result; title:='预约已取消';
 elsif p_action='complete' then
  if not is_coach() then raise exception '仅教练可确认完成'; end if;
  if old_slot.ends_at>now() then raise exception '课程结束后才能标记完成'; end if;
  update appointments set status='completed' where id=p_appointment returning id into result; title:='训练已完成';
 else raise exception '操作无效'; end if;
 insert into appointment_events(appointment_id,actor_id,action,message,details) values(result,auth.uid(),p_action,p_message,
  jsonb_build_object('old_start',old_slot.starts_at,'new_start',selected.starts_at));
 update email_jobs set state='skipped' where appointment_id=result and kind='reminder' and state in ('pending','processing');
 select id into coach_id from profiles where role='coach' and active;
 insert into email_jobs(recipient_id,appointment_id,subject,body) select p.id,result,title,
 '你的课程安排有更新，请登录网站查看最新时间和详情。' from profiles p where p.id in (target,coach_id);
 if p_action in ('book','reschedule') then
  insert into email_jobs(recipient_id,appointment_id,subject,body,kind,due_at) select p.id,result,'训练提醒',
  '你的下一次训练将在 24 小时内开始。请登录网站查看具体时间和地点。','reminder',greatest(now()+interval '1 minute',selected.starts_at-interval '24 hours')
  from profiles p where p.id in (target,coach_id);
 end if;
 return result;
end; $$;

create function public.save_plan(p_member uuid,p_title text,p_content text,p_publish boolean default false,p_id uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 perform 1 from profiles where id=p_member and role='member' for update;
 if not found then raise exception '找不到学员'; end if;
 if p_id is not null and not exists(select 1 from plans where id=p_id and member_id=p_member) then raise exception '计划归属不匹配'; end if;
 if p_publish then update plans set status='archived' where member_id=p_member and status='published' and id is distinct from p_id; end if;
 if p_id is null then
  insert into plans(member_id,title,content,status) values(p_member,p_title,p_content,case when p_publish then 'published' else 'draft' end) returning id into result;
 else
  update plans set title=p_title,content=p_content,status=case when p_publish then 'published' else 'draft' end where id=p_id returning id into result;
 end if;
 if p_publish then insert into email_jobs(recipient_id,subject,body) values(p_member,'新的训练计划已发布','教练更新了你的专属训练计划，请登录网站查看。'); end if;
 return result;
end; $$;
create function public.save_record(p_member uuid,p_date date,p_weight numeric,p_fat numeric,p_notes text,p_shared boolean,p_id uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 if not exists(select 1 from profiles where id=p_member and role='member') then raise exception '找不到学员'; end if;
 if p_id is null then
  insert into records(member_id,recorded_on,weight,body_fat,notes,shared) values(p_member,p_date,p_weight,p_fat,p_notes,p_shared) returning id into result;
 else
  update records set recorded_on=p_date,weight=p_weight,body_fat=p_fat,notes=p_notes,shared=p_shared where id=p_id and member_id=p_member returning id into result;
  if result is null then raise exception '档案归属不匹配'; end if;
 end if; return result;
end; $$;

-- Delivery queue is callable only with the service role; a lease prevents parallel workers claiming the same jobs.
create function public.claim_email_jobs() returns setof public.email_jobs language sql security definer set search_path=public as $$
 update email_jobs set state='processing',locked_until=now()+interval '5 minutes',attempts=attempts+1 where id in (
  select id from email_jobs where ((state='pending' and due_at<=now()) or (state='processing' and locked_until<now())) and attempts<5
  order by due_at limit 10 for update skip locked
 ) returning *;
$$;

-- Explicit table grants + RLS. Mutations of identities, invitations, scheduling and plans go through checked functions.
do $$ declare t text; begin
 foreach t in array array['settings','profiles','invites','referrals','slots','appointments','appointment_events','plans','records','packages','email_jobs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from anon, authenticated',t);
  execute format('grant select on table public.%I to authenticated',t);
  execute format('grant all on table public.%I to service_role',t);
 end loop;
end $$;
create policy settings_read on settings for select to authenticated using(is_active());
create policy profile_read on profiles for select to authenticated using(id=auth.uid() or is_coach());
create policy invite_read on invites for select to authenticated using(is_coach());
create policy referrals_read on referrals for select to authenticated using(is_coach() or (is_active() and referrer_id=auth.uid()));
create policy slot_read on slots for select to authenticated using(is_active());
create policy booking_read on appointments for select to authenticated using(is_coach() or (is_active() and member_id=auth.uid()));
create policy events_read on appointment_events for select to authenticated using(is_coach() or (is_active() and exists(select 1 from appointments a where a.id=appointment_id and a.member_id=auth.uid())));
create policy plan_read on plans for select to authenticated using(is_coach() or (is_active() and member_id=auth.uid() and status in ('published','archived')));
create policy record_read on records for select to authenticated using(is_coach() or (is_active() and member_id=auth.uid() and shared));
create policy package_read on packages for select to authenticated using(is_coach() or (is_active() and active));
create policy package_write on packages for all to authenticated using(is_coach()) with check(is_coach());
grant insert,update,delete on packages to authenticated;
create policy email_read on email_jobs for select to authenticated using(is_coach());

-- Remove default PUBLIC execute privileges, including trigger and service-only functions.
do $$ declare r record; begin
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('is_active','is_coach','handle_new_user','sync_auth_user','save_profile','save_settings','create_invite','revoke_invite','set_member_active','save_slot','get_schedule','manage_booking','save_plan','save_record','claim_email_jobs') loop
 execute format('revoke all on function %s from public, anon, authenticated',r.signature);
 if r.signature::text not like '%handle_new_user%' and r.signature::text not like '%sync_auth_user%' and r.signature::text not like '%claim_email_jobs%' then
 execute format('grant execute on function %s to authenticated',r.signature); end if;
 end loop;
end $$;
grant execute on function public.claim_email_jobs() to service_role;
commit;
