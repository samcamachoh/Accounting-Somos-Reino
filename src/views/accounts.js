/* ============================================================
   Somos Reino — account management
   ------------------------------------------------------------
   Adding people, changing roles, setting passwords, deactivating
   and deleting. Admins only.

   Creating a user and setting a password need the service role,
   which cannot live in a browser, so those calls go through the
   admin-users Edge Function. It re-reads the caller's role from
   the database on every request — the admin-only gate here just
   decides what to draw.

   Three guard rails, enforced on the server and mirrored here so
   the buttons don't lie: an admin cannot deactivate their own
   account, cannot remove their own admin role, and deleting
   someone who appears in the books is refused until confirmed a
   second time. Deactivating keeps the audit trail whole.
   ============================================================ */
import { esc, avatar, ago, emptyState, tag, toast } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state, isDemo, notify, reload } from "../lib/store.js";
import { listUsers, createUser, updateUser, setUserPassword, sendPasswordReset, setUserActive, deleteUser } from "../lib/admin.js";

const ROLES = ["admin", "finance", "staff", "member"];
const roleKey = (role) => `role${String(role || "member")[0].toUpperCase()}${String(role || "member").slice(1)}`;

const ui = () => {
  state.ui.accounts ??= { query: "", role: "all", status: "active", users: null, loading: false, error: null };
  return state.ui.accounts;
};

/* In live mode the roster comes from the Edge Function, which
   knows about auth users the profiles table alone does not — who
   has never signed in, who has a pending invite. Demo mode reads
   the same people everything else does. */
function roster() {
  const view = ui();
  if (isDemo()) return state.data.people;
  return view.users ?? [];
}

function visible() {
  const { query, role, status } = ui();
  const needle = query.trim().toLowerCase();

  return roster().filter((person) => {
    const active = person.is_active !== false;
    if (status === "active" && !active) return false;
    if (status === "inactive" && active) return false;
    if (role !== "all" && person.role !== role) return false;
    if (!needle) return true;
    return `${person.full_name || ""} ${person.email || ""}`.toLowerCase().includes(needle);
  });
}

