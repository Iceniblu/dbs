-- Join codes: new people create their own account at /join with a code of three capitalised words run together
-- ("MapleRiverTeapot", typed in any case) that only the admin sees (on /admin). A new code starts each Monday (Sydney time) and is accepted for two weeks, so last week's code
-- keeps working for a week of grace. The check runs inside the database, on every new account, so it can't be
-- skipped from the browser. Accounts created with Supabase's "Invite user" still work without a code.
--
-- Needs, once, in the Supabase dashboard: Authentication → Sign In / Providers → "Allow new users to sign up" ON
-- (keep "Confirm email" ON). This trigger is what keeps sign-up closed to anyone without a current code.

create table if not exists public.join_codes (
  id         bigint generated always as identity primary key,
  code       text not null,             -- e.g. "MapleRiverTeapot"; matched case-insensitively
  week_start date not null,              -- the Monday (Sydney) this code was made for
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,       -- week_start + 14 days, or earlier if the admin stopped it
  uses       int not null default 0,
  max_uses   int not null default 10     -- a leaked code can't fill the site with accounts
);
create unique index if not exists join_codes_code_lower on public.join_codes (lower(code));
alter table public.join_codes enable row level security;  -- no policies: only the functions below touch it

-- Short, common, easy-to-say words (no homophones or look-alikes that trip people up when read out).
create or replace function public.join_words()
returns text[] language sql immutable set search_path = public as $$
  select array[
    'acorn','actor','amber','anchor','apple','apron','arrow','attic','badge','bagel','baker','bamboo','banjo','barley',
    'basket','beach','beacon','berry','bison','blanket','blossom','bottle','branch','breeze','brick','bridge','brook',
    'bubble','bucket','buffalo','bundle','butter','button','cabin','cactus','camel','candle','canoe','canyon','captain',
    'carpet','carrot','castle','cedar','cello','chalk','cherry','chess','cider','circle','citrus','clover','cobalt',
    'coconut','comet','compass','copper','coral','cotton','cricket','crystal','cupcake','dahlia','daisy','denim',
    'desert','diamond','dinner','dolphin','donkey','dragon','drum','eagle','echo','elbow','ember','emerald','engine',
    'falcon','feather','fern','fiddle','finch','flame','flute','forest','fossil','fountain','fox','galaxy','garden',
    'garlic','ginger','glacier','globe','goose','granite','grape','gravel','guitar','hammer','hammock','harvest',
    'hazel','hedge','helmet','heron','hollow','honey','horizon','iceberg','igloo','island','ivory','jacket','jasmine',
    'jelly','jigsaw','jungle','kayak','kettle','kitten','koala','ladder','lagoon','lantern','lemon','lily','lion',
    'lizard','lobster','locket','magnet','mango','maple','marble','meadow','melon','mirror','mitten','monkey','moose',
    'mosaic','muffin','nectar','needle','nugget','nutmeg','oasis','ocean','olive','onion','orange','orbit','orchid',
    'otter','oyster','paddle','palace','panda','parrot','peach','pebble','pelican','pencil','pepper','piano','pickle',
    'pigeon','pillow','pine','planet','plum','pocket','pony','potato','puffin','pumpkin','puzzle','quilt','rabbit',
    'radish','raven','ribbon','river','robin','rocket','saddle','salmon','sandal','saturn','scarf','shadow','shell',
    'silver','sketch','sparrow','spider','sponge','spoon','squash','squirrel','stone','storm','sugar','summit',
    'sunset','swan','table','teapot','thistle','thunder','tiger','timber','toast','tomato','topaz','torch','tractor',
    'trumpet','tulip','tunnel','turtle','umbrella','valley','velvet','violet','violin','volcano','wagon','walnut',
    'walrus','whale','willow','window','winter','wizard','wombat','yogurt','zebra','zigzag'
  ];
$$;

-- A random index 0..n-1 from the crypto-random UUID generator.
create or replace function public.join_pick(n int)
returns int language sql volatile set search_path = public as $$
  select ((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint) % n)::int;
$$;

