/* ============================================================
   Somos Reino — data access
   ------------------------------------------------------------
   Reads return the canonical shape defined in demo.js: integer
   cents, snake_case columns, funds carrying their own colour and
   bilingual name. Mapping happens here, once, so no view ever
   has to know what a PostgREST row looks like.

   Every function throws an Error carrying a readable message.
   The store catches and surfaces `error.message`, so the wording
   reaches a human.

   Row Level Security is the authority on who may read or write
   what. Nothing here should be read as a permission check — a
   read that returns fewer rows for a member than for a treasurer
   is RLS working, not a bug.
   ============================================================ */
import { requireClient, unwrap, fail, TABLES, FUNCTIONS } from "./supabase.js";

/* Funds carry presentation with them — a colour and both names —
   because every view that shows money shows a fund beside it, and
   a lookup table in the browser would drift from the database. */
const FALLBACK_COLOR = "#9A9299";

const mapFund = (row) => ({
  id: row.id,
  slug: row.slug ?? row.id,
  color: row.color || FALLBACK_COLOR,
  name: { es: row.name_es || row.name_en || row.slug, en: row.name_en || row.name_es || row.slug },
  blurb: { es: row.blurb_es || "", en: row.blurb_en || "" },
  balance_cents: row.balance_cents ?? 0,
  goal_cents: row.goal_cents ?? null,
  raised_cents: row.raised_cents ?? null,
});

const mapPerson = (row) => ({
  id: row.id,
  full_name: row.full_name || row.email || "—",
  email: row.email || "",
  phone: row.phone || "",
  role: row.role || "member",
  teams: row.teams || (row.team_name ? [row.team_name] : []),
  permissions: row.permissions || {},
  is_active: row.is_active !== false,
  background_check: row.background_check || "missing",
  created_at: row.created_at,
  last_seen_at: row.last_seen_at || null,
});

const mapDonation = (row) => ({
  id: row.id,
  profile_id: row.profile_id ?? null,
  /* An anonymous gift has no profile to join, and the finance views
     still need something to print in the Giver column. */
  giver_name: row.profiles?.full_name || row.giver_name || "Anonymous",
  fund_id: row.fund_id,
  amount_cents: row.amount_cents ?? 0,
  fee_cents: row.fee_cents ?? 0,
  fee_covered: Boolean(row.fee_covered),
  method: row.method || "Card",
  recurring: Boolean(row.recurring_gift_id || row.recurring),
  occurred_at: row.occurred_at,
});

const mapExpense = (row) => ({
  id: row.id,
  description: row.description || "",
  submitter_id: row.submitter_id ?? null,
  submitter_name: row.profiles?.full_name || row.submitter_name || "—",
  team_name: row.team_name || "",
  fund_id: row.fund_id,
  amount_cents: row.amount_cents ?? 0,
  status: row.status || "pending",
  has_receipt: Boolean(row.has_receipt ?? row.receipt_url),
  note: row.note || "",
  created_at: row.created_at,
});

const mapPayout = (row) => ({
  id: row.id,
  reference: row.reference || row.id,
  gross_cents: row.gross_cents ?? 0,
  fees_cents: row.fees_cents ?? 0,
  net_cents: row.net_cents ?? 0,
  gift_count: row.gift_count ?? 0,
  paid_at: row.paid_at,
  arrives_at: row.arrives_at,
});

const mapBankTransaction = (row) => ({
  id: row.id,
  reference: row.reference || row.id,
  description: row.description || "",
  amount_cents: row.amount_cents ?? 0,
  kind: row.kind || "other",
  posted_at: row.posted_at,
});

const mapPaymentMethod = (row) => ({
  id: row.id,
  profile_id: row.profile_id,
  brand: (row.brand || "CARD").toUpperCase(),
  last4: row.last4 || "••••",
  exp_month: row.exp_month ?? null,
  exp_year: row.exp_year ?? null,
  is_default: Boolean(row.is_default),
});

const mapRecurring = (row) => ({
  id: row.id,
  profile_id: row.profile_id,
  fund_id: row.fund_id,
  amount_cents: row.amount_cents ?? 0,
  frequency: row.frequency || "monthly",
  next_charge_at: row.next_charge_at,
  payment_method_id: row.payment_method_id ?? null,
  status: row.status || "active",
});

/* ------------------------------------------------------------
   Reads
   ------------------------------------------------------------ */

