-- DBS base: admin, profiles, and who has DBS access. Applied by the migrate workflow (scripts/migrate.sh).
-- Simon (simonapps@gmail.com) becomes the admin automatically when his account is created. Everyone else joins
-- with the week's join code (0002) and can't open any tool until the admin ticks "DBS access" on /admin.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;  -- no policies: invisible through the API

insert into public.admins (user_id)
select id from auth.users where lower(email) = 'simonapps@gmail.com'
on conflict do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- People with DBS access (the admin always has it).
create table if not exists public.members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.members enable row level security;
drop policy if exists "members read" on public.members;
create policy "members read" on public.members for select using (user_id = auth.uid() or (select public.is_admin()));

-- Kept with the app-slug argument so the tools' code and policies read the same as in the household apps.
create or replace function public.has_app_access(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and p_slug = 'dbs' and (
    public.is_admin() or exists (select 1 from public.members m where m.user_id = auth.uid())
  );
$$;

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  updated_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles select own" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles select own" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admin page: everyone, with their name and access.
create or replace function public.admin_list_users()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, display_name text, is_admin_user boolean, has_access boolean)
language sql stable security definer set search_path = public as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, coalesce(p.display_name, ''),
         exists (select 1 from public.admins a where a.user_id = u.id),
         exists (select 1 from public.members m where m.user_id = u.id)
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where public.is_admin()
  order by u.created_at;
$$;

create or replace function public.admin_set_access(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_on then insert into public.members (user_id) values (p_user) on conflict do nothing;
  else delete from public.members where user_id = p_user;
  end if;
end $$;

-- The first account for simonapps@gmail.com becomes the admin.
create or replace function public.dbs_first_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'simonapps@gmail.com' and not exists (select 1 from public.admins) then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists dbs_first_admin on auth.users;
create trigger dbs_first_admin after insert on auth.users for each row execute function public.dbs_first_admin();

revoke all on function public.is_admin() from public, anon;
revoke all on function public.has_app_access(text) from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_access(uuid, boolean) from public, anon;
revoke all on function public.dbs_first_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_app_access(text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_access(uuid, boolean) to authenticated;
