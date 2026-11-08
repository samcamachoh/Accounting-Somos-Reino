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

/* ------------------------------------------------------------
   Follow-ups
   ------------------------------------------------------------ */

const FOLLOW_UP_SELECT =
  "*, people(id, first_name, last_name, phone, email, status), assignee:profiles!assigned_to(id, full_name)";

/**
 * Everything the follow-up queue renders: open and snoozed tasks, tasks
 * finished in the last 30 days, people to add tasks for, and who can
 * be assigned them.
 */
export async function loadFollowUpSnapshot() {
  const db = requireClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();

  const [open, done, people, staff] = await Promise.all([
    db.from(TABLES.followUps).select(FOLLOW_UP_SELECT).in("status", ["open", "snoozed"]).order("due_on"),
    db.from(TABLES.followUps).select(FOLLOW_UP_SELECT).in("status", ["done", "dropped"]).gte("completed_at", since).order("completed_at", { ascending: false }),
    db.from(TABLES.people).select("id, first_name, last_name, phone, email, status").order("last_name"),
    db.from(TABLES.profiles).select("id, full_name, email").eq("is_active", true).order("full_name"),
  ]);

  return {
    followUps: [...unwrap(open, "Loading follow-ups"), ...unwrap(done, "Loading finished follow-ups")],
    people: unwrap(people, "Loading people"),
    staff: unwrap(staff, "Loading staff"),
  };
}

/** A person's recent contact history, newest first. */
export async function loadInteractions(personId) {
  const db = requireClient();
  if (!personId) fail("Which person?");
  const result = await db
    .from(TABLES.interactions)
    .select("*, author:profiles!logged_by(full_name)")
    .eq("person_id", personId)
    .order("occurred_at", { ascending: false })
    .limit(10);
  return unwrap(result, "Loading contact history");
}

/**
 * Add a follow-up by hand.
 * @param {{person_id:string,title:string,kind?:string,due_on?:string,priority?:string,assigned_to?:string|null,details?:string}} followUp
 */
export async function createFollowUp(followUp) {
  const db = requireClient();
  if (!followUp?.person_id) fail("Choose who this follow-up is about.");
  if (!followUp?.title?.trim()) fail("A follow-up needs a title.");

  const result = await db
    .from(TABLES.followUps)
    .insert({ ...followUp, title: followUp.title.trim(), source: "manual" })
    .select(FOLLOW_UP_SELECT)
    .single();
  return unwrap(result, "Creating the follow-up");
}

/**
 * Change a follow-up. The database stamps `completed_at` itself when
 * a task is closed, so callers only say what the status is.
 */
export async function updateFollowUp(id, patch) {
  const db = requireClient();
  if (!id) fail("Which follow-up?");
  const result = await db.from(TABLES.followUps).update(patch).eq("id", id).select(FOLLOW_UP_SELECT).single();
  return unwrap(result, "Updating the follow-up");
}

/**
 * Log a call, visit or note about someone — and, when `followUpId` is
 * given, close that follow-up with the same summary as its outcome.
 * The log is written first, so a failure never loses what was said.
 */
export async function logInteraction({ personId, kind, summary, followUpId, close = true }) {
  const db = requireClient();
  if (!personId) fail("Which person?");
  if (!summary?.trim()) fail("Write a line about what happened.");

  const logged = await db
    .from(TABLES.interactions)
    .insert({ person_id: personId, kind, summary: summary.trim() })
    .select()
    .single();
  const interaction = unwrap(logged, "Logging the contact");

  if (followUpId && close) {
    const followUp = await updateFollowUp(followUpId, { status: "done", outcome: summary.trim() });
    return { interaction, followUp };
  }
  return { interaction };
}

/* ------------------------------------------------------------
   People directory
   ------------------------------------------------------------ */

const PERSON_FIELDS = [
  "household_id", "household_role", "first_name", "last_name", "preferred_name", "email", "phone",
  "birthday", "anniversary", "gender", "language", "status", "first_visit_on", "joined_on",
  "baptized_on", "how_they_found_us", "tags", "notes", "background_check", "background_check_expires",
];
const PERSON_STATUSES = ["visitor", "regular", "member", "inactive", "former"];

/** Keep only columns the table has, and turn blank strings into nulls. */
function cleanPerson(input) {
  const out = {};
  for (const key of PERSON_FIELDS) {
    if (!(key in input)) continue;
    const value = input[key];
    out[key] = typeof value === "string" ? (value.trim() === "" ? null : value.trim()) : value;
  }
  /* These columns are NOT NULL with defaults; null would be refused. */
  for (const key of ["last_name", "language", "status", "background_check"]) {
    if (key in out && out[key] === null) delete out[key];
  }
  if (!out.last_name && "last_name" in input) out.last_name = "";
  return out;
}

