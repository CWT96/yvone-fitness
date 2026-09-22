begin;

alter table public.plans add column if not exists deleted_at timestamptz;
alter table public.records add column if not exists deleted_at timestamptz;
alter table public.email_jobs add column if not exists plan_id uuid references public.plans(id);
drop policy if exists plan_read on public.plans;
create policy plan_read on public.plans for select to authenticated using(
 is_coach() or (is_active() and member_id=auth.uid() and deleted_at is null and status in ('published','archived')));
drop policy if exists record_read on public.records;
create policy record_read on public.records for select to authenticated using(
 is_coach() or (is_active() and member_id=auth.uid() and deleted_at is null and shared));

create or replace function public.save_plan(p_member uuid,p_title text,p_content text,p_publish boolean default false,p_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 perform 1 from profiles where id=p_member and role='member' for update;
 if not found then raise exception '找不到学员'; end if;
 if p_id is not null and not exists(select 1 from plans where id=p_id and member_id=p_member and deleted_at is null) then raise exception '计划归属不匹配或已删除'; end if;
 if p_publish then update plans set status='archived' where member_id=p_member and status='published' and id is distinct from p_id; end if;
 if p_id is null then
  insert into plans(member_id,title,content,status) values(p_member,trim(p_title),p_content,case when p_publish then 'published' else 'draft' end) returning id into result;
 else
  update plans set title=trim(p_title),content=p_content,status=case when p_publish then 'published' else 'draft' end where id=p_id returning id into result;
 end if;
 if p_publish then insert into email_jobs(recipient_id,plan_id,subject,body) values(p_member,result,'新的训练计划已发布','教练更新了你的专属训练计划，请登录网站查看。'); end if;
 return result;
end; $$;

create or replace function public.save_record(p_member uuid,p_date date,p_weight numeric,p_fat numeric,p_notes text,p_shared boolean,p_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 if not exists(select 1 from profiles where id=p_member and role='member') then raise exception '找不到学员'; end if;
 if p_id is null then
  insert into records(member_id,recorded_on,weight,body_fat,notes,shared) values(p_member,p_date,p_weight,p_fat,p_notes,p_shared) returning id into result;
 else
  update records set recorded_on=p_date,weight=p_weight,body_fat=p_fat,notes=p_notes,shared=p_shared where id=p_id and member_id=p_member and deleted_at is null returning id into result;
  if result is null then raise exception '档案归属不匹配或已删除'; end if;
 end if;
 return result;
end; $$;

create or replace function public.set_training_deleted(p_kind text,p_id uuid,p_deleted boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 if p_deleted is null then raise exception '请选择有效操作'; end if;
 -- Deleted content and restored content are drafts; restoration never republishes it.
 if p_kind='plan' then
  update plans set deleted_at=case when p_deleted then now() else null end,status='draft'
   where id=p_id and (deleted_at is not null)= (not p_deleted);
 elsif p_kind='record' then
  update records set deleted_at=case when p_deleted then now() else null end,shared=false
   where id=p_id and (deleted_at is not null)= (not p_deleted);
 else raise exception '内容类型无效'; end if;
 if not found then raise exception '内容不存在或状态已改变，请刷新后重试'; end if;
end; $$;
revoke all on function public.set_training_deleted(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_training_deleted(text,uuid,boolean) to authenticated;

-- Retire publicly readable prices. Historical package rows remain coach-only.
drop policy if exists package_read on public.packages;
create policy package_read on public.packages for select to authenticated using(is_coach());
create table if not exists public.member_prices (
 id uuid primary key default gen_random_uuid(), member_id uuid not null unique references public.profiles(id),
 single_price numeric(12,2) check(single_price between 0 and 999999.99),
 monthly_price numeric(12,2) check(monthly_price between 0 and 999999.99),
 currency text not null default 'USD' check(currency in ('USD','CNY','CAD','AUD','EUR','GBP')),
 updated_at timestamptz not null default now()
);
alter table public.member_prices enable row level security;
revoke all on public.member_prices from anon,authenticated;
grant select on public.member_prices to authenticated;
grant all on public.member_prices to service_role;
drop policy if exists member_prices_read on public.member_prices;
create policy member_prices_read on public.member_prices for select to authenticated using(is_coach() or (is_active() and member_id=auth.uid()));
create or replace function public.save_member_prices(p_member uuid,p_single numeric,p_monthly numeric,p_currency text default 'USD')
returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_coach() then raise exception '仅教练可设置价格'; end if;
 if not exists(select 1 from profiles where id=p_member and role='member') then raise exception '找不到学员'; end if;
 if (p_single is not null and (p_single<0 or p_single>999999.99 or p_single<>round(p_single,2)))
 or (p_monthly is not null and (p_monthly<0 or p_monthly>999999.99 or p_monthly<>round(p_monthly,2))) then raise exception '金额需为 0–999999.99，最多两位小数'; end if;
 insert into member_prices(member_id,single_price,monthly_price,currency) values(p_member,p_single,p_monthly,p_currency)
 on conflict(member_id) do update set single_price=excluded.single_price,monthly_price=excluded.monthly_price,currency=excluded.currency,updated_at=now();
end; $$;
revoke all on function public.save_member_prices(uuid,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.save_member_prices(uuid,numeric,numeric,text) to authenticated;

-- A versioned outbox isolates contact synchronization from signup and email delivery.
create table if not exists public.contact_sync (
 id uuid primary key default gen_random_uuid(), member_id uuid not null unique references public.profiles(id),
 revision bigint not null default 1, state text not null default 'pending' check(state in ('pending','processing','synced','failed')),
 attempts integer not null default 0, due_at timestamptz not null default now(), locked_until timestamptz, lock_token uuid,
 synced_at timestamptz, last_error text, contact_id text, synced_email text, segment_id text, in_segment boolean not null default false
);
alter table public.contact_sync enable row level security;
revoke all on public.contact_sync from anon,authenticated;
grant select on public.contact_sync to authenticated;
grant all on public.contact_sync to service_role;
drop policy if exists contact_sync_read on public.contact_sync;
create policy contact_sync_read on public.contact_sync for select to authenticated using(is_coach());
create or replace function public.enqueue_contact_sync(p_member uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from profiles p join auth.users u on u.id=p.id where p.id=p_member and p.role='member' and u.email_confirmed_at is not null) then return; end if;
 insert into contact_sync(member_id) values(p_member)
 on conflict(member_id) do update set revision=contact_sync.revision+1,
 state=case when contact_sync.state='processing' and contact_sync.locked_until>now() then 'processing' else 'pending' end,
 attempts=0,due_at=now(),last_error=null;
end; $$;
create or replace function public.queue_profile_contact() returns trigger language plpgsql security definer set search_path=public as $$
begin perform enqueue_contact_sync(new.id); return new; end; $$;
create or replace function public.queue_confirmed_contact() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.email_confirmed_at is not null then perform enqueue_contact_sync(new.id); end if;
 return new;
end; $$;
drop trigger if exists profile_contact_changed on public.profiles;
create trigger profile_contact_changed after insert or update of email,full_name,active,email_notifications on public.profiles for each row execute function public.queue_profile_contact();
drop trigger if exists auth_contact_confirmed on auth.users;
create trigger auth_contact_confirmed after update of email_confirmed_at on auth.users for each row execute function public.queue_confirmed_contact();
create or replace function public.claim_contact_sync() returns setof public.contact_sync language sql security definer set search_path=public as $$
 update contact_sync set state='processing',locked_until=now()+interval '5 minutes',lock_token=gen_random_uuid(),attempts=attempts+1 where id in (
  select id from contact_sync where ((state='pending' and due_at<=now()) or (state='processing' and locked_until<now())) and attempts<8
  order by due_at limit 2 for update skip locked
 ) returning *;
$$;
create or replace function public.finish_contact_sync(p_id uuid,p_revision bigint,p_lock uuid,p_error text default null,p_contact text default null,p_email text default null,p_segment text default null,p_in_segment boolean default false)
returns void language plpgsql security definer set search_path=public as $$
begin
 update contact_sync set
  state=case when revision<>p_revision then 'pending' when p_error is null then 'synced' when attempts>=8 then 'failed' else 'pending' end,
  due_at=case when revision<>p_revision then now() else now()+make_interval(mins=>least(60,power(2,attempts)::integer)) end,
  synced_at=case when p_error is null and p_contact is not null then now() else synced_at end,
  last_error=case when revision<>p_revision then null else left(p_error,250) end,
  contact_id=case when p_error is null and p_contact is not null then p_contact else contact_id end,
  synced_email=case when p_error is null and p_contact is not null then p_email else synced_email end,
  segment_id=case when p_error is null and p_contact is not null then p_segment else segment_id end,
  in_segment=case when p_error is null and p_contact is not null then p_in_segment else in_segment end,
  locked_until=null,lock_token=null
 where id=p_id and lock_token=p_lock and state='processing';
end; $$;
revoke all on function public.finish_contact_sync(uuid,bigint,uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_contact_sync(uuid,bigint,uuid,text,text,text,text,boolean) to service_role;
create or replace function public.retry_contact_sync() returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 update contact_sync set state='pending',attempts=0,due_at=now(),locked_until=null,last_error=null,revision=revision+1 where state='failed';
end; $$;
revoke all on function public.enqueue_contact_sync(uuid),public.queue_profile_contact(),public.queue_confirmed_contact(),public.claim_contact_sync(),public.retry_contact_sync() from public,anon,authenticated;
grant execute on function public.claim_contact_sync() to service_role;
grant execute on function public.retry_contact_sync() to authenticated;
insert into contact_sync(member_id)
 select p.id from profiles p join auth.users u on u.id=p.id where p.role='member' and u.email_confirmed_at is not null
 on conflict(member_id) do nothing;
commit;
