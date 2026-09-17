/* ============================================================
   Somos Reino — giving across the church
   ------------------------------------------------------------
   Every gift, with what Stripe took out of it. The fee column
   is the point: gross and net are different numbers and the
   books need both, so neither is hidden behind a hover.
   ============================================================ */
import { esc, money, dollars, shortDate, emptyState, fundDot, tag } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state, fundById, notify } from "../lib/store.js";

const ui = () => {
  state.ui.giving ??= { fund: "all", method: "all" };
  return state.ui.giving;
};

const visible = () => {
  const { fund, method } = ui();
  return state.data.donations.filter(
    (gift) => (fund === "all" || gift.fund_id === fund) && (method === "all" || gift.method === method),
  );
};

export default {
  id: "giving",
  group: "money",
  cap: "finance",
  icon: "M9 15s-5.5-3.4-5.5-7A2.9 2.9 0 0 1 9 6.4 2.9 2.9 0 0 1 14.5 8c0 3.6-5.5 7-5.5 7Z",
  label: () => t("navGiving"),
  crumb: () => t("crumbGiving"),
  title: () => t("navGiving"),

  render() {
    const gifts = visible();
    const { fund, method } = ui();
    const methods = [...new Set(state.data.donations.map((g) => g.method))];

    const gross = gifts.reduce((sum, g) => sum + g.amount_cents, 0);
    const fees = gifts.reduce((sum, g) => sum + g.fee_cents, 0);

    return `
      <div class="grid">
        <div class="row">
          <div class="pills">
            <button class="pill" data-act="giving:fund" data-fund="all" aria-pressed="${fund === "all"}">${esc(t("allFunds"))}</button>
            ${state.data.funds
              .map(
                (f) => `<button class="pill" data-act="giving:fund" data-fund="${esc(f.id)}" aria-pressed="${fund === f.id}">
                  ${esc(f.name[lang()] || f.name.en)}
                </button>`,
              )
              .join("")}
          </div>
          <div class="pills" style="margin-left:auto">
            <button class="pill" data-act="giving:method" data-method="all" aria-pressed="${method === "all"}">${esc(t("allMethods"))}</button>
            ${methods
              .map(
                (m) => `<button class="pill" data-act="giving:method" data-method="${esc(m)}" aria-pressed="${method === m}">${esc(m)}</button>`,
              )
              .join("")}
          </div>
        </div>

        <div class="tiles" style="grid-template-columns:repeat(3,1fr)">
          <div class="tile">
            <div class="eyebrow">${esc(t("gross"))}</div>
            <div class="tile-v">${money(dollars(gross))}</div>
            <div class="tile-note">${esc(t("giftCount", { n: gifts.length }))}</div>
          </div>
          <div class="tile">
            <div class="eyebrow">${esc(t("fees"))}</div>
            <div class="tile-v">${money(dollars(fees))}</div>
            <div class="tile-note">${gifts.filter((g) => g.fee_covered).length} ${esc(t("feesCovered").toLowerCase())}</div>
          </div>
          <div class="tile">
            <div class="eyebrow">${esc(t("net"))}</div>
            <div class="tile-v">${money(dollars(gross - fees))}</div>
            <div class="tile-note">${esc(t("recurringCount", { n: gifts.filter((g) => g.recurring).length }))}</div>
          </div>
        </div>

        <div class="card tbl">
          ${
            gifts.length
              ? `<table>
                  <thead>
                    <tr>
                      <th>${esc(t("giver"))}</th>
                      <th>${esc(t("fund"))}</th>
                      <th>${esc(t("method"))}</th>
                      <th>${esc(t("date"))}</th>
                      <th class="ta-r">${esc(t("amount"))}</th>
                      <th class="ta-r">${esc(t("fees"))}</th>
                    </tr>
                  </thead>
                  <tbody>${gifts.map(row).join("")}</tbody>
                </table>`
              : emptyState(t("noGifts"), t("noGiftsD"))
          }
        </div>
      </div>`;
  },

  handlers: {
    "giving:fund": ({ fund }) => { ui().fund = fund; notify(); },
    "giving:method": ({ method }) => { ui().method = method; notify(); },
  },
};

function row(gift) {
  const fund = fundById(gift.fund_id);
  return `
    <tr>
      <td>
        <div style="font-weight:600">${esc(gift.giver_name)}</div>
        ${gift.recurring ? `<div class="chips" style="margin-top:3px">${tag(t("recurringTag"), "mute")}</div>` : ""}
      </td>
      <td><span class="row" style="gap:6px">${fundDot(fund?.color)}${esc(fund ? fund.name[lang()] || fund.name.en : "—")}</span></td>
      <td>${esc(gift.method)}</td>
      <td class="num" style="font-size:12px;color:var(--text-2)">${esc(shortDate(gift.occurred_at, lang()))}</td>
      <td class="ta-r num" style="font-weight:600">${money(dollars(gift.amount_cents))}</td>
      <td class="ta-r num" style="color:var(--text-2)">
        ${money(dollars(gift.fee_cents))}
        ${gift.fee_covered ? `<div class="lead" style="font-size:10px">${esc(t("feesCovered"))}</div>` : ""}
      </td>
    </tr>`;
}
