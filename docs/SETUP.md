# Setup: Clerk for sign-in, plain Postgres for data

## The pieces

```
 browser pages ──(Clerk token)──▶ Data API ──▶ PostgreSQL   (reads & writes; Row Level Security decides who sees what)
      │
      ├──(Clerk token)──▶ api/admin-users ──▶ Clerk (secret key) + PostgreSQL (owner login)
      │
      └── sign-in ──▶ Clerk
```

- **Clerk** owns accounts, passwords, codes, and sessions. The database never sees a password.
- **PostgreSQL** (14+, any host) holds all the church's data. `db/migrations/` is the whole schema.
- **A Data API** is a PostgREST-compatible web address in front of the database. The pages query it
  directly; it verifies the Clerk token and tells the database who is asking. Row Level Security —
  the policies in the migration — is what keeps a member from reading anyone else's giving.
  Options: Neon's Data API, or PostgREST itself on any host.
- **`api/admin-users`** is the one serverless function. It holds secrets (Clerk's secret key and a
  database login that can write anywhere), so adding people, resetting passwords, deactivating and
  deleting happen there, behind a check that the caller is an admin.

This removes the *vendor* (Supabase), not the *pattern*. A Data API is what lets the pages stay plain
HTML and keeps the security rules in the database where they were tested. The alternative — your own
API that re-implements every rule in application code — is possible but a much larger rewrite.

## What is verified, and what is not

| | |
|---|---|
| Schema on plain PostgreSQL 16, no host-specific pieces (roles, grants, policies, triggers) | **Tested** — 48 checks |
| Deactivated or profile-less accounts read and write nothing, even with a still-valid token | **Tested** (this was a real gap, found and fixed during the move) |
| `api/admin-users` logic against a real database with a stand-in Clerk | **Tested** — 36 checks (authorization, create/update/delete, SQL-injection attempts, transaction clean-up) |
| Browser data client: carries the Clerk token on reads, writes and function calls; sends none when signed out; function errors come through readably | **Tested** against stand-ins |
| Demo mode on all 8 portals, login page, both build modes | **Tested** |
| **A real Clerk sign-in** | **Not tested** — Clerk's servers are not reachable from the build environment |
| **A real Data API accepting a real Clerk token** (Neon or PostgREST) | **Not tested** — the settings below are from memory of how PostgREST works; check each against your provider's current docs |
| **The Vercel function wiring** (`api/admin-users.js`) | **Not tested** — written for Vercel's Web-standard handlers; unverified |

The first real sign-in is the first real test of the three bottom rows. If something fails, the likely
places are, in order: the Clerk token not carrying `"role": "authenticated"`, the Data API not trusting
Clerk's signing keys, and the function's environment variables.

## 1. Database and Data API

Create a PostgreSQL database and apply `db/migrations/20261108000000_church_os_core.sql` **as the
database owner**. It is safe to re-run. It creates the `anon` and `authenticated` roles if missing, and
grants `anon` nothing.

Then expose the database through a Data API that:

1. connects as an `authenticator`-style login that may `SET ROLE authenticated` (and `anon`);
2. **verifies Clerk's tokens** — it needs Clerk's public signing keys, published as JWKS at
   `https://<your-clerk-domain>/.well-known/jwks.json` (for the dev instance:
   `kind-orca-6383.clerk.accounts.dev`);
3. switches to the role named in the token's `role` claim, and exposes the claims to the session as
   `request.jwt.claims` — the PostgREST convention the schema's `jwt_sub()` reads.

Clerk's session tokens carry no `role` claim by default. In the Clerk dashboard, customize the session
token to add `{ "role": "authenticated" }` (name of the setting may have moved).

- **Neon:** its Data API is PostgREST-compatible and has a Clerk option. Follow Neon's current docs; I
  could not reach them from the build environment, so none of its specifics are confirmed here.
- **PostgREST yourself:** `db-schemas = "public"`, `db-anon-role = "anon"`, `jwt-secret` = the JWKS
  document, `role-claim-key = ".role"`. Run it anywhere that can reach the database; put TLS in front.

Set `VITE_DATA_API_URL` to its address.

## 2. Clerk

- **User & authentication:** enable *Email address*, plus at least one of *Email verification code*
  (recommended — no passwords to manage) or *Password*.
- **Sign-up mode: restricted.** The portal is for people the church has added.
- **Session token:** add the `role` claim above.
- Copy the **publishable key** (`pk_test_…`) into `VITE_CLERK_PUBLISHABLE_KEY`. Copy the **secret key**
  (`sk_…`) only into the function's environment — never a `VITE_` variable, never a file in the repo.
- For production, create a production Clerk instance (`pk_live_…`) and swap the keys.

## 3. The admin function

`api/admin-users.js` needs, in its environment:

| Variable | |
|---|---|
| `CLERK_SECRET_KEY` | required |
| `DATABASE_URL` | required — a login that **owns** the tables (it bypasses Row Level Security, which is why the handler checks for an admin first). Not the Data API's login. |
| `CLERK_AUTHORIZED_PARTIES` | optional but recommended — your portal's origin, e.g. `https://portal.example.org`; tokens issued for any other page are refused |
| `ALLOWED_ORIGIN` | only if the pages are on a different origin than the function |

Deploy the pages and `api/` together (same site, under `/api`) and `VITE_API_URL` can stay blank.
`server/admin-users.js` is host-neutral (Request in, Response out); only `api/admin-users.js` is
Vercel-shaped, and another host needs a different two-line wrapper.

## 4. First run

There is no admin until someone is made one:

1. Apply the migration.
2. In the Clerk dashboard: **Users → Create user** for yourself (email, verified). Copy the user id
   (`user_…`).
3. As the database owner, create your profile — the one hand-made row:
   `insert into profiles (id, email, full_name, role) values ('user_…', 'you@example.org', 'Your Name', 'admin');`
4. Set `VITE_DATA_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY`, run `pnpm dev`, open `/login.html`, sign in.
   From then on add everyone else from **Settings**.

## 5. Nightly follow-up rules

`select run_scheduled_follow_up_rules();` creates absence and birthday follow-ups. Run it once a day as
the database owner from any scheduler — `pg_cron` if your host has it, otherwise a scheduled job. It
never creates a duplicate while one is open. It is deliberately not callable from a browser.

## How access works

- A **profile** (role + permissions) is what makes a Clerk account a person with access. Profiles are
  only ever created by an administrator, through the function. A Clerk account with no profile sees
  "no access" and can read nothing.
- The database identifies the caller through `requesting_user_id()`: the Clerk user id from the token,
  **only if** that person has an active profile. Deactivating someone therefore cuts off every read and
  write at once — including their own records — even while their token is still valid. (Their own
  profile row stays readable so the app can say *why*.)
- Pages hide what you cannot open, but that is presentation; the policies are the enforcement.

## Differences from the old Supabase sign-in

- **No emailed invite or reset link from the Settings screen.** Clerk has no admin call for that. A new
  person signs in with a code emailed to them (or the password you set); anyone can use *Forgot
  password?* on the sign-in page.
- **Open sign-up is closed on purpose.** Someone invited from the Clerk dashboard (not from Settings)
  will see "no access" until an admin adds their profile.
- The pages use `@supabase/postgrest-js` — a small, standalone, MIT-licensed PostgREST client. It is the
  only remaining "supabase" name in the repo and has no connection to the Supabase service.
