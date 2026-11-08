/* ============================================================
   Somos Reino — Clerk (sign-in)
   ------------------------------------------------------------
   Clerk owns accounts and sessions. The database never sees a
   password: Supabase is handed the Clerk session token on every
   request (see supabase.js) and reads who you are from it.

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

/**
 * Load Clerk once and return it. Safe to call repeatedly and concurrently.
 * A failed load is not cached, so a later call can try again.
 */
export function loadClerk() {
  if (!clerk) throw new Error("Clerk is not configured. Set VITE_CLERK_PUBLISHABLE_KEY.");
  if (!loading) {
    const lang = (() => { try { return localStorage.getItem("sr-lang") || "es"; } catch { return "es"; } })();
    loading = clerk.load({ localization: clerkLocalization(lang) }).then(() => clerk, (error) => { loading = null; throw error; });
  }
  return loading;
}

/**
 * The current session token for Supabase, or null when signed out.
 * Clerk caches and refreshes tokens itself, so calling this per request is cheap.
 */
export async function getSessionToken() {
  if (!clerk) return null;
  await loadClerk();
  return (await clerk.session?.getToken()) ?? null;
}
