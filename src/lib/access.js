/* ============================================================
   Somos Reino — capabilities
   ------------------------------------------------------------
   There is one interface. What a person sees inside it is
   decided here, and nowhere else.

   A view declares the capability it needs; the router filters
   the navigation and refuses direct routes by the same list, so
   a link is shown exactly when following it would work. Deciding
   visibility any other way lets the menu drift away from the
   permissions and start advertising locked doors.

   These answer "should this be offered". Row Level Security and
   the admin-users Edge Function answer "is this allowed", and
   they are the boundary that actually holds — the HTML and
   JavaScript are static files anyone can download.
   ============================================================ */

/** Every capability a view can ask for. */
export const CAPABILITIES = [
  "give",      // give, and see your own history — everyone with an account
  "serve",     // service plans and your own schedule — everyone with an account
  "finance",   // the books: reconciliation, expenses, giving across the church
  "approve",   // move an expense through approval
  "people",    // the roster, teams, and background-check status
  "accounts",  // connected accounts and fund setup
  "admin",     // create, edit, deactivate and delete accounts
];

/* Roles are the coarse grant; `permissions` on the profile refines it.
   A role always implies its capabilities — a finance lead cannot be
   locked out of the books by an empty permissions object — while a
   permission can add one to somebody whose role does not carry it. */
const ROLE_CAPABILITIES = {
  admin:   ["give", "serve", "finance", "approve", "people", "accounts", "admin"],
  finance: ["give", "serve", "finance", "approve", "accounts"],
  staff:   ["give", "serve", "approve"],
  member:  ["give", "serve"],
};

/* Permission flags stored on the profile, and what each one opens.
   The names match the switches on the People view. */
const PERMISSION_CAPABILITIES = {
  finance: ["finance"],
  approve: ["approve"],
  people: ["people"],
  payouts: ["accounts"],
};

/** Anyone with an active account gets these, whatever their role. */
const BASE_CAPABILITIES = ["give", "serve"];

/**
 * Resolve what this profile may do.
 * @param {{role?:string, permissions?:object, is_active?:boolean}|null} profile
 * @returns {Set<string>} The capabilities granted. Empty when there is no profile.
 */
export function capabilitiesFor(profile) {
  if (!profile || profile.is_active === false) return new Set();

  const granted = new Set(BASE_CAPABILITIES);
  for (const capability of ROLE_CAPABILITIES[String(profile.role || "member").toLowerCase()] || []) {
    granted.add(capability);
  }
  for (const [flag, capabilities] of Object.entries(PERMISSION_CAPABILITIES)) {
    if (profile.permissions?.[flag]) capabilities.forEach((c) => granted.add(c));
  }
  return granted;
}

/**
 * Demo mode has no credentials and therefore no profile, but the
 * point of demo mode is to show the whole portal on a fresh clone.
 * Grant everything and let the badge say the data is not real.
 */
export const demoCapabilities = () => new Set(CAPABILITIES);

/** How the person's access reads in the rail, under their name. */
export function roleLabel(profile, capabilities) {
  if (!profile) return "Demo";
  const role = String(profile.role || "member");
  const title = role.charAt(0).toUpperCase() + role.slice(1);
  /* Someone granted the books by permission rather than by role would
     otherwise read as a plain member while looking at the ledger. */
  if (role === "member" && capabilities?.has("finance")) return `${title} · Finance`;
  return title;
}
