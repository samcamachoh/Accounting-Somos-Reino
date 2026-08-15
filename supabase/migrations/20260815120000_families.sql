-- ============================================================
-- Somos Reino — families
-- ------------------------------------------------------------
-- A family is the household a person gives from: the Ortegas,
-- the Camachos. People are the accounts; a family groups them so
-- statements, addresses, and contact details live in one place
-- instead of being retyped onto every member.
--
-- Everything here is additive. It creates one table, adds three
-- columns to `profiles`, and adds policies alongside whatever
-- policies that table already has — no existing object is
-- dropped or rewritten, so running it against a live project
-- leaves the rest of the schema untouched.
--
--   supabase db push        (or paste into the SQL editor)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- The households themselves
-- ------------------------------------------------------------
create table if not exists public.families (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  -- Whoever the church should call first. Kept nullable: a family
  -- exists before anyone has been named its contact.
  primary_contact_id uuid,
  email              text,
  phone              text,
  address_line1      text,
  address_line2      text,
  city               text,
  state              text,
  postal_code        text,
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.families is
  'Households. Members are profiles carrying this family_id.';

-- ------------------------------------------------------------
-- The link from a person to their household
--
-- `household_name` is the free-text name the giving portal has
-- always read. It stays so nothing that relies on it breaks;
-- once a person is in a family, the family name wins.
-- ------------------------------------------------------------
alter table public.profiles add column if not exists family_id      uuid;
alter table public.profiles add column if not exists family_role    text;
alter table public.profiles add column if not exists household_name text;

-- Foreign keys, added only when they aren't already there so the
-- migration can be re-run safely.
do $$
begin
  alter table public.profiles
    add constraint profiles_family_id_fkey
    foreign key (family_id) references public.families(id) on delete set null;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.families
    add constraint families_primary_contact_id_fkey
    foreign key (primary_contact_id) references public.profiles(id) on delete set null;
exception
  when duplicate_object then null;
end
$$;

-- Head, spouse, child, or someone else under the same roof.
do $$
begin
  alter table public.profiles
    add constraint profiles_family_role_check
    check (family_role is null or family_role in ('head', 'spouse', 'child', 'other'));
exception
  when duplicate_object then null;
end
$$;

create index if not exists profiles_family_id_idx on public.profiles (family_id);
create index if not exists families_name_idx      on public.families (lower(name));

-- ------------------------------------------------------------
-- Keep updated_at honest
-- ------------------------------------------------------------
create or replace function public.sr_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists families_touch_updated_at on public.families;
create trigger families_touch_updated_at
  before update on public.families
  for each row execute function public.sr_touch_updated_at();

-- ------------------------------------------------------------
-- Who may see what
--
-- These read the caller's own row, so they must be SECURITY
-- DEFINER: a policy on `profiles` that queried `profiles`
-- directly would recurse into itself.
-- ------------------------------------------------------------
create or replace function public.sr_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true)
  );
$$;

create or replace function public.sr_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'finance')
      and coalesce(p.is_active, true)
  );
$$;

create or replace function public.sr_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid();
$$;

grant execute on function public.sr_is_admin()  to authenticated;
grant execute on function public.sr_is_staff()  to authenticated;
grant execute on function public.sr_family_id() to authenticated;

alter table public.families enable row level security;

-- Admins own this table outright; the dashboard's writes go
-- through the admin-users function with the service role, which
-- bypasses RLS, so these policies are what a signed-in admin
-- reading directly is held to.
drop policy if exists families_admin_all on public.families;
create policy families_admin_all on public.families
  for all
  using (public.sr_is_admin())
  with check (public.sr_is_admin());

-- Finance sees households to attribute giving; it does not edit them.
drop policy if exists families_staff_read on public.families;
create policy families_staff_read on public.families
  for select
  using (public.sr_is_staff());

-- A member sees their own household and nobody else's.
drop policy if exists families_member_read_own on public.families;
create policy families_member_read_own on public.families
  for select
  using (id = public.sr_family_id());

-- ...and the people in it, so the giving portal can list them.
-- Policies are OR'd, so this widens reads without loosening any
-- rule already on `profiles`.
drop policy if exists profiles_read_own_family on public.profiles;
create policy profiles_read_own_family on public.profiles
  for select
  using (family_id is not null and family_id = public.sr_family_id());
