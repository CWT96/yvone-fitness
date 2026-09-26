-- Member preference is independent of timezone and is editable only by its owner.
begin;
alter table public.profiles add column if not exists language text check (language in ('zh','en'));
create or replace function public.initial_profile_language() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 select case when raw_user_meta_data->>'language' in ('zh','en') then raw_user_meta_data->>'language' else null end
 into new.language from auth.users where id=new.id;
 return new;
end; $$;
drop trigger if exists profile_initial_language on public.profiles;
create trigger profile_initial_language before insert on public.profiles for each row execute function public.initial_profile_language();
revoke all on function public.initial_profile_language() from public,anon,authenticated;
create or replace function public.set_member_language(p_language text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_active() then raise exception 'Please log in to an active account'; end if;
 if p_language is null or p_language not in ('zh','en') then raise exception 'Unsupported language'; end if;
 update public.profiles set language=p_language where id=auth.uid() and role='member';
 if not found then raise exception 'Only members can change their language'; end if;
 update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('language',p_language) where id=auth.uid();
end; $$;
revoke all on function public.set_member_language(text) from public,anon;
grant execute on function public.set_member_language(text) to authenticated;
commit;
