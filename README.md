# Accounting-Somos-Reino

One portal for Somos Reino. Everyone signs in at the same address and
gets the same interface; what appears inside it comes from their
credentials. A member sees their giving. A treasurer sees the books. An
admin sees the accounts. Nobody is asked to pick a portal first, and
there is no second URL to remember.

```
index.html          the page — the only one
src/app.js          boot, routing, and the four regions it repaints
src/views/          one module per screen, one line each in views/index.js
src/lib/access.js   who sees what
src/lib/store.js    the records, and every write that touches them
```

## Running it

```bash
pnpm install
pnpm dev        # local dev server
pnpm build      # production build into dist/
pnpm check      # verify the wiring, the access model, and the strings
```

## Demo mode and live mode

Without credentials the portal runs in **demo mode**: it renders the
sample data in `src/lib/demo.js`, never touches the network, and shows an
amber badge. That is the intended state before a Supabase project exists
— `pnpm dev` works on a fresh clone with no setup.

The sample records are shaped exactly like the rows `src/lib/api.js`
returns: same field names, same integer cents, same nested fund. That is
what lets a view render without knowing which mode it is in, and it is
why there is no `hydrate()` step translating one shape into another.

Adding credentials switches everything to **live mode**, where every page
requires a session and all data comes from Supabase.

```bash
cp .env.example .env    # then fill in the two values
```

Both come from **Project Settings → API** in the Supabase dashboard. The
anon key is meant to be public; Row Level Security is what protects the
data. The `service_role` key must never appear in `.env` — anything
prefixed `VITE_` is compiled into the JavaScript every visitor downloads,
and `pnpm check` fails the build if one turns up.

## Access control

Roles and permissions resolve into **capabilities** in
`src/lib/access.js`. A view declares the one it needs; the rail and the
router both filter on that list, so a link is shown exactly when
following it would work.

| Capability | What it opens | Who has it |
|---|---|---|
| `give` | Account, Give, History, Recurring | anyone with an active account |
| `serve` | Plans, Teams, Songs, Live | anyone with an active account |
| `finance` | Today, Reconcile, Expenses, Giving | `admin`, `finance`, or the `finance` permission |
| `approve` | the approve/deny buttons on Expenses | `admin`, `finance`, `staff`, or the `approve` permission |
| `people` | People | `admin`, or the `people` permission |
| `accounts` | Funds | `admin`, `finance`, or the `payouts` permission |
| `admin` | Accounts | `admin` |

A role always implies its capabilities — a finance lead cannot be locked
out of the books by an empty permissions object — while a permission can
add one to somebody whose role does not carry it. `pnpm check` asserts
this table.

Worth being clear about what the gate does and does not do: it keeps
people out of the *interface*. The HTML and JavaScript are static files
and can always be downloaded by anyone who knows the URL. **Row Level
Security and the Edge Function's admin check are the real boundary** — a
signed-out visitor who fetches the page directly still gets nothing back
from the database.

## Signing in

There is no separate login page. With no session, `index.html` renders
the sign-in view instead of the rail — password, one-time link, or
choosing a new password after a reset, all on the same screen. Password
recovery links return to `/?recovery=1`.

## Account management

The Accounts view covers adding people, editing roles and permissions,
setting passwords, emailing reset links, deactivating, and deleting.

Creating users and setting passwords require the `service_role` key,
which cannot live in a browser. Those operations run in an Edge Function
that verifies the caller's JWT and re-reads their role from the database
before acting:

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
appears in the books is refused until confirmed a second time —
deactivating keeps the audit trail whole.

## Language

Spanish by default, English on the switch in the rail, remembered per
person in `localStorage`. Every string in the portal lives in
`src/lib/i18n.js`; `pnpm check` fails if one is looked up but missing, or
exists in one language and not the other.

## Adding a view

Write the module, then add one line to `src/views/index.js`:

```js
export default {
  id: "reports",              // the route: #/reports
  group: "money",             // the heading it sits under
  cap: "finance",             // the capability it needs
  icon: "M3 15V9M7 15V4…",    // an 18x18 stroked path
  label: () => t("navReports"),
  crumb: () => t("crumbReports"),
  title: () => t("navReports"),
  count: () => pendingThings().length,   // optional rail badge
  render: (ctx) => `…`,                  // HTML, as a string
  handlers: { "reports:filter": ({ value }) => { … } },
};
```

Views return HTML strings and name their handlers; `app.js` keeps one
delegated listener on the document and dispatches by `data-act`, so
replacing a view takes its handlers with it and leaves nothing to unbind.
Writes go through `src/lib/store.js`, which does the right thing in both
demo and live mode, so a view never branches on which one it is in.

## Schema

The table and column names live in `src/lib/supabase.js` (`TABLES`), so a
differing schema is a one-place change.

Expected tables: `profiles`, `funds`, `donations`, `expenses`, `payouts`,
`bank_transactions`, `reconciliation_matches`, `ledger_entries`,
`payment_methods`, `recurring_gifts`.

**Services has no tables yet.** Plans, Teams, Songs and Live read
`src/lib/demo.js` in both modes, and the Plans view says so on screen
rather than letting the badge imply the schedule is real. Wiring it up
means adding those tables plus reads in `src/lib/api.js` and a branch in
`store.load()`.
