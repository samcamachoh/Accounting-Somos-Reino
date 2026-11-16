/* ============================================================
   Somos Reino — admin user management
   ------------------------------------------------------------
   Creating accounts, setting passwords, and deleting people all
   need secrets (Clerk's secret key, a database login that can
   write anywhere). Those must never reach a browser, so every
   one of those operations runs here.

   Sign-in is Clerk's; the database holds each person's role and
   permissions in `profiles`, keyed by their Clerk user id. A
   profile is only ever created HERE, by an administrator — that
   is what keeps anyone from choosing their own role.

   Each request is checked twice before anything happens:

     1. the caller's Clerk session token is verified (signature,
        expiry, and — when configured — the origin it was issued for)
     2. the caller's own profile row must have role = 'admin'

   Step 2 reads the database, so a caller cannot talk their way
   past it by editing their token.

   This file is host-neutral: it takes a Request and returns a
   Response, with its dependencies handed in. api/admin-users.js
   wires the real ones; the tests wire stand-ins.
   ============================================================ */

const MIN_PASSWORD_LENGTH = 8;
const ROLES = ["admin", "finance", "member"];
const PERMISSION_KEYS = ["finance", "approve", "refund", "people", "payouts", "calendar", "followups"];

/**
 * @param {object} deps
 * @param {(token:string)=>Promise<{data?:{sub?:string},errors?:unknown[]}>} deps.verifyToken
 * @param {object} deps.clerk       Clerk backend client (users, emailAddresses).
 * @param {(sql:string, params?:unknown[])=>Promise<{rows:any[], rowCount:number|null}>} deps.query
 *        Runs SQL as the database OWNER — it bypasses Row Level Security, which is exactly why
 *        every call below sits behind the admin check.
 * @param {string} [deps.allowedOrigin]  If the page is served from another origin, the only one let in.
 */
