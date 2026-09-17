/* ============================================================
   Somos Reino — expenses
   ------------------------------------------------------------
   Reimbursement requests and their decisions. Anyone who can
   see the books can read this; only someone with `approve` gets
   the buttons, so a bookkeeper who reconciles but doesn't
   authorise sees the queue without being able to clear it.
   ============================================================ */
import { esc, money, dollars, cents, shortDate, emptyState, fundDot, tag, toast } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state, fundById, pendingExpenses, setExpenseStatus, createExpense, notify } from "../lib/store.js";

const FILTERS = ["pending", "approved", "reimbursed", "denied", "all"];

const STATUS_TONE = { pending: "wait", approved: "ok", reimbursed: "mute", denied: "hot" };
const STATUS_LABEL = { pending: "statusPending", approved: "statusApproved", reimbursed: "statusReimbursed", denied: "statusDenied" };

const ui = () => {
  state.ui.expenses ??= { filter: "pending" };
  return state.ui.expenses;
};

const visible = () => {
  const { filter } = ui();
  return filter === "all" ? state.data.expenses : state.data.expenses.filter((e) => e.status === filter);
};

export default {
  id: "expenses",
  group: "money",
  cap: "finance",
  icon: "M4 3h10v13l-2.5-1.5L9 16l-2.5-1.5L4 16V3ZM7 7h4M7 10h4",
  label: () => t("navExpenses"),
  crumb: () => t("crumbExpenses"),
  title: () => t("navExpenses"),
  count: () => pendingExpenses().length,

  actions: () => `<button class="btn btn-sm btn-primary" data-act="expenses:new">${esc(t("newExpense"))}</button>`,

  render(ctx) {
    const rows = visible();
    const { filter } = ui();

    return `
      <div class="grid">
        <div class="pills">
          ${FILTERS.map((name) => {
            const count = name === "all" ? state.data.expenses.length : state.data.expenses.filter((e) => e.status === name).length;
            const label = name === "all" ? t("statusAll") : t(STATUS_LABEL[name]);
            return `<button class="pill" data-act="expenses:filter" data-filter="${name}" aria-pressed="${filter === name}">
              ${esc(label)}<span class="c">${count}</span>
            </button>`;
          }).join("")}
        </div>

        <div class="card tbl">
          ${rows.length ? table(rows, ctx) : emptyState(t("noExpenses"), t("noExpensesD"))}
        </div>
      </div>`;
  },

  modal(ctx, modal) {
    if (modal.kind === "expenses:new") return newExpenseModal();
    if (modal.kind === "expenses:deny") return denyModal(modal.id);
    return "";
  },

  handlers: {
    "expenses:filter": ({ filter }) => { ui().filter = filter; notify(); },
    "expenses:new": () => { state.modal = { kind: "expenses:new" }; notify(); },

    "expenses:create": async (_dataset, event) => {
      const form = event.target.closest("form");
      const amount = Number(form.amount.value);
      if (!(amount > 0)) throw new Error(t("needAmount"));
      state.modal = null;
      await createExpense({
        description: form.description.value.trim(),
        team_name: form.team.value.trim(),
        fund_id: form.fund.value,
        amount_cents: cents(amount),
        note: form.note.value.trim(),
      });
      toast(t("expenseFiled"));
    },

    "expenses:approve": async ({ id }) => {
      const expense = state.data.expenses.find((e) => e.id === id);
      await setExpenseStatus(id, "approved");
      toast(t("expenseApproved", { d: expense?.description || "", a: money(dollars(expense?.amount_cents || 0)) }));
    },

    "expenses:reimburse": async ({ id }) => {
      const expense = state.data.expenses.find((e) => e.id === id);
      await setExpenseStatus(id, "reimbursed");
      toast(t("expenseReimbursed", { n: expense?.submitter_name || "", a: money(dollars(expense?.amount_cents || 0)) }));
    },

    "expenses:askDeny": ({ id }) => { state.modal = { kind: "expenses:deny", id }; notify(); },

    "expenses:deny": async (_dataset, event) => {
      const form = event.target.closest("form");
      const id = form.dataset.id;
      state.modal = null;
      await setExpenseStatus(id, "denied", form.reason.value.trim());
      toast(t("expenseDenied"));
    },
  },
};

function table(rows, ctx) {
  const canApprove = ctx.can("approve");

  return `
    <table>
      <thead>
        <tr>
          <th>${esc(t("description"))}</th>
          <th>${esc(t("submittedBy"))}</th>
          <th>${esc(t("fund"))}</th>
          <th>${esc(t("date"))}</th>
          <th class="ta-r">${esc(t("amount"))}</th>
          <th></th>
          ${canApprove ? "<th></th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${rows.map((expense) => row(expense, canApprove)).join("")}
      </tbody>
    </table>`;
}

