-- Preserve historical kilogram storage; the UI and new RPC use pounds/inches.
begin;
alter table public.records add column if not exists measurements jsonb not null default '{}'::jsonb;
alter table public.records drop constraint if exists records_measurements_object;
alter table public.records add constraint records_measurements_object check(jsonb_typeof(measurements)='object');
create or replace function public.save_record_us(p_member uuid,p_date date,p_weight_lbs numeric,p_fat numeric,p_notes text,p_shared boolean,p_measurements jsonb default '{}',p_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid; old_weight numeric; stored_weight numeric; item record; val numeric; minimum numeric; maximum numeric;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 if not exists(select 1 from profiles where id=p_member and role='member') then raise exception '找不到学员'; end if;
 if p_weight_lbs is not null and (p_weight_lbs<1 or p_weight_lbs>1100) then raise exception '体重须在 1–1100 lb 之间'; end if;
 if p_measurements is null or jsonb_typeof(p_measurements)<>'object' then raise exception '测量数据格式无效'; end if;
 for item in select key,value from jsonb_each(p_measurements) loop
  if item.key not in ('height_in','waist_in','hips_in','chest_in','arm_in','thigh_in','resting_hr','sleep_hours') or jsonb_typeof(item.value)<>'number' then raise exception '测量项目或数值无效'; end if;
  val:=(item.value #>> '{}')::numeric;
  minimum:=case item.key when 'height_in' then 12 when 'resting_hr' then 20 when 'sleep_hours' then 0 else 1 end;
  maximum:=case item.key when 'height_in' then 108 when 'arm_in' then 50 when 'thigh_in' then 80 when 'resting_hr' then 250 when 'sleep_hours' then 24 else 120 end;
  if val<minimum or val>maximum then raise exception '测量值超出范围：%',item.key; end if;
 end loop;
 if p_id is not null then
  select weight into old_weight from records where id=p_id and member_id=p_member and deleted_at is null for update;
  if not found then raise exception '档案归属不匹配或已删除'; end if;
 end if;
 -- Saving other fields must not repeatedly round an unchanged historical weight.
 stored_weight:=case when p_weight_lbs is null then null when old_weight is not null and p_weight_lbs=round(old_weight/0.45359237,1) then old_weight else p_weight_lbs*0.45359237 end;
 if p_id is null then
  insert into records(member_id,recorded_on,weight,body_fat,notes,shared,measurements) values(p_member,p_date,stored_weight,p_fat,p_notes,p_shared,p_measurements) returning id into result;
 else
  update records set recorded_on=p_date,weight=stored_weight,body_fat=p_fat,notes=p_notes,shared=p_shared,measurements=p_measurements where id=p_id returning id into result;
 end if;
 return result;
end; $$;
revoke all on function public.save_record_us(uuid,date,numeric,numeric,text,boolean,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_record_us(uuid,date,numeric,numeric,text,boolean,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