export function createHandler({ verifyToken, clerk, query, allowedOrigin = "" }) {
  const cors = allowedOrigin
    ? {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      }
    : {};

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const bad = (message, status = 400) => json({ error: message }, status);

  /** Clerk's errors carry a readable first message; fall back to the generic one. */
  const clerkMessage = (error) =>
    error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message || error?.message || "Unknown error";

  /** Normalize an incoming permissions object to the known flags. */
  const cleanPermissions = (input) => {
    if (!input || typeof input !== "object") return undefined;
    return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, Boolean(input[key])]));
  };

  const checkPassword = (password) =>
    typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH
      ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      : null;

  /** "Ana María Beltrán" → first "Ana", last "María Beltrán". */
  const splitName = (full) => {
    const [first, ...rest] = String(full).trim().split(/\s+/);
    return { firstName: first ?? "", lastName: rest.join(" ") };
  };

  /** Resolve the caller from their Clerk token and confirm they are an admin. */
  async function requireAdmin(request) {
    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return { error: bad("Sign in first.", 401) };

    const verified = await verifyToken(token).catch(() => ({ errors: [true] }));
    const callerId = verified.data?.sub; // the Clerk user id
    if (verified.errors || !callerId) return { error: bad("Your session is no longer valid. Sign in again.", 401) };

    let profile;
    try {
      profile = (await query("select id, role, is_active from profiles where id = $1", [callerId])).rows[0];
    } catch (error) {
      return { error: bad(`Could not verify your access: ${error.message}`, 500) };
    }
    if (!profile) return { error: bad("No profile is linked to this account.", 403) };
    if (profile.is_active === false) return { error: bad("This account has been deactivated.", 403) };
    if (profile.role !== "admin") return { error: bad("Only administrators can manage accounts.", 403) };

    return { callerId };
  }

  /** UPDATE profiles SET <whitelisted columns> WHERE id = $n — column names never come from the caller. */
  async function updateProfile(id, patch) {
    const columns = Object.keys(patch);
    if (!columns.length) return;
    const sets = columns.map((c, i) => (c === "permissions" ? `${c} = $${i + 1}::jsonb` : `${c} = $${i + 1}`));
    const values = columns.map((c) => (c === "permissions" ? JSON.stringify(patch[c]) : patch[c]));
    await query(`update profiles set ${sets.join(", ")} where id = $${columns.length + 1}`, [...values, id]);
  }

  return async function handle(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return bad("Use POST.", 405);

    const gate = await requireAdmin(request);
    if (gate.error) return gate.error;
    const { callerId } = gate;

    let body;
    try {
      body = await request.json();
    } catch {
      return bad("Expected a JSON body.");
    }

    const action = String(body?.action ?? "");
    const targetId = typeof body.id === "string" ? body.id : "";

    /* Guard rails that keep an admin from locking everyone out. */
    const isSelf = targetId && targetId === callerId;

    try {
      switch (action) {
        /* ---------------- list ---------------- */
        case "list": {
          const profiles = (await query("select * from profiles order by full_name")).rows;

          /* Merge in sign-in facts the profiles table doesn't carry. */
          const byId = new Map();
          for (let offset = 0; ; offset += 500) {
            const page = await clerk.users.getUserList({ limit: 500, offset });
            for (const u of page.data) byId.set(u.id, { lastSignInAt: u.lastSignInAt, banned: u.banned });
            if (offset + page.data.length >= page.totalCount || page.data.length === 0) break;
          }

          const users = profiles.map((p) => {
            const c = byId.get(p.id);
            return {
              ...p,
              last_sign_in_at: c?.lastSignInAt ? new Date(c.lastSignInAt).toISOString() : null,
              email_confirmed: Boolean(c),
              banned: Boolean(c?.banned),
            };
          });

          return json({ users, callerId });
        }

        /* ---------------- create ---------------- */
        case "create": {
          const email = String(body.email ?? "").trim().toLowerCase();
          const fullName = String(body.fullName ?? "").trim();
          const role = ROLES.includes(String(body.role)) ? String(body.role) : "member";
          if (!email) return bad("An email address is required.");
          if (!fullName) return bad("A name is required.");

          const password = body.password ? String(body.password) : "";
          if (password) {
            const problem = checkPassword(password);
            if (problem) return bad(problem);
          }

          /* The account is created already verified, so the person can sign in
             straight away — with the password if one was set, otherwise with
             an emailed code (turn on "Email verification code" in Clerk).
             Clerk sends no mail when an admin creates a user, so tell them
             to visit the sign-in page. */
          let userId;
          try {
            const created = await clerk.users.createUser({
              emailAddress: [email],
              ...splitName(fullName),
              ...(password ? { password } : { skipPasswordRequirement: true }),
            });
            userId = created.id;
          } catch (error) {
            return bad(`Could not create the account: ${clerkMessage(error)}`);
          }

          try {
            await query(
              `insert into profiles (id, email, full_name, role, phone, team_names, permissions, is_active)
               values ($1, $2, $3, $4, $5, $6, $7::jsonb, true)
               on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, role = excluded.role,
                 phone = excluded.phone, team_names = excluded.team_names, permissions = excluded.permissions, is_active = true`,
              [
                userId, email, fullName, role,
                body.phone ? String(body.phone) : null,
                body.teamName ? [String(body.teamName)] : [],
                JSON.stringify(cleanPermissions(body.permissions) ?? {}),
              ],
            );
          } catch (error) {
            /* Don't leave a Clerk account stranded without a profile. */
            await clerk.users.deleteUser(userId).catch(() => {});
            return bad(`Could not save the profile: ${error.message}`, 500);
          }

          return json({ userId, invited: false, signInWith: password ? "password" : "email-code" });
        }

        /* ---------------- update ---------------- */
        case "update": {
          if (!targetId) return bad("Which account?");

          const patch = {};
          const clerkPatch = {};
          if (body.fullName !== undefined) {
            const name = String(body.fullName).trim();
            patch.full_name = name;
            Object.assign(clerkPatch, splitName(name));
          }
          if (body.phone !== undefined) patch.phone = body.phone ? String(body.phone) : null;
          if (body.teamName !== undefined) patch.team_names = body.teamName ? [String(body.teamName)] : [];
          if (body.permissions !== undefined) patch.permissions = cleanPermissions(body.permissions) ?? {};

          if (body.role !== undefined) {
            const role = String(body.role);
            if (!ROLES.includes(role)) return bad("Unknown role.");
            if (isSelf && role !== "admin") return bad("You can't remove your own administrator role.");
            patch.role = role;
          }

          /* Change the sign-in email: add the new one as the verified primary,
             then remove the old, so the old address can't still be used to get in. */
          const newEmail = body.email ? String(body.email).trim().toLowerCase() : "";
          if (newEmail) {
            try {
              const user = await clerk.users.getUser(targetId);
              const current = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
              if (current?.emailAddress.toLowerCase() !== newEmail) {
                await clerk.emailAddresses.createEmailAddress({ userId: targetId, emailAddress: newEmail, verified: true, primary: true });
                for (const old of user.emailAddresses) await clerk.emailAddresses.deleteEmailAddress(old.id);
              }
            } catch (error) {
              return bad(`Could not change the email: ${clerkMessage(error)}`);
            }
            patch.email = newEmail;
          }

          if (Object.keys(clerkPatch).length) {
            try { await clerk.users.updateUser(targetId, clerkPatch); }
            catch (error) { return bad(`Could not update the name: ${clerkMessage(error)}`); }
          }

          try { await updateProfile(targetId, patch); }
          catch (error) { return bad(`Could not save the changes: ${error.message}`); }

          return json({ ok: true });
        }

        /* ---------------- setPassword ---------------- */
        case "setPassword": {
          if (!targetId) return bad("Which account?");
          const password = String(body.password ?? "");
          const problem = checkPassword(password);
          if (problem) return bad(problem);

          try { await clerk.users.updateUser(targetId, { password, signOutOfOtherSessions: true }); }
          catch (error) { return bad(`Could not set the password: ${clerkMessage(error)}`); }

          return json({ ok: true });
        }

        /* ---------------- sendPasswordReset ---------------- */
        case "sendPasswordReset": {
          /* Clerk has no admin call that emails a reset link: the reset flow
             lives on the sign-in page, where the person proves it is them. */
          return bad(
            "Clerk sends reset emails from the sign-in page. Ask them to choose “Forgot password?” there " +
            "(or to sign in with an emailed code). You can also set a new password for them here.",
          );
        }

        /* ---------------- setActive ---------------- */
        case "setActive": {
          if (!targetId) return bad("Which account?");
          const active = Boolean(body.active);
          if (isSelf && !active) return bad("You can't deactivate your own account.");

          try { await updateProfile(targetId, { is_active: active, disabled_at: active ? null : new Date().toISOString() }); }
          catch (error) { return bad(`Could not update the account: ${error.message}`); }

          /* The profile flag already cuts off every database read (the
             policies require is_active). Banning in Clerk also stops a new
             sign-in, so both are done. */
          try {
            if (active) await clerk.users.unbanUser(targetId);
            else await clerk.users.banUser(targetId);
          } catch (error) {
            return bad(`Access flag saved, but sign-in was not blocked: ${clerkMessage(error)}`, 500);
          }

          return json({ ok: true });
        }

        /* ---------------- delete ---------------- */
        case "delete": {
          if (!targetId) return bad("Which account?");
          if (isSelf) return bad("You can't delete your own account.");

          /* Deleting someone who appears in the books would tear a hole in
             the audit trail. Deactivating keeps the history intact. */
          const counts = await query(
            `select (select count(*) from donations where profile_id = $1)::int as donations,
                    (select count(*) from expenses where submitter_id = $1)::int as expenses`,
            [targetId],
          );
          const records = counts.rows[0].donations + counts.rows[0].expenses;
          if (records > 0 && !body.force) {
            return bad(
              `This person has ${records} financial record${records === 1 ? "" : "s"} in the books. ` +
              `Deactivate the account instead to keep the audit trail, or confirm again to delete anyway.`,
              409,
            );
          }

          try { await clerk.users.deleteUser(targetId); }
          catch (error) { return bad(`Could not delete the account: ${clerkMessage(error)}`); }

          /* Remove the profile too. Their gifts and follow-ups keep their rows;
             the link to the person just clears (ON DELETE SET NULL). */
          try { await query("delete from profiles where id = $1", [targetId]); }
          catch (error) { return bad(`The sign-in was deleted, but the profile was not: ${error.message}`, 500); }

          return json({ ok: true, deletedRecords: records });
        }

        default:
          return bad(`Unknown action "${action}".`);
      }
    } catch (error) {
      return bad(`Something went wrong: ${clerkMessage(error)}`, 500);
    }
  };
}
