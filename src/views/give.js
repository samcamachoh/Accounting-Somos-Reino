/* ============================================================
   Somos Reino — give
   ------------------------------------------------------------
   Pick a fund, pick an amount, pick how often. In live mode the
   button hands off to Stripe Checkout, so no card details ever
   reach this origin; in demo mode it shows the thank-you screen
   the real flow returns to.
   ============================================================ */
import { esc, money, money0, feeFor, cents, dollars } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state, isDemo, fundById, notify } from "../lib/store.js";
import { startCheckout } from "../lib/api.js";

const PRESETS = [25, 50, 100, 250, 500];

/* Per-visit form state. It belongs to this screen and nothing
   else reads it, so it does not go in the store. */
const form = {
  fundId: null,
  amount: 100,
  custom: false,
  frequency: "once",
  coverFee: false,
  /* Set to the completed gift once Stripe (or demo mode) is done,
     which swaps the form for the thank-you screen. */
  done: null,
};

const activeFund = () => fundById(form.fundId) || state.data.funds[0] || null;
const fee = () => feeFor(form.amount);
const total = () => form.amount + (form.coverFee ? fee() : 0);

export default {
  id: "give",
  group: "me",
  cap: "give",
  icon: "M9 3.5v11M3.5 9h11",
  label: () => t("navGive"),
  crumb: () => t("crumbGive"),
  title: () => t("navGive"),

  render(ctx) {
    return form.done ? successScreen(ctx) : giveForm(ctx);
  },

  handlers: {
    "give:fund": ({ fund }) => { form.fundId = fund; notify(); },
    "give:amount": ({ amount }) => {
      form.amount = Number(amount);
      form.custom = false;
      notify();
    },
    "give:custom": () => { form.custom = true; notify(); },
    "give:customInput": ({ value }) => { form.amount = Math.max(0, Number(value) || 0); repaintTotals(); },
    "give:freq": ({ freq }) => { form.frequency = freq; notify(); },
    "give:coverFee": () => { form.coverFee = !form.coverFee; notify(); },

    "give:submit": async () => {
      const fund = activeFund();
      if (!fund) throw new Error(t("chooseFund"));
      if (!(form.amount > 0)) throw new Error(t("needAmount"));

      if (!isDemo()) {
        /* Redirects the browser; nothing after this runs. */
        return startCheckout({
          fundId: fund.id,
          amountCents: cents(total()),
          frequency: form.frequency,
          coverFee: form.coverFee,
        });
      }

      /* Demo mode records the gift so History and the rhythm grid
         reflect what you just did. */
      state.data.donations.unshift({
        id: `g_${Date.now()}`,
        profile_id: state.profile?.id ?? null,
        giver_name: state.profile?.full_name || "—",
        fund_id: fund.id,
        amount_cents: cents(form.amount),
        fee_cents: cents(fee()),
        fee_covered: form.coverFee,
        method: "Card",
        recurring: form.frequency !== "once",
        occurred_at: new Date().toISOString().slice(0, 10),
      });
      if (form.frequency !== "once") {
        state.data.recurring.push({
          id: `r_${Date.now()}`,
          profile_id: state.profile?.id ?? null,
          fund_id: fund.id,
          amount_cents: cents(form.amount),
          frequency: form.frequency,
          next_charge_at: nextChargeDate(form.frequency),
          payment_method_id: state.data.paymentMethods[0]?.id ?? null,
          status: "active",
        });
      }
      form.done = { fundId: fund.id, amount: form.amount, frequency: form.frequency };
      notify();
    },

    "give:again": () => {
      form.done = null;
      form.amount = 100;
      form.custom = false;
      form.frequency = "once";
      form.coverFee = false;
      notify();
    },
  },
};

/* Typing in the custom amount re-renders the totals only — a full
   repaint would take the focus out of the field mid-keystroke. */
function repaintTotals() {
  const node = document.getElementById("giveTotals");
  if (node) node.innerHTML = totalsMarkup();
}

function nextChargeDate(frequency) {
  const date = new Date();
  date.setDate(date.getDate() + (frequency === "weekly" ? 7 : 30));
  return date.toISOString().slice(0, 10);
}

