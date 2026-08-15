# Accounting-Somos-Reino

Giving and accounting for Somos Reino, in one record.

| Page | Who it's for |
|---|---|
| `index.html` | Landing page — routes to the two portals |
| `login.html` | Sign in, reset a password, choose a new one |
| `giving.html` | Members: give, review history, manage recurring gifts (ES/EN) |
| `finance.html` | Leadership: deposits, expenses, funds, people, reconciliation |
| `settings.html` | Admins: accounts, capabilities, and families |

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
That is the intended state before a Supabase project exists — `pnpm dev`
works on a fresh clone with no setup.

Adding credentials switches everything to **live mode**, where every page
requires a session and all data comes from Supabase.

```bash
cp .env.example .env    # then fill in the two values
```

Both values come from **Project Settings → API** in the Supabase
dashboard. The anon key is meant to be public; Row Level Security is what
protects the data. The `service_role` key must never appear in `.env` —
anything prefixed `VITE_` is compiled into the JavaScript every visitor
downloads.

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

## The admin dashboard

`settings.html` is where an administrator manages the church's people and
its households. It opens on two tabs over one load, with a row of counts
above them — people, admins, families, who isn't in a household, who was
invited but has never signed in.

**People** covers adding someone, changing their name, email, phone, team,
role, and capabilities, setting a password or emailing a reset link,
moving them between families, deactivating, and deleting.

**Families** groups the people who give from one household. A family
carries the name, address, phone, and whoever the office should call
first, so those live in one place instead of being retyped onto every
account. Members can be added while creating the family, moved in from a
person's own row, or managed together in the member editor — where each
change saves as it is made. Deleting a family releases its members and
touches nothing else: accounts, giving, and history all stay.

Every giver sees their own household on the account tab of the giving
portal — the family name, its address, and who else is in it. Amounts are
never shared across a family; giving stays private to whoever gave it.

Creating users and setting passwords require the `service_role` key, which
cannot live in a browser. Those operations run in an Edge Function that
verifies the caller's JWT and re-reads their role from the database before
acting:

```bash
supabase functions deploy admin-users
```

It needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` in the function environment — Supabase
provides all three automatically. Before going live, narrow
`Access-Control-Allow-Origin` in `supabase/functions/admin-users/index.ts`
from `*` to your own domain.

Four guard rails are built in: an admin cannot deactivate their own
account, cannot remove their own admin role, deleting someone who appears
in the books is refused until explicitly confirmed a second time —
deactivating keeps the audit trail whole — and a family's primary contact
has to be someone who actually lives in it, so moving a person out clears
the contact they were named for.

## The first administrator

Promoting someone is ordinarily done on `settings.html`, which needs an
admin to already be signed in. To create the first one — or to restore
access when nobody can reach that page — there is a script:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  pnpm grant-admin pastorsam@somosreino.org
```

It gives them `role = 'admin'`, marks the account active, lifts any
sign-in ban, and turns on every finance capability. An existing name,
phone, and teams are left alone — this grants a role, it doesn't rewrite
the person. When no account exists for that address yet, one is invited by
email so they choose their own password; `--no-invite` refuses instead.

Both values are read from the environment or from `.env`. `.env` is
gitignored and Vite only bundles variables prefixed `VITE_`, so the
service key stays out of what visitors download — as long as it is never
given that prefix.

## Schema

The table and column names in `src/lib/supabase.js` (`TABLES`) were
derived from what the pages already expect. Names the pages didn't pin
down — `reconciliation_matches`, `ledger_entries` — are collected there so
a differing schema is a one-place change.

Expected tables: `profiles`, `families`, `funds`, `donations`, `expenses`,
`payouts`, `bank_transactions`, `reconciliation_matches`, `ledger_entries`,
`payment_methods`, `recurring_gifts`.

`families` is the one table this repo defines itself, in
`supabase/migrations/`. Apply it with `supabase db push`, or paste the file
into the SQL editor. It creates the table, adds `family_id`,
`family_role`, and `household_name` to `profiles`, and adds its policies
alongside whatever is already on those tables — nothing existing is
dropped or rewritten, and it can be re-run safely.

Until it runs, the dashboard still loads its people and says in the banner
why the families tab is empty; the giving portal simply omits the
household card.
