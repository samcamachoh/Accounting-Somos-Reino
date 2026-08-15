/* ============================================================
   Somos Reino — admin user and family management
   ------------------------------------------------------------
   Creating users, changing passwords, and deleting accounts all
   need the service_role key. That key must never reach a
   browser, so every one of those operations runs here.

   Families ride along in the same function. They need no
   elevated key of their own, but keeping them here means one
   admin check, one round trip for the dashboard, and one place
   where "who may change this" is decided.

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
const PERMISSION_KEYS = ["finance", "approve", "refund", "people", "payouts", "families"];
/* A banned user cannot sign in. ~100 years stands in for "until lifted". */
const BAN_FOREVER = "876000h";

/* Where someone stands in their household. Null means "in the
   family, unspecified" — the dashboard leaves it blank rather
   than guessing. */
const FAMILY_ROLES = ["head", "spouse", "child", "other"];

/* Request field -> column, for everything on a family that is
   plain contact detail. `name` and `primary_contact_id` are
   handled on their own because both carry rules. */
const FAMILY_FIELDS: Record<string, string> = {
  email: "email",
  phone: "phone",
  addressLine1: "address_line1",
  addressLine2: "address_line2",
  city: "city",
  state: "state",
  postalCode: "postal_code",
  notes: "notes",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const bad = (message: string, status = 400) => json({ error: message }, status);

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

/** Trim to a string, or null when the field was cleared. */
const text = (value: unknown) => {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
};

/** Collect the contact fields a request is actually changing. */
function familyPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(FAMILY_FIELDS)) {
    if (body[field] !== undefined) patch[column] = text(body[field]);
  }
  if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);
  return patch;
}

/**
 * The household fields on a person. Returns an error message when
 * the request asks for something that isn't allowed.
 */
function familyMembership(body: Record<string, unknown>, patch: Record<string, unknown>): string | null {
  if (body.familyId !== undefined) {
    patch.family_id = body.familyId ? String(body.familyId) : null;
    /* Leaving a family takes the relationship with it — "child" of
       nothing is a leftover, not a fact. */
    if (!body.familyId) patch.family_role = null;
  }

  if (body.familyRole !== undefined) {
    const role = text(body.familyRole);
    if (role && !FAMILY_ROLES.includes(role)) return "Unknown household relationship.";
    /* Don't let a relationship survive the removal it was sent with. */
    if (!(body.familyId !== undefined && !body.familyId)) patch.family_role = role;
  }

  if (body.householdName !== undefined) patch.household_name = text(body.householdName);
  return null;
}

/**
 * A primary contact who doesn't live in the family would show a
 * stranger's phone number on the household card.
 */
async function checkPrimaryContact(
  service: SupabaseClient,
  familyId: string,
  contactId: string,
): Promise<string | null> {
  const { data, error } = await service
    .from("profiles")
    .select("family_id")
    .eq("id", contactId)
    .maybeSingle();

  if (error) return `Could not check that contact: ${error.message}`;
  if (!data) return "That person no longer has an account.";
  if (data.family_id !== familyId) return "The primary contact has to be a member of this family.";
  return null;
}

/**
 * Add this year's giving to each family, summed across its
 * members. Best effort: a project without a donations table
 * still gets its families back, with the total left null so the
 * dashboard shows a dash instead of a confident zero.
 */
