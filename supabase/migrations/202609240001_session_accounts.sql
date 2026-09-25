-- Run this new migration only. Existing completed lessons are not charged retroactively.
begin;
create table if not exists public.monthly_memberships (
 id uuid primary key,
 member_id uuid not null references public.profiles(id),
 starts_on date not null, ends_on date not null check(ends_on>=starts_on),
 amount numeric(12,2) check(amount>=0 and amount<=999999.99),
 currency text not null default 'USD' check(currency in ('USD','CNY','CAD','AUD','EUR','GBP')),
 note text not null default '' check(length(note)<=2000),
 created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),
 cancelled_at timestamptz, cancel_reason text check(length(cancel_reason)<=2000)
);
create index if not exists membership_member_dates on public.monthly_memberships(member_id,starts_on,ends_on);
create table if not exists public.session_entries (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('purchase','adjustment','lesson','monthly_lesson')),
 quantity integer not null check(quantity between -10000 and 10000),
 note text not null default '' check(length(note)<=2000),
 amount numeric(12,2) check(amount>=0 and amount<=999999.99),
 currency text not null default 'USD' check(currency in ('USD','CNY','CAD','AUD','EUR','GBP')),
 appointment_id uuid unique references public.appointments(id),
 membership_id uuid references public.monthly_memberships(id),
 created_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),
 check ((kind='purchase' and quantity>0 and appointment_id is null and membership_id is null)
   or (kind='adjustment' and quantity<>0 and appointment_id is null and membership_id is null and amount is null)
   or (kind='lesson' and quantity=-1 and appointment_id is not null and membership_id is null and amount is null)
   or (kind='monthly_lesson' and quantity=0 and appointment_id is not null and membership_id is not null and amount is null))
);
create index if not exists session_entries_member on public.session_entries(member_id,created_at);
alter table public.session_entries enable row level security;
alter table public.monthly_memberships enable row level security;
revoke all on public.session_entries,public.monthly_memberships from anon,authenticated;
grant select on public.session_entries,public.monthly_memberships to authenticated;
grant all on public.session_entries,public.monthly_memberships to service_role;
drop policy if exists session_entries_read on public.session_entries;
create policy session_entries_read on public.session_entries for select to authenticated using(is_coach() or (is_active() and member_id=auth.uid()));
drop policy if exists monthly_memberships_read on public.monthly_memberships;
create policy monthly_memberships_read on public.monthly_memberships for select to authenticated using(is_coach() or (is_active() and member_id=auth.uid()));

create or replace function public.record_session_credit(p_id uuid,p_member uuid,p_kind text,p_quantity integer,p_note text,p_amount numeric default null,p_currency text default 'USD')
returns uuid language plpgsql security definer set search_path=public as $$
declare previous session_entries%rowtype;
begin
 if not is_coach() then raise exception '仅教练可录入课时'; end if;
 if p_id is null or p_kind is null or p_kind not in ('purchase','adjustment') or p_quantity is null or p_quantity=0 or abs(p_quantity::bigint)>10000 or (p_kind='purchase' and p_quantity<0) then raise exception '请输入有效课次数量'; end if;
 if p_note is null or length(trim(p_note))=0 or length(p_note)>2000 then raise exception '请填写购课说明或调整原因（最多 2000 字）'; end if;
 if p_currency is null or p_currency not in ('USD','CNY','CAD','AUD','EUR','GBP') or (p_amount is not null and (p_amount<0 or p_amount>999999.99 or p_amount<>round(p_amount,2))) or (p_kind='adjustment' and p_amount is not null) then raise exception '金额或币种无效'; end if;
 if not exists(select 1 from profiles where id=p_member and role='member') then raise exception '找不到学员'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_member::text,240001));
 select * into previous from session_entries where id=p_id;
 if found then
  if previous.member_id=p_member and previous.kind=p_kind and previous.quantity=p_quantity and previous.note=p_note and previous.amount is not distinct from p_amount and previous.currency=p_currency then return p_id; end if;
  raise exception '此录入请求已使用，请重新打开窗口';
 end if;
 insert into session_entries(id,member_id,kind,quantity,note,amount,currency,created_by) values(p_id,p_member,p_kind,p_quantity,p_note,p_amount,p_currency,auth.uid());
 return p_id;
