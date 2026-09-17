/* ============================================================
   Somos Reino — funds and connected accounts
   ------------------------------------------------------------
   Where the money sits and what is plumbed into it. Read-only
   on purpose: a fund's balance is the sum of what has been
   reconciled into it, so it is changed by reconciling, never by
   typing a new number here.
   ============================================================ */
import { esc, money, money0, dollars, fundRibbon, emptyState } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state } from "../lib/store.js";

/* What the church has plumbed in. These are descriptions of the
   integration, not credentials — the keys live in Supabase. */
const CONNECTIONS = [
  { id: "stripe", name: "Stripe", logo: "S", bg: "#635BFF", color: "#fff", detail: "connStripe" },
  { id: "bank", name: "Truist", logo: "T", bg: "#2E1A47", color: "#fff", detail: "connBank" },
  { id: "supabase", name: "Supabase", logo: "◈", bg: "#3ECF8E", color: "#0B2B1E", detail: "connSupabase" },
];

export default {
  id: "funds",
  group: "church",
  cap: "accounts",
  icon: "M2.5 6.5 9 3l6.5 3.5M3.5 7.5v6M7 7.5v6M11 7.5v6M14.5 7.5v6M2.5 15h13",
  label: () => t("navFunds"),
  crumb: () => t("crumbFunds"),
  title: () => t("navFunds"),

  render() {
    const funds = state.data.funds;
    if (!funds.length) return emptyState(t("noFunds"));

    const ribbonData = funds.map((f) => ({ name: f.name[lang()] || f.name.en, color: f.color, balance: dollars(f.balance_cents) }));

    return `
      <div class="grid">
        ${fundRibbon(ribbonData, t("fundsAcross", { n: funds.length }))}

        <div class="split">
          <div class="card tbl">
            <div class="card-hd"><span class="card-title">${esc(t("fundSetup"))}</span></div>
            <table>
              <thead>
                <tr>
                  <th>${esc(t("fund"))}</th>
                  <th>${esc(t("description"))}</th>
                  <th class="ta-r">${esc(t("balance"))}</th>
                </tr>
              </thead>
              <tbody>
                ${funds
                  .map(
                    (fund) => `
                  <tr>
                    <td>
                      <span class="row" style="gap:8px">
                        <span class="fund-dot" style="background:${esc(fund.color)}"></span>
                        <strong>${esc(fund.name[lang()] || fund.name.en)}</strong>
                      </span>
                    </td>
                    <td class="lead" style="font-size:12.5px">
                      ${esc(fund.blurb[lang()] || fund.blurb.en || "")}
                      ${
                        fund.goal_cents
                          ? `<div class="campaign" style="max-width:220px">
                               <div class="campaign-bar">
                                 <div class="campaign-fill" style="width:${Math.min(100, ((fund.raised_cents || 0) / fund.goal_cents) * 100).toFixed(1)}%;background:${esc(fund.color)}"></div>
                               </div>
                               <div class="campaign-label">${esc(t("goalLabel", { r: money0(dollars(fund.raised_cents || 0)), g: money0(dollars(fund.goal_cents)) }))}</div>
                             </div>`
                          : ""
                      }
                    </td>
                    <td class="ta-r num" style="font-weight:600">${money(dollars(fund.balance_cents))}</td>
                  </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <div class="stack">
            <div class="eyebrow">${esc(t("connectedAccounts"))}</div>
            ${CONNECTIONS.map(
              (connection) => `
              <div class="conn">
                <div class="conn-logo" style="background:${connection.bg};color:${connection.color}">${esc(connection.logo)}</div>
                <div style="min-width:0">
                  <span class="conn-name">${esc(connection.name)}</span>
                  <span class="conn-d">${esc(t(connection.detail))}</span>
                </div>
                <span class="tag t-ok" style="margin-left:auto">${esc(t("connected"))}</span>
              </div>`,
            ).join("")}
          </div>
        </div>
      </div>`;
  },
};
