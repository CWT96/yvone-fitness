begin;
alter table public.member_prices
 add column starter_price numeric(12,2) check (starter_price between 0 and 999999.99),
 add column standard_price numeric(12,2) check (standard_price between 0 and 999999.99),
 add column premium_price numeric(12,2) check (premium_price between 0 and 999999.99),
 add column online_monthly_price numeric(12,2) check (online_monthly_price between 0 and 999999.99),
 add column online_quarterly_price numeric(12,2) check (online_quarterly_price between 0 and 999999.99),
 add column online_annual_price numeric(12,2) check (online_annual_price between 0 and 999999.99);
alter table public.session_entries add column expires_on date;
alter table public.session_entries add constraint purchase_expiry_only check(expires_on is null or kind='purchase');
alter table public.payment_orders drop constraint payment_orders_package_check;
alter table public.payment_orders add constraint payment_orders_package_check check(package in ('single','monthly','quarterly','annual','starter','standard','premium','online_monthly','online_quarterly','online_annual'));
create table public.online_memberships (like public.monthly_memberships including all);
alter table public.online_memberships add constraint online_member_fk foreign key(member_id) references profiles(id), add constraint online_creator_fk foreign key(created_by) references profiles(id);
alter table public.online_memberships enable row level security;
revoke all on public.online_memberships from anon,authenticated;
grant select on public.online_memberships to authenticated;
grant all on public.online_memberships to service_role;
create policy online_memberships_read on public.online_memberships for select to authenticated using(is_coach() or (is_active() and member_id=auth.uid()));
create function public.save_member_catalog_prices(p_member uuid,p_prices jsonb,p_currency text default 'USD') returns void language plpgsql security definer set search_path=public as $$
declare k text; v numeric;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 if p_prices is null or jsonb_typeof(p_prices)<>'object' then raise exception '价格无效'; end if;
 for k in select jsonb_object_keys(p_prices) loop
  if k not in ('single','monthly','starter','standard','premium','online_monthly','online_quarterly','online_annual') then raise exception '购课选项无效'; end if;
  v:=(p_prices->>k)::numeric;
  if v<0 or v>999999.99 or v<>round(v,2) then raise exception '价格无效'; end if;
 end loop;
 perform save_member_prices(p_member,(p_prices->>'single')::numeric,(p_prices->>'monthly')::numeric,p_currency);
 update member_prices set starter_price=(p_prices->>'starter')::numeric,standard_price=(p_prices->>'standard')::numeric,premium_price=(p_prices->>'premium')::numeric,
 online_monthly_price=(p_prices->>'online_monthly')::numeric,online_quarterly_price=(p_prices->>'online_quarterly')::numeric,online_annual_price=(p_prices->>'online_annual')::numeric where member_id=p_member;
end; $$;
revoke all on function public.save_member_catalog_prices(uuid,jsonb,text) from public,anon;
grant execute on function public.save_member_catalog_prices(uuid,jsonb,text) to authenticated;
create function public.cancel_online_membership(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 if p_reason is null or length(trim(p_reason))=0 or length(p_reason)>2000 then raise exception '请填写作废原因（最多 2000 字）'; end if;
 select member_id into target from online_memberships where id=p_id;
 if target is null then raise exception '找不到记录'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text,240001));
 update online_memberships set cancelled_at=now(),cancel_reason=p_reason where id=p_id and cancelled_at is null;
