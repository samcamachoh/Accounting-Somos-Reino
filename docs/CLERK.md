# Moving sign-in to Clerk (keeping Supabase for data)

Decision: **Clerk handles accounts and sign-in; Supabase stays the database.**
Supabase accepts Clerk session tokens (its "third-party auth" support), so
Row Level Security keeps protecting the data — it just keys on the Clerk user
id instead of a Supabase one.

## Status

| Piece | State |
|---|---|
| Schema keyed on Clerk user ids (`requesting_user_id()`, text `profiles.id`) | **Done and tested** (31 checks on Postgres 16) |
| Clerk SDK in the pages, `login.html` replaced, `src/lib/auth.js` reading the Clerk session | Not started — needs Clerk access (below) |
| `admin-users` function creating/disabling accounts through Clerk's backend API | Not started — **it still uses Supabase Auth and UUID ids, so it does not match the new schema until it is moved** |
| Dashboard settings (below) | Needs you |

Until the last three are done, do not apply the migration to a live project
and expect the existing sign-in to work: the schema and the app are mid-move.

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
   integration so session tokens carry `"role": "authenticated"`.
2. **Supabase → Authentication → Third-party auth.** Add Clerk, using your
   Clerk domain.
3. **Clerk → sign-up mode: restricted / invitation-only.** The portal is for
   people the church has added; open sign-up would create accounts that are
   then (correctly) refused, but it's noise.
4. **First admin.** There is no admin until someone is made one. After you
   sign in once and the profile exists, in the Supabase SQL editor:
   `update profiles set role = 'admin' where email = 'you@example.com';`
   (For the very first account, create the profile row by hand with your
   Clerk user id, role `admin`.)
5. Secrets: the Clerk **secret** key goes in as a Supabase function secret
   (`supabase secrets set CLERK_SECRET_KEY=…`). The **publishable** key is
   safe in the browser build (`VITE_CLERK_PUBLISHABLE_KEY`). Never commit the
   secret.

## Not changing

Row Level Security, every table, and all the data functions in
`src/lib/api.js` are unchanged — they run as whoever the token says.
