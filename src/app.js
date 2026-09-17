/* ============================================================
   Somos Reino — boot and router
   ------------------------------------------------------------
   One page. This file decides three things and then gets out of
   the way:

     which state the visitor is in   (auth.js)
     what they may open              (access.js)
     which of those they are looking at (the hash)

   Rendering is a full repaint of four regions — rail, top bar,
   view, modal — from the current state. Views return HTML
   strings and declare their event handlers by name, so there is
   exactly one listener on the document and no listener to leak
   when a view is replaced.
   ============================================================ */
import "./styles/app.css";
import { isConfigured } from "./lib/supabase.js";
import { resolveSession, onAuthChange, isRecoveryLink, signOut } from "./lib/auth.js";
import { state, load, onStoreChange } from "./lib/store.js";
import { roleLabel } from "./lib/access.js";
import { initLang, lang, setLang, t, LANGUAGES } from "./lib/i18n.js";
import { $, esc, avatar, icon, toast } from "./lib/ui.js";
import { GROUPS, groupLabel, viewById, viewsFor, defaultView } from "./views/index.js";
import signin from "./views/signin.js";

/* Signed out, or signed in with nothing to show. Demo mode is
   neither: it has no session by design and renders the full
   portal. Both the render pass and the event dispatcher ask this
   one question, so they can never disagree about which screen is
   up. */
const isGated = () => state.authMode === "signed-out" || state.authMode === "disabled";

/* ------------------------------------------------------------
   Context

   The one object every view render receives. Bundling it means a
   view signature never changes when the app grows another thing
   worth passing down.
   ------------------------------------------------------------ */
const context = () => ({
  state,
  data: state.data,
  caps: state.caps,
  profile: state.profile,
  lang: lang(),
  t,
  can: (capability) => state.caps.has(capability),
  /* Views call these instead of importing the router. */
  go,
  rerender,
  openModal,
  closeModal,
  toast,
});

/* ------------------------------------------------------------
   Routing

   The hash is the address: #/reconcile. Anything else — a stale
   bookmark, a view this person may not open — falls back to their
   default rather than showing an empty screen.
   ------------------------------------------------------------ */
