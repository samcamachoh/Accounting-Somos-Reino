import Stripe from "https://esm.sh/stripe@17.7.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

/* STRIPE_SECRET_KEY is set with `supabase secrets set` — never in the repo. */
export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});

export const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/* Set SITE_URL (e.g. https://somosreino.org) to lock CORS to the site. */
const ORIGIN = Deno.env.get("SITE_URL") ?? "*";
export const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Verify the caller's JWT and load their profile. */
export async function requireMember(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: json({ error: "Sign in first." }, 401) };

  const db = serviceClient();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { error: json({ error: "Your session is no longer valid. Sign in again." }, 401) };

  const { data: profile } = await db
    .from("profiles")
    .select("id, full_name, email, stripe_customer_id, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.is_active === false) return { error: json({ error: "This account can't give right now." }, 403) };

  return { db, user, profile };
}

/** Reuse the member's Stripe customer, creating one on first gift. */
export async function customerFor(db: ReturnType<typeof serviceClient>, profile: any, email: string) {
  if (profile.stripe_customer_id) return profile.stripe_customer_id as string;
  const customer = await stripe.customers.create({
    name: profile.full_name ?? undefined,
    email: profile.email ?? email,
    metadata: { profile_id: profile.id },
  });
  await db.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", profile.id);
  return customer.id;
}
