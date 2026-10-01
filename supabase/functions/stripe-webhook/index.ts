/* Records gifts from Stripe. Deploy with --no-verify-jwt (Stripe has no
   Supabase JWT); the Stripe signature is the authentication.

   Events: checkout.session.completed (one-time), invoice.paid (every
   recurring charge), customer.subscription.updated/deleted. Inserts are
   idempotent on the Stripe payment intent / invoice id, so retries are safe. */
import Stripe from "https://esm.sh/stripe@17.7.0?target=denonext";
import { stripe, serviceClient } from "../_shared/stripe.ts";

const db = serviceClient();
const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : new Date().toISOString());

async function who(customerId: string, metaProfile?: string) {
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  const email = customer.deleted ? null : customer.email;
  let profileId = metaProfile ?? (customer.deleted ? undefined : customer.metadata?.profile_id);
  if (!profileId && email) {
    const { data } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
    profileId = data?.id;
  }
  return { name: customer.deleted ? null : customer.name, email, profileId: profileId ?? null };
}

async function paymentMethodType(pi?: string | null) {
  if (!pi) return "card";
  const p = await stripe.paymentIntents.retrieve(pi, { expand: ["payment_method"] });
  return (p.payment_method as Stripe.PaymentMethod | null)?.type ?? "card";
}

async function recordGift(meta: Record<string, string>, customerId: string, ids: Record<string, string | null>, when: string, pi?: string | null) {
  if (!meta.fund_id || !meta.amount_cents) return; // not a gift we created
  const donor = await who(customerId, meta.profile_id);
  const { error } = await db.from("donations").upsert({
    profile_id: donor.profileId,
    donor_name: donor.name,
    donor_email: donor.email,
    fund_id: meta.fund_id,
    amount_cents: Number(meta.amount_cents),
    fee_cents: Number(meta.fee_cents ?? 0),
    occurred_at: when,
    payment_method_type: await paymentMethodType(pi),
    stripe_customer_id: customerId,
    ...ids,
  }, { onConflict: ids.stripe_invoice_id ? "stripe_invoice_id" : "stripe_payment_intent_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

async function syncSubscription(sub: Stripe.Subscription) {
  const meta = sub.metadata ?? {};
  if (!meta.fund_id) return;
  const donor = await who(sub.customer as string, meta.profile_id);
  if (!donor.profileId) return;
  const { error } = await db.from("recurring_gifts").upsert({
    profile_id: donor.profileId,
    fund_id: meta.fund_id,
    amount_cents: Number(meta.amount_cents),
    interval: meta.frequency === "weekly" ? "week" : "month",
    status: sub.status === "canceled" ? "cancelled" : sub.pause_collection ? "paused" : "active",
    next_charge_at: sub.status === "canceled" ? null : iso(sub.current_period_end),
    stripe_subscription_id: sub.id,
  }, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(), req.headers.get("stripe-signature")!, secret, undefined, cryptoProvider);
  } catch (e) {
    return new Response(`Bad signature: ${(e as Error).message}`, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === "payment" && s.payment_status === "paid") {
        await recordGift(s.metadata ?? {}, s.customer as string,
          { stripe_payment_intent_id: s.payment_intent as string, stripe_invoice_id: null, stripe_checkout_session_id: s.id },
          iso(s.created), s.payment_intent as string);
      }
    } else if (event.type === "invoice.paid") {
      const inv = event.data.object as Stripe.Invoice;
      if (inv.subscription) {
        const sub = await stripe.subscriptions.retrieve(inv.subscription as string);
        await syncSubscription(sub);
        await recordGift(sub.metadata ?? {}, inv.customer as string,
          { stripe_invoice_id: inv.id, stripe_payment_intent_id: null, stripe_checkout_session_id: null },
          iso(inv.status_transitions?.paid_at ?? inv.created), inv.payment_intent as string);
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }
  } catch (e) {
    console.error(event.type, e);
    return new Response("Handler failed", { status: 500 }); // Stripe retries
  }
  return new Response("ok");
});
