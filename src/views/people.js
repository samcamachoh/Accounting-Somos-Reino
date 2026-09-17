/* ============================================================
   Somos Reino — people
   ------------------------------------------------------------
   The roster on the left, one person's permissions on the right.
   The switches here are the same flags access.js reads, so what
   you grant someone is exactly what appears in their rail the
   next time they load the portal — including your own, which is
   why you cannot switch your own finance access off.
   ============================================================ */
import { esc, avatar, ago, emptyState, tag, toast } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state, updatePermissions, notify } from "../lib/store.js";

/* The five flags, in the order they escalate. */
export const PERMISSIONS = [
  { key: "finance", title: "permFinance", detail: "permFinanceD" },
  { key: "approve", title: "permApprove", detail: "permApproveD" },
  { key: "refund", title: "permRefund", detail: "permRefundD" },
  { key: "people", title: "permPeople", detail: "permPeopleD" },
  { key: "payouts", title: "permPayouts", detail: "permPayoutsD" },
];

const BACKGROUND_TONE = { cleared: "ok", expiring: "wait", missing: "hot" };
const BACKGROUND_LABEL = { cleared: "bgCleared", expiring: "bgExpiring", missing: "bgMissing" };

const ui = () => {
  state.ui.people ??= { query: "", role: "all", status: "active", selectedId: null };
  return state.ui.people;
};

function visible() {
  const { query, role, status } = ui();
  const needle = query.trim().toLowerCase();

  return state.data.people.filter((person) => {
    if (status === "active" && !person.is_active) return false;
    if (status === "inactive" && person.is_active) return false;
    if (role !== "all" && person.role !== role) return false;
    if (!needle) return true;
    return `${person.full_name} ${person.email}`.toLowerCase().includes(needle);
  });
}

export default {
  id: "people",
  group: "church",
  cap: "people",
  icon: "M7 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 15c0-2.5 2-4.2 4.5-4.2s4.5 1.7 4.5 4.2M12.5 4.2a2.3 2.3 0 0 1 0 4.4M15.5 15c0-1.9-.9-3.2-2.5-3.8",
  label: () => t("navPeople"),
  crumb: () => t("crumbPeople"),
  title: () => t("navPeople"),

  render(ctx) {
    const rows = visible();
    const selection = ui();
    /* Land on somebody rather than on an empty panel. */
    if (!rows.some((p) => p.id === selection.selectedId)) selection.selectedId = rows[0]?.id ?? null;
    const selected = state.data.people.find((p) => p.id === selection.selectedId) || null;

    return `
      <div class="roster">
        <div class="stack">
          <div class="row">
            <input class="input" style="flex:1 1 200px" type="search" value="${esc(selection.query)}"
                   placeholder="${esc(t("searchPeople"))}" aria-label="${esc(t("searchPeople"))}"
                   data-act-input="people:search">
            <select class="input" style="width:auto" data-act-input="people:role" aria-label="${esc(t("role"))}">
              <option value="all"${selection.role === "all" ? " selected" : ""}>${esc(t("allRoles"))}</option>
              ${["admin", "finance", "staff", "member"]
                .map((r) => `<option value="${r}"${selection.role === r ? " selected" : ""}>${esc(t(`role${r[0].toUpperCase()}${r.slice(1)}`))}</option>`)
                .join("")}
            </select>
            <select class="input" style="width:auto" data-act-input="people:status" aria-label="${esc(t("active"))}">
              <option value="active"${selection.status === "active" ? " selected" : ""}>${esc(t("active"))}</option>
              <option value="inactive"${selection.status === "inactive" ? " selected" : ""}>${esc(t("inactive"))}</option>
              <option value="all"${selection.status === "all" ? " selected" : ""}>${esc(t("statusAll"))}</option>
            </select>
          </div>

          <div class="card">
            ${rows.length ? rows.map((person) => personRow(person, person.id === selection.selectedId)).join("") : emptyState(t("noPeople"), t("noPeopleD"))}
          </div>
        </div>

        ${selected ? detailPanel(selected, ctx) : `<div class="card">${emptyState(t("selectPerson"), t("selectPersonD"))}</div>`}
      </div>`;
  },

  handlers: {
    "people:search": ({ value }) => {
      ui().query = value;
      /* Re-render on every keystroke would steal focus from the
         search box, so repaint only the list. */
      repaintList();
    },
    "people:role": ({ value }) => { ui().role = value; notify(); },
    "people:status": ({ value }) => { ui().status = value; notify(); },
    "people:select": ({ id }) => { ui().selectedId = id; notify(); },

    "people:permission": async ({ id, permission }) => {
      const person = state.data.people.find((p) => p.id === id);
      if (!person) return;

      const next = { ...person.permissions, [permission]: !person.permissions?.[permission] };
      await updatePermissions(id, next);

      const definition = PERMISSIONS.find((p) => p.key === permission);
      toast(
        t(next[permission] ? "permGranted" : "permRevoked", {
          n: person.full_name.split(" ")[0],
          p: t(definition.title).toLowerCase(),
        }),
      );
    },
  },
};

