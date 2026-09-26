begin;
alter table public.member_prices add column quarterly_price numeric(12,2) check(quarterly_price between 0 and 999999.99), add column annual_price numeric(12,2) check(annual_price between 0 and 999999.99);
alter table public.payment_orders drop constraint payment_orders_package_check;
alter table public.payment_orders add constraint payment_orders_package_check check(package in ('single','monthly','quarterly','annual'));
alter table public.payment_orders add constraint membership_quantity_check check(package='single' or quantity=1);
create function public.save_member_package_prices(p_member uuid,p_single numeric,p_monthly numeric,p_quarterly numeric,p_annual numeric,p_currency text default 'USD') returns void language plpgsql security definer set search_path=public as $$
begin
 perform save_member_prices(p_member,p_single,p_monthly,p_currency);
 if p_quarterly<0 or p_quarterly>999999.99 or p_annual<0 or p_annual>999999.99 or p_quarterly<>round(p_quarterly,2) or p_annual<>round(p_annual,2) then raise exception '价格无效'; end if;
 update member_prices set quarterly_price=p_quarterly,annual_price=p_annual where member_id=p_member;
end; $$;
revoke all on function public.save_member_package_prices(uuid,numeric,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.save_member_package_prices(uuid,numeric,numeric,numeric,numeric,text) to authenticated;
create function public.reschedule_new_slot(p_appointment uuid,p_start timestamptz,p_end timestamptz,p_message text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare a appointments%rowtype; previous slots%rowtype; new_slot uuid;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 perform pg_advisory_xact_lock(9012026);
 select * into a from appointments where id=p_appointment for update;
 if not found or a.status<>'booked' then raise exception '课程不可改期'; end if;
 select * into previous from slots where id=a.slot_id for update;
 if previous.starts_at=p_start and previous.ends_at=p_end then raise exception '请选择不同的时间'; end if;
 -- When shifting within the original time, retire the old slot atomically.
 if previous.starts_at<p_end and previous.ends_at>p_start then update slots set active=false where id=previous.id; end if;
 new_slot:=save_slot(p_start,p_end);
 return manage_booking('reschedule',new_slot,p_appointment,null,p_message);
end; $$;
revoke all on function public.reschedule_new_slot(uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.reschedule_new_slot(uuid,timestamptz,timestamptz,text) to authenticated;
create or replace function public.prepare_payment_order(p_member uuid,p_actor uuid,p_package text,p_quantity integer,p_expected integer,p_live boolean)
returns public.payment_orders language plpgsql security definer set search_path=public as $$
declare result payment_orders%rowtype; price member_prices%rowtype; unit integer; day date; zone text;
begin
 if p_package is null or p_package not in ('single','monthly','quarterly','annual') or p_quantity is null or p_quantity not between 1 and 100 or (p_package<>'single' and p_quantity<>1) or p_live is null then raise exception '购课选项无效'; end if;
 if not exists(select 1 from profiles where id=p_member and role='member' and active) then raise exception '学员账号无效'; end if;
 if not exists(select 1 from profiles where id=p_actor and active and (id=p_member or role='coach')) then raise exception '无权购买'; end if;
 if not p_live and not exists(select 1 from profiles where id=p_actor and active and role='coach') then raise exception '仅教练可测试支付'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_member::text,240001));
 select * into price from member_prices where member_id=p_member;
 unit:=round((case p_package when 'single' then price.single_price when 'monthly' then price.monthly_price when 'quarterly' then price.quarterly_price when 'annual' then price.annual_price end)*100)::integer;
 if unit is null or unit<=0 then raise exception '请教练先设置有效的专属价格；免费课程请由教练直接入账'; end if;
 if p_expected is distinct from unit then raise exception '专属价格已更新，请刷新后重新确认'; end if;
 if unit::bigint*p_quantity>99999999 then raise exception '订单金额过大，请减少课次数量'; end if;
 select timezone into zone from settings where id=1;
 day:=(now() at time zone zone)::date;
 if p_package<>'single' and exists(select 1 from monthly_memberships where member_id=p_member and cancelled_at is null and ends_on>=day and starts_on<=(day+make_interval(months => case p_package when 'quarterly' then 3 when 'annual' then 12 else 1 end))::date-1) then raise exception '已有有效或即将开始的包月，请到期后再购买'; end if;
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
  day:=(p_paid_at at time zone zone)::date; finish:=(day+make_interval(months => case o.package when 'quarterly' then 3 when 'annual' then 12 else 1 end))::date-1;
  if exists(select 1 from monthly_memberships where member_id=o.member_id and cancelled_at is null and starts_on<=finish and ends_on>=day) then
   update payment_orders set fulfillment='review',review_note='付款成功，但包月日期与已有记录重叠；请教练核对并处理。' where id=o.id;
   notice:='付款已确认，但包月日期与已有记录重叠，请联系教练核对。';
  else
   insert into monthly_memberships(id,member_id,starts_on,ends_on,note,amount,currency,created_by)
   values(o.id,o.member_id,day,finish,'Stripe 在线购课（'||(case o.package when 'quarterly' then 3 when 'annual' then 12 else 1 end)||' 个月，不自动续费）',o.amount_total/100.0,o.currency,o.created_by);
   update payment_orders set starts_on=day,ends_on=finish where id=o.id;
   notice:='不限次数包月已开通：'||day||' 至 '||finish||'（美西日期，含结束日）。到期后需手动购买，不自动续费。';
  end if;
 end if;
 insert into email_jobs(recipient_id,subject,body)
 select id,'购课付款已确认','订单：'||o.id||E'\n金额：'||o.currency||' '||to_char(o.amount_total/100.0,'FM999999990.00')||E'\n'||notice
 from profiles where id=o.member_id or (role='coach' and active);
 return (select fulfillment from payment_orders where id=o.id);
end; $$;


commit;
