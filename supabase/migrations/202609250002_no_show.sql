-- No show is coach-only after the scheduled end. Single-session no shows cost
-- one credit; monthly no shows record zero. Existing history is untouched.
begin;
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check check(status in ('booked','cancelled','completed','no_show'));
drop index if exists public.one_booking_per_slot;
create unique index one_booking_per_slot on public.appointments(slot_id) where status in ('booked','completed','no_show');
alter table public.session_entries drop constraint if exists session_entries_kind_check;
alter table public.session_entries add constraint session_entries_kind_check check(kind in ('purchase','adjustment','lesson','monthly_lesson','no_show','monthly_no_show'));
alter table public.session_entries drop constraint if exists session_entries_check;
alter table public.session_entries add constraint session_entries_check check (
 (kind='purchase' and quantity>0 and appointment_id is null and membership_id is null)
 or (kind='adjustment' and quantity<>0 and appointment_id is null and membership_id is null and amount is null)
 or (kind in ('lesson','no_show') and quantity=-1 and appointment_id is not null and membership_id is null and amount is null)
 or (kind in ('monthly_lesson','monthly_no_show') and quantity=0 and appointment_id is not null and membership_id is not null and amount is null)
);
create or replace function public.get_schedule() returns table(id uuid,starts_at timestamptz,ends_at timestamptz,available boolean) language sql stable security definer set search_path=public as $$
 select s.id,s.starts_at,s.ends_at,not exists(select 1 from appointments a where a.slot_id=s.id and a.status in ('booked','completed','no_show'))
 from slots s where is_active() and s.active and s.starts_at>now() order by s.starts_at;
$$;
create or replace function public.charge_completed_session()
returns trigger language plpgsql security definer set search_path=public as $$
declare covered uuid; lesson_date date; studio_zone text;
begin
 if new.status not in ('completed','no_show') or old.status<>'booked' then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.member_id::text,240001));
 select timezone into studio_zone from settings where id=1;
 select (starts_at at time zone coalesce(studio_zone,'America/Los_Angeles'))::date into lesson_date from slots where id=new.slot_id;
 select id into covered from monthly_memberships where member_id=new.member_id and cancelled_at is null and starts_on<=lesson_date and ends_on>=lesson_date order by starts_on limit 1;
 insert into session_entries(member_id,kind,quantity,note,appointment_id,membership_id,created_by)
 values(new.member_id,case when new.status='no_show' then case when covered is null then 'no_show' else 'monthly_no_show' end else case when covered is null then 'lesson' else 'monthly_lesson' end end,case when covered is null then -1 else 0 end,
 case when new.status='no_show' then case when covered is null then '未到场，扣除 1 节' else '包月内未到场，只记缺席，不扣按次课时' end else case when covered is null then '完成课程，扣除 1 节' else '包月内完成课程，不扣按次课时' end end,new.id,covered,auth.uid())
 on conflict(appointment_id) do nothing;
 return new;
end; $$;
create or replace function public.manage_booking(p_action text,p_slot uuid default null,p_appointment uuid default null,p_member uuid default null,p_message text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid; result uuid; existing appointments%rowtype; selected slots%rowtype; old_slot slots%rowtype; coach_id uuid; title text; notice_body text; notice_zone text; notice_location text; member_name text;
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
  if existing.status<>'booked' then raise exception '预约已取消或已完成／已标记未到场'; end if;
  select * into old_slot from slots where id=existing.slot_id;
  if old_slot.starts_at<=now() and not is_coach() then raise exception '课程已开始，请联系教练'; end if;
  target:=existing.member_id;
 end if;
 if p_action in ('book','reschedule') then
  select * into selected from slots where id=p_slot and active for update;
  if not found or selected.starts_at<=now() then raise exception '时间段不可预约'; end if;
  if p_action='reschedule' and p_slot=existing.slot_id then raise exception '请选择不同的时间段'; end if;
  if exists(select 1 from appointments where slot_id=p_slot and status in ('booked','completed','no_show')) then raise exception '这个时间已被预约，请选择其他时段'; end if;
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
 elsif p_action='no_show' then
  if not is_coach() then raise exception '仅教练可标记未到场'; end if;
  if old_slot.ends_at>now() then raise exception '课程结束后才能标记未到场'; end if;
  update appointments set status='no_show',reason=p_message where id=p_appointment returning id into result; title:='课程未到场（No show）';
 else raise exception '操作无效'; end if;
 insert into appointment_events(appointment_id,actor_id,action,message,details) values(result,auth.uid(),p_action,p_message,
  jsonb_build_object('old_start',old_slot.starts_at,'new_start',selected.starts_at));
 update email_jobs set state='skipped' where appointment_id=result and kind='reminder' and state in ('pending','processing');
 select id into coach_id from profiles where role='coach' and active;
 select timezone,location into notice_zone,notice_location from settings where id=1;
 select full_name into member_name from profiles where id=target;
 notice_body:='学员：' || member_name || E'\n';
 if p_action='reschedule' then
  notice_body:=notice_body || '原时间：' || public.training_time_label(old_slot.starts_at,old_slot.ends_at,notice_zone) || E'\n'
   || '新时间：' || public.training_time_label(selected.starts_at,selected.ends_at,notice_zone);
 elsif p_action='book' then
  notice_body:=notice_body || '训练时间：' || public.training_time_label(selected.starts_at,selected.ends_at,notice_zone);
 else
  notice_body:=notice_body || case when p_action='cancel' then '已取消时间：' else '训练时间：' end
   || public.training_time_label(old_slot.starts_at,old_slot.ends_at,notice_zone);
 end if;
 notice_body:=notice_body || E'\n时区：' || notice_zone || E'\n地点：' || notice_location;
 if p_action='no_show' then
  notice_body:=notice_body || E'\n结果：未到场（No show），不计入完成次数和训练时长。' || E'\n课时结算：' ||
   (select note from session_entries where appointment_id=result);
 end if;
 if nullif(trim(p_message),'') is not null then
  notice_body:=notice_body || E'\n' || case when p_action='no_show' then '缺席备注：' when p_action in ('reschedule','cancel') then '原因：' else '留言：' end || trim(p_message);
 end if;
 insert into email_jobs(recipient_id,appointment_id,subject,body) select p.id,result,title,
 notice_body from profiles p where p.id in (target,coach_id);
 if p_action in ('book','reschedule') then
  insert into email_jobs(recipient_id,appointment_id,subject,body,kind,due_at) select p.id,result,'训练提醒',
  '学员：' || member_name || E'\n训练时间：' || public.training_time_label(selected.starts_at,selected.ends_at,notice_zone) || E'\n时区：' || notice_zone || E'\n地点：' || notice_location,'reminder',greatest(now()+interval '1 minute',selected.starts_at-interval '24 hours')
  from profiles p where p.id in (target,coach_id);
 end if;
 return result;
end; $$;

notify pgrst,'reload schema';
commit;
