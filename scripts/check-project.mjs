#!/usr/bin/env node
/* ============================================================
   Somos Reino — project check
   ------------------------------------------------------------
   Catches the wiring mistakes this project is prone to, none of
   which fail a build:

     - a module imports a file that isn't on disk, which kills
       the whole script at runtime with no visible error
     - a view is written but never registered, so it exists and
       is unreachable
     - a view asks for a capability access.js doesn't grant, so
       it is registered and still unreachable
     - a string is looked up that i18n.js doesn't carry, which
       renders the key itself on screen
     - a string exists in one language but not the other
     - an env var is read in code but missing from .env.example

   Run with `pnpm check`. Exits non-zero when something is wrong.
   ============================================================ */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, extname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const notes = [];

const read = (file) => readFileSync(join(root, file), "utf8");
const has = (file) => existsSync(join(root, file));

/** Every .js file under src/, repo-relative. */
function sources(dir = "src", found = []) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sources(relative, found);
    else if (extname(entry.name) === ".js") found.push(relative);
  }
  return found;
}

/* ---- 1. the files the project can't run without ---- */
for (const file of ["package.json", "vite.config.js", ".env.example", "index.html", "src/app.js", "src/views/index.js"]) {
  if (!has(file)) problems.push(`Missing ${file}`);
}

/* One page, on purpose. A second .html at the root means either a
   portal crept back in or a Vite entry is about to be needed. */
const pages = readdirSync(root).filter((f) => f.endsWith(".html"));
if (pages.length !== 1 || pages[0] !== "index.html") {
  problems.push(`Expected index.html to be the only page; found ${pages.join(", ") || "none"}`);
}

const files = has("src") ? sources() : [];

/* ---- 2. every relative import resolves on disk ---- */
for (const file of files) {
  const from = dirname(file);
  for (const match of read(file).matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const target = resolve("/", from, match[1]).slice(1);
    if (!has(target)) problems.push(`${file} imports "${match[1]}", which does not exist`);
  }
}

/* index.html points at the entry and the stylesheet by absolute path. */
for (const match of read("index.html").matchAll(/(?:src|href)="(\/src\/[^"]+)"/g)) {
  if (!has(match[1].slice(1))) problems.push(`index.html references "${match[1]}", which does not exist`);
}

