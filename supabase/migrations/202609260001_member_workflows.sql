begin;
-- Snapshot only the signup name; never expose another member's profile/email.
alter table public.referrals add column if not exists referred_name text not null default '';
update public.referrals r set referred_name=coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),p.full_name,'新学员') from auth.users u join public.profiles p on p.id=u.id where r.referred_id=u.id and r.referred_name='';
create or replace function public.snapshot_referral_name() returns trigger language plpgsql security definer set search_path=public as $$
begin
 select full_name into new.referred_name from profiles where id=new.referred_id;
 new.referred_name:=coalesce(new.referred_name,'新学员'); return new;
end; $$;
create trigger referral_signup_name before insert on public.referrals for each row execute function public.snapshot_referral_name();
revoke all on function public.snapshot_referral_name() from public,anon,authenticated;
-- One transaction: failure to book rolls back the newly-created slot.
create or replace function public.book_new_slot(p_member uuid,p_start timestamptz,p_end timestamptz,p_message text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare slot_id uuid;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 slot_id:=save_slot(p_start,p_end);
 return manage_booking('book',slot_id,null,p_member,p_message);
end; $$;
revoke all on function public.book_new_slot(uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.book_new_slot(uuid,timestamptz,timestamptz,text) to authenticated;
commit;
