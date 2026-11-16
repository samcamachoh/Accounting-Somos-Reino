-- ============================================================
-- Somos Reino — review fixes
-- ------------------------------------------------------------
-- 1. A member may edit their own people row, but only their contact
--    details. Status, notes, background check, household and the other
--    church-managed columns can only be changed by people-managers.
-- 2. RSVP capacity is enforced in the database, and members can read a
--    complete "going" count without being able to read other people's RSVPs.
--
-- Safe to run more than once. Run after the core and grants migrations.
-- ============================================================

-- ---- 1. self-service edits to people --------------------------------
create or replace function people_guard_self_update() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  -- Direct database access (migrations, the scheduler) carries no signed-in user.
  if jwt_sub() is null or can_people() then
    return new;
  end if;
  if (new.id, new.profile_id, new.household_id, new.household_role, new.status,
      new.first_visit_on, new.joined_on, new.baptized_on, new.how_they_found_us,
      new.tags, new.notes, new.background_check, new.background_check_expires, new.created_at)
     is distinct from
     (old.id, old.profile_id, old.household_id, old.household_role, old.status,
      old.first_visit_on, old.joined_on, old.baptized_on, old.how_they_found_us,
      old.tags, old.notes, old.background_check, old.background_check_expires, old.created_at) then
    raise exception 'You can only change your own contact details.' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists people_guard_self_update on people;
create trigger people_guard_self_update before update on people
  for each row execute function people_guard_self_update();

-- ---- 2. RSVP capacity -------------------------------------------------
-- Count of "yes" RSVPs for events the caller can see. Returns totals only.
create or replace function event_going_counts(event_ids uuid[])
returns table (event_id uuid, going bigint)
language sql stable security definer set search_path = public as
$$
  select a.event_id, count(*)::bigint
    from event_attendance a
    join events e on e.id = a.event_id
   where a.event_id = any(event_ids)
     and a.rsvp = 'yes'
     and (e.visibility = 'public'
          or (e.visibility = 'members' and requesting_user_id() is not null)
          or can_calendar() or is_staff())
   group by a.event_id
$$;
revoke execute on function event_going_counts(uuid[]) from public;
grant execute on function event_going_counts(uuid[]) to authenticated;

create or replace function enforce_event_capacity() returns trigger
language plpgsql security definer set search_path = public as
$$
declare cap int; taken bigint;
begin
  if new.rsvp is distinct from 'yes' then return new; end if;
  -- Managers may overbook on purpose; so may direct database access.
  if jwt_sub() is null or can_calendar() or can_people() then return new; end if;
  -- Lock the event so two simultaneous RSVPs cannot both take the last spot.
  select capacity into cap from events where id = new.event_id for update;
  if cap is null then return new; end if;
  select count(*) into taken from event_attendance
   where event_id = new.event_id and rsvp = 'yes' and person_id <> new.person_id;
  if taken >= cap then
    raise exception 'This event is full.' using errcode = 'P0001';
  end if;
  return new;
end
$$;
drop trigger if exists enforce_event_capacity on event_attendance;
create trigger enforce_event_capacity before insert or update on event_attendance
  for each row execute function enforce_event_capacity();
