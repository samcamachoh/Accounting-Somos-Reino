/* ============================================================
   Somos Reino — application state
   ------------------------------------------------------------
   One store for the whole portal. It holds three things:

     session   who is signed in, and what they may do
     data      the canonical records, in the shape api.js returns
     ui        whatever the current view is holding on to

   Every mutation below is written once and works in both modes.
   In demo mode it edits `data` in memory; in live mode it calls
   Supabase and folds the returned row back into `data`. The
   views call these and then ask for a re-render — they never
   branch on which mode they are in, and that is the whole point
   of keeping demo.js in the live shape.
   ============================================================ */
import { isConfigured } from "./supabase.js";
import { demoStore } from "./demo.js";
import { capabilitiesFor, demoCapabilities } from "./access.js";
import * as api from "./api.js";

/* A render callback, set by app.js. Mutations call it rather than
   importing the router, which would make these two modules
   circular. */
let onChange = () => {};
export const onStoreChange = (fn) => { onChange = fn; };
export const notify = () => onChange();

export const state = {
  /** demo | ready | error — what the badge reports. */
  mode: "demo",
  /** The Supabase user, or null in demo mode. */
  user: null,
  /** The signed-in person's profile row. */
  profile: null,
  /** A Set of capability names. See access.js. */
  caps: new Set(),
  /** The canonical records. Empty until load() resolves. */
  data: emptyStore(),
  /** The view id currently routed to. */
  view: null,
  /** The open dialog, as {kind, ...payload}, or null. */
  modal: null,
  /** Whatever the current view is holding on to between renders. */
  ui: {},
  /** A load failure, surfaced in the badge and a banner. */
  error: null,
};

function emptyStore() {
  return {
    profile: null, funds: [], people: [], donations: [], recurring: [], paymentMethods: [],
    expenses: [], payouts: [], bankTransactions: [], matches: [], ledgerEntries: [],
    activity: [], weekly: [], songs: [], teams: [], plans: [],
  };
}

/** True when the portal is showing sample data rather than the database. */
export const isDemo = () => state.mode === "demo";

/* ------------------------------------------------------------
   Loading
   ------------------------------------------------------------ */

/**
 * Fill the store for this session.
 *
 * Demo mode needs no session and grants every capability — the
 * point of it is to show the whole portal on a fresh clone, and
 * the badge says plainly that none of it is real.
 *
 * @param {{user?:object, profile?:object}|null} session
 */
export async function load(session) {
  if (!isConfigured) {
    state.mode = "demo";
    state.user = null;
    state.data = demoStore();
    state.profile = state.data.profile;
    state.caps = demoCapabilities();
    state.error = null;
    return state;
  }

  state.user = session?.user ?? null;
  state.profile = session?.profile ?? null;
  state.caps = capabilitiesFor(state.profile);

  try {
    const data = await api.loadStore({
      userId: state.user?.id,
      canSeeBooks: state.caps.has("finance"),
    });
    /* Services has no tables yet, so those three collections keep
       coming from demo.js even in live mode. The Plans view says so
       on screen rather than passing sample data off as real. */
    const { songs, teams, plans } = demoStore();
    state.data = { ...data, songs, teams, plans };
    state.profile = data.profile || state.profile;
    state.caps = capabilitiesFor(state.profile);
    state.mode = "ready";
    state.error = null;
  } catch (error) {
    state.mode = "error";
    state.error = error.message;
    /* Keep whatever loaded. A treasurer with a flaky connection
       should still see the rail and the views that did come back. */
  }
  return state;
}

/** Re-read everything. Used after a write whose effects are wider than its own row. */
export const reload = () => load({ user: state.user, profile: state.profile });

/* ------------------------------------------------------------
   Lookups

   Every view needs these and none of them should be reimplemented
   per view, which is how "—" for a missing fund ended up spelled
   three different ways.
   ------------------------------------------------------------ */
export const fundById = (id) => state.data.funds.find((f) => f.id === id) || null;
export const fundColor = (id) => fundById(id)?.color || "#9A9299";
export const fundName = (id, lang) => {
  const fund = fundById(id);
  return fund ? fund.name[lang] || fund.name.en : "—";
};
export const personById = (id) => state.data.people.find((p) => p.id === id) || null;
export const personName = (id) => personById(id)?.full_name || "—";
export const songById = (id) => state.data.songs.find((s) => s.id === id) || null;
export const planById = (id) => state.data.plans.find((p) => p.id === id) || null;
export const teamById = (id) => state.data.teams.find((t) => t.id === id) || null;

/** The signed-in person's own giving, newest first. */
export const myDonations = () =>
  state.data.donations
    .filter((d) => !state.profile || d.profile_id === state.profile.id)
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));

export const myRecurring = () => state.data.recurring.filter((r) => r.status !== "cancelled");

/* A payout or transaction is reconciled when a match names it. */
export const matchForPayout = (payoutId) => state.data.matches.find((m) => m.payout_id === payoutId) || null;
export const matchForBank = (bankId) => state.data.matches.find((m) => m.bank_transaction_id === bankId) || null;
export const ledgerForBank = (bankId) => state.data.ledgerEntries.find((l) => l.bank_transaction_id === bankId) || null;

