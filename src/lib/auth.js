/* ============================================================
   Somos Reino — sessions
   ------------------------------------------------------------
   One page, so there is no redirecting anywhere: this module
   answers "who is this" and the router decides what to paint.
   There are four answers.

     demo        no credentials configured — sample data
     signed-out  no session — paint the sign-in view
     disabled    the profile exists but has been deactivated
     ready       `user` and `profile` are populated

   What a signed-in person may then *do* is access.js's question,
   not this one. Row Level Security and the admin-users Edge
   Function are the enforcement either way — the HTML and
   JavaScript are static files anyone can download, so a gate
   here decides what to render and nothing more.
   ============================================================ */
import { supabase, isConfigured, TABLES } from "./supabase.js";

/**
 * Resolve the visitor's state.
 * @returns {Promise<{mode:"demo"|"signed-out"|"disabled"|"ready", user?:object, profile?:object}>}
 */
export async function resolveSession() {
  if (!isConfigured) return { mode: "demo" };

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not read the session: ${error.message}`);
  if (!session?.user) return { mode: "signed-out" };

  const user = session.user;
  const { data: profile, error: profileError } = await supabase
    .from(TABLES.profiles)
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw new Error(`Could not load your profile: ${profileError.message}`);

  /* No profile row means the account exists in auth but was never
     given a place in the church — treat it as deactivated rather
     than crashing on a null role. */
  if (!profile) return { mode: "disabled", user };
  if (profile.is_active === false) return { mode: "disabled", user, profile };

  return { mode: "ready", user, profile };
}

/**
 * Re-resolve whenever Supabase says the session changed — a token
 * refresh, a sign-out in another tab, or the recovery link landing
 * back on this page.
 */
export function onAuthChange(handler) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event) => handler(event));
  return () => data?.subscription?.unsubscribe();
}

/** True while the browser is on a password-recovery link. */
export const isRecoveryLink = () =>
  window.location.hash.includes("type=recovery") || new URLSearchParams(window.location.search).has("recovery");

/* ------------------------------------------------------------
   Sign in and out
   ------------------------------------------------------------ */

const requireAuth = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase.auth;
};

export async function signInWithPassword(email, password) {
  const { data, error } = await requireAuth().signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

/** Send a one-time sign-in link instead of using a password. */
export async function sendMagicLink(email) {
  const { error } = await requireAuth().signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
}

/** Email the visitor a link to choose a new password. */
export async function requestPasswordReset(email) {
  const { error } = await requireAuth().resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?recovery=1`,
  });
  if (error) throw new Error(error.message);
}

/** Change the signed-in person's own password. */
export async function updateMyPassword(password) {
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
  const { error } = await requireAuth().updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Could not sign out: ${error.message}`);
}