end; $$;
revoke all on function public.cancel_online_membership(uuid,text) from public,anon;
grant execute on function public.cancel_online_membership(uuid,text) to authenticated;
create or replace function public.prepare_payment_order(p_member uuid,p_actor uuid,p_package text,p_quantity integer,p_expected integer,p_live boolean)
returns public.payment_orders language plpgsql security definer set search_path=public as $$
declare result payment_orders%rowtype; price member_prices%rowtype; unit integer; day date; zone text;
begin
 if p_package is null or p_package not in ('single','monthly','quarterly','annual','starter','standard','premium','online_monthly','online_quarterly','online_annual') or p_quantity is null or p_quantity not between 1 and 100 or (p_package<>'single' and p_quantity<>1) or p_live is null then raise exception '购课选项无效'; end if;
 if not exists(select 1 from profiles where id=p_member and role='member' and active) then raise exception '学员账号无效'; end if;
 if not exists(select 1 from profiles where id=p_actor and active and (id=p_member or role='coach')) then raise exception '无权购买'; end if;
 if not p_live and not exists(select 1 from profiles where id=p_actor and active and role='coach') then raise exception '仅教练可测试支付'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_member::text,240001));
 select * into price from member_prices where member_id=p_member;
 unit:=round((case p_package when 'single' then price.single_price when 'monthly' then price.monthly_price when 'quarterly' then price.quarterly_price when 'annual' then price.annual_price when 'starter' then price.starter_price when 'standard' then price.standard_price when 'premium' then price.premium_price when 'online_monthly' then price.online_monthly_price when 'online_quarterly' then price.online_quarterly_price when 'online_annual' then price.online_annual_price end)*100)::integer;
 if unit is null or unit<=0 then raise exception '请教练先设置有效的专属价格；免费课程请由教练直接入账'; end if;
 if p_expected is distinct from unit then raise exception '专属价格已更新，请刷新后重新确认'; end if;
 if unit::bigint*p_quantity>99999999 then raise exception '订单金额过大，请减少课次数量'; end if;
 select timezone into zone from settings where id=1;
 day:=(now() at time zone zone)::date;
 if p_package in ('monthly','quarterly','annual') and exists(select 1 from monthly_memberships where member_id=p_member and cancelled_at is null and ends_on>=day and starts_on<=(day+make_interval(months => case p_package when 'quarterly' then 3 when 'annual' then 12 else 1 end))::date-1) then raise exception '已有有效或即将开始的包月，请到期后再购买'; end if;
 if p_package like 'online_%' and exists(select 1 from online_memberships where member_id=p_member and cancelled_at is null and ends_on>=day) then raise exception '已有线上服务，请到期后再购买'; end if;
 update payment_orders set status='expired' where member_id=p_member and livemode=p_live and status='pending' and created_at<now()-interval '65 minutes';
 select * into result from payment_orders where member_id=p_member and package=p_package and livemode=p_live and status='pending' order by created_at desc limit 1;
 if found then
  if result.quantity<>p_quantity or result.unit_amount<>unit or result.currency<>price.currency then raise exception '已有不同金额的待支付订单，请先关闭旧订单再购买'; end if;
  return result;
 end if;
 insert into payment_orders(member_id,created_by,package,quantity,unit_amount,amount_total,currency,livemode)
 values(p_member,p_actor,p_package,p_quantity,unit,unit*p_quantity,price.currency,p_live) returning * into result;
 return result;
end; $$;


-- Preserve the fulfillment contract of all previously sold products.
alter function public.settle_payment_order(uuid,text,text,integer,text,boolean,timestamptz) rename to settle_legacy_payment_order;
revoke all on function public.settle_legacy_payment_order(uuid,text,text,integer,text,boolean,timestamptz) from public,anon,authenticated,service_role;
create function public.settle_payment_order(p_order uuid,p_session text,p_intent text,p_amount integer,p_currency text,p_live boolean,p_paid_at timestamptz)
returns text language plpgsql security definer set search_path=public as $$
declare o payment_orders%rowtype; day date; finish date; zone text; notice text; credits integer; months integer;
begin
 select * into o from payment_orders where id=p_order;
 if not found then raise exception '找不到订单'; end if;
 if o.package in ('single','monthly','quarterly','annual') then return settle_legacy_payment_order(p_order,p_session,p_intent,p_amount,p_currency,p_live,p_paid_at); end if;
 perform pg_advisory_xact_lock(hashtextextended(o.member_id::text,240001));
 select * into o from payment_orders where id=p_order for update;
 if p_session is null or p_intent is null or p_paid_at is null or o.amount_total is distinct from p_amount or o.currency is distinct from upper(p_currency) or o.livemode is distinct from p_live or (o.stripe_session_id is not null and o.stripe_session_id<>p_session) or (o.payment_intent is not null and o.payment_intent<>p_intent) then raise exception '付款与订单不匹配'; end if;
 if o.paid_at is not null then return o.fulfillment; end if;
 update payment_orders set status='paid',paid_at=p_paid_at,stripe_session_id=p_session,payment_intent=p_intent,fulfillment=case when p_live then 'fulfilled' else 'test' end where id=o.id;
 if not p_live then return 'test'; end if;
 select timezone into zone from settings where id=1;
 day:=(p_paid_at at time zone zone)::date;
 if o.package in ('starter','standard','premium') then
  credits:=case o.package when 'starter' then 5 when 'standard' then 10 else 20 end;
  finish:=(day+interval '3 months')::date-1;
  insert into session_entries(id,member_id,kind,quantity,note,amount,currency,created_by,expires_on,created_at)
  values(o.id,o.member_id,'purchase',credits,'Stripe 线下课次套餐',o.amount_total/100.0,o.currency,o.created_by,finish,p_paid_at);
  notice:='线下套餐课时已入账：'||credits||' 节，有效至 '||finish||'（含当日）。';
 else
  months:=case o.package when 'online_quarterly' then 3 when 'online_annual' then 12 else 1 end;
  finish:=(day+make_interval(months=>months))::date-1;
  if exists(select 1 from online_memberships where member_id=o.member_id and cancelled_at is null and starts_on<=finish and ends_on>=day) then
   update payment_orders set fulfillment='review',review_note='付款成功，但线上服务日期与已有记录重叠；请教练核对并处理。' where id=o.id;
   notice:='付款已确认，但线上服务日期重叠，请联系教练核对。';
  else
   insert into online_memberships(id,member_id,starts_on,ends_on,note,amount,currency,created_by)
   values(o.id,o.member_id,day,finish,'Stripe 线上指导',o.amount_total/100.0,o.currency,o.created_by);
   notice:='线上指导已开通：'||day||' 至 '||finish||'（含结束日）。不包含线下课程，不自动续费。';
  end if;
 end if;
 update payment_orders set starts_on=day,ends_on=finish where id=o.id;
 insert into email_jobs(recipient_id,subject,body)
 select id,'购课付款已确认','订单：'||o.id||E'\n金额：'||o.currency||' '||to_char(o.amount_total/100.0,'FM999999990.00')||E'\n'||notice from profiles where id=o.member_id or (role='coach' and active);
 return (select fulfillment from payment_orders where id=o.id);
