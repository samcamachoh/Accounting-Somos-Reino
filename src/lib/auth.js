/* ============================================================
   Somos Reino — portal auth
   ------------------------------------------------------------
   getPortalSession() resolves which of five states the visitor
   is in. The portals branch on `mode` and render accordingly:

     demo       no credentials configured — keep sample data
     signed-out no Clerk session — send them to login.html
     disabled   profile exists but has been deactivated
     forbidden  signed in, but not allowed in this portal
     ready      cleared — `user` and `profile` are populated

   Sign-in itself is Clerk's. This file asks Clerk who is signed
   in, then reads that person's profile (role, permissions) from
   the database — a Clerk account with no profile is "forbidden",
   because profiles are only ever created by an administrator.

   Authorization is enforced by Row Level Security in the
   database, and by the admin-users Edge Function for anything
   privileged. The checks here decide what to *render*; they are
   not the security boundary on their own.
   ============================================================ */
import { db, isConfigured, TABLES } from "./db.js";
import { clerk, loadClerk } from "./clerk.js";

/** Roles permitted into the finance portal. */
const STAFF_ROLES = ["admin", "finance"];

export const LOGIN_PAGE = "/login.html";

/* ------------------------------------------------------------
   Who may reach what.

   getPortalSession() gates on these same two predicates, so a
   link is shown exactly when following it would work. Deciding
   visibility any other way lets the menu drift away from the
   permissions and start advertising locked doors.

   These answer "should this be offered", not "is this allowed" —
   RLS and the admin-users function remain the enforcement.
   ------------------------------------------------------------ */

/** Finance portal: staff only. */
export const canAccessFinance = (profile) => STAFF_ROLES.includes(profile?.role);

/** Account management: admins only. */
export const canAccessSettings = (profile) => profile?.role === "admin";

/** Follow-ups: admins, plus anyone granted `followups` or `people`. */
export const canAccessFollowUps = (profile) =>
  profile?.role === "admin" || Boolean(profile?.permissions?.followups) || Boolean(profile?.permissions?.people);

/** People directory: admins and anyone granted `people`. */
export const canAccessPeople = (profile) =>
  profile?.role === "admin" || Boolean(profile?.permissions?.people);

/** Create and edit events, rooms, and bookings. Everyone else can view and RSVP. */
export const canManageCalendar = (profile) =>
  profile?.role === "admin" || Boolean(profile?.permissions?.calendar) || Boolean(profile?.permissions?.people);

/** The giving portal is open to anyone with an active account. */
export const canAccessGiving = () => true;

/**
 * Resolve the visitor's portal state.
 * @param {{staffOnly?:boolean, adminOnly?:boolean, followupsOnly?:boolean, peopleOnly?:boolean}} options
 */
export async function getPortalSession({ staffOnly = false, adminOnly = false, followupsOnly = false, peopleOnly = false } = {}) {
  if (!isConfigured) return { mode: "demo" };

  await loadClerk();
  if (!clerk.isSignedIn || !clerk.user) return { mode: "signed-out" };

  const clerkUser = clerk.user;
  const user = { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress ?? null };

  const { data: profile, error: profileError } = await db
    .from(TABLES.profiles)
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw new Error(`Could not load your profile: ${profileError.message}`);
  if (!profile) return { mode: "forbidden", user };
  if (profile.is_active === false) return { mode: "disabled", user, profile };
  if (adminOnly && !canAccessSettings(profile)) return { mode: "forbidden", user, profile };
  if (staffOnly && !canAccessFinance(profile)) return { mode: "forbidden", user, profile };
  if (peopleOnly && !canAccessPeople(profile)) return { mode: "forbidden", user, profile };
  if (followupsOnly && !canAccessFollowUps(profile)) return { mode: "forbidden", user, profile };

  return { mode: "ready", user, profile };
}

/* ------------------------------------------------------------
   Sign out
   ------------------------------------------------------------ */

/** Sign the current user out and return them to the login page. */
export async function signOut() {
  if (!clerk) return;
  await loadClerk();
  await clerk.signOut({ redirectUrl: LOGIN_PAGE });
}

/* ------------------------------------------------------------
   Gates
   ------------------------------------------------------------ */

/**
 * Send an unauthenticated visitor to the login page, remembering
 * where they were headed.
 *
 * The portals call this as mountAuthGate(); it redirects rather
 * than rendering an inline form so there is one place to sign in.
 */
export function mountAuthGate() {
  const next = window.location.pathname + window.location.search;
  const url = new URL(LOGIN_PAGE, window.location.origin);
  if (next && next !== LOGIN_PAGE) url.searchParams.set("next", next);
  window.location.replace(url.href);
}

/**
 * Full-screen gate for a signed-in visitor who cannot enter.
 * @param {string} [message] Overrides the default explanation.
 */
export function mountForbiddenGate(message) {
  document.getElementById("sr-gate")?.remove();

  const root = document.createElement("div");
  root.id = "sr-gate";
  root.style.cssText = `
    position:fixed; inset:0; z-index:9999; display:grid; place-items:center;
    padding:24px; background:#FAF7F5;
    font-family:"Schibsted Grotesk",system-ui,sans-serif; color:#1E1B22;
  `;

  const card = document.createElement("div");
  card.style.cssText = "width:min(420px,100%);background:#fff;border:1px solid #E9E2DD;border-radius:22px;padding:32px";
  card.innerHTML = `
    <div style="font:700 11px/1 inherit;letter-spacing:.16em;text-transform:uppercase;color:#6A6371">Somos Reino</div>
    <h1 style="font:800 30px/1.1 'Bricolage Grotesque',sans-serif;letter-spacing:-.03em;margin:14px 0 10px">No access</h1>
    <p style="color:#6A6371;line-height:1.5;margin:0;font-size:15px"></p>
    <button id="sr-gate-signout" style="display:inline-block;margin-top:18px;background:none;border:0;padding:0;color:#C8483F;font:600 14px/1 inherit;cursor:pointer;text-decoration:underline">Sign out</button>
  `;
  card.querySelector("p").textContent =
    message || "This account doesn't have access to this portal. Ask an administrator if you think that's a mistake.";

  root.appendChild(card);
  document.body.appendChild(root);
  card.querySelector("#sr-gate-signout").addEventListener("click", () => signOut());
  return root;
}

/**
 * Guard a whole page. Redirects to login when signed out, renders
 * the no-access gate when the role is wrong, and resolves to the
 * session when the visitor may proceed.
 *
 * In demo mode it resolves immediately so local preview still works.
 * @param {{staffOnly?:boolean, adminOnly?:boolean, followupsOnly?:boolean, peopleOnly?:boolean}} options
 */
export async function requireSession(options = {}) {
  const session = await getPortalSession(options);

  if (session.mode === "signed-out") { mountAuthGate(); return null; }
  if (session.mode === "disabled") {
    mountForbiddenGate("This account has been deactivated. Ask an administrator to restore access.");
    return null;
  }
  if (session.mode === "forbidden") { mountForbiddenGate(); return null; }

  return session;
}