export default {
  id: "accounts",
  group: "church",
  cap: "admin",
  icon: "M2.5 6.5h4M10.5 6.5h5M2.5 11.5h9M13.5 11.5h2M8.5 4.5v4M11.5 9.5v4",
  label: () => t("navAccounts"),
  crumb: () => t("crumbAccounts"),
  title: () => t("navAccounts"),

  actions: () => `<button class="btn btn-sm btn-primary" data-act="accounts:new">${esc(t("addPerson"))}</button>`,

  /* Live mode fetches the roster the first time this view opens. */
  mount() {
    const view = ui();
    if (isDemo() || view.users || view.loading) return;

    view.loading = true;
    listUsers()
      .then(({ users }) => { view.users = users; view.error = null; })
      .catch((error) => { view.error = error.message; })
      .finally(() => { view.loading = false; notify(); });
  },

  render() {
    const view = ui();
    const rows = visible();

    return `
      <div class="grid">
        ${view.error ? `<div class="banner banner-err">${esc(view.error)}</div>` : ""}

        <div class="row">
          <input class="input" style="flex:1 1 220px" type="search" value="${esc(view.query)}"
                 placeholder="${esc(t("searchPeople"))}" aria-label="${esc(t("searchPeople"))}"
                 data-act-input="accounts:search">
          <select class="input" style="width:auto" data-act-input="accounts:role" aria-label="${esc(t("role"))}">
            <option value="all"${view.role === "all" ? " selected" : ""}>${esc(t("allRoles"))}</option>
            ${ROLES.map((r) => `<option value="${r}"${view.role === r ? " selected" : ""}>${esc(t(roleKey(r)))}</option>`).join("")}
          </select>
          <select class="input" style="width:auto" data-act-input="accounts:status" aria-label="${esc(t("active"))}">
            <option value="active"${view.status === "active" ? " selected" : ""}>${esc(t("active"))}</option>
            <option value="inactive"${view.status === "inactive" ? " selected" : ""}>${esc(t("inactive"))}</option>
            <option value="all"${view.status === "all" ? " selected" : ""}>${esc(t("statusAll"))}</option>
          </select>
        </div>

        <div class="card tbl">
          ${
            view.loading
              ? emptyState(t("loading"))
              : rows.length
                ? `<table>
                    <thead>
                      <tr>
                        <th>${esc(t("fullName"))}</th>
                        <th>${esc(t("role"))}</th>
                        <th>${esc(t("seen"))}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>${rows.map(row).join("")}</tbody>
                  </table>`
                : emptyState(t("noPeople"), t("noPeopleD"))
          }
        </div>
      </div>`;
  },

  modal(ctx, modal) {
    if (modal.kind === "accounts:edit") return personModal(modal.id);
    if (modal.kind === "accounts:password") return passwordModal(modal.id);
    if (modal.kind === "accounts:delete") return deleteModal(modal.id, modal.force);
    return "";
  },

  handlers: {
    "accounts:search": ({ value }) => { ui().query = value; repaintTable(); },
    "accounts:role": ({ value }) => { ui().role = value; notify(); },
    "accounts:status": ({ value }) => { ui().status = value; notify(); },

    "accounts:new": () => { state.modal = { kind: "accounts:edit", id: null }; notify(); },
    "accounts:edit": ({ id }) => { state.modal = { kind: "accounts:edit", id }; notify(); },
    "accounts:askPassword": ({ id }) => { state.modal = { kind: "accounts:password", id }; notify(); },
    "accounts:askDelete": ({ id }) => { state.modal = { kind: "accounts:delete", id }; notify(); },

    "accounts:save": async (_dataset, event) => {
      const form = event.target.closest("form");
      const id = form.dataset.id || null;
      const changes = {
        fullName: form.fullName.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        role: form.role.value,
        teamName: form.team.value.trim(),
      };

      if (isDemo()) {
        applyLocally(id, changes);
      } else if (id) {
        await updateUser(id, changes);
      } else {
        /* A blank password means invite them and let them choose
           their own — the usual case. */
        const password = form.password?.value || "";
        await createUser({ ...changes, password: password || undefined });
      }

      state.modal = null;
      toast(t(id ? "personSaved" : "personAdded"));
      await refresh();
    },

    "accounts:setPassword": async (_dataset, event) => {
      const form = event.target.closest("form");
      const id = form.dataset.id;
      const password = form.password.value;
      if (!password || password.length < 8) throw new Error(t("passwordTooShort"));

      state.modal = null;
      if (isDemo()) return toast(t("passwordSaved"));
      await setUserPassword(id, password);
      toast(t("passwordSaved"));
      notify();
    },

    "accounts:sendReset": async ({ id }) => {
      const person = roster().find((p) => p.id === id);
      if (!person?.email) throw new Error(t("emailRequired"));
      state.modal = null;
      if (!isDemo()) await sendPasswordReset(person.email);
      toast(t("resetEmailed", { e: person.email }));
      notify();
    },

    "accounts:toggleActive": async ({ id }) => {
      const person = roster().find((p) => p.id === id);
      if (!person) return;
      /* Mirrored from the Edge Function so the button doesn't lie. */
      if (person.id === state.profile?.id) throw new Error(t("cannotSelfDeactivate"));

      const next = person.is_active === false;
      if (isDemo()) person.is_active = next;
      else await setUserActive(id, next);

      toast(t(next ? "personReactivated" : "personDeactivated", { n: person.full_name }));
      await refresh();
    },

    "accounts:delete": async ({ id, force }) => {
      const person = roster().find((p) => p.id === id);
      if (person?.id === state.profile?.id) throw new Error(t("cannotSelfDeactivate"));

      if (isDemo()) {
        state.data.people = state.data.people.filter((p) => p.id !== id);
        state.modal = null;
        toast(t("personDeleted"));
        return notify();
      }

      try {
        await deleteUser(id, { force: force === "true" });
      } catch (error) {
        /* The function refuses a first delete for anyone who appears
           in the books. Ask again rather than swallowing the reason. */
        if (!force) {
          state.modal = { kind: "accounts:delete", id, force: true, reason: error.message };
          return notify();
        }
        throw error;
      }

      state.modal = null;
      toast(t("personDeleted"));
      await refresh();
    },
  },
};

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */

