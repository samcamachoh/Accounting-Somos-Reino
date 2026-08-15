/* ============================================================
   Somos Reino — admin user and family management (browser side)
   ------------------------------------------------------------
   Thin wrapper over the admin-users Edge Function. Nothing
   privileged happens here: this file only shapes requests and
   turns failures into readable messages. The function re-checks
   that the caller is an admin on every call.
   ============================================================ */
import { requireClient, fail } from "./supabase.js";

const FUNCTION = "admin-users";

/* Where invite and reset emails should land. The function has no idea
   what domain it is being called from, so the browser supplies it. */
const loginUrl = () => new URL("/login.html", window.location.origin).href;

/** Invoke the admin function and unwrap its reply. */
async function call(action, payload = {}) {
  const db = requireClient();
  const { data, error } = await db.functions.invoke(FUNCTION, {
    body: { action, ...payload },
  });

  /* A non-2xx reply carries our own message in the body; surface
     that rather than the generic "Edge Function returned a
     non-2xx status code". */
  if (error) {
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* keep the original message */ }
    fail(message);
  }
  if (data?.error) fail(data.error);

  return data;
}

/**
 * Everything the dashboard renders: every profile with its
 * sign-in status, and every family with its contact details and
 * this year's giving.
 *
 * `familiesError` is set when the families table isn't there yet
 * — the people list still loads, and the dashboard says why the
 * other tab is empty instead of failing whole.
 */
export async function listUsers() {
  const data = await call("list");
  return {
    users: data.users ?? [],
    families: data.families ?? [],
    callerId: data.callerId,
    familiesError: data.familiesError ?? null,
  };
}

/**
 * Create an account. Omit `password` to email an invite instead,
 * letting the person choose their own.
 * Pass `familyName` in place of `familyId` to start a household in
 * the same call; it is discarded again if the account can't be made.
 *
 * @param {{email:string,fullName:string,role?:string,teamName?:string,phone?:string,password?:string,permissions?:object,familyId?:string,familyName?:string,familyRole?:string}} user
 */
export function createUser(user) {
  if (!user?.email) fail("An email address is required.");
  if (!user?.fullName) fail("A name is required.");
  return call("create", { ...user, redirectTo: loginUrl() });
}

/**
 * Change a person's details. Only the fields you pass are touched.
 * @param {string} id
 * @param {{fullName?:string,email?:string,role?:string,teamName?:string,phone?:string,permissions?:object,familyId?:string|null,familyName?:string,familyRole?:string|null}} changes
 */
export function updateUser(id, changes) {
  if (!id) fail("Which account?");
  return call("update", { id, ...changes });
}

/** Set someone's password directly. */
export function setUserPassword(id, password) {
  if (!id) fail("Which account?");
  if (!password) fail("Enter a new password.");
  return call("setPassword", { id, password });
}

/** Email a reset link so the person picks their own password. */
export function sendPasswordReset(email) {
  if (!email) fail("An email address is required.");
  return call("sendPasswordReset", { email, redirectTo: loginUrl() });
}

/** Block or restore sign-in without touching the person's history. */
export function setUserActive(id, active) {
  if (!id) fail("Which account?");
  return call("setActive", { id, active: Boolean(active) });
}

/**
 * Permanently delete an account. Refused when the person appears
 * in the books unless `force` is set.
 */
export function deleteUser(id, { force = false } = {}) {
  if (!id) fail("Which account?");
  return call("delete", { id, force });
}

/* ------------------------------------------------------------
   Families

   A family is the household someone gives from. Members are
   profiles carrying its id, so moving a person between
   households is a single write against that person — there is
   no join table to keep in step.
   ------------------------------------------------------------ */

/**
 * Start a household.
 * @param {{name:string,primaryContactId?:string,email?:string,phone?:string,addressLine1?:string,addressLine2?:string,city?:string,state?:string,postalCode?:string,notes?:string,memberIds?:string[]}} family
 * @returns {Promise<{familyId:string}>}
 */
export function createFamily(family) {
  if (!family?.name?.trim()) fail("A family needs a name.");
  return call("createFamily", family);
}

/**
 * Change a household's name, contact details, or who to call first.
 * Only the fields you pass are touched.
 * @param {string} familyId
 * @param {object} changes Same shape as createFamily.
 */
export function updateFamily(familyId, changes) {
  if (!familyId) fail("Which family?");
  return call("updateFamily", { familyId, ...changes });
}

/**
 * Remove the household. Its members keep their accounts and
 * their history — they simply stop being grouped.
 * @returns {Promise<{released:number}>} How many people were let go.
 */
export function deleteFamily(familyId) {
  if (!familyId) fail("Which family?");
  return call("deleteFamily", { familyId });
}

/**
 * Put one person in a household, or take them out with a null id.
 *
 * Pass `familyName` instead of `familyId` to start a household and
 * place them in it in a single call — the function creates it and
 * throws it away again if the move fails, so a rejected save never
 * leaves an empty family behind.
 *
 * @param {string} id The profile being moved.
 * @param {{familyId?:string|null, familyName?:string, familyRole?:"head"|"spouse"|"child"|"other"|null}} household
 */
export function setUserFamily(id, household = {}) {
  if (!id) fail("Which account?");
  const { familyId = null, familyName, familyRole = null } = household;
  return call("setFamily", { id, familyId: familyId || null, familyName, familyRole });
}
