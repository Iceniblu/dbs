-- DBS supplier database: brands, the suppliers that sell them, and contacts for both.
-- Each brand and supplier has one main contact; each person can pick their own preferred contact.
-- The datasheet generator fills the Supplier row from a brand, using supplier contacts only
-- ("Modular" / "Contact Ben Moth @ Modular Partners: 0414 191 288"). Access: has_app_access('dbs').

create table if not exists public.dbs_suppliers (
  id         bigint generated always as identity primary key,
  name       text not null check (length(trim(name)) > 0),
  phone      text not null default '',
  email      text not null default '',
  website    text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists dbs_suppliers_name_key on public.dbs_suppliers (lower(trim(name)));

create table if not exists public.dbs_brands (
  id          bigint generated always as identity primary key,
  name        text not null check (length(trim(name)) > 0),
  aliases     text[] not null default '{}',   -- other names the brand appears under, for matching imports
  supplier_id bigint references public.dbs_suppliers (id) on delete set null,
  website     text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists dbs_brands_name_key on public.dbs_brands (lower(trim(name)));
create index if not exists dbs_brands_supplier_idx on public.dbs_brands (supplier_id);

-- A contact belongs to exactly one supplier or one brand. "phone" is their mobile.
create table if not exists public.dbs_contacts (
  id          bigint generated always as identity primary key,
  supplier_id bigint references public.dbs_suppliers (id) on delete cascade,
  brand_id    bigint references public.dbs_brands (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  title       text not null default '',
  phone       text not null default '',
  email       text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint dbs_contacts_owner check ((supplier_id is null) <> (brand_id is null))
);
create index if not exists dbs_contacts_supplier_idx on public.dbs_contacts (supplier_id);
create index if not exists dbs_contacts_brand_idx on public.dbs_contacts (brand_id);

alter table public.dbs_suppliers add column if not exists main_contact_id bigint references public.dbs_contacts (id) on delete set null;
alter table public.dbs_brands add column if not exists main_contact_id bigint references public.dbs_contacts (id) on delete set null;

-- Each person's preferred contact for a brand or a supplier (only their own rows are visible).
create table if not exists public.dbs_contact_prefs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_id    bigint references public.dbs_brands (id) on delete cascade,
  supplier_id bigint references public.dbs_suppliers (id) on delete cascade,
  contact_id  bigint not null references public.dbs_contacts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  check ((brand_id is null) <> (supplier_id is null))
);
create unique index if not exists dbs_contact_prefs_brand on public.dbs_contact_prefs (user_id, brand_id) where brand_id is not null;
create unique index if not exists dbs_contact_prefs_supplier on public.dbs_contact_prefs (user_id, supplier_id) where supplier_id is not null;

alter table public.dbs_suppliers enable row level security;
alter table public.dbs_brands enable row level security;
alter table public.dbs_contacts enable row level security;
alter table public.dbs_contact_prefs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['dbs_suppliers', 'dbs_contacts', 'dbs_brands'] loop
    execute format('drop policy if exists "dbs access" on public.%I', t);
    execute format('create policy "dbs access" on public.%I for all using ((select public.has_app_access(%L))) with check ((select public.has_app_access(%L)))', t, 'dbs', 'dbs');
  end loop;
end $$;
drop policy if exists "own prefs" on public.dbs_contact_prefs;
create policy "own prefs" on public.dbs_contact_prefs for all
  using (user_id = auth.uid() and (select public.has_app_access('dbs')))
  with check (user_id = auth.uid() and (select public.has_app_access('dbs')));

-- Keep updated_at current.
create or replace function public.dbs_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists dbs_suppliers_touch on public.dbs_suppliers;
drop trigger if exists dbs_contacts_touch on public.dbs_contacts;
drop trigger if exists dbs_brands_touch on public.dbs_brands;
create trigger dbs_suppliers_touch before update on public.dbs_suppliers for each row execute function public.dbs_touch();
create trigger dbs_contacts_touch before update on public.dbs_contacts for each row execute function public.dbs_touch();
create trigger dbs_brands_touch before update on public.dbs_brands for each row execute function public.dbs_touch();

-- A brand's main contact is one of its own contacts or one of its supplier's.
create or replace function public.dbs_brand_check()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.main_contact_id is not null and not exists (
    select 1 from public.dbs_contacts c
     where c.id = new.main_contact_id
       and (c.brand_id = new.id or (c.supplier_id is not null and c.supplier_id is not distinct from new.supplier_id))
  ) then
    new.main_contact_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists dbs_brands_check on public.dbs_brands;
create trigger dbs_brands_check before insert or update on public.dbs_brands for each row execute function public.dbs_brand_check();

-- A supplier's main contact is one of its own contacts.
create or replace function public.dbs_supplier_check()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.main_contact_id is not null and not exists (
    select 1 from public.dbs_contacts c where c.id = new.main_contact_id and c.supplier_id = new.id
  ) then
    new.main_contact_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists dbs_suppliers_check on public.dbs_suppliers;
create trigger dbs_suppliers_check before insert or update on public.dbs_suppliers for each row execute function public.dbs_supplier_check();
