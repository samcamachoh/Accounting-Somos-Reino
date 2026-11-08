/* ============================================================
   Somos Reino — admin user management (Clerk)
   ------------------------------------------------------------
   Creating accounts, setting passwords, and deleting people all
   need secret keys. Those must never reach a browser, so every
   one of those operations runs here.

   Sign-in is Clerk's; the database holds each person's role and
   permissions in `profiles`, keyed by their Clerk user id. A
   profile is only ever created HERE, by an administrator — that
   is what keeps anyone from choosing their own role.

   Each request is checked twice before anything happens:

     1. the caller's Clerk session token is verified with
        CLERK_SECRET_KEY (signature, expiry, and — when set —
        the page origin it was issued for)
     2. the caller's own profile row must have role = 'admin'

   Step 2 reads the database with the service client, so a
   caller cannot talk their way past it by editing their token.

   Secrets (set with `supabase secrets set`, never committed):
     CLERK_SECRET_KEY           required
     CLERK_AUTHORIZED_PARTIES   optional, comma-separated origins,
                                e.g. https://portal.somosreino.org
   Supabase supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

   Deploy:  supabase functions deploy admin-users
   ============================================================ */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";
import { createClerkClient, verifyToken } from "npm:@clerk/backend@3.27.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY") ?? "";
const AUTHORIZED_PARTIES = (Deno.env.get("CLERK_AUTHORIZED_PARTIES") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

/* Tighten to your own origin(s) before going live. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MIN_PASSWORD_LENGTH = 8;
const ROLES = ["admin", "finance", "member"];
const PERMISSION_KEYS = ["finance", "approve", "refund", "people", "payouts", "calendar", "followups"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const bad = (message: string, status = 400) => json({ error: message }, status);

/** Clerk's errors carry a readable first message; fall back to the generic one. */
function clerkMessage(error: unknown): string {
  const e = error as { errors?: { longMessage?: string; message?: string }[]; message?: string };
  return e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e?.message || "Unknown error";
}

/** Normalize an incoming permissions object to the known flags. */
function cleanPermissions(input: unknown) {
  if (!input || typeof input !== "object") return undefined;
  const out: Record<string, boolean> = {};
  for (const key of PERMISSION_KEYS) out[key] = Boolean((input as Record<string, unknown>)[key]);
  return out;
}

function checkPassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/** "Ana María Beltrán" → first "Ana", last "María Beltrán". */
function splitName(full: string) {
  const [first, ...rest] = full.trim().split(/\s+/);
  return { firstName: first ?? "", lastName: rest.join(" ") };
}

/** Resolve the caller from their Clerk token and confirm they are an admin. */
// deno-lint-ignore no-explicit-any
async function requireAdmin(req: Request, service: SupabaseClient<any, "public", any>) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: bad("Sign in first.", 401) };

  const verified = await verifyToken(token, {
    secretKey: CLERK_SECRET_KEY,
    ...(AUTHORIZED_PARTIES.length ? { authorizedParties: AUTHORIZED_PARTIES } : {}),
  });
  /* `sub` is the Clerk user id. */
  const callerId = (verified.data as { sub?: string } | undefined)?.sub;
  if (verified.errors || !callerId) return { error: bad("Your session is no longer valid. Sign in again.", 401) };

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", callerId)
    .maybeSingle();

  if (profileError) return { error: bad(`Could not verify your access: ${profileError.message}`, 500) };
  if (!profile) return { error: bad("No profile is linked to this account.", 403) };
  if (profile.is_active === false) return { error: bad("This account has been deactivated.", 403) };
  if (profile.role !== "admin") return { error: bad("Only administrators can manage accounts.", 403) };

  return { callerId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return bad("Use POST.", 405);
  if (!CLERK_SECRET_KEY) return bad("The server is missing CLERK_SECRET_KEY.", 500);

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

  const gate = await requireAdmin(req, service);
  if (gate.error) return gate.error;
  const callerId = gate.callerId!;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Expected a JSON body.");
  }

  const action = String(body.action ?? "");
  const targetId = typeof body.id === "string" ? body.id : "";

  /* Guard rails that keep an admin from locking everyone out. */
  const isSelf = targetId && targetId === callerId;

  try {
    switch (action) {
      /* ---------------- list ---------------- */
      case "list": {
        const { data: profiles, error } = await service.from("profiles").select("*").order("full_name");
        if (error) return bad(`Could not load people: ${error.message}`, 500);

        /* Merge in sign-in facts the profiles table doesn't carry. */
        const byId = new Map<string, { lastSignInAt: number | null; banned: boolean }>();
        for (let offset = 0; ; offset += 500) {
          const page = await clerk.users.getUserList({ limit: 500, offset });
          for (const u of page.data) byId.set(u.id, { lastSignInAt: u.lastSignInAt, banned: u.banned });
          if (offset + page.data.length >= page.totalCount || page.data.length === 0) break;
        }

        const users = (profiles ?? []).map((p) => {
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
        let userId: string;
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

        const { error: profileError } = await service.from("profiles").upsert({
          id: userId,
          email,
          full_name: fullName,
          role,
          phone: body.phone ? String(body.phone) : null,
          team_names: body.teamName ? [String(body.teamName)] : [],
          permissions: cleanPermissions(body.permissions) ?? {},
          is_active: true,
        });

        /* Don't leave a Clerk account stranded without a profile. */
        if (profileError) {
          await clerk.users.deleteUser(userId).catch(() => {});
          return bad(`Could not save the profile: ${profileError.message}`, 500);
        }

        return json({ userId, invited: false, signInWith: password ? "password" : "email-code" });
      }

      /* ---------------- update ---------------- */
      case "update": {
        if (!targetId) return bad("Which account?");

        const patch: Record<string, unknown> = {};
        const clerkPatch: Record<string, string> = {};
        if (body.fullName !== undefined) {
          const name = String(body.fullName).trim();
          patch.full_name = name;
          Object.assign(clerkPatch, splitName(name));
        }
        if (body.phone !== undefined) patch.phone = body.phone ? String(body.phone) : null;
        if (body.teamName !== undefined) patch.team_names = body.teamName ? [String(body.teamName)] : [];
        if (body.permissions !== undefined) patch.permissions = cleanPermissions(body.permissions);

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

        if (Object.keys(patch).length) {
          const { error } = await service.from("profiles").update(patch).eq("id", targetId);
          if (error) return bad(`Could not save the changes: ${error.message}`);
        }

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
          400,
        );
      }

      /* ---------------- setActive ---------------- */
      case "setActive": {
        if (!targetId) return bad("Which account?");
        const active = Boolean(body.active);
        if (isSelf && !active) return bad("You can't deactivate your own account.");

        const { error } = await service
          .from("profiles")
          .update({ is_active: active, disabled_at: active ? null : new Date().toISOString() })
          .eq("id", targetId);
        if (error) return bad(`Could not update the account: ${error.message}`);

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
        const [{ count: donationCount }, { count: expenseCount }] = await Promise.all([
          service.from("donations").select("id", { count: "exact", head: true }).eq("profile_id", targetId),
          service.from("expenses").select("id", { count: "exact", head: true }).eq("submitter_id", targetId),
        ]);

        const records = (donationCount ?? 0) + (expenseCount ?? 0);
        if (records > 0 && !body.force) {
          return bad(
            `This person has ${records} financial record${records === 1 ? "" : "s"} in the books. ` +
            `Deactivate the account instead to keep the audit trail, or confirm again to delete anyway.`,
            409,
          );
        }

        try { await clerk.users.deleteUser(targetId); }
        catch (error) { return bad(`Could not delete the account: ${clerkMessage(error)}`); }

        /* Profiles no longer cascade from a sign-in table, so remove it here.
           Their gifts and follow-ups keep their rows; the link just clears. */
        const { error: profileError } = await service.from("profiles").delete().eq("id", targetId);
        if (profileError) return bad(`The sign-in was deleted, but the profile was not: ${profileError.message}`, 500);

        return json({ ok: true, deletedRecords: records });
      }

      default:
        return bad(`Unknown action "${action}".`);
    }
  } catch (error) {
    return bad(`Something went wrong: ${clerkMessage(error)}`, 500);
  }
});
