/* ============================================================
   Somos Reino — reconciliation
   ------------------------------------------------------------
   Stripe on the left, the bank on the right, and a seam between
   them showing the difference. Picking a payout auto-selects the
   transaction whose amount already equals it, so the common case
   — a Stripe transfer that landed exactly as sent — is two
   clicks, and the seam shows $0.00 before you commit to it.

   Money that didn't come through Stripe (a counted offering, a
   rental) has no payout to match, so it gets recorded straight
   to a fund instead. Both paths end in the Reconciled tab with
   an Undo beside them.
   ============================================================ */
import { esc, money, dollars, shortDate, emptyState, toast } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import {
  state, openPayouts, openBank, suggestionFor, matchForPayout, ledgerForBank,
  fundName, fundById, reconcile, undoReconciliation, recordBankTransaction,
  undoRecordedBankTransaction, notify,
} from "../lib/store.js";

/* Selection and tab live in state.ui, which the router clears when
   you leave — coming back to a half-made match you can no longer
   see the reason for is worse than starting over. */
const ui = () => {
  state.ui.reconcile ??= { tab: "open", payoutId: null, bankId: null };
  return state.ui.reconcile;
};

const selectedPayout = () => state.data.payouts.find((p) => p.id === ui().payoutId) || null;
const selectedBank = () => state.data.bankTransactions.find((b) => b.id === ui().bankId) || null;

/** How far off the two selected lines are, in cents. */
const variance = () => {
  const payout = selectedPayout();
  const bank = selectedBank();
  return payout && bank ? bank.amount_cents - payout.net_cents : null;
};