function giveForm() {
  const funds = state.data.funds;
  const fund = activeFund();
  if (fund && !form.fundId) form.fundId = fund.id;

  return `
    <div class="side-lg">
      <div class="stack">
        <section>
          <h2 style="margin-bottom:10px">${esc(t("chooseFund"))}</h2>
          <div class="fundlist">
            ${funds.map((f) => fundCard(f, f.id === form.fundId)).join("")}
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-hd"><span class="card-title">${esc(t("chooseAmount"))}</span></div>
          <div class="card-bd" style="display:grid;gap:14px">
            <div class="seg">
              ${PRESETS.map(
                (amount) => `<button class="pill" data-act="give:amount" data-amount="${amount}"
                  aria-pressed="${!form.custom && form.amount === amount}">${money0(amount)}</button>`,
              ).join("")}
              <button class="pill" data-act="give:custom" aria-pressed="${form.custom}">${esc(t("custom"))}</button>
            </div>

            ${
              form.custom
                ? `<div class="field">
                     <label for="giveCustom">${esc(t("chooseAmount"))}</label>
                     <input class="input" id="giveCustom" type="number" min="1" step="1" inputmode="decimal"
                            value="${form.amount || ""}" data-act-input="give:customInput" autofocus>
                   </div>`
                : `<div class="amt-display">${money0(form.amount)}</div>`
            }

            <div class="field">
              <label>${esc(t("frequency"))}</label>
              <div class="seg">
                ${[
                  ["once", "freqOnce"],
                  ["weekly", "freqWeekly"],
                  ["monthly", "freqMonthly"],
                ]
                  .map(
                    ([value, key]) => `<button class="pill" data-act="give:freq" data-freq="${value}"
                      aria-pressed="${form.frequency === value}">${esc(t(key))}</button>`,
                  )
                  .join("")}
              </div>
            </div>

            <div id="giveTotals">${totalsMarkup()}</div>

            <button class="btn btn-primary btn-lg btn-block" data-act="give:submit">${esc(submitLabel())}</button>
            <p class="lead" style="font-size:12px;text-align:center">${esc(t("secured"))}</p>
          </div>
        </section>
      </div>
    </div>`;
}

function submitLabel() {
  const amount = money0(total());
  if (form.frequency === "monthly") return t("giveMonthly", { a: amount });
  if (form.frequency === "weekly") return t("giveWeekly", { a: amount });
  return t("giveOnce", { a: amount });
}

function totalsMarkup() {
  return `
    <div class="feerow">
      <div>
        <span class="feerow-t">${esc(t("coverFeeT"))}</span>
        <span class="feerow-d">${esc(t("coverFeeD", { f: money(fee()) }))}</span>
      </div>
      <button class="sw-toggle" data-act="give:coverFee" aria-pressed="${form.coverFee}"
              aria-label="${esc(t("coverFeeT"))}" style="margin-left:auto"></button>
    </div>
    <div class="totalline">
      <span class="eyebrow">${esc(t("totalToday"))}</span>
      <span class="num" style="font-size:19px;font-weight:600">${money(total())}</span>
    </div>`;
}

function fundCard(fund, selected) {
  const campaign =
    fund.goal_cents && fund.raised_cents
      ? `<div class="campaign">
           <div class="campaign-bar">
             <div class="campaign-fill" style="width:${Math.min(100, (fund.raised_cents / fund.goal_cents) * 100).toFixed(1)}%;background:${esc(fund.color)}"></div>
           </div>
           <div class="campaign-label">${esc(t("goalLabel", { r: money0(dollars(fund.raised_cents)), g: money0(dollars(fund.goal_cents)) }))}</div>
         </div>`
      : "";

  return `
    <button class="fundcard" data-act="give:fund" data-fund="${esc(fund.id)}" aria-pressed="${selected}">
      <span class="fund-radio" aria-hidden="true"></span>
      <span style="min-width:0">
        <span class="fund-name">${esc(fund.name[lang()] || fund.name.en)}</span>
        <span class="fund-blurb">${esc(fund.blurb[lang()] || fund.blurb.en)}</span>
        ${campaign}
      </span>
    </button>`;
}

function successScreen() {
  const { fundId, amount, frequency } = form.done;
  const fund = fundById(fundId);
  const name = fund ? fund.name[lang()] || fund.name.en : "—";
  const first = (state.profile?.full_name || "—").split(" ")[0];

  const body =
    frequency === "once"
      ? t("successBodyOnce", { a: money(amount), f: name })
      : t("successBodyRec", { a: money(amount), f: name });

  return `
    <div class="card success" style="max-width:480px;margin:0 auto">
      <div class="mark" aria-hidden="true">✓</div>
      <h2 style="font-size:24px">${esc(t("successTitleOnce", { n: first }))}</h2>
      <p class="lead" style="margin-top:8px">${esc(body)}</p>
      <div class="row" style="justify-content:center;margin-top:20px">
        <button class="btn" data-act="app:go" data-view="history">${esc(t("viewHistory"))}</button>
        <button class="btn btn-primary" data-act="give:again">${esc(t("giveAgain"))}</button>
      </div>
    </div>`;
}
