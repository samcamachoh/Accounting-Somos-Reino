/* Opens the Stripe billing portal so a member can manage cards and recurring gifts. */
import { CORS, json, requireMember, customerFor, stripe } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);

  const who = await requireMember(req);
  if ("error" in who) return who.error;

  const { returnUrl } = await req.json().catch(() => ({}));
  const site = Deno.env.get("SITE_URL");
  if (!returnUrl || (site && !String(returnUrl).startsWith(site))) return json({ error: "Bad return URL." }, 400);

  const customer = await customerFor(who.db, who.profile, who.user.email!);
  const session = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
  return json({ url: session.url });
});
