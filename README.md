# Accounting-Somos-Reino

> **Direction:** this is becoming the church's operating software — accounting,
> calendar, people and follow-ups on one database. See [docs/CHURCH-OS.md](docs/CHURCH-OS.md)
> for the schema, access model and roadmap.

A member portal for Somos Reino — give, review your history, and manage
recurring gifts in Spanish or English. The same records feed the
leadership side of the books, behind the same sign-in.

| Page | Who it's for |
|---|---|
| `index.html` | Members: your account — profile, payment methods, notifications — and the tabs to every portal your role opens |
| `login.html` | Sign in (Clerk) — password or emailed code, ES/EN |
| `giving.html` | Members: give, review history, manage recurring gifts (ES/EN) |
| `finance.html` | Leadership: deposits, expenses, funds, people, reconciliation |
| `calendar.html` | Everyone: what's happening, RSVP. Calendar managers: add, repeat, cancel, and book rooms |
| `people.html` | People managers: directory of everyone — families, visitors, members; add, edit, import and export |
| `followups.html` | Pastoral team: who needs a call, visit, or note — queue, log contact, snooze |
| `services.html` | Everyone serving: service plans, scheduling, songs, live |
| `settings.html` | Admins: add, edit, deactivate, and delete accounts |

`services.html` is the one page that still runs entirely on sample data.
It covers what a church needs to plan a weekend — service types and
plans, the order of service with running times, team scheduling with
accept and decline, blockouts, the song library with keys and
arrangements, media, plan templates, a live service clock, and the
CCLI, service length, and volunteer load reports. There are no services
tables wired up yet, so it gates on a session like the
other portals but always reports **demo** in the status badge: that
badge answers "am I looking at real data", and for this page the honest
answer is no. Wiring it up means adding those tables plus reads and
writes in `src/lib/api.js`, then a `hydrate` function the way
`finance.html` and `giving.html` do it.

## Running it

```bash
pnpm install
pnpm dev        # local dev server
pnpm build      # production build into dist/
pnpm check      # verify pages, imports, and build entries line up
```

## Demo mode and live mode

Without credentials the portals run in **demo mode**: they render their
built-in sample data, never touch the network, and show an amber badge.
That is the intended state before a database exists — `pnpm dev` works on a
fresh clone with no setup.

Adding credentials switches everything to **live mode**, where every page
requires a session and all data comes from the database. Sign-in is
[Clerk](https://clerk.com); data is PostgreSQL behind a PostgREST-compatible
Data API. Both values are needed — with either missing, the portals stay in
demo mode.

```bash
cp .env.example .env    # then fill in the values
```

`VITE_DATA_API_URL` is the Data API's address; `VITE_CLERK_PUBLISHABLE_KEY`
(`pk_test_…` / `pk_live_…`) comes from **API keys** in the Clerk dashboard.
Both are meant to be public; Row Level Security is what protects the data.
Neither a database connection string nor Clerk's **secret** key (`sk_…`) may
ever appear in `.env` — anything prefixed `VITE_` is compiled into the
JavaScript every visitor downloads. They live only in the admin function's
environment. **Start with [docs/SETUP.md](docs/SETUP.md).**

## Access control

Three roles, checked in `src/lib/auth.js` and enforced by RLS:

- `admin` — everything, including `settings.html`
- `finance` — the finance portal
- `member` — their own giving only

In live mode every page calls `requireSession()` before rendering, and
signed-out visitors are redirected to `login.html` with a `next` parameter
so they land where they were headed.

Worth being clear about what this does and does not do: the gate keeps
people out of the *data*. The HTML and JavaScript are static files and can
always be downloaded by anyone who knows the URL. Row Level Security and
the Edge Function's admin check are the real boundary — a signed-out
visitor who fetches the page directly still gets nothing back from the
database.

## Account management

`settings.html` covers adding people, editing roles and permissions,
setting passwords, deactivating, and deleting.

Accounts live in Clerk; each person's role and permissions live in the
`profiles` table, keyed by their Clerk user id. **A profile is only ever
created by an administrator** — that is what stops anyone choosing their own
role. A Clerk account with no profile gets the "no access" screen and can
read nothing.

Creating accounts and setting passwords need secrets, which cannot live in a
browser. Those operations run in a serverless function
(`api/admin-users.js`, logic in `server/admin-users.js`) that verifies the
caller's Clerk session token, then re-reads their role from the database
before acting. Its environment (`CLERK_SECRET_KEY`, `DATABASE_URL`, …) is
listed in [docs/SETUP.md](docs/SETUP.md).

Adding a person creates an already-verified Clerk account and their profile
in one step. Clerk sends no email when an admin does this, so tell them to
open the portal and sign in with their email (a code is emailed to them), or
with the password you set.

Three guard rails are built in: an admin cannot deactivate their own
account, cannot remove their own admin role, and deleting someone who
appears in the books is refused until explicitly confirmed a second time —
deactivating keeps the audit trail whole. Deactivating cuts off all data
access at once, even while the person's session is still valid.

## Schema

`db/migrations/` is the whole schema, plain PostgreSQL 14+ with no
host-specific pieces. The table and column names in `src/lib/db.js`
(`TABLES`) match it; a differing schema is a one-place change there.

Tables: `profiles`, `households`, `people`, `groups`, `group_members`,
`group_positions`, `person_positions`, `rooms`, `event_series`, `events`,
`event_attendance`, `service_types`, `service_plans`, `songs`, `plan_items`,
`plan_assignments`, `blockouts`, `interactions`, `follow_ups`,
`follow_up_rules`, `funds`, `payment_methods`, `recurring_gifts`,
`donations`, `expenses`, `payouts`, `bank_transactions`,
`reconciliation_matches`, `ledger_entries`. See
[docs/CHURCH-OS.md](docs/CHURCH-OS.md) for how they fit together.
