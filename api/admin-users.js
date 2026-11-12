/* ============================================================
   Somos Reino — admin-users serverless function (host wiring)
   ------------------------------------------------------------
   The logic lives in server/admin-users.js. This file only hands
   it the real Clerk client and a database connection, read from
   the function's environment:

     CLERK_SECRET_KEY           required — Clerk's secret key (sk_…)
     DATABASE_URL               required — a connection string for a
                                database login that owns the tables
                                (it bypasses Row Level Security, which
                                is why the handler checks for an admin
                                first). NOT the Data API's login.
                                Falls back to SOMOS_DATABASE_URL, the name
                                Vercel's Neon integration created for this
                                project (it was installed with the prefix
                                SOMOS), so nothing needs duplicating.
     CLERK_AUTHORIZED_PARTIES   optional, comma-separated origins the
                                session token may have been issued for,
                                e.g. https://portal.example.org
     ALLOWED_ORIGIN             optional — only if the pages are served
                                from a different origin than this function

   None of these may ever be a VITE_ variable or be committed.

   Written for Vercel's Web-standard function handlers (`export function POST`).
   Another host that speaks Request/Response only needs a different two-line wrapper.
   ============================================================ */
import pg from "pg";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { createHandler } from "../server/admin-users.js";

const secretKey = process.env.CLERK_SECRET_KEY ?? "";
const authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/* One small pool per function instance; serverless instances are short-lived. */
const databaseUrl = process.env.DATABASE_URL || process.env.SOMOS_DATABASE_URL || "";
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl, max: 2 }) : null;

const handler = createHandler({
  verifyToken: (token) => verifyToken(token, { secretKey, ...(authorizedParties.length ? { authorizedParties } : {}) }),
  clerk: createClerkClient({ secretKey }),
  query: (sql, params) => pool.query(sql, params),
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? "",
});

const misconfigured = () =>
  new Response(JSON.stringify({ error: "The server is missing CLERK_SECRET_KEY or the database address (DATABASE_URL / SOMOS_DATABASE_URL)." }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });

export function POST(request) { return secretKey && pool ? handler(request) : misconfigured(); }
export function OPTIONS(request) { return secretKey && pool ? handler(request) : misconfigured(); }
