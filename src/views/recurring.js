/* ============================================================
   Somos Reino — recurring gifts
   ------------------------------------------------------------
   Pause, change the amount, or stop. In live mode each of these
   opens the Stripe billing portal, because the subscription
   lives in Stripe and editing our copy of it would put the two
   out of step. Demo mode edits the sample row so the buttons do
   something on a fresh clone.
   ============================================================ */
import { esc, money, dollars, cents, longDate, emptyState, fundDot } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state, myRecurring, fundById, setRecurringStatus, setRecurringAmount, cancelRecurring, notify } from "../lib/store.js";

export default {
  id: "recurring",
  group: "me",
  cap: "give",
  icon: "M3 6.5A5.5 5.5 0 0 1 13.7 5M15 5V2M15 5h-3M15 11.5A5.5 5.5 0 0 1 4.3 13M3 13v3M3 13h3",
  label: () => t("navRecurring"),
  crumb: () => t("crumbRecurring"),
  title: () => t("recurringTitle"),
  count: () => myRecurring().filter((r) => r.status === "active").length,

  render() {
    const gifts = myRecurring();
    if (!gifts.length) {
      return `
        <div class="card" style="max-width:520px">
          ${emptyState(t("recurringEmpty"))}
          <div style="padding:0 20px 24px;text-align:center">
            <button class="btn btn-primary" data-act="app:go" data-view="give">${esc(t("startRecurring"))}</button>
          </div>
        </div>`;
    }

    return `<div class="stack" style="max-width:520px">${gifts.map(giftCard).join("")}</div>`;
  },

  modal(ctx, modal) {
    if (modal.kind === "recurring:cancel") return cancelModal(modal.id);
    if (modal.kind === "recurring:edit") return editModal(modal.id);
    return "";
  },

  handlers: {
    "recurring:pause": ({ id }) => setRecurringStatus(id, "paused"),
    "recurring:resume": ({ id }) => setRecurringStatus(id, "active"),

    "recurring:askEdit": ({ id }) => { state.modal = { kind: "recurring:edit", id }; notify(); },
    "recurring:askCancel": ({ id }) => { state.modal = { kind: "recurring:cancel", id }; notify(); },

    "recurring:saveAmount": async (_dataset, event) => {
      const form = event.target.closest("form");
      const amount = Number(form.amount.value);
      if (!(amount > 0)) throw new Error(t("needAmount"));
      state.modal = null;
      await setRecurringAmount(form.dataset.id, cents(amount));
    },

    "recurring:confirmCancel": async ({ id }) => {
      state.modal = null;
      await cancelRecurring(id);
    },
  },
};

function giftCard(gift) {
  const fund = fundById(gift.fund_id);
  const name = fund ? fund.name[lang()] || fund.name.en : "—";
  const paused = gift.status === "paused";
  const cadence = gift.frequency === "weekly" ? t("freqWeekly") : t("freqMonthly");

  return `
    <div class="reccard">
      <div class="reccard-top">
        ${fundDot(fund?.color, 11)}
        <span class="reccard-fund">${esc(name)}</span>
        ${paused ? `<span class="tag t-wait">${esc(t("pausedTag"))}</span>` : ""}
        <span class="reccard-amt">${money(dollars(gift.amount_cents))}</span>
      </div>
      <div class="lead" style="font-size:12.5px;margin-top:6px">
        ${esc(cadence)} · ${esc(t("nextCharge"))}: ${esc(longDate(gift.next_charge_at, lang()))}
      </div>
      <div class="reccard-actions">
        <button class="btn btn-sm" data-act="recurring:${paused ? "resume" : "pause"}" data-id="${esc(gift.id)}">
          ${esc(paused ? t("resume") : t("pause"))}
        </button>
        <button class="btn btn-sm" data-act="recurring:askEdit" data-id="${esc(gift.id)}">${esc(t("editAmt"))}</button>
        <button class="btn btn-sm btn-ghost btn-danger" data-act="recurring:askCancel" data-id="${esc(gift.id)}">${esc(t("cancelBtn"))}</button>
      </div>
    </div>`;
}

function editModal(id) {
  const gift = myRecurring().find((r) => r.id === id);
  if (!gift) return "";

  return `
    <div class="scrim" data-scrim>
      <form class="modal" data-act="recurring:saveAmount" data-id="${esc(id)}" role="dialog" aria-modal="true">
        <div class="modal-hd"><div class="modal-t">${esc(t("editTitle"))}</div></div>
        <div class="modal-bd">
          <div class="field">
            <label for="recAmount">${esc(t("newAmount"))}</label>
            <input class="input" id="recAmount" name="amount" type="number" min="1" step="1"
                   inputmode="decimal" value="${dollars(gift.amount_cents)}">
          </div>
        </div>
        <div class="modal-ft">
          <button class="btn" type="button" data-act="app:close">${esc(t("cancelBtn"))}</button>
          <button class="btn btn-primary" type="submit">${esc(t("save"))}</button>
        </div>
      </form>
    </div>`;
}

function cancelModal(id) {
  return `
    <div class="scrim" data-scrim>
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-hd">
          <div class="modal-t">${esc(t("cancelTitle"))}</div>
          <div class="modal-d">${esc(t("cancelBody"))}</div>
        </div>
        <div class="modal-ft">
          <button class="btn" data-act="app:close">${esc(t("keepIt"))}</button>
          <button class="btn btn-primary" data-act="recurring:confirmCancel" data-id="${esc(id)}">${esc(t("yesCancelIt"))}</button>
        </div>
      </div>
    </div>`;
}