function row(expense, canApprove) {
  const fund = fundById(expense.fund_id);

  return `
    <tr>
      <td>
        <div style="font-weight:600">${esc(expense.description)}</div>
        ${expense.note ? `<div class="lead" style="font-size:11.5px">${esc(expense.note)}</div>` : ""}
      </td>
      <td>
        <div>${esc(expense.submitter_name)}</div>
        ${expense.team_name ? `<div class="lead" style="font-size:11.5px">${esc(expense.team_name)}</div>` : ""}
      </td>
      <td>
        <span class="row" style="gap:6px">${fundDot(fund?.color)}${esc(fund ? fund.name[lang()] || fund.name.en : "—")}</span>
      </td>
      <td class="num" style="font-size:12px;color:var(--text-2)">${esc(shortDate(expense.created_at, lang()))}</td>
      <td class="ta-r num" style="font-weight:600">${money(dollars(expense.amount_cents))}</td>
      <td>
        <div class="chips">
          ${tag(t(STATUS_LABEL[expense.status] || "statusPending"), STATUS_TONE[expense.status] || "mute")}
          ${expense.has_receipt ? "" : tag(t("noReceipt"), "hot")}
        </div>
      </td>
      ${canApprove ? `<td class="ta-r">${actionsFor(expense)}</td>` : ""}
    </tr>`;
}

function actionsFor(expense) {
  if (expense.status === "pending") {
    return `
      <div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
        <button class="btn btn-sm btn-ghost btn-danger" data-act="expenses:askDeny" data-id="${esc(expense.id)}">${esc(t("deny"))}</button>
        <button class="btn btn-sm btn-primary" data-act="expenses:approve" data-id="${esc(expense.id)}">${esc(t("approve"))}</button>
      </div>`;
  }
  if (expense.status === "approved") {
    return `<button class="btn btn-sm" data-act="expenses:reimburse" data-id="${esc(expense.id)}">${esc(t("markReimbursed"))}</button>`;
  }
  return "";
}

function newExpenseModal() {
  return `
    <div class="scrim" data-scrim>
      <form class="modal" data-act="expenses:create" role="dialog" aria-modal="true">
        <div class="modal-hd"><div class="modal-t">${esc(t("newExpense"))}</div></div>
        <div class="modal-bd">
          <div class="field">
            <label for="expDesc">${esc(t("description"))}</label>
            <input class="input" id="expDesc" name="description" required>
          </div>
          <div class="duo">
            <div class="field">
              <label for="expAmount">${esc(t("amount"))}</label>
              <input class="input" id="expAmount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required>
            </div>
            <div class="field">
              <label for="expFund">${esc(t("fund"))}</label>
              <select class="input" id="expFund" name="fund">
                ${state.data.funds.map((f) => `<option value="${esc(f.id)}">${esc(f.name[lang()] || f.name.en)}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="field">
            <label for="expTeam">${esc(t("team"))}</label>
            <input class="input" id="expTeam" name="team">
          </div>
          <div class="field">
            <label for="expNote">${esc(t("note"))}</label>
            <textarea class="input" id="expNote" name="note" rows="2"></textarea>
          </div>
        </div>
        <div class="modal-ft">
          <button class="btn" type="button" data-act="app:close">${esc(t("cancelBtn"))}</button>
          <button class="btn btn-primary" type="submit">${esc(t("add"))}</button>
        </div>
      </form>
    </div>`;
}

function denyModal(id) {
  const expense = state.data.expenses.find((e) => e.id === id);
  return `
    <div class="scrim" data-scrim>
      <form class="modal" data-act="expenses:deny" data-id="${esc(id)}" role="dialog" aria-modal="true">
        <div class="modal-hd">
          <div class="modal-t">${esc(t("denyTitle"))}</div>
          <div class="modal-d">${esc(expense?.description || "")} · ${money(dollars(expense?.amount_cents || 0))}</div>
        </div>
        <div class="modal-bd">
          <div class="field">
            <label for="denyReason">${esc(t("denyReason"))}</label>
            <textarea class="input" id="denyReason" name="reason" rows="3"
              placeholder="${esc(t("denyReasonPlaceholder"))}"></textarea>
          </div>
        </div>
        <div class="modal-ft">
          <button class="btn" type="button" data-act="app:close">${esc(t("cancelBtn"))}</button>
          <button class="btn btn-primary" type="submit">${esc(t("deny"))}</button>
        </div>
      </form>
    </div>`;
}
