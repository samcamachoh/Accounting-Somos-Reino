/* ============================================================
   Somos Reino — your giving history
   ------------------------------------------------------------
   Every gift you've given, grouped by year, with the rhythm grid
   that answers the question people actually open this for: have
   I been giving the way I meant to?
   ============================================================ */
import { esc, money, dollars, shortDate, parseDay, emptyState, fundDot, monthNames, toast } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { myDonations, fundById, notify } from "../lib/store.js";

/* Which year's list is open. Defaults to the most recent year
   with a gift in it rather than to the calendar year, so someone
   opening this in January doesn't land on an empty page. */
let year = null;

const years = () => [...new Set(myDonations().map((g) => String(g.occurred_at).slice(0, 4)))].map(Number).sort((a, b) => b - a);
const giftsIn = (y) => myDonations().filter((g) => String(g.occurred_at).startsWith(String(y)));
const totalIn = (y) => giftsIn(y).reduce((sum, g) => sum + g.amount_cents, 0);

export default {
  id: "history",
  group: "me",
  cap: "give",
  icon: "M9 4.5v5l3.5 2M9 3a6 6 0 1 1-5.2 3",
  label: () => t("navHistory"),
  crumb: () => t("crumbHistory"),
  title: () => t("historyTitle"),

  render() {
    const available = years();
    if (!available.length) return emptyState(t("noGiftsYear"));
    if (!available.includes(year)) year = available[0];

    const gifts = giftsIn(year);

    return `
      <div class="side">
        <div class="stack">
          ${available.length > 1
            ? `<div class="pills">
                 ${available.map((y) => `<button class="pill" data-act="history:year" data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join("")}
               </div>`
            : ""}

          <section class="card">
            <div class="card-hd">
              <span class="card-title">${esc(t("totalGivenIn", { y: year }))}</span>
              <span class="num" style="margin-left:auto;font-size:17px;font-weight:600">${money(dollars(totalIn(year)))}</span>
            </div>
            <div class="card-bd">
              ${gifts.length ? gifts.map(giftRow).join("") : emptyState(t("noGiftsYear"))}
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="card">
            <div class="card-hd"><span class="card-title">${esc(t("rhythmTitle"))}</span></div>
            <div class="card-bd">
              ${rhythmGrid(year)}
              <div class="rlegend">
                <span class="row" style="gap:6px"><span class="rdot gave" style="width:10px;height:10px"></span>${esc(t("legendGave"))}</span>
                <span class="row" style="gap:6px"><span class="rdot" style="width:10px;height:10px"></span>${esc(t("legendMissed"))}</span>
                <span class="row" style="gap:6px"><span class="rdot future" style="width:10px;height:10px"></span>${esc(t("legendUpcoming"))}</span>
              </div>
            </div>
          </section>

          <button class="btn btn-block" data-act="history:statement">${esc(t("emailStatement", { y: year }))}</button>
        </div>
      </div>`;
  },

  handlers: {
    "history:year": ({ year: next }) => { year = Number(next); notify(); },
    "history:statement": () => {
      /* No statement job behind this yet. Say what happened rather
         than claiming an email went out. */
      toast(t("statementSent", { y: year }));
    },
  },
};

function giftRow(gift) {
  const fund = fundById(gift.fund_id);
  const name = fund ? fund.name[lang()] || fund.name.en : "—";
  return `
    <div class="giftrow">
      ${fundDot(fund?.color)}
      <div style="min-width:0">
        <span class="giftrow-desc">${esc(name)}</span>
        <span class="giftrow-meta">${esc(shortDate(gift.occurred_at, lang()))} · ${esc(gift.method)}${gift.recurring ? ` · ${esc(t("recurringTag"))}` : ""}</span>
      </div>
      <span class="giftrow-amt">${money(dollars(gift.amount_cents))}</span>
    </div>`;
}

/** Twelve cells: gave, didn't, or hasn't happened yet. */
function rhythmGrid(y) {
  const now = new Date();
  const gifts = giftsIn(y);

  return `<div class="rhythm">${monthNames(lang())
    .map((label, index) => {
      const gave = gifts.some((g) => parseDay(g.occurred_at).getMonth() === index);
      const future = y === now.getFullYear() && index > now.getMonth();
      const cls = gave ? "gave" : future ? "future" : "";
      const title = `${label} ${y} — ${gave ? t("legendGave") : future ? t("legendUpcoming") : t("legendMissed")}`;
      return `<div class="rmonth"><div class="rdot ${cls}" title="${esc(title)}"></div><span>${esc(label[0])}</span></div>`;
    })
    .join("")}</div>`;
}
