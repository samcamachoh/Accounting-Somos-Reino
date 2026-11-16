-- ============================================================
-- Somos Reino — table privileges
-- ------------------------------------------------------------
-- Row Level Security decides which ROWS a person sees; these
-- grants decide which TABLES a signed-in person may touch at
-- all, and make sure a signed-out visitor gets nothing.
--
-- Run this AFTER the core migration, and run it AGAIN after
-- enabling a host's Data API: some hosts apply their own default
-- grants when the API is switched on, and this puts the rules
-- back the way they are meant to be. It is safe to run any
-- number of times.
-- ============================================================

-- Signed-out roles: nothing. Whichever of these the host uses.
do $$
declare r text;
begin
  foreach r in array array['anon', 'anonymous'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke execute on all functions in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
    end if;
  end loop;
end $$;

-- Signed-in people: the tables, filtered by the policies.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- The nightly rules run from a scheduler as the owner, never from a browser.
revoke execute on function run_scheduled_follow_up_rules() from public, authenticated;