/* ---- 3. every view module is registered, and asks for a real capability ---- */
const registry = has("src/views/index.js") ? read("src/views/index.js") : "";
const capabilities = has("src/lib/access.js")
  ? [...read("src/lib/access.js").matchAll(/^\s*"([a-z]+)",\s*\/\//gm)].map((m) => m[1])
  : [];

for (const file of files.filter((f) => f.startsWith("src/views/") && f !== "src/views/index.js")) {
  const name = file.slice("src/views/".length, -3);
  /* signin is deliberately outside the registry: it is the screen
     that renders when there is nothing to navigate. */
  if (name !== "signin" && !registry.includes(`./${name}.js`)) {
    problems.push(`${file} is not registered in src/views/index.js — it will never be reachable`);
  }

  const capability = read(file).match(/^\s*cap:\s*"([a-z]+)"/m)?.[1];
  if (capability && capabilities.length && !capabilities.includes(capability)) {
    problems.push(`${file} requires the capability "${capability}", which access.js does not define`);
  }
}
if (capabilities.length) notes.push(`${capabilities.length} capabilities defined in access.js`);

/* ---- 4. the capability model still grants what it should ----

   access.js has no imports of its own, so it can be exercised
   directly. These assertions are the promise the whole portal
   rests on: one interface, and what you see in it comes from
   your credentials. */
if (has("src/lib/access.js")) {
  const { capabilitiesFor } = await import(new URL("../src/lib/access.js", import.meta.url));

  const expectations = [
    ["a member", { role: "member" }, ["give", "serve"], ["finance", "people", "admin"]],
    ["a member granted the books", { role: "member", permissions: { finance: true } }, ["give", "finance"], ["admin", "people"]],
    ["a finance lead", { role: "finance" }, ["finance", "approve", "accounts"], ["admin", "people"]],
    ["a finance lead with an empty permissions object", { role: "finance", permissions: {} }, ["finance"], ["admin"]],
    ["an admin", { role: "admin" }, ["give", "serve", "finance", "approve", "people", "accounts", "admin"], []],
    ["a deactivated admin", { role: "admin", is_active: false }, [], ["give", "serve", "finance", "admin"]],
    ["nobody", null, [], ["give", "finance", "admin"]],
  ];

  for (const [who, profile, granted, denied] of expectations) {
    const capabilities = capabilitiesFor(profile);
    for (const capability of granted) {
      if (!capabilities.has(capability)) problems.push(`access.js: ${who} should have "${capability}" and does not`);
    }
    for (const capability of denied) {
      if (capabilities.has(capability)) problems.push(`access.js: ${who} should not have "${capability}" and does`);
    }
  }
  notes.push(`${expectations.length} access expectations checked`);

  /* The role list lives in three places: the capability map, the
     select on the Accounts view, and the Edge Function, which is
     Deno and cannot import from src/. A role added in one and not
     the others is accepted on screen and refused by the server. */
  const roleLists = {
    /* Scoped to the role map — the permission map below it uses
       some of the same words as its own keys. */
    "src/lib/access.js": [
      ...read("src/lib/access.js")
        .match(/const ROLE_CAPABILITIES = \{[\s\S]*?\n\};/)[0]
        .matchAll(/^\s{2}([a-z]+):\s*\[/gm),
    ].map((m) => m[1]),
    "src/views/accounts.js": JSON.parse(read("src/views/accounts.js").match(/const ROLES = (\[[^\]]+\])/)?.[1] ?? "[]"),
    "supabase/functions/admin-users/index.ts": JSON.parse(
      read("supabase/functions/admin-users/index.ts").match(/const ROLES = (\[[^\]]+\])/)?.[1] ?? "[]",
    ),
  };

  const [reference, ...others] = Object.entries(roleLists);
  for (const [file, roles] of others) {
    const sorted = [...roles].sort().join(",");
    if (sorted !== [...reference[1]].sort().join(",")) {
      problems.push(`${file} lists roles [${roles}] but ${reference[0]} lists [${reference[1]}]`);
    }
  }
  notes.push(`role list agrees across ${Object.keys(roleLists).length} files: ${reference[1].join(", ")}`);
}

/* ---- 5. every t("key") exists, in both languages ---- */
if (has("src/lib/i18n.js")) {
  const i18n = read("src/lib/i18n.js");
  const table = i18n.slice(i18n.indexOf("const STRINGS"), i18n.indexOf("\n/* The language"));

  /* Anchoring on a closing brace at end of line is what keeps a
     {placeholder} inside a string from ending the entry early. */
  const defined = new Map();
  for (const match of table.matchAll(/^ {2}([A-Za-z0-9_]+): \{([\s\S]*?)\},$/gm)) {
    defined.set(match[1], match[2]);
  }

  for (const [key, value] of defined) {
    if (!/\bes:/.test(value)) problems.push(`i18n key "${key}" has no Spanish string`);
    if (!/\ben:/.test(value)) problems.push(`i18n key "${key}" has no English string`);
  }

  /* Two scans. The strict one — a literal inside t() — is what
     proves a key is missing. The loose one is any quoted string
     anywhere, which is how a key reached through a lookup table
     or a ternary still counts as used. */
  const used = new Set();
  const mentioned = new Set();
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)) used.add(match[1]);
    for (const match of source.matchAll(/"([A-Za-z0-9_]+)"/g)) mentioned.add(match[1]);
  }
  /* Keys assembled at runtime — role labels, statuses — are built
     from a prefix, so check the prefixes are all accounted for. */
  const dynamic = /^(role|status|bg|perm)[A-Z]/;

  for (const key of used) {
    if (!defined.has(key) && !dynamic.test(key)) problems.push(`t("${key}") is used but not defined in i18n.js`);
  }

  const unused = [...defined.keys()].filter((key) => !mentioned.has(key) && !dynamic.test(key));
  if (unused.length) notes.push(`${unused.length} i18n key(s) defined but not used: ${unused.slice(0, 8).join(", ")}${unused.length > 8 ? "…" : ""}`);
  notes.push(`${defined.size} i18n keys, ${used.size} referenced`);
}

/* ---- 6. env vars read in code are documented ---- */
if (has(".env.example")) {
  const example = read(".env.example");
  const used = new Set();
  for (const file of files) {
    for (const match of read(file).matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) used.add(match[1]);
  }
  for (const variable of used) {
    if (!example.includes(variable)) problems.push(`${variable} is read in src/ but missing from .env.example`);
  }
  if (used.size) notes.push(`${used.size} env var(s) documented in .env.example`);
}

/* ---- 7. the service_role key never reaches the browser ----

   Anything prefixed VITE_ is compiled into the JavaScript every
   visitor downloads. This is worth a hard failure. */
for (const file of [".env.example", ...files]) {
  if (has(file) && /VITE_[A-Z_]*SERVICE_ROLE/.test(read(file))) {
    problems.push(`${file} exposes a service_role key to the browser`);
  }
}

/* ---- report ---- */
for (const note of notes) console.log(`  ok  ${note}`);

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} found:\n`);
  for (const problem of problems) console.error(`  ✗  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`\nProject check passed — ${files.length} module(s) wired correctly.\n`);