const routeFromHash = () => (window.location.hash.replace(/^#\/?/, "").split("?")[0] || "").trim();

export function go(id, { replace = false } = {}) {
  const target = `#/${id}`;
  if (window.location.hash === target) return rerender();
  if (replace) window.history.replaceState(null, "", target);
  else window.location.hash = target;
  /* replaceState does not fire hashchange, so drive the repaint. */
  if (replace) applyRoute();
}

function applyRoute() {
  const requested = routeFromHash();
  const allowed = viewsFor(state.caps);
  const view = allowed.find((v) => v.id === requested);

  if (!view) {
    const fallback = defaultView(state.caps);
    /* A route that exists but is not theirs is worth saying out
       loud — silently landing somewhere else reads as a bug. */
    if (requested && viewById(requested)) toast(t("noAccessBody"), { tone: "warn" });
    if (requested !== fallback) return go(fallback, { replace: true });
  }

  const next = view ? view.id : defaultView(state.caps);
  if (state.view !== next) {
    state.view = next;
    /* Each view keeps its own scratch state — filters, selections,
       which person is open — and starts clean when you arrive. */
    state.ui = {};
    window.scrollTo({ top: 0 });
  }
  render();
}

/* ------------------------------------------------------------
   Modals

   Held in state rather than in the DOM, so a re-render never
   loses whichever dialog is open.
   ------------------------------------------------------------ */
export function openModal(modal) {
  state.modal = modal;
  render();
  /* Focus the first thing worth typing into. */
  requestAnimationFrame(() => $("#modalRoot .input, #modalRoot button")?.focus());
}

export function closeModal() {
  state.modal = null;
  render();
}

/* ------------------------------------------------------------
   Render
   ------------------------------------------------------------ */

/** Repaint from current state. Safe to call as often as you like. */
export function rerender() {
  render();
}

function render() {
  if (isGated()) return renderGate();

  const view = viewById(state.view);
  if (!view) return;
  const ctx = context();

  document.title = `${view.title(ctx)} · Somos Reino`;
  renderRail(ctx, view);

  $("#crumb").textContent = view.crumb ? view.crumb(ctx) : "";
  $("#title").textContent = view.title(ctx);
  $("#topActions").innerHTML = view.actions ? view.actions(ctx) : "";
  $("#view").innerHTML = view.render(ctx);
  $("#modalRoot").innerHTML = state.modal ? renderModal(ctx, view) : "";

  renderBadge();
  view.mount?.(ctx);
  document.body.classList.add("booted");
}

function renderModal(ctx, view) {
  /* A modal belongs to the view that opened it; the sign-in view is
     the one screen that can raise one without a rail behind it. */
  const owner = view?.modal ? view : signin;
  return owner.modal?.(ctx, state.modal) || "";
}

function renderRail(ctx, current) {
  const allowed = viewsFor(state.caps);

  $("#brandSub").textContent = t("appName") === "Somos Reino" ? railSubtitle(allowed) : "";

  $("#nav").innerHTML = GROUPS.map((group) => {
    const items = allowed.filter((v) => v.group === group);
    if (!items.length) return "";
    /* A group heading for a single-item group is noise, and on a
       phone the headings are hidden anyway. */
    const heading = items.length > 1 ? `<div class="nav-eyebrow">${esc(t(groupLabel[group]))}</div>` : "";
    return heading + items.map((v) => navItem(v, v.id === current.id, ctx)).join("");
  }).join("");

  const name = state.profile?.full_name || "—";
  $("#railFoot").innerHTML = `
    <button class="me" data-act="app:account" title="${esc(t("navAccount"))}">
      ${avatar(name)}
      <span>
        <span class="me-name">${esc(name)}</span>
        <span class="me-role">${esc(roleLabel(state.profile, state.caps))}</span>
      </span>
    </button>
    <div class="row">
      <div class="langsw" role="group" aria-label="Language">
        ${LANGUAGES.map((l) => `<button data-act="app:lang" data-lang="${l}" aria-pressed="${l === lang()}">${l.toUpperCase()}</button>`).join("")}
      </div>
      ${isConfigured ? `<button class="btn btn-sm btn-ghost" data-act="app:signout" style="color:#8B8394;margin-left:auto">${esc(t("signOut"))}</button>` : ""}
    </div>`;
}

/** "Finance & People", "Giving" — what this person's portal actually is. */
function railSubtitle(allowed) {
  const groups = new Set(allowed.map((v) => v.group));
  if (groups.has("money") && groups.has("church")) return "Finance & People";
  if (groups.has("money")) return "Finance";
  if (groups.has("services")) return "Give & Serve";
  return "Giving";
}

function navItem(view, isCurrent, ctx) {
  const count = view.count?.(ctx) || 0;
  return `
    <button class="nav-item" data-act="app:go" data-view="${esc(view.id)}"${isCurrent ? ' aria-current="page"' : ""}>
      ${icon(view.icon)}
      <span>${esc(view.label(ctx))}</span>
      ${count ? `<span class="nav-count">${count}</span>` : ""}
    </button>`;
}

/* The badge answers one question: am I looking at real data.
   "Demo" is not a failure — it is the state the portal ships in
   before a Supabase project exists. */
function renderBadge() {
  const label = state.mode === "error" ? `${t("modeError")}: ${state.error}` : t(state.mode === "ready" ? "modeReady" : "modeDemo");
  let badge = $("#mode-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "mode-badge";
    badge.setAttribute("role", "status");
    document.body.appendChild(badge);
  }
  badge.className = `mode-${state.mode}`;
  badge.title = state.error || "";
  badge.innerHTML = `<span class="sr-dot"></span><span class="sr-text">${esc(label)}</span>`;
}

/* ------------------------------------------------------------
   Gates

   Signed out, or signed in with no way in. Both replace the whole
   shell: there is no rail to show someone who has no views.
   ------------------------------------------------------------ */
function renderGate() {
  const ctx = context();
  document.title = "Somos Reino";

  if (state.authMode === "signed-out") {
    document.body.innerHTML = signin.shell(ctx, state.modal);
    document.body.classList.add("booted");
    signin.mount?.(ctx);
    return;
  }

  document.body.innerHTML = `
    <div class="signin">
      <div class="signin-card">
        <div class="eyebrow">${esc(t("appName"))}</div>
        <h1>${esc(t("noAccessTitle"))}</h1>
        <p class="lead">${esc(t("disabledBody"))}</p>
        <button class="btn btn-ghost btn-danger" data-act="app:signout" style="margin-top:18px;padding-left:0">${esc(t("signOut"))}</button>
      </div>
    </div>`;
  document.body.classList.add("booted");
}

/* ------------------------------------------------------------
   Events

   One delegated listener. A view names its handlers, the click
   carries the name in data-act, and this dispatches — so a view
   that is replaced takes its handlers with it and there is
   nothing left behind to unbind.
   ------------------------------------------------------------ */
const APP_HANDLERS = {
  "app:go": ({ view }) => go(view),
  "app:account": () => go("account"),
  "app:lang": ({ lang: next }) => { setLang(next); render(); },
  "app:signout": async () => {
    await signOut();
    window.location.reload();
  },
  "app:close": () => closeModal(),
};

function handlersFor() {
  const view = isGated() ? signin : viewById(state.view);
  return { ...APP_HANDLERS, ...(view?.handlers || {}) };
}

async function dispatch(name, dataset, event) {
  const handler = handlersFor()[name];
  if (!handler) return;
  try {
    await handler(dataset, event);
  } catch (error) {
    /* Every write path throws an Error carrying a sentence meant
       for a person; this is where that sentence is spent. */
    toast(error.message, { tone: "warn" });
  }
}

document.addEventListener("click", (event) => {
  /* Clicking the dim area behind a dialog closes it; clicking
     inside it must not. */
  const scrim = event.target.closest("[data-scrim]");
  if (scrim && event.target === scrim) return closeModal();

  const target = event.target.closest("[data-act]");
  if (!target) return;
  event.preventDefault();
  dispatch(target.dataset.act, { ...target.dataset }, event);
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-act]");
  if (!form) return;
  event.preventDefault();
  dispatch(form.dataset.act, { ...form.dataset }, event);
});

/* Filters and search boxes re-render as you type. */
document.addEventListener("input", (event) => {
  const target = event.target.closest("[data-act-input]");
  if (!target) return;
  dispatch(target.dataset.actInput, { ...target.dataset, value: target.value }, event);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.modal) closeModal();
});

window.addEventListener("hashchange", applyRoute);

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */
onStoreChange(() => render());

async function boot() {
  initLang();

  let session = { mode: "demo" };
  if (isConfigured) {
    try {
      session = await resolveSession();
    } catch (error) {
      session = { mode: "signed-out" };
      state.error = error.message;
    }
  }

  /* A recovery link lands here with a live session, and the only
     thing to do with it is choose a password. */
  state.authMode = isRecoveryLink() ? "signed-out" : session.mode;
  if (isRecoveryLink()) state.modal = { kind: "recovery" };

  if (session.mode === "ready" || session.mode === "demo") {
    await load(session);
    applyRoute();
  } else {
    renderGate();
  }
}

/* Supabase refreshes tokens and broadcasts sign-out across tabs.
   Either can invalidate what is on screen, so re-boot rather than
   leave a stale rail up. */
onAuthChange((event) => {
  if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) boot();
});

boot();
