/* ============================================================
   Somos Reino — data client
   ------------------------------------------------------------
   The portals run in one of two modes:

     demo  — no credentials configured. The pages keep their
             built-in sample data and nothing touches the network.
     ready — credentials present. Every read and write goes
             through the Data API with Row Level Security applied.

   The database is plain PostgreSQL behind a PostgREST-compatible
   Data API (Neon's Data API, or PostgREST itself). Sign-in is
   Clerk's: every request carries the Clerk session token, the
   Data API verifies it, and the database's policies read who you
   are from it. Nothing here proves identity — it only asks.

   Credentials come from Vite env vars (see .env.example). They
   are read at build time, so restart `pnpm dev` after changing
   them. Both are needed: the Data API URL, and the Clerk
   publishable key for sign-in.
   ============================================================ */
import { PostgrestClient } from "@supabase/postgrest-js";
import { clerkConfigured, getSessionToken } from "./clerk.js";

const dataUrl = import.meta.env.VITE_DATA_API_URL;

/* Serverless functions (account admin, payments). Same origin by default. */
const apiBase = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

/**
 * True when the database AND sign-in are both configured. Without sign-in
 * there is no way to prove who anyone is, so the portals stay in demo mode
 * rather than half-working.
 */
export const isConfigured = Boolean(dataUrl && clerkConfigured);

/** fetch, with the signed-in person's Clerk token attached to every request. */
async function fetchWithToken(input, init = {}) {
  const token = await getSessionToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/** The shared client, or null in demo mode. */
export const db = isConfigured ? new PostgrestClient(dataUrl, { fetch: fetchWithToken }) : null;

/**
 * Call a serverless function with the signed-in person's token, and return
 * its JSON. The function re-verifies the token and re-checks permissions
 * itself — this only carries the request. Failures throw an Error carrying
 * the function's own readable message.
 * @param {string} name e.g. "admin-users"
 * @param {object} body
 */
export async function callApi(name, body = {}) {
  let response;
  try {
    response = await fetchWithToken(`${apiBase}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    fail("Could not reach the server. Check your connection and try again.");
  }

  let data = null;
  try { data = await response.json(); } catch { /* non-JSON error page */ }
  if (!response.ok) fail(data?.error || `The server answered ${response.status}.`);
  if (data?.error) fail(data.error);
  return data;
}

/* ------------------------------------------------------------
   Table and function names.

   These were derived from how finance.html and giving.html read
   the snapshots they are handed. Every name the pages did not
   pin down directly is collected here so a schema that differs
   can be reconciled in one place instead of across the file.
   ------------------------------------------------------------ */
export const TABLES = {
  funds: "funds",
  profiles: "profiles",
  donations: "donations",
  expenses: "expenses",
  payouts: "payouts",
  bankTransactions: "bank_transactions",
  matches: "reconciliation_matches",
  ledgerEntries: "ledger_entries",
  paymentMethods: "payment_methods",
  recurringGifts: "recurring_gifts",
  people: "people",
  events: "events",
  eventSeries: "event_series",
  eventAttendance: "event_attendance",
  rooms: "rooms",
  households: "households",
  groups: "groups",
  groupMembers: "group_members",
  givingSummary: "person_giving_summary",
  followUps: "follow_ups",
  interactions: "interactions",
  followUpRules: "follow_up_rules",
};

/* Stripe and account provisioning need secret keys, so they run as
   serverless functions (api/) rather than in the browser. */
export const FUNCTIONS = {
  checkout: "create-checkout-session",
  billingPortal: "create-billing-portal-session",
  createMember: "create-member-account",
};

/** Throw a caller-friendly Error. Call sites surface `error.message` in a toast. */
export function fail(message) {
  throw new Error(message);
}

/** Unwrap a PostgREST result, converting its error into a thrown Error. */
export function unwrap({ data, error }, context) {
  if (error) fail(`${context}: ${error.message}`);
  return data;
}

/** Guard used by every api.js entry point. */
export function requireClient() {
  if (!db) fail("The database isn't connected. Set VITE_DATA_API_URL and VITE_CLERK_PUBLISHABLE_KEY.");
  return db;
}
