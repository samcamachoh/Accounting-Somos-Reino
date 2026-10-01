-- Stripe giving: record who gave (name + email) and which Stripe objects
-- carried the money, so a giver's history can be pulled for any date range.
-- Additive only: safe to run on top of the existing schema.

alter table public.profiles
  add column if not exists stripe_customer_id text unique;

alter table public.donations
  add column if not exists donor_name text,
  add column if not exists donor_email text,
  add column if not exists fee_cents integer not null default 0,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_intent_id text unique,
  add column if not exists stripe_invoice_id text unique,
  add column if not exists stripe_checkout_session_id text;

alter table public.recurring_gifts
  add column if not exists stripe_subscription_id text unique;

create index if not exists donations_donor_email_idx
  on public.donations (lower(donor_email));

-- Link gifts already on file to the matching member by email.
update public.donations d
   set profile_id = p.id
  from public.profiles p
 where d.profile_id is null
   and d.donor_email is not null
   and lower(p.email) = lower(d.donor_email);