function repaintTable() {
  const card = document.querySelector(".view .card.tbl");
  if (!card) return notify();
  const rows = visible();
  card.innerHTML = rows.length
    ? `<table>
        <thead><tr><th>${esc(t("fullName"))}</th><th>${esc(t("role"))}</th><th>${esc(t("seen"))}</th><th></th></tr></thead>
        <tbody>${rows.map(row).join("")}</tbody>
      </table>`
    : emptyState(t("noPeople"), t("noPeopleD"));
}

/** Re-read the roster after a write that changed it. */
async function refresh() {
  if (isDemo()) return notify();
  const view = ui();
  try {
    const { users } = await listUsers();
    view.users = users;
  } catch (error) {
    view.error = error.message;
  }
  /* Roles and permissions feed the rail, including your own. */
  await reload();
  notify();
}

/** Demo mode writes straight into the sample roster. */
function applyLocally(id, changes) {
  const patch = {
    full_name: changes.fullName,
    email: changes.email,
    phone: changes.phone,
    role: changes.role,
    teams: changes.teamName ? [changes.teamName] : [],
  };

  if (id) {
    const person = state.data.people.find((p) => p.id === id);
    if (person) Object.assign(person, patch);
  } else {
    state.data.people.unshift({
      id: `p_${Date.now()}`,
      is_active: true,
      background_check: "missing",
      permissions: {},
      created_at: new Date().toISOString(),
      last_seen_at: null,
      ...patch,
    });
  }
}

function row(person) {
  const active = person.is_active !== false;
  const name = person.full_name || person.email || "—";
  const isMe = person.id === state.profile?.id;
  const seen = person.last_seen_at || person.last_sign_in_at;

  return `
    <tr${active ? "" : ' style="opacity:.55"'}>
      <td>
        <div class="row" style="flex-wrap:nowrap">
          ${avatar(name)}
          <div style="min-width:0">
            <div style="font-weight:600">${esc(name)}${isMe ? ` ${tag(t("you"), "mute")}` : ""}</div>
            <div class="lead" style="font-size:11.5px">${esc(person.email || "")}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="chips">
          ${tag(t(roleKey(person.role)), person.role === "admin" ? "hot" : "mute")}
          ${active ? "" : tag(t("inactive"), "mute")}
        </div>
      </td>
      <td class="num" style="font-size:12px;color:var(--text-2)">${esc(seen ? ago(seen, lang()) : t("never"))}</td>
      <td class="ta-r">
        <div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
          <button class="btn btn-sm btn-ghost" data-act="accounts:edit" data-id="${esc(person.id)}">${esc(t("edit"))}</button>
          <button class="btn btn-sm btn-ghost" data-act="accounts:askPassword" data-id="${esc(person.id)}">${esc(t("password"))}</button>
          <button class="btn btn-sm btn-ghost" data-act="accounts:toggleActive" data-id="${esc(person.id)}"${isMe ? " disabled" : ""}>
            ${esc(active ? t("deactivate") : t("reactivate"))}
          </button>
          <button class="btn btn-sm btn-ghost btn-danger" data-act="accounts:askDelete" data-id="${esc(person.id)}"${isMe ? " disabled" : ""}>
            ${esc(t("remove"))}
          </button>
        </div>
      </td>
    </tr>`;
}