end; $$;

create or replace function public.record_monthly_membership(p_id uuid,p_member uuid,p_start date,p_end date,p_note text,p_amount numeric default null,p_currency text default 'USD')
returns uuid language plpgsql security definer set search_path=public as $$
declare previous monthly_memberships%rowtype;
begin
 if not is_coach() then raise exception '仅教练可录入包月'; end if;
 if p_id is null or p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then raise exception '请选择有效日期，最长 366 天'; end if;
 if p_note is null or length(trim(p_note))=0 or length(p_note)>2000 then raise exception '请填写包月说明（最多 2000 字）'; end if;
 if p_currency is null or p_currency not in ('USD','CNY','CAD','AUD','EUR','GBP') or (p_amount is not null and (p_amount<0 or p_amount>999999.99 or p_amount<>round(p_amount,2))) then raise exception '金额或币种无效'; end if;
 if not exists(select 1 from profiles where id=p_member and role='member') then raise exception '找不到学员'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_member::text,240001));
 select * into previous from monthly_memberships where id=p_id;
 if found then
  if previous.member_id=p_member and previous.starts_on=p_start and previous.ends_on=p_end and previous.note=p_note and previous.amount is not distinct from p_amount and previous.currency=p_currency then return p_id; end if;
  raise exception '此录入请求已使用，请重新打开窗口';
 end if;
 if exists(select 1 from monthly_memberships where member_id=p_member and cancelled_at is null and starts_on<=p_end and ends_on>=p_start) then raise exception '有效期与已有包月重叠，请核对日期'; end if;
 insert into monthly_memberships(id,member_id,starts_on,ends_on,note,amount,currency,created_by) values(p_id,p_member,p_start,p_end,p_note,p_amount,p_currency,auth.uid());
 return p_id;
end; $$;

create or replace function public.cancel_monthly_membership(p_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 if not is_coach() then raise exception '仅教练可作废包月'; end if;
 if p_reason is null or length(trim(p_reason))=0 or length(p_reason)>2000 then raise exception '请填写作废原因（最多 2000 字）'; end if;
 select member_id into target from monthly_memberships where id=p_id;
 if target is null then raise exception '找不到包月记录'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text,240001));
 update monthly_memberships set cancelled_at=now(),cancel_reason=p_reason where id=p_id and cancelled_at is null;
end; $$;

create or replace function public.charge_completed_session()
returns trigger language plpgsql security definer set search_path=public as $$
declare covered uuid; lesson_date date; studio_zone text;
begin
 if new.status<>'completed' or old.status='completed' then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.member_id::text,240001));
 select timezone into studio_zone from settings where id=1;
 select (starts_at at time zone coalesce(studio_zone,'America/Los_Angeles'))::date into lesson_date from slots where id=new.slot_id;
 select id into covered from monthly_memberships where member_id=new.member_id and cancelled_at is null and starts_on<=lesson_date and ends_on>=lesson_date order by starts_on limit 1;
 insert into session_entries(member_id,kind,quantity,note,appointment_id,membership_id,created_by)
 values(new.member_id,case when covered is null then 'lesson' else 'monthly_lesson' end,case when covered is null then -1 else 0 end,
 case when covered is null then '完成课程，扣除 1 节' else '包月内完成课程，不扣按次课时' end,new.id,covered,auth.uid())
 on conflict(appointment_id) do nothing;
 return new;
end; $$;
drop trigger if exists charge_completed_session on public.appointments;
create trigger charge_completed_session after update of status on public.appointments for each row execute function public.charge_completed_session();
revoke all on function public.record_session_credit(uuid,uuid,text,integer,text,numeric,text),public.record_monthly_membership(uuid,uuid,date,date,text,numeric,text),public.cancel_monthly_membership(uuid,text),public.charge_completed_session() from public,anon,authenticated;
grant execute on function public.record_session_credit(uuid,uuid,text,integer,text,numeric,text),public.record_monthly_membership(uuid,uuid,date,date,text,numeric,text),public.cancel_monthly_membership(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