export const openPayouts = () => state.data.payouts.filter((p) => !matchForPayout(p.id));
export const openBank = () =>
  state.data.bankTransactions.filter((b) => !matchForBank(b.id) && !ledgerForBank(b.id));

export const pendingExpenses = () => state.data.expenses.filter((e) => e.status === "pending");

/** The transaction whose amount already equals this payout's net. */
export const suggestionFor = (payout) => openBank().find((b) => b.amount_cents === payout.net_cents) || null;

/* ------------------------------------------------------------
   Mutations

   Each one edits `data` and, in live mode, writes through. A
   caller that needs the screen to update calls notify() — usually
   by way of the router's rerender().
   ------------------------------------------------------------ */

const localId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

/** Move an expense through approval. */
export async function setExpenseStatus(id, status, note) {
  const expense = state.data.expenses.find((e) => e.id === id);
  if (!expense) return;

  if (isDemo()) {
    expense.status = status;
    if (note !== undefined) expense.note = note;
  } else {
    const updated = await api.setExpenseStatus(id, status, note);
    Object.assign(expense, updated);
  }
  notify();
}

/** File a new reimbursement request. */
export async function createExpense(input) {
  if (isDemo()) {
    state.data.expenses.unshift({
      id: localId("e"),
      submitter_id: state.profile?.id ?? null,
      submitter_name: state.profile?.full_name || "—",
      has_receipt: false,
      note: "",
      status: "pending",
      created_at: new Date().toISOString().slice(0, 10),
      ...input,
    });
  } else {
    const created = await api.createExpense({ ...input, submitter_id: state.profile?.id });
    state.data.expenses.unshift(created);
  }
  notify();
}

/** Match a Stripe payout to the bank transaction that carried it. */
export async function reconcile(payoutId, bankTransactionId) {
  if (isDemo()) {
    state.data.matches.push({
      id: localId("m"),
      payout_id: payoutId,
      bank_transaction_id: bankTransactionId,
      matched_at: new Date().toISOString(),
    });
  } else {
    state.data.matches.push(await api.reconcile(payoutId, bankTransactionId));
  }
  notify();
}

/** Undo a match. */
export async function undoReconciliation(matchId) {
  if (!isDemo()) await api.undoReconciliation(matchId);
  state.data.matches = state.data.matches.filter((m) => m.id !== matchId);
  notify();
}

/** File a non-Stripe transaction against a fund. */
export async function recordBankTransaction(input) {
  if (isDemo()) {
    state.data.ledgerEntries.push({
      id: localId("l"),
      bank_transaction_id: input.bankTransactionId,
      fund_id: input.fundId,
      category: input.category || null,
      note: input.note || null,
    });
  } else {
    state.data.ledgerEntries.push(await api.recordBankTransaction(input));
  }
  notify();
}

/** Remove the ledger entry recorded for a bank transaction. */
export async function undoRecordedBankTransaction(bankTransactionId) {
  if (!isDemo()) await api.undoRecordedBankTransaction(bankTransactionId);
  state.data.ledgerEntries = state.data.ledgerEntries.filter((l) => l.bank_transaction_id !== bankTransactionId);
  notify();
}

/** Replace a person's permission flags. */
export async function updatePermissions(profileId, permissions) {
  const person = personById(profileId);
  if (!person) return;

  if (isDemo()) {
    person.permissions = permissions;
  } else {
    Object.assign(person, await api.updatePermissions(profileId, permissions));
  }
  /* Changing your own permissions changes your own rail. */
  if (profileId === state.profile?.id) {
    state.profile.permissions = permissions;
    state.caps = capabilitiesFor(state.profile);
  }
  notify();
}

/** Update the signed-in person's own contact details. */
export async function updateMyProfile(changes) {
  if (isDemo()) {
    Object.assign(state.profile, changes);
  } else {
    Object.assign(state.profile, await api.updateMyProfile(state.user?.id, changes));
  }
  notify();
}

/* ---- recurring gifts ----

   Live mode sends people to the Stripe billing portal for these:
   the subscription lives in Stripe, and editing our copy of it
   would put the two out of step. Demo mode edits the sample row
   so the buttons do something on a fresh clone. */

export async function setRecurringStatus(id, status) {
  if (!isDemo()) return api.openBillingPortal();
  const gift = state.data.recurring.find((r) => r.id === id);
  if (gift) gift.status = status;
  notify();
}

export async function setRecurringAmount(id, amountCents) {
  if (!isDemo()) return api.openBillingPortal();
  const gift = state.data.recurring.find((r) => r.id === id);
  if (gift) gift.amount_cents = amountCents;
  notify();
}

export async function cancelRecurring(id) {
  if (!isDemo()) return api.openBillingPortal();
  state.data.recurring = state.data.recurring.filter((r) => r.id !== id);
  notify();
}

/* ---- services ----

   No tables behind these yet, so they are memory-only in both
   modes. See the note in load(). */

export function setSlotStatus(planId, slotId, status) {
  const slot = planById(planId)?.slots.find((s) => s.id === slotId);
  if (slot) slot.status = status;
  notify();
}
