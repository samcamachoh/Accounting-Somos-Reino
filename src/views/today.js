/* ============================================================
   Somos Reino — today
   ------------------------------------------------------------
   Where a treasurer starts. Four numbers, then the list of what
   is actually waiting on them, ordered by what it costs to keep
   waiting — an unreconciled deposit ages worse than an unread
   activity line, and the page should say so.
   ============================================================ */
import { esc, money, money0, dollars, ago, avatar, barChart, fundRibbon, emptyState } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state, openPayouts, openBank, pendingExpenses } from "../lib/store.js";

const unreconciledCents = () =>
  openPayouts().reduce((sum, p) => sum + p.net_cents, 0) + openBank().reduce((sum, b) => sum + b.amount_cents, 0);

const pendingCents = () => pendingExpenses().reduce((sum, e) => sum + e.amount_cents, 0);

/** Gifts recorded in the current calendar month. */
function givingThisMonth() {
  const prefix = new Date().toISOString().slice(0, 7);
  const gifts = state.data.donations.filter((g) => String(g.occurred_at).startsWith(prefix));
  /* A fresh clone's sample data is anchored to a fixed July, so a
     month with nothing in it falls back to the most recent month
     that has gifts rather than reporting a flat zero. */
  if (gifts.length) return gifts;
  const latest = state.data.donations[0];
  if (!latest) return [];
  return state.data.donations.filter((g) => String(g.occurred_at).slice(0, 7) === String(latest.occurred_at).slice(0, 7));
}

export default {
  id: "today",
  group: "money",
  cap: "finance",
  icon: "M3 10.5 9 4l6 6.5M4.5 9v6.5h9V9",
  label: () => t("navToday"),
  crumb: () => t("crumbToday"),
  title: ({ profile }) => t("todayTitle", { n: (profile?.full_name || "—").split(" ")[0] }),

  render(ctx) {
    const { data, can } = ctx;
    const openLines = openPayouts().length + openBank().length;
    const monthGifts = givingThisMonth();
    const funds = data.funds.map((f) => ({ name: f.name[lang()] || f.name.en, color: f.color, balance: dollars(f.balance_cents) }));

    return `
      <div class="grid">
        ${fundRibbon(funds, t("fundsAcross", { n: funds.length }))}

        <div class="tiles">
          <button class="tile tile-hot" data-act="app:go" data-view="reconcile">
            <div class="eyebrow">${esc(t("unreconciled"))}</div>
            <div class="tile-v">${money(dollars(unreconciledCents()))}</div>
            <div class="tile-note">${openLines} ${esc(t("openLines"))}</div>
          </button>
          <button class="tile" data-act="app:go" data-view="expenses">
            <div class="eyebrow">${esc(t("pendingExpenses"))}</div>
            <div class="tile-v">${money(dollars(pendingCents()))}</div>
            <div class="tile-note">${esc(t("expenseCount", { n: pendingExpenses().length }))}</div>
          </button>
          <button class="tile" data-act="app:go" data-view="giving">
            <div class="eyebrow">${esc(t("givingMTD"))}</div>
            <div class="tile-v">${money(dollars(monthGifts.reduce((sum, g) => sum + g.amount_cents, 0)))}</div>
            <div class="tile-note">${esc(t("giftCount", { n: monthGifts.length }))} · ${esc(t("recurringCount", { n: monthGifts.filter((g) => g.recurring).length }))}</div>
          </button>
          ${
            can("people")
              ? `<button class="tile" data-act="app:go" data-view="people">
                   <div class="eyebrow">${esc(t("navPeople"))}</div>
                   <div class="tile-v">${data.people.filter((p) => p.is_active).length}</div>
                   <div class="tile-note">${esc(t("withFinanceAccess", { n: data.people.filter((p) => p.permissions?.finance).length }))}</div>
                 </button>`
              : `<div class="tile">
                   <div class="eyebrow">${esc(t("fundBalance"))}</div>
                   <div class="tile-v">${money0(funds.reduce((sum, f) => sum + f.balance, 0))}</div>
                   <div class="tile-note">${esc(t("fundsAcross", { n: funds.length }))}</div>
                 </div>`
          }
        </div>

        <div class="split">
          <div class="card">
            <div class="card-hd">
              <span class="card-title">${esc(t("needsAttention"))}</span>
            </div>
            ${attentionList(ctx)}
          </div>

          <div class="stack">
            <div class="card">
              <div class="card-hd">
                <span class="card-title">${esc(t("weeklyGiving"))}</span>
                <span class="eyebrow" style="margin-left:auto">${data.weekly.length}</span>
              </div>
              <div class="card-bd" style="padding:14px 16px 10px">
                ${data.weekly.length ? barChart(data.weekly) : emptyState(t("noGifts"))}
                ${
                  data.weekly.length >= 4
                    ? `<div class="row" style="gap:18px;margin-top:10px">
                         <div>
                           <div class="eyebrow">4-week avg</div>
                           <div class="num" style="font-size:15px;font-weight:600">${money0(
                             data.weekly.slice(-4).reduce((sum, d) => sum + d.v, 0) / 4,
                           )}</div>
                         </div>
                       </div>`
                    : ""
                }
              </div>
            </div>

            ${
              data.activity.length
                ? `<div class="card">
                     <div class="card-hd"><span class="card-title">${esc(t("activity"))}</span></div>
                     <div class="card-bd" style="padding:4px 16px">
                       ${data.activity
                         .map(
                           (item) => `
                         <div class="feed-item">
                           ${avatar(item.actor)}
                           <span class="feed-t"><b>${esc(item.actor)}</b> ${esc(item.text)}</span>
                           <span class="feed-time">${esc(ago(item.at, lang()))}</span>
                         </div>`,
                         )
                         .join("")}
                     </div>
                   </div>`
                : ""
            }
          </div>
        </div>
      </div>`;
  },
};

/**
 * What is waiting, worst first. Each row is a real count off the
 * store — nothing here is advisory copy that can go stale while
 * the number behind it changes.
 */
function attentionList(ctx) {
  const { can } = ctx;
  const items = [];
  const openLines = openPayouts().length + openBank().length;

  if (openLines) {
    items.push({
      color: "var(--coral)",
      title: t("attnReconcile", { n: openLines }),
      detail: t("attnReconcileD", { a: money(dollars(unreconciledCents())) }),
      view: "reconcile",
    });
  }

  const pending = pendingExpenses();
  if (pending.length) {
    items.push({
      color: "var(--amber)",
      title: t("attnExpenses", { n: pending.length }),
      detail: t("attnExpensesD", { a: money(dollars(pendingCents())) }),
      view: "expenses",
    });
  }

  if (can("people")) {
    const unchecked = state.data.people.filter((p) => p.is_active && p.background_check !== "cleared");
    if (unchecked.length) {
      items.push({
        color: "var(--amber)",
        title: t("attnBackground", { n: unchecked.length }),
        detail: unchecked.map((p) => p.full_name).join(", "),
        view: "people",
      });
    }
  }

  if (!items.length) return emptyState(t("allClear"), t("allClearD"));

  return items
    .map(
      (item) => `
      <button class="att" data-act="app:go" data-view="${esc(item.view)}">
        <span class="att-bar" style="background:${item.color}"></span>
        <span style="min-width:0">
          <span class="att-t">${esc(item.title)}</span>
          <span class="att-d">${esc(item.detail)}</span>
        </span>
        <span class="att-go">→</span>
      </button>`,
    )
    .join("");
}