function personModal(id) {
  const person = id ? roster().find((p) => p.id === id) : null;
  const isMe = person?.id === state.profile?.id;

  return `
    <div class="scrim" data-scrim>
      <form class="modal" data-act="accounts:save"${id ? ` data-id="${esc(id)}"` : ""} role="dialog" aria-modal="true">
        <div class="modal-hd"><div class="modal-t">${esc(person ? t("editPerson") : t("addPerson"))}</div></div>
        <div class="modal-bd">
          <div class="field">
            <label for="acName">${esc(t("fullName"))}</label>
            <input class="input" id="acName" name="fullName" value="${esc(person?.full_name || "")}" required>
          </div>
          <div class="field">
            <label for="acEmail">${esc(t("email"))}</label>
            <input class="input" id="acEmail" name="email" type="email" value="${esc(person?.email || "")}" required>
          </div>
          <div class="duo">
            <div class="field">
              <label for="acRole">${esc(t("role"))}</label>
              <select class="input" id="acRole" name="role"${isMe ? " disabled" : ""}>
                ${ROLES.map((r) => `<option value="${r}"${(person?.role || "member") === r ? " selected" : ""}>${esc(t(roleKey(r)))}</option>`).join("")}
              </select>
              ${isMe ? `<input type="hidden" name="role" value="${esc(person.role)}">` : ""}
            </div>
            <div class="field">
              <label for="acPhone">${esc(t("phone"))}</label>
              <input class="input" id="acPhone" name="phone" type="tel" value="${esc(person?.phone || "")}">
            </div>
          </div>
          <div class="field">
            <label for="acTeam">${esc(t("team"))}</label>
            <input class="input" id="acTeam" name="team" value="${esc((person?.teams || [])[0] || person?.team_name || "")}">
          </div>
          ${
            person
              ? ""
              : `<div class="field">
                   <label for="acPassword">${esc(t("password"))}</label>
                   <input class="input" id="acPassword" name="password" type="password" autocomplete="new-password" minlength="8">
                   <span class="lead" style="font-size:11.5px">${esc(t("inviteNote"))}</span>
                 </div>`
          }
        </div>
        <div class="modal-ft">
          <button class="btn" type="button" data-act="app:close">${esc(t("cancelBtn"))}</button>
          <button class="btn btn-primary" type="submit">${esc(person ? t("save") : t("add"))}</button>
        </div>
      </form>
    </div>`;
}

function passwordModal(id) {
  const person = roster().find((p) => p.id === id);

  return `
    <div class="scrim" data-scrim>
      <form class="modal" data-act="accounts:setPassword" data-id="${esc(id)}" role="dialog" aria-modal="true">
        <div class="modal-hd">
          <div class="modal-t">${esc(t("setPassword"))}</div>
          <div class="modal-d">${esc(person?.full_name || "")} · ${esc(person?.email || "")}</div>
        </div>
        <div class="modal-bd">
          <div class="field">
            <label for="acNewPassword">${esc(t("newPassword"))}</label>
            <input class="input" id="acNewPassword" name="password" type="password" autocomplete="new-password" minlength="8">
          </div>
          <button class="btn btn-block" type="button" data-act="accounts:sendReset" data-id="${esc(id)}">${esc(t("sendReset"))}</button>
        </div>
        <div class="modal-ft">
          <button class="btn" type="button" data-act="app:close">${esc(t("cancelBtn"))}</button>
          <button class="btn btn-primary" type="submit">${esc(t("save"))}</button>
        </div>
      </form>
    </div>`;
}

function deleteModal(id, force) {
  const person = roster().find((p) => p.id === id);

  return `
    <div class="scrim" data-scrim>
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-hd">
          <div class="modal-t">${esc(t("deleteTitle", { n: person?.full_name || "" }))}</div>
          <div class="modal-d">${esc(t("deleteBody"))}</div>
        </div>
        ${
          force
            ? `<div class="modal-bd"><div class="banner banner-err">${esc(state.modal?.reason || t("deleteInBooks"))}</div></div>`
            : ""
        }
        <div class="modal-ft">
          <button class="btn" data-act="app:close">${esc(t("cancelBtn"))}</button>
          <button class="btn" data-act="accounts:toggleActive" data-id="${esc(id)}">${esc(t("deactivate"))}</button>
          <button class="btn btn-primary" data-act="accounts:delete" data-id="${esc(id)}"${force ? ' data-force="true"' : ""}>
            ${esc(t("deleteConfirm"))}
          </button>
        </div>
      </div>
    </div>`;
}