async function withGivingTotals(
  service: SupabaseClient,
  families: Record<string, unknown>[],
  users: Record<string, unknown>[],
) {
  if (!families.length) return families;

  const year = new Date().getUTCFullYear();
  const familyOf = new Map(users.map((u) => [u.id as string, u.family_id as string | null]));

  const { data: gifts, error } = await service
    .from("donations")
    .select("profile_id, amount_cents")
    .gte("occurred_at", `${year}-01-01`);

  if (error) return families.map((f) => ({ ...f, giving_cents_ytd: null, giving_year: year }));

  const totals = new Map<string, number>();
  for (const gift of gifts ?? []) {
    const familyId = familyOf.get(gift.profile_id);
    if (!familyId) continue;
    totals.set(familyId, (totals.get(familyId) ?? 0) + (gift.amount_cents ?? 0));
  }

  return families.map((f) => ({
    ...f,
    giving_cents_ytd: totals.get(f.id as string) ?? 0,
    giving_year: year,
  }));
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

      /* Families come back in the same reply. The dashboard renders
         both tabs off one load, and a family's members are just the
         users above carrying its id — no second lookup. */
      const { data: families, error: familyError } = await service
        .from("families")
        .select("*")
        .order("name");

      /* A project that hasn't run the families migration yet should
         still get its people, so this failure is reported inline
         rather than replacing the whole reply with an error. */
      if (familyError) {
        return json({ users, families: [], callerId, familiesError: familyError.message });
      }

      return json({
        users,
        families: await withGivingTotals(service, families ?? [], users),
        callerId,
      });
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

      /* With a password the account is usable immediately. Without one,
         inviteUserByEmail both creates the user and sends the invite —
         generateLink only returns a link and mails nothing, which would
         strand the person with no way in. */
      const redirectTo = body.redirectTo ? String(body.redirectTo) : undefined;
      let userId: string;

      if (password) {
        const { data: created, error } = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (error) return bad(`Could not create the account: ${error.message}`);
        userId = created.user.id;
      } else {
        const { data: invited, error } = await service.auth.admin.inviteUserByEmail(
          email,
          redirectTo ? { redirectTo } : undefined,
        );
        if (error) return bad(`Could not send the invite: ${error.message}`);
        userId = invited.user.id;
      }

      const household: Record<string, unknown> = {};
      const householdProblem = familyMembership(body, household);
      if (householdProblem) {
        await service.auth.admin.deleteUser(userId);
        return bad(householdProblem);
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
        ...household,
      });

      /* Don't leave an auth user stranded without a profile. */
      if (profileError) {
        await service.auth.admin.deleteUser(userId);
        return bad(`Could not save the profile: ${profileError.message}`, 500);
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

      const householdProblem = familyMembership(body, patch);
      if (householdProblem) return bad(householdProblem);

      /* Moving out of a family they were the contact for would leave
         the household pointing at someone who no longer lives there. */
      if (patch.family_id !== undefined) {
        const { error: contactError } = await service
          .from("families")
          .update({ primary_contact_id: null })
          .eq("primary_contact_id", targetId)
          .neq("id", patch.family_id ?? "00000000-0000-0000-0000-000000000000");
        if (contactError) return bad(`Could not update the household contact: ${contactError.message}`);
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

      /* resetPasswordForEmail actually delivers the mail; the admin
         generateLink call only hands back a URL. */
      const asAnon = createClient(SUPABASE_URL, ANON_KEY);
      const redirectTo = body.redirectTo ? String(body.redirectTo) : undefined;
      const { error } = await asAnon.auth.resetPasswordForEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
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

    /* ---------------- setFamily ---------------- */
    /* Move one person in or out of a household. The dashboard uses
       this for drag-free member management: the same call adds
       someone, changes their relationship, or takes them out. */
    case "setFamily": {
      if (!targetId) return bad("Which account?");

      const patch: Record<string, unknown> = {};
      const problem = familyMembership({ familyId: body.familyId ?? null, familyRole: body.familyRole }, patch);
      if (problem) return bad(problem);

      const { error: contactError } = await service
        .from("families")
        .update({ primary_contact_id: null })
        .eq("primary_contact_id", targetId)
        .neq("id", patch.family_id ?? "00000000-0000-0000-0000-000000000000");
      if (contactError) return bad(`Could not update the household contact: ${contactError.message}`);

      const { error } = await service.from("profiles").update(patch).eq("id", targetId);
      if (error) return bad(`Could not change the household: ${error.message}`);

      return json({ ok: true });
    }

    /* ---------------- createFamily ---------------- */
    case "createFamily": {
      const name = String(body.name ?? "").trim();
      if (!name) return bad("A family needs a name.");

      const { data: family, error } = await service
        .from("families")
        .insert({ name, ...familyPatch(body), is_active: true })
        .select()
        .single();
      if (error) return bad(`Could not create the family: ${error.message}`);

      /* Members can come along with the family so an admin isn't
         made to create an empty household and fill it separately. */
      const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
      if (memberIds.length) {
        const { error: memberError } = await service
          .from("profiles")
          .update({ family_id: family.id })
          .in("id", memberIds);
        if (memberError) return bad(`The family was created, but its members were not added: ${memberError.message}`, 500);
      }

      const contactId = body.primaryContactId ? String(body.primaryContactId) : "";
      if (contactId) {
        const contactProblem = await checkPrimaryContact(service, family.id, contactId);
        if (contactProblem) return bad(contactProblem);
        const { error: contactError } = await service
          .from("families")
          .update({ primary_contact_id: contactId })
          .eq("id", family.id);
        if (contactError) return bad(`The family was created, but its contact was not set: ${contactError.message}`, 500);
      }

      return json({ familyId: family.id, members: memberIds.length });
    }

    /* ---------------- updateFamily ---------------- */
    case "updateFamily": {
      const familyId = String(body.familyId ?? "");
      if (!familyId) return bad("Which family?");

      const patch = familyPatch(body);
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return bad("A family needs a name.");
        patch.name = name;
      }

      if (body.primaryContactId !== undefined) {
        const contactId = body.primaryContactId ? String(body.primaryContactId) : "";
        if (contactId) {
          const problem = await checkPrimaryContact(service, familyId, contactId);
          if (problem) return bad(problem);
        }
        patch.primary_contact_id = contactId || null;
      }

      if (!Object.keys(patch).length) return json({ ok: true });

      const { error } = await service.from("families").update(patch).eq("id", familyId);
      if (error) return bad(`Could not save the family: ${error.message}`);

      return json({ ok: true });
    }

    /* ---------------- deleteFamily ---------------- */
    /* Deleting a household is not deleting its people. Members are
       released first so the outcome is one they can see coming:
       everyone stays, they just aren't grouped any more. */
    case "deleteFamily": {
      const familyId = String(body.familyId ?? "");
      if (!familyId) return bad("Which family?");

      const { data: released, error: releaseError } = await service
        .from("profiles")
        .update({ family_id: null, family_role: null })
        .eq("family_id", familyId)
        .select("id");
      if (releaseError) return bad(`Could not release the members: ${releaseError.message}`);

      const { error } = await service.from("families").delete().eq("id", familyId);
      if (error) return bad(`Could not delete the family: ${error.message}`);

      return json({ ok: true, released: released?.length ?? 0 });
    }

    default:
      return bad(`Unknown action "${action}".`);
  }
});