-- Three different words, capitalised and run together, e.g. "MapleRiverTeapot".
create or replace function public.join_new_code()
returns text language plpgsql volatile set search_path = public as $$
declare w text[] := public.join_words(); n int := array_length(w, 1); a int; b int; c int;
begin
  a := public.join_pick(n);
  loop b := public.join_pick(n); exit when b <> a; end loop;
  loop c := public.join_pick(n); exit when c <> a and c <> b; end loop;
  return initcap(w[a + 1]) || initcap(w[b + 1]) || initcap(w[c + 1]);
end $$;


create or replace function public.join_tidy(p text)
returns text language sql immutable set search_path = public as $$
  select lower(regexp_replace(coalesce(p, ''), '[^A-Za-z]+', '', 'g'));
$$;

create or replace function public.join_this_week()
returns date language sql stable set search_path = public as $$
  select date_trunc('week', now() at time zone 'Australia/Sydney')::date;  -- Monday
$$;

-- Make this week's code if there isn't one yet.
create or replace function public.join_ensure_code()
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_week date := public.join_this_week();
begin
  if exists (select 1 from public.join_codes where week_start = v_week and expires_at > now()) then return; end if;
  for i in 1..10 loop
    begin
      insert into public.join_codes (code, week_start, expires_at)
      values (public.join_new_code(), v_week, (v_week + 14)::timestamp at time zone 'Australia/Sydney');
      return;
    exception when unique_violation then null;  -- the same three words came up before: try again
    end;
  end loop;
  raise exception 'Could not make a join code';
end $$;

-- Admin panel: the codes that are accepted right now (this week's first), making this week's if needed.
create or replace function public.admin_join_codes()
returns table (code text, week_start date, expires_at timestamptz, uses int, max_uses int, is_current boolean)
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  perform public.join_ensure_code();
  return query
    select j.code, j.week_start, j.expires_at, j.uses, j.max_uses, j.week_start = public.join_this_week()
    from public.join_codes j
    where j.expires_at > now()
    order by j.week_start desc, j.created_at desc;
end $$;

-- Admin panel: stop every code that's still accepted (e.g. one was shared too widely) and make a fresh one.
create or replace function public.admin_join_codes_reset()
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.join_codes set expires_at = now() where expires_at > now();
  perform public.join_ensure_code();
end $$;

-- Runs before every new account is saved. Sign-up passes the code in the user metadata as join_code;
-- it is checked, counted, and then removed so it isn't stored with the account.
create or replace function public.join_code_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if new.invited_at is not null then return new; end if;  -- invited from the Supabase dashboard
  if lower(new.email) = 'simonapps@gmail.com' and not exists (select 1 from public.admins) then return new; end if;  -- first admin
  select id into v_id from public.join_codes
   where lower(code) = public.join_tidy(new.raw_user_meta_data ->> 'join_code')
     and expires_at > now() and uses < max_uses
   for update;
  if v_id is null then raise exception 'join_code_invalid'; end if;
  update public.join_codes set uses = uses + 1 where id = v_id;
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'join_code';
  return new;
end $$;

-- After the account exists: start their profile with the name they typed on /join.
create or replace function public.join_new_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 40);
begin
  if v_name <> '' then
    insert into public.profiles (user_id, display_name) values (new.id, v_name) on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists join_code_gate on auth.users;
create trigger join_code_gate before insert on auth.users for each row execute function public.join_code_gate();
drop trigger if exists join_new_profile on auth.users;
create trigger join_new_profile after insert on auth.users for each row execute function public.join_new_profile();

revoke all on function public.join_words() from public, anon, authenticated;
revoke all on function public.join_pick(int) from public, anon, authenticated;
revoke all on function public.join_new_code() from public, anon, authenticated;
revoke all on function public.join_tidy(text) from public, anon, authenticated;
revoke all on function public.join_this_week() from public, anon, authenticated;
revoke all on function public.join_ensure_code() from public, anon, authenticated;
revoke all on function public.join_code_gate() from public, anon, authenticated;
revoke all on function public.join_new_profile() from public, anon, authenticated;
revoke all on function public.admin_join_codes() from public, anon;
revoke all on function public.admin_join_codes_reset() from public, anon;
grant execute on function public.admin_join_codes() to authenticated;
grant execute on function public.admin_join_codes_reset() to authenticated;
