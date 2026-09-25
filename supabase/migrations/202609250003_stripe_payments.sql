-- One-time Checkout purchases only. Test payments never affect real entitlements.
begin;
create table if not exists public.payment_orders (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references profiles(id),
 created_by uuid not null references profiles(id),
 package text not null check(package in ('single','monthly')),
 quantity integer not null check(quantity between 1 and 100),
 unit_amount integer not null check(unit_amount>0),
 amount_total integer not null check(amount_total between 1 and 99999999),
 currency text not null check(currency in ('USD','CNY','CAD','AUD','EUR','GBP')),
 livemode boolean not null,
 status text not null default 'pending' check(status in ('pending','paid','expired','refunded','partial_refund')),
 stripe_session_id text unique, payment_intent text unique,
 created_at timestamptz not null default now(), paid_at timestamptz,
 starts_on date, ends_on date,
 fulfillment text not null default 'pending' check(fulfillment in ('pending','fulfilled','test','review')),
 review_note text not null default '',
 amount_refunded integer not null default 0 check(amount_refunded>=0 and amount_refunded<=amount_total),
 check(amount_total=unit_amount*quantity), check(package<>'monthly' or quantity=1)
);
create index if not exists payment_orders_member on payment_orders(member_id,created_at desc);
alter table payment_orders enable row level security;
revoke all on payment_orders from anon,authenticated;
grant select on payment_orders to authenticated;
grant all on payment_orders to service_role;
drop policy if exists payment_orders_read on payment_orders;
create policy payment_orders_read on payment_orders for select to authenticated using(is_coach() or (is_active() and member_id=auth.uid() and livemode));

create or replace function public.prepare_payment_order(p_member uuid,p_actor uuid,p_package text,p_quantity integer,p_expected integer,p_live boolean)
returns public.payment_orders language plpgsql security definer set search_path=public as $$
declare result payment_orders%rowtype; price member_prices%rowtype; unit integer; day date; zone text;
begin
 if p_package is null or p_package not in ('single','monthly') or p_quantity is null or p_quantity not between 1 and 100 or (p_package='monthly' and p_quantity<>1) or p_live is null then raise exception '购课选项无效'; end if;
 if not exists(select 1 from profiles where id=p_member and role='member' and active) then raise exception '学员账号无效'; end if;
 if not exists(select 1 from profiles where id=p_actor and active and (id=p_member or role='coach')) then raise exception '无权购买'; end if;
 if not p_live and not exists(select 1 from profiles where id=p_actor and active and role='coach') then raise exception '仅教练可测试支付'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_member::text,240001));
 select * into price from member_prices where member_id=p_member;
 unit:=round((case when p_package='single' then price.single_price else price.monthly_price end)*100)::integer;
 if unit is null or unit<=0 then raise exception '请教练先设置有效的专属价格；免费课程请由教练直接入账'; end if;
 if p_expected is distinct from unit then raise exception '专属价格已更新，请刷新后重新确认'; end if;
 if unit::bigint*p_quantity>99999999 then raise exception '订单金额过大，请减少课次数量'; end if;
 select timezone into zone from settings where id=1;
 day:=(now() at time zone zone)::date;
 if p_package='monthly' and exists(select 1 from monthly_memberships where member_id=p_member and cancelled_at is null and ends_on>=day and starts_on<=(day+interval '1 month')::date-1) then raise exception '已有有效或即将开始的包月，请到期后再购买'; end if;
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

