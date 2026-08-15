/* ============================================================
   Somos Reino — shared Supabase client
   ------------------------------------------------------------
   The portals run in one of two modes:

     demo  — no credentials configured. The pages keep their
             built-in sample data and nothing touches the network.
     ready — credentials present. Every read and write goes
             through Supabase with Row Level Security applied.

   Credentials come from Vite env vars (see .env.example). They
   are read at build time, so restart `pnpm dev` after changing
   them.
   ============================================================ */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when both credentials are configured. */
export const isConfigured = Boolean(url && anonKey);

/** The shared client, or null in demo mode. */
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/* ------------------------------------------------------------
   Table and Edge Function names.

   These were derived from how finance.html and giving.html read
   the snapshots they are handed. Every name the pages did not
   pin down directly is collected here so a schema that differs
   can be reconciled in one place instead of across the file.
   ------------------------------------------------------------ */
export const TABLES = {
  funds: "funds",
  profiles: "profiles",
  families: "families",
  donations: "donations",
  expenses: "expenses",
  payouts: "payouts",
  bankTransactions: "bank_transactions",
  matches: "reconciliation_matches",
  ledgerEntries: "ledger_entries",
  paymentMethods: "payment_methods",
  recurringGifts: "recurring_gifts",
};

/* Stripe and account provisioning need the service role, so they
   run as Edge Functions rather than from the browser. */
export const FUNCTIONS = {
  checkout: "create-checkout-session",
  billingPortal: "create-billing-portal-session",
  createMember: "create-member-account",
};

/** Throw a caller-friendly Error. Call sites surface `error.message` in a toast. */
export function fail(message) {
  throw new Error(message);
}

/** Unwrap a PostgREST result, converting its error into a thrown Error. */
export function unwrap({ data, error }, context) {
  if (error) fail(`${context}: ${error.message}`);
  return data;
}

/** Guard used by every api.js entry point. */
export function requireClient() {
  if (!supabase) fail("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  return supabase;
}
