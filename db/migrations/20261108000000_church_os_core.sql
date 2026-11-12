-- ============================================================
-- Somos Reino — Church OS core schema
-- ------------------------------------------------------------
-- One database for the whole church:
--
--   1. access      profiles (sign-in accounts), roles, permissions
--   2. people      households, people, groups & teams
--   3. calendar    rooms, events, RSVPs and attendance
--   4. services    service types, plans, order of service, scheduling, songs
--   5. follow-ups  tasks tied to people, a contact log, automation rules
--   6. accounting  funds, gifts, expenses, payouts, bank, ledger
--
-- The thread through all of it: a PERSON. A visitor who checks in
-- gets a follow-up; a volunteer on a plan is a person; a gift is
-- from a person; a calendar event has attendees who are people.
--
-- Plain PostgreSQL (15+). Nothing here is specific to any host: it runs
-- on Neon, RDS, a VM, or a laptop. The pages reach it through a
-- PostgREST-compatible Data API (Neon's Data API, or PostgREST itself),
-- which verifies the Clerk session token and sets the request's claims;
-- the policies below read the signed-in person from those claims.
--
-- Written for an empty database. If one already holds tables, compare
-- first (`pg_dump --schema-only`) — every create is `if not exists`, but
-- columns an existing table lacks are not patched here.
--
-- Row Level Security is on for every table, keyed on the Clerk user id. The pages' checks
-- decide what to *show*; the policies below decide what is *allowed*.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ACCESS
-- ------------------------------------------------------------

-- Roles the Data API switches into. `authenticated` is a signed-in person.
-- The signed-out role is called `anon` by PostgREST's own docs and `anonymous`
-- by Neon's Data API, so both are created; neither is ever granted anything
-- (see the grants migration, which is safe to re-run).
do $$
declare r text;
begin
  foreach r in array array['anon', 'anonymous', 'authenticated'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if;
  end loop;
end $$;

-- The raw Clerk user id from the verified session token (`sub`: text like
-- "user_2abc…", not a UUID). NULL with no token.
-- Data APIs hand the verified token to the database in one of two ways, and
-- both are accepted so the same schema runs on either:
--   1. the `request.jwt.claims` setting — PostgREST's convention
--   2. `auth.user_id()` — Neon's Data API (the pg_session_jwt extension)
-- The plain setting is read FIRST: it is a harmless read that cannot fail,
-- whereas calling a host function that raises when no token is set can
-- disturb what follows it (seen on Neon). Malformed claims are treated as "no
-- answer", never as an error that breaks the query.
-- SECURITY DEFINER so it runs with its owner's access: the signed-in role
-- often has no right to use the host's `auth` schema until the Data API is
-- enabled, and this must work regardless.
-- Nothing but requesting_user_id() and "can I see my own profile" should call this.
create or replace function jwt_sub() returns text
language plpgsql stable security definer set search_path = public, pg_temp as
$$
declare sub text;
begin
  begin
    sub := nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '');
  exception when others then
    sub := null;
  end;
  if sub is not null then return sub; end if;

  begin
    if to_regprocedure('auth.user_id()') is not null then
      execute 'select auth.user_id()::text' into sub;
    end if;
  exception when others then
    sub := null;
  end;
  return nullif(sub, '');
end
$$;

create table if not exists profiles (
  id           text primary key,                      -- Clerk user id
  full_name    text,
  email        text,
  phone        text,
  role         text not null default 'member' check (role in ('admin','finance','member')),
  permissions  jsonb not null default '{}'::jsonb,   -- finance, approve, refund, people, payouts, calendar, followups
  team_names   text[] not null default '{}',
  locale       text not null default 'es' check (locale in ('es','en')),
  is_active    boolean not null default true,
  disabled_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- Who is signed in AND allowed in? This is the id every policy uses. A person
-- who has been deactivated, or who has a Clerk account but no profile (profiles
-- are only created by an administrator), is treated exactly like a visitor with no
-- token: NULL. So deactivating someone cuts off every read and write at once —
-- including their own records — even while their session token is still valid.
-- SECURITY DEFINER so it can read profiles without recursing into profiles' own policies.
create or replace function requesting_user_id() returns text
language sql stable security definer set search_path = public as
$$ select id from profiles where id = jwt_sub() and is_active $$;

-- Helpers. SECURITY DEFINER so policies can read profiles without
-- recursing into profiles' own policies.
create or replace function app_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = requesting_user_id() and is_active $$;

create or replace function app_has(flag text) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(
     (select role = 'admin' or coalesce((permissions ->> flag)::boolean, false)
        from profiles where id = requesting_user_id() and is_active),
     false) $$;

create or replace function my_permissions() returns jsonb
language sql stable security definer set search_path = public as
$$ select permissions from profiles where id = requesting_user_id() $$;

create or replace function is_admin()    returns boolean language sql stable as $$ select app_role() = 'admin' $$;
create or replace function is_staff()    returns boolean language sql stable as $$ select app_role() in ('admin','finance') $$;
create or replace function can_people()  returns boolean language sql stable as $$ select app_has('people') $$;
create or replace function can_finance() returns boolean language sql stable as $$ select app_role() in ('admin','finance') or app_has('finance') $$;
create or replace function can_calendar() returns boolean language sql stable as $$ select app_has('calendar') or app_has('people') $$;
create or replace function can_followups() returns boolean language sql stable as $$ select app_has('followups') or app_has('people') $$;

create or replace function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

-- ------------------------------------------------------------
-- 2. PEOPLE
-- ------------------------------------------------------------

create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address1    text,
  address2    text,
  city        text,
  region      text,
  postal_code text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Everyone the church knows — not only people who can sign in.
-- profile_id links the ones who can.
create table if not exists people (
  id                uuid primary key default gen_random_uuid(),
  profile_id        text unique references profiles(id) on delete set null,
  household_id      uuid references households(id) on delete set null,
  household_role    text check (household_role in ('head','spouse','child','other')),
  first_name        text not null,
  last_name         text not null default '',
  preferred_name    text,
  email             text,
  phone             text,
  birthday          date,
  anniversary       date,
  gender            text,
  language          text not null default 'es' check (language in ('es','en','both')),
  status            text not null default 'visitor'
                      check (status in ('visitor','regular','member','inactive','former')),
  first_visit_on    date,
  joined_on         date,
  baptized_on       date,
  how_they_found_us text,
  tags              text[] not null default '{}',
  notes             text,                              -- pastoral notes: people/followups staff only
  background_check  text not null default 'none' check (background_check in ('none','pending','cleared','expired')),
  background_check_expires date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists people_household_idx on people(household_id);
create index if not exists people_status_idx    on people(status);
create index if not exists people_name_idx      on people(lower(last_name), lower(first_name));

-- Teams, small groups, ministries.
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  kind        text not null default 'team' check (kind in ('team','small_group','ministry','class')),
  description text,
  leader_id   uuid references people(id) on delete set null,
  color       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists group_members (
  group_id   uuid not null references groups(id) on delete cascade,
  person_id  uuid not null references people(id) on delete cascade,
  role       text not null default 'member' check (role in ('leader','coach','member')),
  joined_on  date not null default current_date,
  left_on    date,
  primary key (group_id, person_id)
);

-- Positions inside a team (Worship: Keys, Drums… / Production: FOH…).
create table if not exists group_positions (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references groups(id) on delete cascade,
  name      text not null,
  sort      int not null default 0,
  unique (group_id, name)
);

-- Who can fill which position.
create table if not exists person_positions (
  person_id   uuid not null references people(id) on delete cascade,
  position_id uuid not null references group_positions(id) on delete cascade,
  primary key (person_id, position_id)
);

-- ------------------------------------------------------------
-- 3. CALENDAR
-- ------------------------------------------------------------

create table if not exists rooms (
  id        uuid primary key default gen_random_uuid(),
  name      text unique not null,
  capacity  int,
  is_active boolean not null default true
);

-- A recurring pattern. Occurrences are materialised into `events`
-- so every query, RSVP and attendance row points at a real row.
create table if not exists event_series (
  id          uuid primary key default gen_random_uuid(),
  rrule       text not null,                 -- RFC 5545, e.g. FREQ=WEEKLY;BYDAY=SU
  starts_on   date not null,
  until_on    date,
  created_at  timestamptz not null default now()
);

create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  series_id    uuid references event_series(id) on delete set null,
  title        text not null,
  kind         text not null default 'event'
                 check (kind in ('service','event','meeting','class','outreach','rental','holiday')),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  all_day      boolean not null default false,
  location     text,
  room_id      uuid references rooms(id) on delete set null,
  group_id     uuid references groups(id) on delete set null,   -- hosting team/group
  description  text,
  visibility   text not null default 'public' check (visibility in ('public','members','staff')),
  rsvp_enabled boolean not null default false,
  capacity     int,
  status       text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_by   text references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index if not exists events_starts_idx on events(starts_at);
create index if not exists events_room_idx   on events(room_id, starts_at);

-- RSVP and attendance share a row: you RSVP, then you are checked in.
create table if not exists event_attendance (
  event_id      uuid not null references events(id) on delete cascade,
  person_id     uuid not null references people(id) on delete cascade,
  rsvp          text check (rsvp in ('yes','no','maybe')),
  checked_in_at timestamptz,
  guests        int not null default 0,
  primary key (event_id, person_id)
);

-- No two events may hold the same room at the same time.
create or replace function prevent_room_double_booking() returns trigger language plpgsql as
$$
begin
  if new.room_id is not null and new.status = 'scheduled' and exists (
    select 1 from events e
     where e.room_id = new.room_id and e.id <> new.id and e.status = 'scheduled'
       and tstzrange(e.starts_at, e.ends_at) && tstzrange(new.starts_at, new.ends_at)
  ) then
    raise exception 'That room is already booked at that time.' using errcode = '23P01';
  end if;
  return new;
end
$$;
drop trigger if exists events_no_double_booking on events;
create trigger events_no_double_booking before insert or update on events
  for each row execute function prevent_room_double_booking();

-- ------------------------------------------------------------
-- 4. SERVICES
-- ------------------------------------------------------------

create table if not exists service_types (
  id        uuid primary key default gen_random_uuid(),
  slug      text unique not null,
  name      text not null,
  color     text,
  weekday   int check (weekday between 0 and 6),   -- 0 = Sunday
  start_time time,
  is_active boolean not null default true
);

-- A plan is one occurrence of a service — it hangs off a calendar event.
create table if not exists service_plans (
  id              uuid primary key default gen_random_uuid(),
  service_type_id uuid not null references service_types(id),
  event_id        uuid unique references events(id) on delete cascade,
  title           text,
  series_title    text,
  speaker_id      uuid references people(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists songs (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  author     text,
  ccli_number text,
  default_key text,
  bpm        int,
  length_sec int,
  language   text check (language in ('es','en','both')),
  tags       text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists plan_items (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references service_plans(id) on delete cascade,
  sort       int not null,
  kind       text not null default 'item' check (kind in ('header','song','item','media','message')),
  title      text not null,
  song_id    uuid references songs(id) on delete set null,
  song_key   text,
  length_sec int not null default 0,
  notes      text,
  unique (plan_id, sort) deferrable initially deferred
);

-- Team scheduling: ask a person to fill a position on a plan.
create table if not exists plan_assignments (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references service_plans(id) on delete cascade,
  position_id uuid not null references group_positions(id) on delete cascade,
  person_id   uuid references people(id) on delete set null,
  status      text not null default 'pending' check (status in ('open','pending','accepted','declined')),
  responded_at timestamptz,
  note        text,
  unique (plan_id, position_id, person_id)
);

create table if not exists blockouts (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people(id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  reason     text,
  check (ends_on >= starts_on)
);

-- ------------------------------------------------------------
-- 5. FOLLOW-UPS
-- ------------------------------------------------------------

-- Every phone call, visit, text and note about a person.
create table if not exists interactions (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references people(id) on delete cascade,
  kind        text not null check (kind in ('call','text','email','visit','in_person','prayer','note')),
  summary     text not null,
  occurred_at timestamptz not null default now(),
  logged_by   text references profiles(id) on delete set null default requesting_user_id(),
  created_at  timestamptz not null default now()
);
create index if not exists interactions_person_idx on interactions(person_id, occurred_at desc);

-- The task list. Anything someone needs to do about someone.
create table if not exists follow_ups (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references people(id) on delete cascade,
  kind         text not null default 'general'
                 check (kind in ('first_visit','new_member','absence','care','prayer','birthday','giving','volunteer','general')),
  title        text not null,
  details      text,
  due_on       date not null default current_date,
  priority     text not null default 'normal' check (priority in ('low','normal','high')),
  status       text not null default 'open' check (status in ('open','snoozed','done','dropped')),
  assigned_to  text references profiles(id) on delete set null,
  event_id     uuid references events(id) on delete set null,   -- the visit / service it came from
  source       text not null default 'manual' check (source in ('manual','rule','import')),
  rule_id      uuid,
  outcome      text,
  completed_at timestamptz,
  created_by   text references profiles(id) on delete set null default requesting_user_id(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists follow_ups_queue_idx  on follow_ups(status, due_on);
create index if not exists follow_ups_person_idx on follow_ups(person_id);
create index if not exists follow_ups_owner_idx  on follow_ups(assigned_to, status);

-- "When X happens, create this follow-up, N days later, for this person."
create table if not exists follow_up_rules (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  trigger        text not null check (trigger in ('new_visitor','new_member','absent_weeks','birthday')),
  threshold      int,                         -- absent_weeks: how many weeks missed
  delay_days     int not null default 2,
  kind           text not null default 'general',
  title_template text not null,               -- {{name}} is replaced with the person's name
  assign_to      text references profiles(id) on delete set null,
  is_active      boolean not null default true
);
alter table follow_ups drop constraint if exists follow_ups_rule_fk;
alter table follow_ups add  constraint follow_ups_rule_fk
  foreign key (rule_id) references follow_up_rules(id) on delete set null;

-- Closing a follow-up stamps it.
create or replace function stamp_follow_up() returns trigger language plpgsql as
$$
begin
  if new.status in ('done','dropped') and old.status not in ('done','dropped') then
    new.completed_at = now();
  elsif new.status in ('open','snoozed') then
    new.completed_at = null;
  end if;
  return new;
end
$$;
drop trigger if exists follow_ups_stamp on follow_ups;
create trigger follow_ups_stamp before update on follow_ups
  for each row execute function stamp_follow_up();

-- A new visitor / new member gets their follow-up from the rules.
create or replace function apply_new_person_rules() returns trigger language plpgsql
security definer set search_path = public as
$$
declare r follow_up_rules;
begin
  for r in
    select * from follow_up_rules
     where is_active
       and ((trigger = 'new_visitor' and new.status = 'visitor')
         or (trigger = 'new_member'  and new.status = 'member' and (tg_op = 'INSERT' or old.status <> 'member')))
  loop
    insert into follow_ups (person_id, kind, title, due_on, assigned_to, source, rule_id)
    values (new.id, r.kind,
            replace(r.title_template, '{{name}}', trim(new.first_name || ' ' || new.last_name)),
            current_date + r.delay_days, r.assign_to, 'rule', r.id);
  end loop;
  return new;
end
$$;
drop trigger if exists people_apply_rules on people;
create trigger people_apply_rules after insert or update of status on people
  for each row execute function apply_new_person_rules();

-- Run daily (pg_cron or a scheduled Edge Function).
-- Members and regulars who have not been seen in N weeks, and whose
-- birthday is today, get a follow-up — once, not every night.
create or replace function run_scheduled_follow_up_rules() returns int
language plpgsql security definer set search_path = public as
$$
declare r follow_up_rules; made int := 0; n int;
begin
  for r in select * from follow_up_rules where is_active and trigger in ('absent_weeks','birthday') loop
    if r.trigger = 'absent_weeks' then
      insert into follow_ups (person_id, kind, title, due_on, assigned_to, source, rule_id)
      select p.id, r.kind, replace(r.title_template, '{{name}}', trim(p.first_name || ' ' || p.last_name)),
             current_date + r.delay_days, r.assign_to, 'rule', r.id
        from people p
       where p.status in ('member','regular')
         and coalesce((select max(e.starts_at) from event_attendance a join events e on e.id = a.event_id
                        where a.person_id = p.id and a.checked_in_at is not null),
                      p.joined_on::timestamptz, p.created_at)
             < now() - make_interval(weeks => coalesce(r.threshold, 3))
         and not exists (select 1 from follow_ups f where f.person_id = p.id and f.rule_id = r.id
                           and (f.status in ('open','snoozed') or f.created_at > now() - interval '60 days'));
    else
      insert into follow_ups (person_id, kind, title, due_on, assigned_to, source, rule_id)
      select p.id, r.kind, replace(r.title_template, '{{name}}', trim(p.first_name || ' ' || p.last_name)),
             current_date, r.assign_to, 'rule', r.id
        from people p
       where p.status in ('member','regular') and p.birthday is not null
         and to_char(p.birthday, 'MM-DD') = to_char(current_date, 'MM-DD')
         and not exists (select 1 from follow_ups f where f.person_id = p.id and f.rule_id = r.id
                           and f.created_at > now() - interval '300 days');
    end if;
    get diagnostics n = row_count; made := made + n;
  end loop;
  return made;
end
$$;
revoke all on function run_scheduled_follow_up_rules() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6. ACCOUNTING
--    Names and columns match src/lib/db.js TABLES and what
--    finance.html / giving.html already read.
-- ------------------------------------------------------------

create table if not exists funds (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  name_en               text not null,
  name_es               text,
  color                 text,
  restricted            boolean not null default false,   -- donor-restricted money
  is_active             boolean not null default true,
  current_balance_cents bigint not null default 0
);

create table if not exists payment_methods (
  id          uuid primary key default gen_random_uuid(),
  profile_id  text not null references profiles(id) on delete cascade,
  type        text not null default 'card',
  brand       text,
  last4       text,
  exp_month   int,
  exp_year    int,
  is_default  boolean not null default false,
  stripe_payment_method_id text unique,
  created_at  timestamptz not null default now()
);

create table if not exists recurring_gifts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  text not null references profiles(id) on delete cascade,
  fund_id     uuid not null references funds(id),
  amount_cents bigint not null check (amount_cents > 0),
  frequency   text not null check (frequency in ('weekly','monthly')),
  status      text not null default 'active' check (status in ('active','paused','cancelled')),
  next_charge_on date,
  stripe_subscription_id text unique,
  created_at  timestamptz not null default now()
);

create table if not exists donations (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          text references profiles(id) on delete set null,    -- signed-in giver
  person_id           uuid references people(id) on delete set null,      -- any giver, incl. cash & check
  fund_id             uuid not null references funds(id),
  amount_cents        bigint not null check (amount_cents > 0),
  processing_fee_cents bigint not null default 0,
  payment_method_type text,                                               -- Card, ACH, Cash, Check
  anonymous           boolean not null default false,
  recurring_gift_id   uuid references recurring_gifts(id) on delete set null,
  payout_id           uuid,
  stripe_payment_intent_id text unique,
  occurred_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create index if not exists donations_person_idx on donations(person_id, occurred_at desc);
create index if not exists donations_profile_idx on donations(profile_id, occurred_at desc);

create table if not exists expenses (
  id                uuid primary key default gen_random_uuid(),
  submitter_id      text references profiles(id) on delete set null,
  fund_id           uuid references funds(id),
  description       text not null,
  team_name         text,
  amount_cents      bigint not null check (amount_cents > 0),
  note              text,
  receipt_path      text,
  status            text not null default 'pending' check (status in ('pending','approved','denied','reimbursed')),
  status_changed_at timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists payouts (
  id               uuid primary key default gen_random_uuid(),
  stripe_payout_id text unique,
  gross_cents      bigint not null,
  fee_cents        bigint not null default 0,
  net_cents        bigint not null,
  gift_count       int not null default 0,
  arrival_date     date,
  created_at       timestamptz not null default now()
);
alter table donations drop constraint if exists donations_payout_fk;
alter table donations add  constraint donations_payout_fk foreign key (payout_id) references payouts(id) on delete set null;

create table if not exists bank_transactions (
  id                      uuid primary key default gen_random_uuid(),
  external_transaction_id text unique,
  posted_at               timestamptz not null,
  description             text,
  amount_cents            bigint not null,
  kind                    text,
  created_at              timestamptz not null default now()
);

create table if not exists reconciliation_matches (
  id                  uuid primary key default gen_random_uuid(),
  payout_id           uuid not null unique references payouts(id) on delete cascade,
  bank_transaction_id uuid not null unique references bank_transactions(id) on delete cascade,
  matched_at          timestamptz not null default now()
);

create table if not exists ledger_entries (
  id                  uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null unique references bank_transactions(id) on delete cascade,
  fund_id             uuid not null references funds(id),
  category            text,
  note                text,
  created_at          timestamptz not null default now()
);

-- Where giving meets people: one row per person per year, for
-- giving statements and for the "haven't given in a while" view.
-- security_invoker so the donations policy applies to the caller.
create or replace view person_giving_summary with (security_invoker = true) as
select p.id as person_id,
       trim(p.first_name || ' ' || p.last_name) as name,
       date_part('year', d.occurred_at)::int as year,
       count(*) as gifts,
       sum(d.amount_cents) as total_cents,
       max(d.occurred_at) as last_gift_at
  from donations d
  join people p on p.id = d.person_id
 where not d.anonymous
 group by p.id, p.first_name, p.last_name, date_part('year', d.occurred_at);

-- The follow-up queue with the person attached, overdue first.
create or replace view follow_up_queue with (security_invoker = true) as
select f.*, trim(p.first_name || ' ' || p.last_name) as person_name, p.phone as person_phone,
       p.email as person_email, p.status as person_status,
       (f.due_on < current_date and f.status = 'open') as overdue
  from follow_ups f join people p on p.id = f.person_id
 where f.status in ('open','snoozed')
 order by overdue desc, f.due_on, f.priority desc;

-- ------------------------------------------------------------
-- updated_at on the tables that carry it
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['households','people','events','service_plans','follow_ups'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Keep people in step with sign-in accounts: an account with no
-- matching person (by email) gets one; otherwise it is linked.
-- ------------------------------------------------------------
create or replace function link_profile_to_person() returns trigger language plpgsql
security definer set search_path = public as
$$
declare existing uuid;
begin
  select id into existing from people
   where profile_id is null and email is not null and lower(email) = lower(new.email) limit 1;
  if existing is not null then
    update people set profile_id = new.id where id = existing;
  elsif not exists (select 1 from people where profile_id = new.id) then
    insert into people (profile_id, first_name, last_name, email, phone, status, language)
    values (new.id,
            coalesce(nullif(split_part(coalesce(new.full_name, ''), ' ', 1), ''), split_part(coalesce(new.email, ''), '@', 1), 'Member'),
            coalesce(nullif(trim(substr(coalesce(new.full_name, ''), length(split_part(coalesce(new.full_name, ''), ' ', 1)) + 1)), ''), ''),
            new.email, new.phone, 'member', new.locale);
  end if;
  return new;
end
$$;
drop trigger if exists profiles_link_person on profiles;
create trigger profiles_link_person after insert on profiles
  for each row execute function link_profile_to_person();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','households','people','groups','group_members','group_positions','person_positions',
    'rooms','event_series','events','event_attendance',
    'service_types','service_plans','songs','plan_items','plan_assignments','blockouts',
    'interactions','follow_ups','follow_up_rules',
    'funds','payment_methods','recurring_gifts','donations','expenses','payouts',
    'bank_transactions','reconciliation_matches','ledger_entries'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Re-runnable: clear any policies from a previous run before recreating them.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- A small helper so policies can say "this row is about me".
create or replace function my_person_id() returns uuid language sql stable security definer set search_path = public as
$$ select id from people where profile_id = requesting_user_id() limit 1 $$;

-- ---- profiles: yourself, or everyone if you manage people; admins write.
drop policy if exists profiles_read  on profiles;
drop policy if exists profiles_self  on profiles;
drop policy if exists profiles_admin on profiles;
-- Your own profile stays readable even when deactivated: that is how the app
-- tells you "this account has been deactivated" instead of a blank screen.
create policy profiles_read  on profiles for select using (id = jwt_sub() or can_people() or can_followups() or is_staff());
create policy profiles_self  on profiles for update using (id = requesting_user_id())
  with check (id = requesting_user_id() and role = app_role() and permissions = my_permissions() and is_active);
create policy profiles_admin on profiles for all using (is_admin()) with check (is_admin());

-- ---- people & households: people-managers read/write; a person reads their own record.
create policy people_read   on people for select using (can_people() or can_followups() or id = my_person_id());
create policy people_write  on people for all    using (can_people()) with check (can_people());
create policy people_self   on people for update using (id = my_person_id()) with check (id = my_person_id());
create policy households_read  on households for select using (can_people() or id = (select household_id from people where id = my_person_id()));
create policy households_write on households for all using (can_people()) with check (can_people());

-- ---- groups: any signed-in member sees them; people-managers edit.
create policy groups_read   on groups for select using (requesting_user_id() is not null);
create policy groups_write  on groups for all using (can_people()) with check (can_people());
create policy gm_read       on group_members for select using (can_people() or person_id = my_person_id());
create policy gm_write      on group_members for all using (can_people()) with check (can_people());
create policy gp_read       on group_positions for select using (requesting_user_id() is not null);
create policy gp_write      on group_positions for all using (can_people()) with check (can_people());
create policy pp_read       on person_positions for select using (can_people() or can_calendar() or person_id = my_person_id());
create policy pp_write      on person_positions for all using (can_people()) with check (can_people());

-- ---- calendar: visibility decides who sees an event.
create policy rooms_read    on rooms for select using (requesting_user_id() is not null);
create policy rooms_write   on rooms for all using (can_calendar()) with check (can_calendar());
create policy series_read   on event_series for select using (requesting_user_id() is not null);
create policy series_write  on event_series for all using (can_calendar()) with check (can_calendar());
create policy events_read   on events for select using (
  visibility = 'public'
  or (visibility = 'members' and requesting_user_id() is not null)
  or can_calendar() or is_staff());
create policy events_write  on events for all using (can_calendar()) with check (can_calendar());
create policy att_read      on event_attendance for select using (can_calendar() or can_people() or person_id = my_person_id());
create policy att_write     on event_attendance for all using (can_calendar() or can_people()) with check (can_calendar() or can_people());
create policy att_rsvp      on event_attendance for insert with check (person_id = my_person_id() and checked_in_at is null);
create policy att_rsvp_upd  on event_attendance for update using (person_id = my_person_id()) with check (person_id = my_person_id() and checked_in_at is null);

-- ---- services: everyone serving can read; calendar managers plan.
create policy st_read   on service_types for select using (requesting_user_id() is not null);
create policy st_write  on service_types for all using (can_calendar()) with check (can_calendar());
create policy sp_read   on service_plans for select using (requesting_user_id() is not null);
create policy sp_write  on service_plans for all using (can_calendar()) with check (can_calendar());
create policy songs_read  on songs for select using (requesting_user_id() is not null);
create policy songs_write on songs for all using (can_calendar()) with check (can_calendar());
create policy pi_read   on plan_items for select using (requesting_user_id() is not null);
create policy pi_write  on plan_items for all using (can_calendar()) with check (can_calendar());
create policy pa_read   on plan_assignments for select using (requesting_user_id() is not null);
create policy pa_write  on plan_assignments for all using (can_calendar()) with check (can_calendar());
-- Accept / decline your own slot — and nothing else about it.
create policy pa_respond on plan_assignments for update using (person_id = my_person_id())
  with check (person_id = my_person_id() and status in ('accepted','declined','pending'));
create policy bo_read   on blockouts for select using (can_calendar() or person_id = my_person_id());
create policy bo_own    on blockouts for all using (person_id = my_person_id() or can_calendar())
  with check (person_id = my_person_id() or can_calendar());

-- ---- follow-ups: pastoral data. Only people who run follow-ups.
create policy fu_read    on follow_ups for select using (can_followups() or assigned_to = requesting_user_id());
create policy fu_write   on follow_ups for all using (can_followups()) with check (can_followups());
create policy fu_mine    on follow_ups for update using (assigned_to = requesting_user_id()) with check (assigned_to = requesting_user_id());
create policy ix_read    on interactions for select using (can_followups() or can_people());
create policy ix_write   on interactions for all using (can_followups() or can_people()) with check (can_followups() or can_people());
create policy rules_all  on follow_up_rules for all using (is_admin() or can_followups()) with check (is_admin() or can_followups());

-- ---- accounting: finance sees everything; a giver sees only their own.
create policy funds_read    on funds for select using (requesting_user_id() is not null);
create policy funds_write   on funds for all using (can_finance()) with check (can_finance());
create policy pm_own        on payment_methods for select using (profile_id = requesting_user_id() or can_finance());
create policy rg_own        on recurring_gifts for select using (profile_id = requesting_user_id() or can_finance());
create policy don_own       on donations for select using (profile_id = requesting_user_id() or person_id = my_person_id() or can_finance());
create policy don_write     on donations for all using (can_finance()) with check (can_finance());
create policy exp_read      on expenses for select using (submitter_id = requesting_user_id() or can_finance());
create policy exp_submit    on expenses for insert with check (submitter_id = requesting_user_id() and status = 'pending');
create policy exp_review    on expenses for update using (can_finance()) with check (can_finance());
create policy payouts_all   on payouts for all using (can_finance()) with check (can_finance());
create policy bank_all      on bank_transactions for all using (can_finance()) with check (can_finance());
create policy match_all     on reconciliation_matches for all using (can_finance()) with check (can_finance());
create policy ledger_all    on ledger_entries for all using (can_finance()) with check (can_finance());
-- Stripe webhooks run as the database owner, which bypasses RLS, so no insert
-- policy is needed for them.
