/* ============================================================
   Somos Reino — data access
   ------------------------------------------------------------
   Every function here throws an Error carrying a readable
   message; the portals catch and surface `error.message` in a
   toast, so the wording reaches a human.

   Reads are shaped to match exactly what finance.html and
   giving.html destructure out of their snapshots. Changing a
   select() here means changing the matching hydrate function
   in the page.

   Row Level Security is the authority on who may read or write
   what. Nothing here should be read as a permission check.
   ============================================================ */
import { requireClient, unwrap, fail, TABLES, FUNCTIONS } from "./supabase.js";

/* ------------------------------------------------------------
   Reads
   ------------------------------------------------------------ */

/**
 * Everything the finance portal renders, in one round of parallel reads.
 * @returns {Promise<{funds:object[],payouts:object[],bankTransactions:object[],matches:object[],ledgerEntries:object[],expenses:object[],donations:object[],profiles:object[]}>}
 */
export async function loadFinanceSnapshot() {
  const db = requireClient();

  const [funds, payouts, bankTransactions, matches, ledgerEntries, expenses, donations, profiles] =
    await Promise.all([
      db.from(TABLES.funds).select("*").order("name_en"),
      db.from(TABLES.payouts).select("*").order("created_at", { ascending: false }),
      db.from(TABLES.bankTransactions).select("*").order("posted_at", { ascending: false }),
      db.from(TABLES.matches).select("*"),
      db.from(TABLES.ledgerEntries).select("*, funds(slug)"),
      db.from(TABLES.expenses).select("*, profiles(full_name)").order("created_at", { ascending: false }),
      db.from(TABLES.donations).select("*, funds(slug), profiles(full_name)").order("occurred_at", { ascending: false }),
      db.from(TABLES.profiles).select("*").order("full_name"),
    ]);

  return {
    funds: unwrap(funds, "Loading funds"),
    payouts: unwrap(payouts, "Loading payouts"),
    bankTransactions: unwrap(bankTransactions, "Loading bank transactions"),
    matches: unwrap(matches, "Loading reconciliation matches"),
    ledgerEntries: unwrap(ledgerEntries, "Loading ledger entries"),
    expenses: unwrap(expenses, "Loading expenses"),
    donations: unwrap(donations, "Loading donations"),
    profiles: unwrap(profiles, "Loading people"),
  };
}

/**
 * Everything the giver portal renders for one person.
 * @param {string} userId The signed-in profile id.
 */
export async function loadGivingSnapshot(userId) {
  const db = requireClient();
  if (!userId) fail("A user id is required to load your giving.");

  const [funds, paymentMethods, donations, recurring] = await Promise.all([
    db.from(TABLES.funds).select("*").order("name_en"),
    db.from(TABLES.paymentMethods).select("*").eq("profile_id", userId).order("is_default", { ascending: false }),
    db.from(TABLES.donations).select("*, funds(slug)").eq("profile_id", userId).order("occurred_at", { ascending: false }),
    db.from(TABLES.recurringGifts).select("*, funds(slug)").eq("profile_id", userId).order("created_at", { ascending: false }),
  ]);

  return {
    funds: unwrap(funds, "Loading funds"),
    paymentMethods: unwrap(paymentMethods, "Loading payment methods"),
    donations: unwrap(donations, "Loading your giving history"),
    recurring: unwrap(recurring, "Loading your recurring gifts"),
  };
}

/**
 * The household a person belongs to, with everyone in it.
 *
 * Returns null when they aren't in a family — that is an ordinary
 * state, not a failure, and the portal falls back to the surname
 * on the profile. Row Level Security limits this to the caller's
 * own family; there is no way to read another household's people.
 *
 * @param {{family_id?:string}} profile The signed-in profile.
 * @returns {Promise<{family:object, members:object[]}|null>}
 */
export async function loadHousehold(profile) {
  const db = requireClient();
  if (!profile?.family_id) return null;

  const [family, members] = await Promise.all([
    db.from(TABLES.families).select("*").eq("id", profile.family_id).maybeSingle(),
    db
      .from(TABLES.profiles)
      .select("id, full_name, family_role, is_active")
      .eq("family_id", profile.family_id)
      .order("full_name"),
  ]);

  const record = unwrap(family, "Loading your household");
  if (!record) return null;

  return { family: record, members: unwrap(members, "Loading your household") ?? [] };
}

/* ------------------------------------------------------------
   Expenses
   ------------------------------------------------------------ */

/**
 * File a new reimbursement request.
 * @param {{submitter_id:string,fund_id:string,description:string,team_name:string,amount_cents:number,note:string}} expense
 * @returns {Promise<{id:string}>} The created row — the portal reads `.id`.
 */
export async function createExpense(expense) {
  const db = requireClient();
  if (!expense?.description) fail("An expense needs a description.");
  if (!(expense.amount_cents > 0)) fail("An expense needs an amount above zero.");

  const result = await db
    .from(TABLES.expenses)
    .insert({ ...expense, status: "pending" })
    .select()
    .single();

  return unwrap(result, "Creating the expense");
}

/**
 * Move an expense through approval.
 * @param {string} id
 * @param {"pending"|"approved"|"denied"|"reimbursed"} status
 * @param {string} [note] Stored alongside the status when given.
 */
export async function setExpenseStatus(id, status, note) {
  const db = requireClient();
  const patch = { status, status_changed_at: new Date().toISOString() };
  if (note !== undefined) patch.note = note;

  const result = await db.from(TABLES.expenses).update(patch).eq("id", id).select().single();
  return unwrap(result, "Updating the expense");
}

/* ------------------------------------------------------------
   Reconciliation
   ------------------------------------------------------------ */