export default {
  id: "reconcile",
  group: "money",
  cap: "finance",
  icon: "M3 6h5l2 6h5M3 12h5M11 3l3 3-3 3",
  label: () => t("navReconcile"),
  crumb: () => t("crumbReconcile"),
  title: () => t("navReconcile"),
  count: () => openPayouts().length + openBank().length,

  actions: () => `<button class="btn btn-sm" data-act="reconcile:export">${esc(t("exportCsv"))}</button>`,

  render(ctx) {
    const { tab } = ui();
    const payouts = state.data.payouts;
    const bank = state.data.bankTransactions;
    const total = payouts.length + bank.length;
    const open = new Set(openBank().map((b) => b.id));
    const cleared = payouts.filter((p) => matchForPayout(p.id)).length + bank.filter((b) => !open.has(b.id)).length;
    const pct = total ? Math.round((cleared / total) * 100) : 100;

    const matchedCount = state.data.matches.length + state.data.ledgerEntries.length;
    const openCount = openPayouts().length + openBank().length;
    const unreconciled =
      openPayouts().reduce((sum, p) => sum + p.net_cents, 0) + openBank().reduce((sum, b) => sum + b.amount_cents, 0);

    return `
      <div class="grid">
        <div class="rec-bar">
          <div>
            <div class="k">${esc(t("unreconciled"))}</div>
            <div class="v">${money(dollars(unreconciled))}</div>
          </div>
          <div>
            <div class="k">${esc(t("openLines"))}</div>
            <div class="v">${openCount}</div>
          </div>
          <div class="rec-prog">
            <div class="k">${esc(t("clearedOf", { a: cleared, b: total }))}</div>
            <div class="rec-track"><div class="rec-fill" style="width:${pct}%"></div></div>
          </div>
        </div>

        <div class="pills">
          <button class="pill" data-act="reconcile:tab" data-tab="open" aria-pressed="${tab === "open"}">
            ${esc(t("tabOpen"))}<span class="c">${openCount}</span>
          </button>
          <button class="pill" data-act="reconcile:tab" data-tab="done" aria-pressed="${tab === "done"}">
            ${esc(t("tabMatched"))}<span class="c">${matchedCount}</span>
          </button>
        </div>

        ${tab === "open" ? matcher() : reconciledList()}
      </div>`;
  },

  modal(ctx, modal) {
    if (modal.kind !== "reconcile:record") return "";
    const bank = state.data.bankTransactions.find((b) => b.id === modal.id);
    if (!bank) return "";

    return `
      <div class="scrim" data-scrim>
        <form class="modal" data-act="reconcile:saveRecord" data-id="${esc(bank.id)}" role="dialog" aria-modal="true">
          <div class="modal-hd">
            <div class="modal-t">${esc(t("recordTitle"))}</div>
            <div class="modal-d">${esc(bank.description)} · ${money(dollars(bank.amount_cents))} · ${esc(shortDate(bank.posted_at, lang()))}</div>
          </div>
          <div class="modal-bd">
            <p class="lead" style="font-size:12.5px">${esc(t("recordBody"))}</p>
            <div class="field">
              <label for="recFund">${esc(t("fund"))}</label>
              <select class="input" id="recFund" name="fund">
                ${state.data.funds.map((f) => `<option value="${esc(f.id)}">${esc(f.name[lang()] || f.name.en)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="recCategory">${esc(t("category"))}</label>
              <input class="input" id="recCategory" name="category" placeholder="${esc(t("category"))}">
            </div>
            <div class="field">
              <label for="recNote">${esc(t("note"))}</label>
              <textarea class="input" id="recNote" name="note" rows="2"></textarea>
            </div>
          </div>
          <div class="modal-ft">
            <button class="btn" type="button" data-act="app:close">${esc(t("cancelBtn"))}</button>
            <button class="btn btn-primary" type="submit">${esc(t("recordIt"))}</button>
          </div>
        </form>
      </div>`;
  },

  handlers: {
    "reconcile:tab": ({ tab }) => { ui().tab = tab; notify(); },

    "reconcile:pickPayout": ({ id }) => {
      const selection = ui();
      selection.payoutId = selection.payoutId === id ? null : id;
      /* Offer the obvious counterpart rather than making someone
         hunt for the number they can already see. */
      const payout = selectedPayout();
      if (payout && !selection.bankId) selection.bankId = suggestionFor(payout)?.id ?? null;
      notify();
    },

    "reconcile:pickBank": ({ id }) => {
      const selection = ui();
      selection.bankId = selection.bankId === id ? null : id;
      notify();
    },

    "reconcile:clear": () => {
      Object.assign(ui(), { payoutId: null, bankId: null });
      notify();
    },

    "reconcile:match": async () => {
      const payout = selectedPayout();
      const bank = selectedBank();
      if (!payout || !bank) return;
      await reconcile(payout.id, bank.id);
      Object.assign(ui(), { payoutId: null, bankId: null });
      toast(t("matchedToast", { a: payout.reference, b: bank.reference }));
    },

    /* Every payout whose amount already has an exact counterpart.
       The ones left over are the ones that actually need a person. */
    "reconcile:acceptAll": async () => {
      const pairs = openPayouts()
        .map((payout) => ({ payout, bank: suggestionFor(payout) }))
        .filter((pair) => pair.bank);

      let done = 0;
      for (const { payout, bank } of pairs) {
        await reconcile(payout.id, bank.id);
        done += 1;
      }
      Object.assign(ui(), { payoutId: null, bankId: null });
      toast(done ? t("acceptedToast", { n: done }) : t("noConfidentMatches"));
    },

    "reconcile:undo": async ({ id }) => {
      await undoReconciliation(id);
      toast(t("undone"));
    },

    "reconcile:askRecord": () => {
      const bank = selectedBank();
      if (!bank) return;
      state.modal = { kind: "reconcile:record", id: bank.id };
      notify();
    },

    "reconcile:saveRecord": async (_dataset, event) => {
      const form = event.target.closest("form");
      state.modal = null;
      await recordBankTransaction({
        bankTransactionId: form.dataset.id,
        fundId: form.fund.value,
        category: form.category.value.trim(),
        note: form.note.value.trim(),
      });
      Object.assign(ui(), { payoutId: null, bankId: null });
      toast(t("recordedToast", { f: fundName(form.fund.value, lang()) }));
    },

    "reconcile:unrecord": async ({ id }) => {
      await undoRecordedBankTransaction(id);
      toast(t("undone"));
    },

    "reconcile:export": () => exportCsv(),
  },
};

/* ------------------------------------------------------------
   The matcher
   ------------------------------------------------------------ */
function matcher() {
  const payout = selectedPayout();
  const bank = selectedBank();
  const canMatch = Boolean(payout && bank);
  /* Money with no Stripe counterpart is recorded, not matched. */
  const canRecord = Boolean(bank && !payout && bank.kind !== "stripe");
  const suggestions = openPayouts().filter((p) => suggestionFor(p)).length;
  const difference = variance();

  return `
    <div class="matcher">
      <div>
        <div class="col-hd">
          <span class="src">${esc(t("stripePayouts"))}</span>
          <span class="n">${openPayouts().length}</span>
        </div>
        <div class="lane">
          ${openPayouts().length
            ? openPayouts().map(payoutCard).join("")
            : `<div class="card">${emptyState(t("nothingToReconcile"), t("nothingToReconcileD"))}</div>`}
        </div>
      </div>

      <div class="seam">
        <div class="seam-line"></div>
        <div class="seam-box">
          <div class="thread ${canMatch ? "on" : ""}"></div>
          <div class="seam-var">
            ${
              canMatch
                ? `<span class="lab">${esc(t("difference"))}</span>
                   <span style="font-size:15px;font-weight:600;color:${difference === 0 ? "var(--sage)" : "var(--coral-deep)"}">${money(dollars(difference))}</span>`
                : canRecord
                  ? `<span class="lab">${esc(t("noCounterpart"))}</span>
                     <span style="font-size:12px;color:var(--text-2);line-height:1.35">${esc(t("recordBody"))}</span>`
                  : `<span class="lab">${esc(t("pickOneEach"))}</span>`
            }
          </div>
          ${
            canRecord
              ? `<button class="btn btn-primary btn-sm btn-block" data-act="reconcile:askRecord">${esc(t("recordIt"))}</button>`
              : `<button class="btn btn-primary btn-sm btn-block" data-act="reconcile:match" ${canMatch ? "" : "disabled"}>${esc(t("matchThem"))}</button>`
          }
          ${suggestions ? `<button class="btn btn-sm btn-block" data-act="reconcile:acceptAll">${esc(t("acceptFound", { n: suggestions }))}</button>` : ""}
          ${canMatch || canRecord ? `<button class="btn btn-ghost btn-sm btn-block" data-act="reconcile:clear">${esc(t("clear"))}</button>` : ""}
          <div class="thread ${canMatch ? "on" : ""}"></div>
        </div>
      </div>

      <div>
        <div class="col-hd">
          <span class="src">${esc(t("bankDeposits"))}</span>
          <span class="n">${openBank().length}</span>
        </div>
        <div class="lane">
          ${openBank().length
            ? openBank().map(bankCard).join("")
            : `<div class="card">${emptyState(t("nothingToReconcile"), t("nothingToReconcileD"))}</div>`}
        </div>
      </div>
    </div>`;
}

function payoutCard(payout) {
  const suggested = suggestionFor(payout);
  return `
    <button class="rowc" data-act="reconcile:pickPayout" data-id="${esc(payout.id)}" aria-pressed="${ui().payoutId === payout.id}">
      ${suggested ? `<span class="tag t-ok sug"><span class="dot"></span>${esc(t("suggestion"))}</span>` : ""}
      <span class="rowc-top">
        <span class="rowc-id">${esc(payout.reference)}</span>
        <span class="rowc-amt">${money(dollars(payout.net_cents))}</span>
      </span>
      <span class="rowc-desc">${esc(t("stripePayout"))} · ${esc(t("giftCount", { n: payout.gift_count }))}</span>
      <span class="rowc-meta">
        <span>${esc(shortDate(payout.paid_at, lang()))} → ${esc(shortDate(payout.arrives_at, lang()))}</span>
        <span class="num" style="color:var(--text-3)">${esc(t("gross"))} ${money(dollars(payout.gross_cents))} − ${esc(t("fees"))} ${money(dollars(payout.fees_cents))}</span>
      </span>
    </button>`;
}

function bankCard(bank) {
  const kindLabel = { stripe: t("kindStripe"), deposit: t("kindDeposit") }[bank.kind] || t("kindOther");
  return `
    <button class="rowc" data-act="reconcile:pickBank" data-id="${esc(bank.id)}" aria-pressed="${ui().bankId === bank.id}">
      <span class="rowc-top">
        <span class="rowc-id">${esc(bank.reference)}</span>
        <span class="rowc-amt">${money(dollars(bank.amount_cents))}</span>
      </span>
      <span class="rowc-desc">${esc(bank.description)}</span>
      <span class="rowc-meta">
        <span>${esc(shortDate(bank.posted_at, lang()))}</span>
        <span class="tag ${bank.kind === "stripe" ? "t-mute" : "t-wait"}">${esc(kindLabel)}</span>
      </span>
    </button>`;
}

/* ------------------------------------------------------------
   The reconciled tab
   ------------------------------------------------------------ */
function reconciledList() {
  const matches = state.data.matches;
  const recorded = state.data.ledgerEntries;

  if (!matches.length && !recorded.length) {
    return `<div class="card">${emptyState(t("nothingReconciledYet"), t("nothingReconciledYetD"))}</div>`;
  }

  const matchRows = matches
    .map((match) => {
      const payout = state.data.payouts.find((p) => p.id === match.payout_id);
      const bank = state.data.bankTransactions.find((b) => b.id === match.bank_transaction_id);
      if (!payout) return "";
      return `
        <div class="matched-row">
          <div>
            <div style="font-size:13px;font-weight:600">${esc(payout.reference)} · ${money(dollars(payout.net_cents))}</div>
            <div class="lead" style="font-size:11.5px">${esc(shortDate(payout.paid_at, lang()))} · ${esc(t("giftCount", { n: payout.gift_count }))} · ${money(dollars(payout.fees_cents))}</div>
          </div>
          <div class="link-mark">${esc(t("matched"))}</div>
          <div class="row">
            <div>
              <div style="font-size:13px;font-weight:600">${esc(bank?.reference || "—")} · ${bank ? money(dollars(bank.amount_cents)) : ""}</div>
              <div class="lead" style="font-size:11.5px">${esc(bank?.description || "")}</div>
            </div>
            <button class="btn btn-sm btn-ghost" data-act="reconcile:undo" data-id="${esc(match.id)}" style="margin-left:auto">${esc(t("undo"))}</button>
          </div>
        </div>`;
    })
    .join("");

  const recordedRows = recorded
    .map((entry) => {
      const bank = state.data.bankTransactions.find((b) => b.id === entry.bank_transaction_id);
      if (!bank) return "";
      const fund = fundById(entry.fund_id);
      return `
        <div class="matched-row">
          <div>
            <div style="font-size:13px;font-weight:600">${esc(bank.description)}</div>
            <div class="lead" style="font-size:11.5px">${esc(bank.reference)} · ${esc(shortDate(bank.posted_at, lang()))}</div>
          </div>
          <div class="link-mark">${esc(t("recorded"))}</div>
          <div class="row">
            <div>
              <div style="font-size:13px;font-weight:600">${money(dollars(bank.amount_cents))} → ${esc(fund ? fund.name[lang()] || fund.name.en : "—")}</div>
              <div class="lead" style="font-size:11.5px">${esc(entry.category || entry.note || t("noCounterpart"))}</div>
            </div>
            <button class="btn btn-sm btn-ghost" data-act="reconcile:unrecord" data-id="${esc(bank.id)}" style="margin-left:auto">${esc(t("undo"))}</button>
          </div>
        </div>`;
    })
    .join("");

  return `<div class="card">${matchRows}${recordedRows}</div>`;
}

/* ------------------------------------------------------------
   Export

   Built and downloaded in the browser. An auditor asking for the
   month's reconciliation should not need anyone to run a query.
   ------------------------------------------------------------ */
function exportCsv() {
  const rows = [["type", "reference", "description", "amount", "date", "status", "counterpart"]];

  for (const payout of state.data.payouts) {
    const match = matchForPayout(payout.id);
    const bank = match && state.data.bankTransactions.find((b) => b.id === match.bank_transaction_id);
    rows.push([
      "stripe_payout", payout.reference, `${payout.gift_count} gifts`,
      (payout.net_cents / 100).toFixed(2), payout.paid_at,
      match ? "matched" : "open", bank?.reference || "",
    ]);
  }

  for (const bank of state.data.bankTransactions) {
    const entry = ledgerForBank(bank.id);
    rows.push([
      "bank_transaction", bank.reference, bank.description,
      (bank.amount_cents / 100).toFixed(2), bank.posted_at,
      entry ? "recorded" : state.data.matches.some((m) => m.bank_transaction_id === bank.id) ? "matched" : "open",
      entry ? fundName(entry.fund_id, "en") : "",
    ]);
  }

  /* Quote every field and double any quote inside it — a fund note
     with a comma in it should not shift the whole row. */
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `somos-reino-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