end; $$;
revoke all on function public.settle_payment_order(uuid,text,text,integer,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.settle_payment_order(uuid,text,text,integer,text,boolean,timestamptz) to service_role;
create or replace function public.record_online_membership(p_id uuid,p_member uuid,p_start date,p_end date,p_note text,p_amount numeric default null,p_currency text default 'USD')
returns uuid language plpgsql security definer set search_path=public as $$
declare previous online_memberships%rowtype;
begin
 if not is_coach() then raise exception '仅教练可录入线上服务'; end if;
 if p_id is null or p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then raise exception '请选择有效日期，最长 366 天'; end if;
 if p_note is null or length(trim(p_note))=0 or length(p_note)>2000 then raise exception '请填写线上服务说明（最多 2000 字）'; end if;
 if p_currency is null or p_currency not in ('USD','CNY','CAD','AUD','EUR','GBP') or (p_amount is not null and (p_amount<0 or p_amount>999999.99 or p_amount<>round(p_amount,2))) then raise exception '金额或币种无效'; end if;
 if not exists(select 1 from profiles where id=p_member and role='member') then raise exception '找不到学员'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_member::text,240001));
 select * into previous from online_memberships where id=p_id;
 if found then
  if previous.member_id=p_member and previous.starts_on=p_start and previous.ends_on=p_end and previous.note=p_note and previous.amount is not distinct from p_amount and previous.currency=p_currency then return p_id; end if;
  raise exception '此录入请求已使用，请重新打开窗口';
 end if;
 if exists(select 1 from online_memberships where member_id=p_member and cancelled_at is null and starts_on<=p_end and ends_on>=p_start) then raise exception '有效期与已有线上服务重叠，请核对日期'; end if;
 insert into online_memberships(id,member_id,starts_on,ends_on,note,amount,currency,created_by) values(p_id,p_member,p_start,p_end,p_note,p_amount,p_currency,auth.uid());
 return p_id;
end; $$;

revoke all on function public.record_online_membership(uuid,uuid,date,date,text,numeric,text) from public,anon;
grant execute on function public.record_online_membership(uuid,uuid,date,date,text,numeric,text) to authenticated;
create function public.record_session_credit_with_expiry(p_id uuid,p_member uuid,p_kind text,p_quantity integer,p_note text,p_amount numeric default null,p_currency text default 'USD',p_expiry date default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare previous session_entries%rowtype;
begin
 if not is_coach() then raise exception '仅教练可录入课时'; end if;
 if p_expiry is not null and p_kind<>'purchase' then raise exception '只有购课可设置有效期'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_member::text,240001));
 select * into previous from session_entries where id=p_id;
 if found and previous.expires_on is distinct from p_expiry then raise exception '此录入请求已使用，请重新打开窗口'; end if;
 perform record_session_credit(p_id,p_member,p_kind,p_quantity,p_note,p_amount,p_currency);
 update session_entries set expires_on=p_expiry where id=p_id;
 return p_id;
end; $$;
revoke all on function public.record_session_credit_with_expiry(uuid,uuid,text,integer,text,numeric,text,date) from public,anon;
grant execute on function public.record_session_credit_with_expiry(uuid,uuid,text,integer,text,numeric,text,date) to authenticated;
notify pgrst,'reload schema';
commit;
