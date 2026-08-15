#!/usr/bin/env node
/* ============================================================
   Somos Reino — project check
   ------------------------------------------------------------
   Catches the wiring mistakes this project is prone to, none of
   which fail a build:

     - a page imports /src/lib/… that isn't on disk, which kills
       the whole module script at runtime with no visible error
     - a page exists but isn't a Vite entry, so it silently never
       reaches dist/
     - an env var is read in code but missing from .env.example

   Run with `pnpm check`. Exits non-zero when something is wrong.
   ============================================================ */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const notes = [];

const read = (file) => readFileSync(join(root, file), "utf8");
const has = (file) => existsSync(join(root, file));

/* ---- 1. the files the project can't run without ---- */
for (const file of ["package.json", "pnpm-lock.yaml", "vite.config.js", ".env.example", "index.html"]) {
  if (!has(file)) problems.push(`Missing ${file}`);
}

const pages = readdirSync(root).filter((f) => f.endsWith(".html"));
if (pages.length === 0) problems.push("No HTML pages found at the repo root");

/* ---- 2. every absolute import in a page resolves on disk ---- */
const importPattern = /(?:^|\s)(?:import\s[^"']*?from\s*|import\s*)["'](\/[^"']+)["']/gm;

for (const page of pages) {
  const source = read(page);
  const seen = new Set();

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (seen.has(specifier)) continue;
    seen.add(specifier);

    if (!has(specifier.replace(/^\//, ""))) {
      problems.push(`${page} imports "${specifier}", which does not exist`);
    }
  }
  if (seen.size) notes.push(`${page}: ${seen.size} local module import(s) resolved`);
}

/* ---- 3. every page is a build entry ---- */
if (has("vite.config.js")) {
  const config = read("vite.config.js");
  for (const page of pages) {
    const name = page.replace(/\.html$/, "");
    if (!config.includes(`"${name}"`) && !config.includes(`'${name}'`) && !config.includes(page)) {
      problems.push(`${page} is not listed as a Vite entry — it will be dropped from dist/`);
    }
  }
}

/* ---- 4. env vars read in code are documented ---- */
if (has(".env.example")) {
  const example = read(".env.example");
  const used = new Set();

  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const relative = join(dir, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith(".js")) {
        for (const match of read(relative).matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) {
          used.add(match[1]);
        }
      }
    }
  };
  if (has("src")) walk("src");

  for (const variable of used) {
    if (!example.includes(variable)) problems.push(`${variable} is read in src/ but missing from .env.example`);
  }
  if (used.size) notes.push(`${used.size} env var(s) documented in .env.example`);
}

/* ---- report ---- */
for (const note of notes) console.log(`  ok  ${note}`);

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} found:\n`);
  for (const problem of problems) console.error(`  ✗  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`\nProject check passed — ${pages.length} page(s) wired correctly.\n`);
