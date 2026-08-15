/* ============================================================
   Somos Reino — admin user management
   ------------------------------------------------------------
   Creating users, changing passwords, and deleting accounts all
   need the service_role key. That key must never reach a
   browser, so every one of those operations runs here.

   Each request is checked twice before anything happens:

     1. the caller's JWT is verified against Supabase Auth
     2. the caller's own profile row must have role = 'admin'

   Step 2 reads the database with the service client, so a
   caller cannot talk their way past it by editing their token.

   Deploy:  supabase functions deploy admin-users
   ============================================================ */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/* Tighten to your own origin(s) before going live. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MIN_PASSWORD_LENGTH = 8;
const ROLES = ["admin", "finance", "member"];
const PERMISSION_KEYS = ["finance", "approve", "refund", "people", "payouts"];
/* A banned user cannot sign in. ~100 years stands in for "until lifted". */
const BAN_FOREVER = "876000h";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const bad = (message: string, status = 400) => json({ error: message }, status);

/** Normalize an incoming permissions object to the five known flags. */
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

/** Resolve the caller and confirm they are an admin. */
async function requireAdmin(req: Request, service: SupabaseClient) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: bad("Sign in first.", 401) };

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await asCaller.auth.getUser();
  if (error || !user) return { error: bad("Your session is no longer valid. Sign in again.", 401) };

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) return { error: bad(`Could not verify your access: ${profileError.message}`, 500) };
  if (!profile) return { error: bad("No profile is linked to this account.", 403) };
  if (profile.is_active === false) return { error: bad("This account has been deactivated.", 403) };
  if (profile.role !== "admin") return { error: bad("Only administrators can manage accounts.", 403) };

  return { callerId: user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return bad("Use POST.", 405);

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

  switch (action) {
    /* ---------------- list ---------------- */
    case "list": {
      const { data: profiles, error } = await service
        .from("profiles")
        .select("*")
        .order("full_name");
      if (error) return bad(`Could not load people: ${error.message}`, 500);

      /* Merge in auth-side facts the profiles table doesn't carry. */
      const { data: authUsers, error: authError } = await service.auth.admin.listUsers({ perPage: 1000 });
      if (authError) return bad(`Could not load sign-in details: ${authError.message}`, 500);

      const byId = new Map(authUsers.users.map((u) => [u.id, u]));
      const users = (profiles ?? []).map((p) => {
        const authUser = byId.get(p.id);
        return {
          ...p,
          last_sign_in_at: authUser?.last_sign_in_at ?? null,
          email_confirmed: Boolean(authUser?.email_confirmed_at),
          banned: Boolean((authUser as { banned_until?: string } | undefined)?.banned_until),
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

      const { data: created, error } = await service.auth.admin.createUser({
        email,
        password: password || undefined,
        email_confirm: true,
      });
      if (error) return bad(`Could not create the account: ${error.message}`);

      const userId = created.user.id;
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

      /* Don't leave an auth user stranded without a profile. */
      if (profileError) {
        await service.auth.admin.deleteUser(userId);
        return bad(`Could not save the profile: ${profileError.message}`, 500);
      }

      /* No password given means they set their own via an invite link. */
      if (!password) {
        await service.auth.admin.generateLink({ type: "invite", email });
      }

      return json({ userId, invited: !password });
    }

    /* ---------------- update ---------------- */
    case "update": {
      if (!targetId) return bad("Which account?");

      const patch: Record<string, unknown> = {};
      if (body.fullName !== undefined) patch.full_name = String(body.fullName).trim();
      if (body.phone !== undefined) patch.phone = body.phone ? String(body.phone) : null;
      if (body.teamName !== undefined) patch.team_names = body.teamName ? [String(body.teamName)] : [];
      if (body.permissions !== undefined) patch.permissions = cleanPermissions(body.permissions);

      if (body.role !== undefined) {
        const role = String(body.role);
        if (!ROLES.includes(role)) return bad("Unknown role.");
        if (isSelf && role !== "admin") return bad("You can't remove your own administrator role.");
        patch.role = role;
      }

      const newEmail = body.email ? String(body.email).trim().toLowerCase() : "";
      if (newEmail) {
        const { error } = await service.auth.admin.updateUserById(targetId, { email: newEmail });
        if (error) return bad(`Could not change the email: ${error.message}`);
        patch.email = newEmail;
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

      const { error } = await service.auth.admin.updateUserById(targetId, { password });
      if (error) return bad(`Could not set the password: ${error.message}`);

      return json({ ok: true });
    }

    /* ---------------- sendPasswordReset ---------------- */
    case "sendPasswordReset": {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email) return bad("An email address is required.");

      const { error } = await service.auth.admin.generateLink({ type: "recovery", email });
      if (error) return bad(`Could not send the reset link: ${error.message}`);

      return json({ ok: true });
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

      /* Banning is what actually stops a sign-in; the profile flag
         only controls what the portals render. */
      const { error: banError } = await service.auth.admin.updateUserById(targetId, {
        ban_duration: active ? "none" : BAN_FOREVER,
      });
      if (banError) return bad(`Access flag saved, but sign-in was not blocked: ${banError.message}`, 500);

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

      const { error } = await service.auth.admin.deleteUser(targetId);
      if (error) return bad(`Could not delete the account: ${error.message}`);

      return json({ ok: true, deletedRecords: records });
    }

    default:
      return bad(`Unknown action "${action}".`);
  }
});
