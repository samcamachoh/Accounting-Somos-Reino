/* ============================================================
   Somos Reino — your account
   ------------------------------------------------------------
   Profile, payment methods, and what we email you about. The
   one view everyone with an account can open, which makes it
   the landing place for anyone who isn't on the finance side.
   ============================================================ */
import { esc, $, emptyState, toast } from "../lib/ui.js";
import { t } from "../lib/i18n.js";
import { updateMyProfile, isDemo } from "../lib/store.js";
import { openBillingPortal } from "../lib/api.js";

/* Notification preferences have no column yet, so they toggle in
   memory. Kept honest: the switches work, nothing is promised. */
const NOTIFICATIONS = [
  { id: "receipts", title: "notifReceipts", detail: "notifReceiptsD", on: true },
  { id: "statements", title: "notifStatements", detail: "notifStatementsD", on: true },
  { id: "schedule", title: "notifSchedule", detail: "notifScheduleD", on: false },
];

let preferences = Object.fromEntries(NOTIFICATIONS.map((n) => [n.id, n.on]));

export default {
  id: "account",
  group: "me",
  cap: "give",
  icon: "M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 15.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5",
  label: ({ t }) => t("navAccount"),
  crumb: ({ t }) => t("crumbAccount"),
  title: ({ t, profile }) => t("greeting", { n: (profile?.full_name || "—").split(" ")[0] }),

  render(ctx) {
    const { t, profile, data } = ctx;
    const cards = data.paymentMethods;

    return `
      <div class="stack" style="max-width:640px">
        <section class="card">
          <div class="card-hd"><span class="card-title">${esc(t("profile"))}</span></div>
          <div class="card-bd">
            <form data-act="account:save" style="display:grid;gap:12px">
              <div class="field">
                <label for="acctName">${esc(t("fullName"))}</label>
                <input class="input" id="acctName" name="full_name" value="${esc(profile?.full_name || "")}" autocomplete="name">
              </div>
              <div class="duo">
                <div class="field">
                  <label for="acctEmail">${esc(t("email"))}</label>
                  <input class="input" id="acctEmail" name="email" type="email" value="${esc(profile?.email || "")}" autocomplete="email">
                </div>
                <div class="field">
                  <label for="acctPhone">${esc(t("phone"))}</label>
                  <input class="input" id="acctPhone" name="phone" type="tel" value="${esc(profile?.phone || "")}" autocomplete="tel">
                </div>
              </div>
              <button class="btn btn-dark" type="submit" style="justify-self:start">${esc(t("saveChanges"))}</button>
            </form>
          </div>
        </section>

        <section class="card">
          <div class="card-hd">
            <span class="card-title">${esc(t("paymentMethods"))}</span>
            <button class="btn btn-sm" data-act="account:billing" style="margin-left:auto">${esc(t("manageInStripe"))}</button>
          </div>
          <div class="card-bd">
            ${
              cards.length
                ? cards.map((card) => paymentRow(card, t)).join("")
                : emptyState(t("noCards"))
            }
            <div class="row" style="padding-top:12px;color:var(--text-2);font-size:12.5px">
              <span>🔒</span><span>${esc(t("stripeNote"))}</span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-hd"><span class="card-title">${esc(t("notifications"))}</span></div>
          <div class="card-bd">
            ${NOTIFICATIONS.map(
              (n) => `
              <div class="notif">
                <div>
                  <div class="notif-t">${esc(t(n.title))}</div>
                  <div class="notif-d">${esc(t(n.detail))}</div>
                </div>
                <button class="sw-toggle" data-act="account:notify" data-pref="${n.id}"
                        aria-pressed="${preferences[n.id]}" aria-label="${esc(t(n.title))}"></button>
              </div>`,
            ).join("")}
          </div>
        </section>
      </div>`;
  },

  handlers: {
    "account:save": async (_dataset, event) => {
      const form = event.target.closest("form");
      await updateMyProfile({
        full_name: form.full_name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
      });
      toast(t("profileSaved"));
    },

    "account:billing": async () => {
      if (isDemo()) throw new Error("Stripe isn't connected in demo mode.");
      await openBillingPortal();
    },

    "account:notify": ({ pref }) => {
      preferences[pref] = !preferences[pref];
      const button = $(`[data-pref="${pref}"]`);
      if (button) button.setAttribute("aria-pressed", String(preferences[pref]));
    },
  },
};

function paymentRow(card, t) {
  const expiry = card.exp_month ? `${String(card.exp_month).padStart(2, "0")}/${card.exp_year}` : "";
  return `
    <div class="paycard">
      <span class="cardchip">${esc(card.brand)}</span>
      <div class="paycard-id">
        <div style="font-weight:600">•••• ${esc(card.last4)}</div>
        ${expiry ? `<div class="num" style="font-size:11.5px;color:var(--text-2)">${esc(expiry)}</div>` : ""}
      </div>
      ${card.is_default ? `<span class="tag t-ok">${esc(t("defaultTag"))}</span>` : ""}
      <div class="paycard-actions">
        <button class="btn btn-sm btn-ghost" data-act="account:billing">${esc(t("edit"))}</button>
      </div>
    </div>`;
}
