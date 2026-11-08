# Moving sign-in to Clerk (keeping Supabase for data)

Decision: **Clerk handles accounts and sign-in; Supabase stays the database.**
Supabase accepts Clerk session tokens (its "third-party auth" support), so
Row Level Security keeps protecting the data — it just keys on the Clerk user
id instead of a Supabase one.

## Status

| Piece | State |
|---|---|
| Schema keyed on Clerk user ids (`requesting_user_id()`, text `profiles.id`) | Done — 31 checks on Postgres 16 |
| Browser: `src/lib/clerk.js`, `login.html`, `auth.js`, Supabase client sending the Clerk token | Done — builds; demo mode unchanged on all 8 pages; token and profile lookup verified with a stand-in session |
| `admin-users` function on Clerk (create, update, password, deactivate, delete) | Done — type-checked against Clerk's and Supabase's real types, and 28 behaviour checks against stand-ins for both |
| **A real sign-in against your Clerk instance** | **Not tested.** Clerk's servers are not reachable from the build environment, so nothing here has talked to real Clerk. First sign-in is the first real test. |
| Dashboard settings (below) | Needs you |

Do the settings below, then follow "First run". If something misbehaves, the
most likely places are the Clerk→Supabase token (setting 1 and 2) and the
sign-in methods enabled in Clerk (setting 3).

## How it fits together

- The browser signs in with Clerk, then gives Supabase the Clerk session
  token on every request (`createClient(url, key, { accessToken })`).
- The database reads who you are from the token's `sub` claim, which is the
  Clerk user id: `requesting_user_id()` in the migration. Every policy and
  helper uses it.
- A person's `profiles` row (role, permissions) is created **on the server**,
  never by the browser, when an admin invites them. A Clerk account with no
  profile row gets the existing "no access" screen. This is deliberate:
  if the browser could create its own profile, it could also choose its own
  role and claim someone else's records by email.
- `admin-users` stays the only place that holds a secret key. It will verify
  the caller's Clerk token itself and re-read their role from the database,
  as it does today. (Set `verify_jwt = false` for it in `supabase/config.toml`
  and verify the token in the function; the gateway check is built for
  Supabase's own tokens.)

## Settings to make (names may have moved — check Clerk's and Supabase's current docs)

1. **Clerk → Supabase connection.** In the Clerk dashboard, turn on the Supabase
   integration so session tokens carry `"role": "authenticated"` (without it
   Supabase treats every request as anonymous and returns nothing).
2. **Supabase → Authentication → Third-party auth.** Add Clerk, using your
   Clerk domain (for this instance, `kind-orca-6383.clerk.accounts.dev`).
3. **Clerk → User & authentication.** Enable *Email address* and at least one of
   *Email verification code* (recommended — no passwords to manage) or
   *Password*. People are created by the admin function with a verified
   email, so they can use either straight away.
4. **Clerk → sign-up mode: restricted.** The portal is for people the church
   has added. (Accounts created by the admin function are not blocked by this.)
5. **Secrets** on the function: `CLERK_SECRET_KEY` (required) and
   `CLERK_AUTHORIZED_PARTIES` (your portal's origin; optional but recommended).
   The **publishable** key goes in the build as `VITE_CLERK_PUBLISHABLE_KEY`
   (`pk_test_a2luZC1vcmNhLTYzODMuY2xlcmsuYWNjb3VudHMuZGV2JA` for the dev
   instance). Never commit a secret key.
6. In production, create a **production** Clerk instance (`pk_live_…`) and swap
   the keys; development keys are rate-limited and not for real use.

## First run

There is no admin until someone is made one:

1. Apply `supabase/migrations/…_church_os_core.sql` to the Supabase project.
2. In the Clerk dashboard, **Users → Create user** for yourself (email,
   verified). Copy the user id (`user_…`).
3. In the Supabase SQL editor, create your profile — the one hand-made row:
   `insert into profiles (id, email, full_name, role) values ('user_…', 'you@example.org', 'Your Name', 'admin');`
4. Set the three `VITE_` values, run `pnpm dev`, open `/login.html`, sign in.
   From then on add everyone else from **Settings**.

## Known differences from the Supabase sign-in

- **No emailed invite or reset link from the admin screen.** Clerk has no admin
  call for that. People sign in with an emailed code, or use *Forgot password?*
  on the sign-in page.
- **Open sign-up is closed on purpose** (setting 4). Someone invited from the
  Clerk dashboard (not from Settings) can create a Clerk account but will see
  "no access" until an admin adds their profile.
- `supabase.auth.*` no longer works in the browser; the client is configured
  to send Clerk's token instead. Use `src/lib/auth.js`.

## Not changing

Row Level Security, every table, and all the data functions in
`src/lib/api.js` are unchanged — they run as whoever the token says.
