# Church OS — one database for the whole church

Somos Reino's accounting, calendar, people and follow-ups all live in one
PostgreSQL database, defined in
`db/migrations/20261108000000_church_os_core.sql`. The pages are
views onto it; the database is the product.

## The idea: everything hangs off a person

```
households ─< people >─ profiles (sign-in)
                │
   ┌────────────┼──────────────┬───────────────┐
   │            │              │               │
 groups     event_attendance  follow_ups     donations
 (teams,    (RSVP + check-in) interactions  (giving, per person)
 small      │                 follow_up_rules
 groups)    events ── service_plans ── plan_items / songs
            (calendar)        └─ plan_assignments (who serves)
```

`profiles` stays the sign-in account the portals already use. `people` is
everyone the church knows — visitors, kids, people who never log in. A
trigger links the two by email, so creating an account never makes a
duplicate person.

## Modules

| Module | Tables | What it does |
|---|---|---|
| People | `households`, `people`, `groups`, `group_members`, `group_positions` | Directory, families, membership status, teams and small groups |
| Calendar | `rooms`, `events`, `event_series`, `event_attendance` | One calendar for services, meetings, classes, rentals. Rooms cannot be double-booked (enforced in the database). RSVP and check-in share a row |
| Services | `service_types`, `service_plans`, `plan_items`, `plan_assignments`, `songs`, `blockouts` | Plans hang off calendar events. People accept/decline their own slot |
| Follow-ups | `follow_ups`, `interactions`, `follow_up_rules`, view `follow_up_queue` | Tasks about people, a contact log, and rules that create tasks automatically |
| Accounting | `funds`, `donations`, `expenses`, `payouts`, `bank_transactions`, `reconciliation_matches`, `ledger_entries`, `payment_methods`, `recurring_gifts`, view `person_giving_summary` | Unchanged table names — the finance and giving portals keep working. `donations.person_id` ties gifts (including cash and check) to people |

## Follow-up automation

`follow_up_rules` turn things that happen into tasks:

| Trigger | When it fires |
|---|---|
| `new_visitor` | A person is added with status `visitor` — instant |
| `new_member` | A person's status becomes `member` — instant |
| `absent_weeks` | Nightly: a member/regular with no check-in for `threshold` weeks |
| `birthday` | Nightly: today is a member's birthday |

Instant rules are database triggers. The nightly ones are one function,
`run_scheduled_follow_up_rules()`; schedule it with `pg_cron`
(`select cron.schedule('followups', '0 11 * * *', 'select run_scheduled_follow_up_rules()')`)
or a scheduled Edge Function. It never creates a duplicate while one is open.

Example rule: `{trigger: 'new_visitor', delay_days: 2, title_template: 'Call {{name}} after their first visit'}`.

## Access

Roles stay `admin | finance | member`. Capabilities are the `permissions`
flags, set in `settings.html`; an admin has all of them.

| Flag | Opens |
|---|---|
| `finance` (or role finance) | All accounting tables |
| `people` | Read/write people, households, groups, contact log |
| `calendar` | Create/edit events, rooms, service plans, scheduling (people managers get this too) |
| `followups` | The follow-up queue and rules |

Members see only their own record, their own giving, public/members events,
and can RSVP and accept/decline their own scheduling requests. Pastoral
notes (`people.notes`, `interactions`, `follow_ups`) are never visible to
plain members. Row Level Security enforces all of this; the pages only
decide what to show.

Tested against Postgres 16 (48 checks): the migration applies cleanly and re-runs;
a member cannot read other people's gifts, cannot read follow-ups, cannot promote
themselves, cannot check themselves in; a deactivated account reads and writes
nothing; rooms reject overlap; visitor, absence and birthday rules fire once;
signed-out visitors are granted nothing.

## Applying it

See [SETUP.md](SETUP.md). The migration is for an empty database; if one
already holds tables, compare first (`pg_dump --schema-only`) and take a
backup. Existing tables are left alone (`create table if not exists`), so a
column they lack (`donations.person_id`, the permission flags) needs an
`alter table`.

## Roadmap

1. **Apply the schema** and reconcile with the live project.
2. ~~**People portal** (`people.html`)~~ — **built.** Search (name, email, phone,
   family, tag), status and group filters, person detail (family, groups, open
   follow-ups, contact history, giving for finance), add/edit with duplicate
   warning, CSV import (English or Spanish headers) and export. Still to do:
   merge duplicates, group membership editing, bulk edit, photos.
3. ~~**Follow-up queue** (`followups.html`)~~ — **built.** Mine / Everyone / Done,
   overdue-first, call and text links, log a contact (closes the task and
   keeps the history), snooze, add by hand. Still to do: rule editor, and
   assigning from the card.
4. ~~**Calendar portal** (`calendar.html`)~~ — **built.** Month and agenda views,
   type and room filters, RSVP with capacity, add/edit, repeating events (daily,
   weekly on chosen days, monthly by date or "2nd Sunday", up to 104 at a time),
   room booking that names the clashing dates before saving, cancel/restore/delete
   one event or "this and all following", and a .ics download. Still to do: week
   view, edit-all-in-series, a public/subscribable .ics feed, multi-day events.
5. **Wire `services.html`** to the services tables (it is demo-only today).
6. **Check-in** (kids/adults) writing `event_attendance`, which feeds
   absence follow-ups.
7. **Giving statements** from `person_giving_summary`, and cash/check
   entry for the counting team.
8. **Email/SMS** via Edge Function (reminders, scheduling requests,
   follow-up nudges).