function repaintList() {
  const rows = visible();
  const { selectedId } = ui();
  const card = document.querySelector(".roster .card");
  if (card) card.innerHTML = rows.length ? rows.map((p) => personRow(p, p.id === selectedId)).join("") : emptyState(t("noPeople"), t("noPeopleD"));
}

function personRow(person, selected) {
  return `
    <button class="prow" data-act="people:select" data-id="${esc(person.id)}" aria-pressed="${selected}">
      ${avatar(person.full_name)}
      <span style="min-width:0">
        <span class="prow-name">${esc(person.full_name)}</span>
        <span class="prow-sub">${esc(person.teams.join(" · ") || person.email)}</span>
      </span>
      <span class="chips" style="margin-left:auto">
        ${person.is_active ? "" : tag(t("inactive"), "mute")}
        ${tag(t(`role${person.role[0].toUpperCase()}${person.role.slice(1)}`), person.role === "admin" ? "hot" : "mute")}
      </span>
    </button>`;
}

function detailPanel(person, ctx) {
  const isMe = person.id === state.profile?.id;
  const background = person.background_check || "missing";

  return `
    <div class="stack">
      <div class="card">
        <div class="card-bd">
          <div class="row">
            ${avatar(person.full_name, 44)}
            <div>
              <div style="font-size:16px;font-weight:700">${esc(person.full_name)}</div>
              <div class="lead" style="font-size:12.5px">${esc(person.email)}</div>
            </div>
          </div>
          <div style="margin-top:14px">
            <div class="kv"><span class="k">${esc(t("role"))}</span><span class="v">${esc(t(`role${person.role[0].toUpperCase()}${person.role.slice(1)}`))}</span></div>
            <div class="kv"><span class="k">${esc(t("phone"))}</span><span class="v">${esc(person.phone || "—")}</span></div>
            <div class="kv"><span class="k">${esc(t("team"))}</span><span class="v">${esc(person.teams.join(", ") || "—")}</span></div>
            <div class="kv">
              <span class="k">${esc(t("backgroundCheck"))}</span>
              <span>${tag(t(BACKGROUND_LABEL[background]), BACKGROUND_TONE[background])}</span>
            </div>
            ${person.created_at ? `<div class="kv"><span class="k">${esc(t("memberSince", { y: String(person.created_at).slice(0, 4) }))}</span><span class="v">${person.last_seen_at ? esc(t("lastSeen", { t: ago(person.last_seen_at, lang()) })) : "—"}</span></div>` : ""}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><span class="card-title">${esc(t("permissions"))}</span></div>
        <div class="card-bd">
          ${PERMISSIONS.map((definition) => {
            const on = Boolean(person.permissions?.[definition.key]);
            /* An admin who switches off their own access to the books
               locks themselves out of the view they are standing in. */
            const locked = isMe && definition.key === "finance";
            return `
              <div class="perm">
                <div>
                  <span class="perm-t">${esc(t(definition.title))}</span>
                  <span class="perm-d">${esc(t(definition.detail))}</span>
                </div>
                <button class="sw-toggle" data-act="people:permission"
                        data-id="${esc(person.id)}" data-permission="${definition.key}"
                        aria-pressed="${on}" aria-label="${esc(t(definition.title))}"
                        ${locked ? "disabled" : ""}></button>
              </div>`;
          }).join("")}
        </div>
      </div>

      ${
        ctx.can("admin")
          ? `<button class="btn btn-block" data-act="app:go" data-view="accounts">${esc(t("crumbAccounts").split("/").pop().trim())}</button>`
          : ""
      }
    </div>`;
}