/**
 * Load everything this person is allowed to see, in one round of
 * parallel reads.
 *
 * A member's reads come back thin — RLS returns their own giving
 * and nothing else — and the finance tables come back empty rather
 * than failing. That is why this is one function rather than one
 * per portal: the shape is the same either way, and the views
 * branch on capabilities, not on which query ran.
 *
 * @param {{userId:string, canSeeBooks:boolean}} options
 */
export async function loadStore({ userId, canSeeBooks = false }) {
  const db = requireClient();
  if (!userId) fail("A user id is required to load the portal.");

  /* Everyone's reads. */
  const common = [
    db.from(TABLES.funds).select("*").order("name_en"),
    db.from(TABLES.profiles).select("*").eq("id", userId).maybeSingle(),
    db.from(TABLES.paymentMethods).select("*").eq("profile_id", userId).order("is_default", { ascending: false }),
    db.from(TABLES.recurringGifts).select("*").eq("profile_id", userId).order("created_at", { ascending: false }),
  ];

  /* The books. Skipped entirely rather than fired and discarded —
     a member's browser should not be asking for the payout table. */
  const books = canSeeBooks
    ? [
        db.from(TABLES.donations).select("*, profiles(full_name)").order("occurred_at", { ascending: false }),
        db.from(TABLES.expenses).select("*, profiles(full_name)").order("created_at", { ascending: false }),
        db.from(TABLES.payouts).select("*").order("paid_at", { ascending: false }),
        db.from(TABLES.bankTransactions).select("*").order("posted_at", { ascending: false }),
        db.from(TABLES.matches).select("*"),
        db.from(TABLES.ledgerEntries).select("*"),
        db.from(TABLES.profiles).select("*").order("full_name"),
      ]
    : [
        db.from(TABLES.donations).select("*").eq("profile_id", userId).order("occurred_at", { ascending: false }),
      ];

  const results = await Promise.all([...common, ...books]);
  const [funds, profile, paymentMethods, recurring, donations, ...rest] = results;

  const store = {
    profile: unwrap(profile, "Loading your profile") ? mapPerson(unwrap(profile, "Loading your profile")) : null,
    funds: unwrap(funds, "Loading funds").map(mapFund),
    paymentMethods: unwrap(paymentMethods, "Loading payment methods").map(mapPaymentMethod),
    recurring: unwrap(recurring, "Loading your recurring gifts").map(mapRecurring),
    donations: unwrap(donations, "Loading giving").map(mapDonation),
    expenses: [],
    payouts: [],
    bankTransactions: [],
    matches: [],
    ledgerEntries: [],
    people: [],
    activity: [],
    weekly: [],
  };

  if (canSeeBooks) {
    const [expenses, payouts, bank, matches, ledger, people] = rest;
    store.expenses = unwrap(expenses, "Loading expenses").map(mapExpense);
    store.payouts = unwrap(payouts, "Loading payouts").map(mapPayout);
    store.bankTransactions = unwrap(bank, "Loading bank transactions").map(mapBankTransaction);
    store.matches = unwrap(matches, "Loading reconciliation matches");
    store.ledgerEntries = unwrap(ledger, "Loading ledger entries");
    store.people = unwrap(people, "Loading people").map(mapPerson);
    store.weekly = weeklyTotals(store.donations);
  }

  return store;
}

/**
 * Giving per week for the last nine weeks, for the Today chart.
 * Derived here rather than queried: the donations are already in
 * memory and a view over them would be another thing to migrate.
 */
function weeklyTotals(donations) {
  const buckets = new Map();
  for (const d of donations) {
    if (!d.occurred_at) continue;
    const date = new Date(`${d.occurred_at.slice(0, 10)}T12:00:00`);
    /* Week starting Monday, so a Sunday's giving lands in its own week. */
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) || 0) + d.amount_cents);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-9)
    .map(([key, totalCents]) => {
      const date = new Date(`${key}T12:00:00`);
      return { w: date.toLocaleDateString("en-US", { month: "short", day: "2-digit" }), v: totalCents / 100 };
    });
}

/* ------------------------------------------------------------
   Expenses
   ------------------------------------------------------------ */

/** File a new reimbursement request. */
export async function createExpense(expense) {
  const db = requireClient();
  if (!expense?.description) fail("An expense needs a description.");
  if (!(expense.amount_cents > 0)) fail("An expense needs an amount above zero.");

  const result = await db.from(TABLES.expenses).insert({ ...expense, status: "pending" }).select("*, profiles(full_name)").single();
  return mapExpense(unwrap(result, "Creating the expense"));
}

