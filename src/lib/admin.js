/* ============================================================
   Somos Reino — admin user management (browser side)
   ------------------------------------------------------------
   Thin wrapper over the admin-users serverless function. Nothing
   privileged happens here: this file only shapes requests and
   turns failures into readable messages. The function re-checks
   that the caller is an admin on every call.
   ============================================================ */
import { requireClient, fail, callApi } from "./db.js";

const FUNCTION = "admin-users";

/** Invoke the admin function and unwrap its reply. */
function call(action, payload = {}) {
  requireClient();
  return callApi(FUNCTION, { action, ...payload });
}

/** Everyone with a profile, plus their sign-in status. */
export async function listUsers() {
  const data = await call("list");
  return { users: data.users ?? [], callerId: data.callerId };
}

/**
 * Create an account, ready to sign in. With a `password` they can use it;
 * without one they sign in with a code emailed to them. No email is sent by
 * this call — tell the person to open the portal.
 * @param {{email:string,fullName:string,role?:string,teamName?:string,phone?:string,password?:string,permissions?:object}} user
 */
export function createUser(user) {
  if (!user?.email) fail("An email address is required.");
  if (!user?.fullName) fail("A name is required.");
  return call("create", user);
}

/**
 * Change a person's details. Only the fields you pass are touched.
 * @param {string} id
 * @param {{fullName?:string,email?:string,role?:string,teamName?:string,phone?:string,permissions?:object}} changes
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
  return call("sendPasswordReset", { email });
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