create or replace function public.settle_payment_order(p_order uuid,p_session text,p_intent text,p_amount integer,p_currency text,p_live boolean,p_paid_at timestamptz)
returns text language plpgsql security definer set search_path=public as $$
declare o payment_orders%rowtype; day date; finish date; zone text; notice text;
begin
 select * into o from payment_orders where id=p_order;
 if not found then raise exception '找不到订单'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o.member_id::text,240001));
 select * into o from payment_orders where id=p_order for update;
 if p_session is null or p_intent is null or p_paid_at is null or o.amount_total is distinct from p_amount or o.currency is distinct from upper(p_currency) or o.livemode is distinct from p_live or (o.stripe_session_id is not null and o.stripe_session_id<>p_session) or (o.payment_intent is not null and o.payment_intent<>p_intent) then raise exception '付款与订单不匹配'; end if;
 if o.paid_at is not null then return o.fulfillment; end if;
 update payment_orders set status='paid',paid_at=p_paid_at,stripe_session_id=p_session,payment_intent=p_intent,fulfillment=case when p_live then 'fulfilled' else 'test' end where id=o.id;
 if not p_live then return 'test'; end if;
 if o.package='single' then
  insert into session_entries(id,member_id,kind,quantity,note,amount,currency,created_by)
  values(o.id,o.member_id,'purchase',o.quantity,'Stripe 在线购课 · '||o.id,o.amount_total/100.0,o.currency,o.created_by);
  notice:='已增加 '||o.quantity||' 节按次课时。';
 else
  select timezone into zone from settings where id=1;
  day:=(p_paid_at at time zone zone)::date; finish:=(day+interval '1 month')::date-1;
  if exists(select 1 from monthly_memberships where member_id=o.member_id and cancelled_at is null and starts_on<=finish and ends_on>=day) then
   update payment_orders set fulfillment='review',review_note='付款成功，但包月日期与已有记录重叠；请教练核对并处理。' where id=o.id;
   notice:='付款已确认，但包月日期与已有记录重叠，请联系教练核对。';
  else
   insert into monthly_memberships(id,member_id,starts_on,ends_on,note,amount,currency,created_by)
   values(o.id,o.member_id,day,finish,'Stripe 在线购课（单月，不自动续费）',o.amount_total/100.0,o.currency,o.created_by);
   update payment_orders set starts_on=day,ends_on=finish where id=o.id;
   notice:='不限次数包月已开通：'||day||' 至 '||finish||'（美西日期，含结束日）。到期后需手动购买，不自动续费。';
  end if;
 end if;
 insert into email_jobs(recipient_id,subject,body)
 select id,'购课付款已确认','订单：'||o.id||E'\n金额：'||o.currency||' '||to_char(o.amount_total/100.0,'FM999999990.00')||E'\n'||notice
 from profiles where id=o.member_id or (role='coach' and active);
 return (select fulfillment from payment_orders where id=o.id);
end; $$;

create or replace function public.note_payment_refund(p_order uuid,p_intent text,p_amount integer,p_live boolean)
returns void language plpgsql security definer set search_path=public as $$
declare o payment_orders%rowtype;
begin
 select * into o from payment_orders where id=p_order for update;
 if not found or o.paid_at is null then raise exception '付款尚未入账，请稍后重试'; end if;
 if o.payment_intent is distinct from p_intent or o.livemode is distinct from p_live or p_amount is null or p_amount<0 or p_amount>o.amount_total then raise exception '退款与订单不匹配'; end if;
 if p_amount<=o.amount_refunded then return; end if;
 update payment_orders set amount_refunded=p_amount,status=case when p_amount=o.amount_total then 'refunded' else 'partial_refund' end,fulfillment=case when livemode then 'review' else 'test' end,review_note='Stripe 已退款；课时或包月需教练核对并手动调整，系统未自动删除历史。' where id=o.id;
 if p_live then
  insert into email_jobs(recipient_id,subject,body) select id,'退款后需核对课时','订单：'||o.id||E'\n退款已记录，请核对学员课时或包月并手动调整，历史记录保留。' from profiles where role='coach' and active;
 end if;
end; $$;
revoke all on function public.prepare_payment_order(uuid,uuid,text,integer,integer,boolean),public.settle_payment_order(uuid,text,text,integer,text,boolean,timestamptz),public.note_payment_refund(uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.prepare_payment_order(uuid,uuid,text,integer,integer,boolean),public.settle_payment_order(uuid,text,text,integer,text,boolean,timestamptz),public.note_payment_refund(uuid,text,integer,boolean) to service_role;
notify pgrst,'reload schema';
commit;
