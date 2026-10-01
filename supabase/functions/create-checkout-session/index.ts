/* Opens Stripe Checkout for a one-time or recurring gift.
   The gift is attributed to the signed-in member; the webhook records it. */
import { CORS, json, requireMember, customerFor, stripe } from "../_shared/stripe.ts";

const INTERVALS: Record<string, "week" | "month"> = { weekly: "week", monthly: "month" };
const feeFor = (cents: number) => Math.round(cents * 0.029 + 30);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);

  const who = await requireMember(req);
  if ("error" in who) return who.error;
  const { db, user, profile } = who;

  const { fundId, amountCents, frequency, coverFee, returnUrl } = await req.json().catch(() => ({}));
  if (!fundId) return json({ error: "Choose a fund before giving." }, 400);
  if (!Number.isInteger(amountCents) || amountCents < 100) return json({ error: "The minimum gift is $1." }, 400);
  if (!["once", "weekly", "monthly"].includes(frequency)) return json({ error: "Unknown frequency." }, 400);

  const site = Deno.env.get("SITE_URL");
  if (site && !String(returnUrl).startsWith(site)) return json({ error: "Bad return URL." }, 400);

  const { data: fund } = await db.from("funds").select("id, name_en").eq("id", fundId).maybeSingle();
  if (!fund) return json({ error: "That fund doesn't exist." }, 400);

  const customer = await customerFor(db, profile, user.email!);
  const recurring = frequency !== "once";
  const fee = coverFee ? feeFor(amountCents) : 0;
  const meta = {
    profile_id: profile.id,
    fund_id: fund.id,
    amount_cents: String(amountCents),
    fee_cents: String(fee),
    frequency,
  };
  const line = (name: string, cents: number) => ({
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: cents,
      product_data: { name },
      ...(recurring ? { recurring: { interval: INTERVALS[frequency] } } : {}),
    },
  });

  const sep = returnUrl.includes("?") ? "&" : "?";
  const session = await stripe.checkout.sessions.create({
    mode: recurring ? "subscription" : "payment",
    customer,
    line_items: [
      line(`Somos Reino — ${fund.name_en}`, amountCents),
      ...(fee ? [line("Processing fee", fee)] : []),
    ],
    metadata: meta,
    ...(recurring
      ? { subscription_data: { metadata: meta } }
      : { payment_intent_data: { metadata: meta } }),
    success_url: `${returnUrl}${sep}gift=thanks`,
    cancel_url: returnUrl,
  });

  return json({ url: session.url });
});
