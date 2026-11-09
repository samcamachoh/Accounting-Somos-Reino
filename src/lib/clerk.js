/* ============================================================
   Somos Reino — Clerk (sign-in)
   ------------------------------------------------------------
   Clerk owns accounts and sessions. The database never sees a
   password: the Data API is handed the Clerk session token on every
   request (see db.js), verifies it, and the database reads who you
   are from it.

   One shared instance, loaded once, so every page and module
   that asks gets the same signed-in state.

   The publishable key is meant to be public — it only identifies
   the Clerk instance. The secret key never appears in this repo
   or in any browser build; it lives in the admin-users function.
   ============================================================ */
import { Clerk } from "@clerk/clerk-js";
import { esES, enUS } from "@clerk/localizations";

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** True when a publishable key is configured. */
export const clerkConfigured = Boolean(key);

/** The shared Clerk instance, or null when no key is configured. */
export const clerk = key ? new Clerk(key) : null;

/** The language Clerk's own screens should speak — follows the portals' ES/EN choice. */
export function clerkLocalization(lang) {
  return lang === "en" ? enUS : esES;
}

let loading = null;

/** How long to wait for Clerk before giving up with a readable error. */
export const LOAD_TIMEOUT_MS = 20000;

/**
 * Load Clerk once and return it. Safe to call repeatedly and concurrently.
 * A failed or timed-out load is not cached, so a later call can try again.
 *
 * `ui: true` is for the page that draws Clerk's sign-in screens (login.html).
 * Those screens ship as a separate package; handing them to load() bundles
 * them with the site instead of having Clerk download them at runtime — a
 * page that cannot reach that download sits empty. The screens are loaded
 * lazily so every other page, which only needs to know who is signed in,
 * never pays for them. The first call decides: later calls reuse it.
 */
export function loadClerk({ ui = false } = {}) {
  if (!clerk) throw new Error("Clerk is not configured. Set VITE_CLERK_PUBLISHABLE_KEY.");
  if (!loading) {
    const lang = (() => { try { return localStorage.getItem("sr-lang") || "es"; } catch { return "es"; } })();
    const options = { localization: clerkLocalization(lang) };
    if (ui) options.ui = { ClerkUI: import("@clerk/ui/entry").then((m) => m.ClerkUI) };
    const attempt = clerk.load(options);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Clerk did not respond in time.")), LOAD_TIMEOUT_MS));
    loading = Promise.race([attempt, timeout]).then(() => clerk, (error) => { loading = null; throw error; });
  }
  return loading;
}

/**
 * The current session token for the Data API, or null when signed out.
 * Clerk caches and refreshes tokens itself, so calling this per request is cheap.
 */
export async function getSessionToken() {
  if (!clerk) return null;
  await loadClerk();
  return (await clerk.session?.getToken()) ?? null;
}