/** Read every row of a query, a page at a time, past PostgREST's 1,000-row cap. */
async function fetchAll(buildQuery, context) {
  const size = 1000;
  const rows = [];
  for (let from = 0; ; from += size) {
    const page = unwrap(await buildQuery().range(from, from + size - 1), context);
    rows.push(...page);
    if (page.length < size) return rows;
  }
}

/** Everyone, with their family and groups, for the directory. */
export async function loadPeopleSnapshot() {
  const db = requireClient();
  const [people, households, memberships] = await Promise.all([
    fetchAll(() => db.from(TABLES.people).select("*").order("last_name").order("first_name"), "Loading people"),
    fetchAll(() => db.from(TABLES.households).select("*").order("name"), "Loading families"),
    fetchAll(() => db.from(TABLES.groupMembers).select("person_id, role, left_on, groups(id, name, kind)").is("left_on", null), "Loading groups"),
  ]);
  return { people, households, memberships };
}

/**
 * One person's story: contact history, open follow-ups, family, and — when
 * the viewer may see the books — what they have given this year.
 */
export async function loadPersonDetail(person, { includeGiving = false } = {}) {
  const db = requireClient();
  if (!person?.id) fail("Which person?");

  const [interactions, followUps, family, giving] = await Promise.all([
    db.from(TABLES.interactions).select("*, author:profiles!logged_by(full_name)").eq("person_id", person.id).order("occurred_at", { ascending: false }).limit(15),
    db.from(TABLES.followUps).select("id, title, kind, due_on, status").eq("person_id", person.id).in("status", ["open", "snoozed"]).order("due_on"),
    person.household_id
      ? db.from(TABLES.people).select("id, first_name, last_name, household_role, status").eq("household_id", person.household_id).neq("id", person.id)
      : Promise.resolve({ data: [], error: null }),
    includeGiving
      ? db.from(TABLES.givingSummary).select("year, gifts, total_cents, last_gift_at").eq("person_id", person.id).order("year", { ascending: false }).limit(3)
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    interactions: unwrap(interactions, "Loading contact history"),
    followUps: unwrap(followUps, "Loading follow-ups"),
    family: unwrap(family, "Loading family"),
    giving: unwrap(giving, "Loading giving"),
  };
}

/** Find a family by name (case-insensitive) or create it. Returns its id. */
export async function ensureHousehold(name) {
  const db = requireClient();
  const clean = String(name ?? "").trim();
  if (!clean) return null;

  const found = unwrap(await db.from(TABLES.households).select("id").ilike("name", clean.replace(/[%_]/g, "\\$&")).limit(1), "Looking up the family");
  if (found.length) return found[0].id;

  return unwrap(await db.from(TABLES.households).insert({ name: clean }).select("id").single(), "Creating the family").id;
}

/** Add one person. Returns the created row. */
export async function createPerson(input) {
  const db = requireClient();
  if (!input?.first_name?.trim()) fail("A first name is required.");
  const result = await db.from(TABLES.people).insert(cleanPerson(input)).select("*").single();
  return unwrap(result, "Adding the person");
}

/** Change a person; only the fields passed are touched. */
export async function updatePerson(id, changes) {
  const db = requireClient();
  if (!id) fail("Which person?");
  if ("first_name" in changes && !String(changes.first_name ?? "").trim()) fail("A first name is required.");
  const result = await db.from(TABLES.people).update(cleanPerson(changes)).eq("id", id).select("*").single();
  return unwrap(result, "Saving the person");
}

/**
 * Bulk-add people from an import. Families are created once per name.
 * Rows go in chunks, so a bad row fails its chunk without hiding which
 * chunk it was in. Returns how many were added.
 * @param {object[]} rows Person fields plus an optional `household_name`.
 */
export async function importPeople(rows) {
  const db = requireClient();
  if (!rows?.length) fail("There is nothing to import.");

  const ids = new Map();
  for (const name of new Set(rows.map((r) => String(r.household_name ?? "").trim()).filter(Boolean))) {
    ids.set(name.toLowerCase(), await ensureHousehold(name));
  }

  const payload = rows.map(({ household_name, ...person }) => ({
    ...cleanPerson(person),
    household_id: household_name ? ids.get(String(household_name).trim().toLowerCase()) ?? null : null,
  }));

  let added = 0;
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const result = await db.from(TABLES.people).insert(chunk);
    if (result.error) fail(`Importing rows ${i + 1}–${i + chunk.length}: ${result.error.message}. ${added} added before that.`);
    added += chunk.length;
  }
  return { added };
}

export { PERSON_STATUSES };