/**
 * Move an expense through approval.
 * @param {"pending"|"approved"|"denied"|"reimbursed"} status
 */
export async function setExpenseStatus(id, status, note) {
  const db = requireClient();
  const patch = { status, status_changed_at: new Date().toISOString() };
  if (note !== undefined) patch.note = note;

  const result = await db.from(TABLES.expenses).update(patch).eq("id", id).select("*, profiles(full_name)").single();
  return mapExpense(unwrap(result, "Updating the expense"));
}

/* ------------------------------------------------------------
   Reconciliation
   ------------------------------------------------------------ */

/** Match a Stripe payout to the bank transaction that carried it. */
export async function reconcile(payoutId, bankTransactionId) {
  const db = requireClient();
  if (!payoutId || !bankTransactionId) fail("Both a payout and a bank transaction are needed to reconcile.");

  const result = await db
    .from(TABLES.matches)
    .insert({ payout_id: payoutId, bank_transaction_id: bankTransactionId, matched_at: new Date().toISOString() })
    .select()
    .single();

  return unwrap(result, "Reconciling the payout");
}

/** Undo a match. */
export async function undoReconciliation(matchId) {
  const db = requireClient();
  if (!matchId) fail("That match is missing its id, so it can't be undone.");
  unwrap(await db.from(TABLES.matches).delete().eq("id", matchId), "Undoing the reconciliation");
}

/**
 * Record a bank transaction that isn't a Stripe payout — a counted
 * offering, a rental, a refund — against a fund.
 */
export async function recordBankTransaction({ bankTransactionId, fundId, category, note }) {
  const db = requireClient();
  if (!bankTransactionId || !fundId) fail("A bank transaction and a fund are both needed.");

  const result = await db
    .from(TABLES.ledgerEntries)
    .insert({ bank_transaction_id: bankTransactionId, fund_id: fundId, category: category || null, note: note || null })
    .select()
    .single();

  return unwrap(result, "Recording the transaction");
}

/** Remove the ledger entry recorded for a bank transaction. */
export async function undoRecordedBankTransaction(bankTransactionId) {
  const db = requireClient();
  unwrap(
    await db.from(TABLES.ledgerEntries).delete().eq("bank_transaction_id", bankTransactionId),
    "Undoing the recorded transaction",
  );
}

/* ------------------------------------------------------------
   People
   ------------------------------------------------------------ */

/** Replace a person's permission flags. */
export async function updatePermissions(profileId, permissions) {
  const db = requireClient();
  const result = await db.from(TABLES.profiles).update({ permissions }).eq("id", profileId).select().single();
  return mapPerson(unwrap(result, "Updating permissions"));
}

/** Update the signed-in person's own contact details. */
export async function updateMyProfile(userId, { full_name, email, phone }) {
  const db = requireClient();
  if (!userId) fail("You need to be signed in to update your profile.");

  const result = await db.from(TABLES.profiles).update({ full_name, email, phone }).eq("id", userId).select().single();
  return mapPerson(unwrap(result, "Saving your profile"));
}

/* ------------------------------------------------------------
   Stripe

   Both of these redirect the browser on success, so they do not
   return. Card details never touch this origin.
   ------------------------------------------------------------ */

/** Open Stripe Checkout for a one-time or recurring gift. */
export async function startCheckout({ fundId, amountCents, frequency, coverFee }) {
  const db = requireClient();
  if (!fundId) fail("Choose a fund before giving.");
  if (!(amountCents > 0)) fail("Choose an amount above zero.");

  const { data, error } = await db.functions.invoke(FUNCTIONS.checkout, {
    body: { fundId, amountCents, frequency, coverFee: Boolean(coverFee), returnUrl: window.location.href },
  });
  if (error) fail(`Opening checkout: ${error.message}`);
  if (!data?.url) fail("Checkout did not return a payment link.");

  window.location.assign(data.url);
}

/** Open the Stripe billing portal, where cards and recurring gifts are managed. */
export async function openBillingPortal() {
  const db = requireClient();
  const { data, error } = await db.functions.invoke(FUNCTIONS.billingPortal, {
    body: { returnUrl: window.location.href },
  });
  if (error) fail(`Opening the billing portal: ${error.message}`);
  if (!data?.url) fail("The billing portal did not return a link.");

  window.location.assign(data.url);
}
