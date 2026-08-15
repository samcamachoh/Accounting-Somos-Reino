/* ============================================================
   Somos Reino — portal auth
   ------------------------------------------------------------
   getPortalSession() resolves which of five states the visitor
   is in. The portals branch on `mode` and render accordingly:

     demo       no credentials configured — keep sample data
     signed-out no Supabase session — show the sign-in gate
     disabled   profile exists but has been deactivated
     forbidden  signed in, but not allowed in this portal
     ready      cleared — `user` and `profile` are populated

   Authorization is enforced by Row Level Security in the
   database. The checks here decide what to *render*; they are
   not the security boundary on their own.
   ============================================================ */
import { supabase, isConfigured, TABLES } from "./supabase.js";

/** Roles permitted into the finance portal. */
const STAFF_ROLES = ["admin", "finance"];

const UI = `
  position:fixed; inset:0; z-index:9999; display:grid; place-items:center;
  padding:24px; background:#FAF7F5;
  font-family:"Schibsted Grotesk",system-ui,sans-serif; color:#1E1B22;
`;
const CARD = `
  width:min(420px,100%); background:#fff; border:1px solid #E9E2DD;
  border-radius:22px; padding:32px;
`;
const FIELD = `
  width:100%; padding:12px 14px; margin:0 0 12px;
  border:1px solid #D8CFC8; border-radius:10px;
  font:400 15px/1.3 inherit; color:inherit; background:#fff;
`;
const BUTTON = `
  width:100%; padding:13px 16px; border:0; border-radius:10px;
  background:#F7746D; color:#fff; font:700 15px/1 inherit; cursor:pointer;
`;
const LINK = `
  display:inline-block; margin-top:18px; background:none; border:0; padding:0;
  color:#C8483F; font:600 14px/1 inherit; cursor:pointer; text-decoration:underline;
`;

/**
 * Resolve the visitor's portal state.
 * @param {{staffOnly?:boolean}} options
 */
export async function getPortalSession({ staffOnly = false } = {}) {
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
  if (!profile) return { mode: "forbidden", user };
  if (profile.is_active === false) return { mode: "disabled", user, profile };
  if (staffOnly && !STAFF_ROLES.includes(profile.role)) return { mode: "forbidden", user, profile };

  return { mode: "ready", user, profile };
}

/** Sign the current user out and return to a clean page. */
export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Could not sign out: ${error.message}`);
  window.location.reload();
}

function overlay() {
  document.getElementById("sr-gate")?.remove();
  const root = document.createElement("div");
  root.id = "sr-gate";
  root.style.cssText = UI;
  return root;
}

/**
 * Full-screen sign-in gate. Sends a magic link, so there are no
 * passwords for the church to store or reset.
 * @param {{staffOnly?:boolean}} options
 */
export function mountAuthGate({ staffOnly = false } = {}) {
  const root = overlay();
  const card = document.createElement("div");
  card.style.cssText = CARD;

  const title = staffOnly ? "Leadership sign in" : "Sign in to give";
  const blurb = staffOnly
    ? "Enter the email your access was granted to. We'll send a one-time sign-in link."
    : "Enter your email and we'll send a one-time sign-in link — no password needed.";

  card.innerHTML = `
    <div style="font:700 11px/1 inherit;letter-spacing:.16em;text-transform:uppercase;color:#6A6371">Somos Reino</div>
    <h1 style="font:800 30px/1.1 'Bricolage Grotesque',sans-serif;letter-spacing:-.03em;margin:14px 0 10px">${title}</h1>
    <p style="color:#6A6371;line-height:1.5;margin:0 0 22px;font-size:15px">${blurb}</p>
    <form id="sr-gate-form" novalidate>
      <input id="sr-gate-email" type="email" required autocomplete="email"
             placeholder="you@example.com" aria-label="Email" style="${FIELD}">
      <button type="submit" style="${BUTTON}">Send sign-in link</button>
    </form>
    <p id="sr-gate-msg" role="status" style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#6A6371;min-height:1.2em"></p>
  `;

  root.appendChild(card);
  document.body.appendChild(root);

  const form = card.querySelector("#sr-gate-form");
  const input = card.querySelector("#sr-gate-email");
  const msg = card.querySelector("#sr-gate-msg");
  const button = form.querySelector("button");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (!email) {
      msg.style.color = "#C8483F";
      msg.textContent = "Enter your email address.";
      return;
    }

    button.disabled = true;
    button.style.opacity = ".6";
    msg.style.color = "#6A6371";
    msg.textContent = "Sending…";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });

    button.disabled = false;
    button.style.opacity = "1";

    if (error) {
      msg.style.color = "#C8483F";
      msg.textContent = error.message;
      return;
    }
    msg.style.color = "#3F7A63";
    msg.textContent = `Check ${email} for your sign-in link.`;
  });

  input.focus();
  return root;
}

/**
 * Full-screen gate for a signed-in visitor who cannot enter.
 * @param {string} [message] Overrides the default explanation.
 */
export function mountForbiddenGate(message) {
  const root = overlay();
  const card = document.createElement("div");
  card.style.cssText = CARD;
  const text = message || "This account doesn't have access to this portal. Ask an administrator if you think that's a mistake.";

  card.innerHTML = `
    <div style="font:700 11px/1 inherit;letter-spacing:.16em;text-transform:uppercase;color:#6A6371">Somos Reino</div>
    <h1 style="font:800 30px/1.1 'Bricolage Grotesque',sans-serif;letter-spacing:-.03em;margin:14px 0 10px">No access</h1>
    <p style="color:#6A6371;line-height:1.5;margin:0;font-size:15px"></p>
    <button id="sr-gate-signout" style="${LINK}">Sign out</button>
  `;
  card.querySelector("p").textContent = text;

  root.appendChild(card);
  document.body.appendChild(root);
  card.querySelector("#sr-gate-signout").addEventListener("click", () => signOut());
  return root;
}