/**
 * Match a Stripe payout to the bank transaction that carried it.
 * @returns {Promise<{id:string}>} The match — the portal keeps `.id` to undo with.
 */
export async function reconcileTransactions(payoutId, bankTransactionId) {
  const db = requireClient();
  if (!payoutId || !bankTransactionId) fail("Both a payout and a bank transaction are needed to reconcile.");

  const result = await db
    .from(TABLES.matches)
    .insert({ payout_id: payoutId, bank_transaction_id: bankTransactionId, matched_at: new Date().toISOString() })
    .select()
    .single();

  return unwrap(result, "Reconciling the payout");
}

/** Undo a match made by reconcileTransactions. */
export async function undoReconciliation(matchId) {
  const db = requireClient();
  if (!matchId) fail("That match is missing its id, so it can't be undone.");

  const result = await db.from(TABLES.matches).delete().eq("id", matchId);
  unwrap(result, "Undoing the reconciliation");
}

/**
 * Record a bank transaction that isn't a Stripe payout — a counted
 * offering, a rental, a refund — against a fund.
 */
export async function recordBankTransaction(bankTransactionId, fundId, category, note) {
  const db = requireClient();
  if (!bankTransactionId || !fundId) fail("A bank transaction and a fund are both needed.");

  const result = await db
    .from(TABLES.ledgerEntries)
    .insert({
      bank_transaction_id: bankTransactionId,
      fund_id: fundId,
      category: category || null,
      note: note || null,
    })
    .select()
    .single();

  return unwrap(result, "Recording the transaction");
}

/** Remove the ledger entry recorded for a bank transaction. */
export async function undoRecordedBankTransaction(bankTransactionId) {
  const db = requireClient();
  const result = await db.from(TABLES.ledgerEntries).delete().eq("bank_transaction_id", bankTransactionId);
  unwrap(result, "Undoing the recorded transaction");
}

/* ------------------------------------------------------------
   People
   ------------------------------------------------------------ */

/**
 * Invite a new member. Creating an auth user needs the service
 * role, so this runs as an Edge Function rather than in the browser.
 * @returns {Promise<{userId:string}>}
 */
export async function createMemberAccount({ email, fullName, role, teamName }) {
  const db = requireClient();
  if (!email || !fullName) fail("A name and an email are needed to create the account.");

  const { data, error } = await db.functions.invoke(FUNCTIONS.createMember, {
    body: { email, fullName, role, teamName },
  });
  if (error) fail(`Creating the account: ${error.message}`);
  if (!data?.userId) fail("The account was created but no user id came back.");

  return data;
}

/** Revoke access without deleting the person's history. */
export async function deactivateMember(profileId) {
  const db = requireClient();
  const result = await db
    .from(TABLES.profiles)
    .update({ is_active: false, disabled_at: new Date().toISOString() })
    .eq("id", profileId)
    .select()
    .single();

  return unwrap(result, "Removing access");
}

/** Restore access to a previously deactivated person. */
export async function reactivateMember(profileId) {
  const db = requireClient();
  const result = await db
    .from(TABLES.profiles)
    .update({ is_active: true, disabled_at: null })
    .eq("id", profileId)
    .select()
    .single();

  return unwrap(result, "Restoring access");
}

/**
 * Replace a person's permission flags.
 * @param {string} profileId
 * @param {{finance:boolean,approve:boolean,refund:boolean,people:boolean,payouts:boolean}} permissions
 */
export async function updateMemberPermissions(profileId, permissions) {
  const db = requireClient();
  const result = await db
    .from(TABLES.profiles)
    .update({ permissions })
    .eq("id", profileId)
    .select()
    .single();

  return unwrap(result, "Updating permissions");
}

/** Update the signed-in person's own contact details. */
export async function updateMyProfile({ full_name, email, phone }) {
  const db = requireClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error) fail(`Could not confirm who you are: ${error.message}`);
  if (!user) fail("You need to be signed in to update your profile.");

  const result = await db
    .from(TABLES.profiles)
    .update({ full_name, email, phone })
    .eq("id", user.id)
    .select()
    .single();

  return unwrap(result, "Saving your profile");
}

/* ------------------------------------------------------------
   Stripe
   ------------------------------------------------------------ */

/**
 * Open Stripe Checkout for a one-time or recurring gift.
 * Redirects the browser on success, so it does not return.
 * @param {{fundId:string,amountCents:number,frequency:"once"|"weekly"|"monthly",coverFee:boolean}} gift
 */
export async function startCheckout({ fundId, amountCents, frequency, coverFee }) {
  const db = requireClient();
  if (!fundId) fail("Choose a fund before giving.");
  if (!(amountCents > 0)) fail("Choose an amount above zero.");

  const { data, error } = await db.functions.invoke(FUNCTIONS.checkout, {
    body: {
      fundId,
      amountCents,
      frequency,
      coverFee: Boolean(coverFee),
      returnUrl: window.location.href,
    },
  });
  if (error) fail(`Opening checkout: ${error.message}`);
  if (!data?.url) fail("Checkout did not return a payment link.");

  window.location.assign(data.url);
}

/**
 * Open the Stripe billing portal, where cards and recurring gifts
 * are managed. Redirects the browser on success.
 */
export async function openBillingPortal() {
  const db = requireClient();

  const { data, error } = await db.functions.invoke(FUNCTIONS.billingPortal, {
    body: { returnUrl: window.location.href },
  });
  if (error) fail(`Opening the billing portal: ${error.message}`);
  if (!data?.url) fail("The billing portal did not return a link.");

  window.location.assign(data.url);
}
