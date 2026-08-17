# Accounting-Somos-Reino

A member portal for Somos Reino — give, review your history, and manage
recurring gifts in Spanish or English. The same records feed the
leadership side of the books, behind the same sign-in.

| Page | Who it's for |
|---|---|
| `index.html` | Members: your account — profile, payment methods, notifications — and the tabs to every portal your role opens |
| `login.html` | Sign in, reset a password, choose a new one |
| `giving.html` | Members: give, review history, manage recurring gifts (ES/EN) |
| `finance.html` | Leadership: deposits, expenses, funds, people, reconciliation |
| `settings.html` | Admins: add, edit, deactivate, and delete accounts |

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

The sidebar in `src/lib/portal-nav.js` is built from those same two
predicates, so it lists exactly the portals the person can open — a link
appears only when following it would work.

Worth being clear about what this does and does not do: the gate keeps
people out of the *data*. The HTML and JavaScript are static files and can
always be downloaded by anyone who knows the URL. Row Level Security and
the Edge Function's admin check are the real boundary — a signed-out
visitor who fetches the page directly still gets nothing back from the
database.

## Account management

`settings.html` covers adding people, editing roles and permissions,
setting passwords, emailing reset links, deactivating, and deleting.

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

Three guard rails are built in: an admin cannot deactivate their own
account, cannot remove their own admin role, and deleting someone who
appears in the books is refused until explicitly confirmed a second time —
deactivating keeps the audit trail whole.

## Schema

The table and column names in `src/lib/supabase.js` (`TABLES`) were
derived from what the pages already expect. Names the pages didn't pin
down — `reconciliation_matches`, `ledger_entries` — are collected there so
a differing schema is a one-place change.

Expected tables: `profiles`, `funds`, `donations`, `expenses`, `payouts`,
`bank_transactions`, `reconciliation_matches`, `ledger_entries`,
`payment_methods`, `recurring_gifts`.
