#!/usr/bin/env node
/* ============================================================
   Somos Reino — grant an administrator
   ------------------------------------------------------------
   Makes someone an admin: role `admin`, active, every finance
   capability on. Run it when there is no admin to sign in as
   yet, or when the person's account exists but nobody can reach
   settings.html to promote them the ordinary way.

     pnpm grant-admin pastorsam@somosreino.org
     pnpm grant-admin someone@example.org --name "Ana Beltrán"

   The account is invited by email when it doesn't exist. Pass
   --no-invite to fail instead, and --redirect <url> to say where
   the invite should land (defaults to the login page path).

   This needs the service_role key, so it runs here rather than
   in a browser:

     SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...

   Both are read from the environment, or from .env when it is
   there. That file is gitignored, and Vite only ever bundles
   variables prefixed VITE_ — so the service key stays out of
   what visitors download, as long as it is never given that
   prefix.
   ============================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* Every capability the finance portal knows about. "Access
   everything" means the role and these together: the role opens
   the portals, these open what is inside them. */
const ALL_PERMISSIONS = {
  finance: true,
  approve: true,
  refund: true,
  people: true,
  payouts: true,
  families: true,
};

const die = (message) => { console.error(`\n  ✗  ${message}\n`); process.exit(1); };

/* ---- arguments ---- */
const args = process.argv.slice(2);
const TAKES_A_VALUE = ["--name", "--redirect"];

const flag = (name) => {
  const at = args.indexOf(name);
  if (at === -1) return null;
  const value = args[at + 1];
  if (!value || value.startsWith("--")) die(`${name} needs a value.`);
  return value;
};

/* The first bare word is the address — skipping anything that is
   a flag, or the value belonging to one. */
let email = null;
for (let i = 0; i < args.length && !email; i++) {
  if (TAKES_A_VALUE.includes(args[i])) i++;
  else if (!args[i].startsWith("--")) email = args[i];
}

const name = flag("--name");
const redirectTo = flag("--redirect");
const mayInvite = !args.includes("--no-invite");

if (!email) die("Which email address? Usage: pnpm grant-admin someone@somosreino.org");
if (!email.includes("@")) die(`"${email}" doesn't look like an email address.`);

/* ---- credentials ---- */
/* A .env is a convenience for whoever already has one; the
   environment always wins so CI can pass the key without a file. */
function fromEnvFile(key) {
  const file = join(root, ".env");
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith(`${key}=`));
  return line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") || undefined;
}

const setting = (...keys) => keys.map((k) => process.env[k] || fromEnvFile(k)).find(Boolean);

const url = setting("SUPABASE_URL", "VITE_SUPABASE_URL");
const serviceKey = setting("SUPABASE_SERVICE_ROLE_KEY");

if (!url) die("Set SUPABASE_URL (or VITE_SUPABASE_URL) to your project URL.");
if (!serviceKey) {
  die(
    "Set SUPABASE_SERVICE_ROLE_KEY. It is in Project Settings -> API, under\n" +
    "     service_role. Never prefix it VITE_ — that would compile it into\n" +
    "     the JavaScript every visitor downloads.",
  );
}

/* The anon key is the easy mistake here, and it fails much later
   with a confusing permission error. Say so up front. */
try {
  const claims = JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64").toString());
  if (claims.role && claims.role !== "service_role") {
    die(`That key is the ${claims.role} key, not service_role. Only service_role may manage accounts.`);
  }
} catch { /* Not a JWT we can read — let the API be the judge. */ }

const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ---- find, or invite ---- */
const wanted = email.trim().toLowerCase();

const { data: list, error: listError } = await service.auth.admin.listUsers({ perPage: 1000 });
if (listError) die(`Could not read the user list: ${listError.message}`);

let user = list.users.find((u) => u.email?.toLowerCase() === wanted);
let invited = false;

if (!user) {
  if (!mayInvite) die(`No account for ${wanted}, and --no-invite was passed.`);
  const { data, error } = await service.auth.admin.inviteUserByEmail(
    wanted,
    redirectTo ? { redirectTo } : undefined,
  );
  if (error) die(`Could not invite ${wanted}: ${error.message}`);
  user = data.user;
  invited = true;
}

/* ---- promote ---- */
/* Read first so an existing name, phone, and teams survive: this
   grants a role, it does not rewrite the person. */
const { data: existing, error: readError } = await service
  .from("profiles")
  .select("*")
  .eq("id", user.id)
  .maybeSingle();

if (readError) die(`Could not read the profile: ${readError.message}`);

const { error: writeError } = await service.from("profiles").upsert({
  ...(existing ?? {}),
  id: user.id,
  email: wanted,
  full_name: existing?.full_name || name || wanted.split("@")[0],
  role: "admin",
  is_active: true,
  disabled_at: null,
  permissions: { ...(existing?.permissions ?? {}), ...ALL_PERMISSIONS },
});

if (writeError) die(`Could not save the profile: ${writeError.message}`);

/* A previously deactivated account is still banned in Auth, and
   the profile flag alone would not let them back in. */
const { error: banError } = await service.auth.admin.updateUserById(user.id, { ban_duration: "none" });
if (banError) die(`Role saved, but sign-in is still blocked: ${banError.message}`);

const verb = existing ? "is now an administrator" : "was added as an administrator";
console.log(`\n  ok  ${existing?.full_name || wanted} ${verb}.`);
if (invited) console.log(`      An invite was emailed to ${wanted} — they choose their own password.`);
console.log("");
