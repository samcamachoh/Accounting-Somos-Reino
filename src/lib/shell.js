/* ============================================================
   Somos Reino — app shell
   ------------------------------------------------------------
   One navigation for every page: a side menu on desktop, a top
   bar and bottom tab bar on phones and tablets.

   Pages call mountShell({ active }) as the FIRST thing they do, so
   the frame paints at once instead of after sign-in resolves, then
   shell.update(session) when they know who is signed in.

   Which links appear depends on role and permissions. That is
   presentation only — Row Level Security and the admin function
   are what actually enforce access. To avoid the menu jumping when
   a page loads, the last known capabilities are remembered in this
   browser and used for the first paint; update() replaces them with
   the truth. A stale hint can only ever show a link that then says
   "no access", never expose data.
   ============================================================ */
import {
  canAccessFinance, canAccessSettings, canAccessFollowUps, canAccessPeople, signOut,
} from "./auth.js";

const CAPS_KEY = "sr-caps";
const LANG_KEY = "sr-lang";

const ICONS = {
  home: "M3 10.5 9 4l6 6.5M4.5 9v6.5h9V9",
  calendar: "M3.5 4.5h11v10h-11zM3.5 7.5h11M6.5 3v3M11.5 3v3",
  followups: "M4 9.5l3 3 7-7.5",
  people: "M6.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 14.5c0-2.4 2-4 4.5-4s4.5 1.6 4.5 4M12 8.2a2.2 2.2 0 1 0 0-4.4M13.5 10.6c1.6.4 2.5 1.7 2.5 3.4",
  giving: "M9 15s-5.5-3.2-5.5-7.3A3 3 0 0 1 9 6.2a3 3 0 0 1 5.5 1.5C14.5 11.8 9 15 9 15Z",
  services: "M3.5 3.5h11v11h-11zM3.5 7h11M6.5 10h5M6.5 12h3",
  finance: "M2.5 15.5h13M5 13V9M9 13V4M13 13v-6",
  settings: "M2.5 6.5h4M10.5 6.5h5M2.5 11.5h9M13.5 11.5h2M8.5 4.5v4M11.5 9.5v4",
  more: "M4 9h.01M9 9h.01M14 9h.01",
  out: "M7 3.5H4.5v11H7M11 6l3 3-3 3M14 9H7.5",
};

/* `rank` decides what earns a slot on the phone's bottom bar (five fit). */
const NAV = [
  { id: "home", href: "/index.html", rank: 1, label: { es: "Inicio", en: "Home" }, show: () => true },
  { id: "calendar", href: "/calendar.html", rank: 2, label: { es: "Calendario", en: "Calendar" }, show: () => true },
  { id: "followups", href: "/followups.html", rank: 3, label: { es: "Seguimiento", en: "Follow-ups" }, show: (c) => c.followups },
  { id: "people", href: "/people.html", rank: 4, label: { es: "Personas", en: "People" }, show: (c) => c.people },
  { id: "giving", href: "/giving.html", rank: 5, label: { es: "Aportaciones", en: "Giving" }, show: () => true },
  { id: "services", href: "/services.html", rank: 6, label: { es: "Servicios", en: "Services" }, show: () => true },
  { id: "finance", href: "/finance.html", rank: 7, label: { es: "Finanzas", en: "Finance" }, show: (c) => c.finance },
  { id: "settings", href: "/settings.html", rank: 8, label: { es: "Ajustes", en: "Settings" }, show: (c) => c.settings },
];

const STR = {
  more: { es: "Más", en: "More" },
  signOut: { es: "Cerrar sesión", en: "Sign out" },
  skip: { es: "Saltar al contenido", en: "Skip to content" },
  menu: { es: "Menú principal", en: "Main menu" },
  demo: { es: "Modo demostración", en: "Demo mode" },
  language: { es: "Idioma", en: "Language" },
  roleAdmin: { es: "Administrador", en: "Administrator" },
  roleFinance: { es: "Finanzas", en: "Finance" },
  roleMember: { es: "Miembro", en: "Member" },
};

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const getLang = () => safe(() => localStorage.getItem(LANG_KEY), null) === "en" ? "en" : "es";
const t = (key) => STR[key][getLang()];

const NO_CAPS = { followups: false, people: false, finance: false, settings: false, name: "", role: "", demo: false };
const readCaps = () => safe(() => ({ ...NO_CAPS, ...JSON.parse(localStorage.getItem(CAPS_KEY) || "{}") }), NO_CAPS);
const writeCaps = (c) => safe(() => localStorage.setItem(CAPS_KEY, JSON.stringify(c)));

const initials = (name) => String(name || "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "·";
const svg = (id) => `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="${ICONS[id]}"/></svg>`;

/** Turn a signed-in session (or demo mode) into the capability hints the menu needs. */
export function capsFromSession(session) {
  if (!session || session.mode === "demo") return { ...NO_CAPS, followups: true, people: true, finance: true, settings: true, name: "Demo", role: "demo", demo: true };
  const p = session.profile;
  if (!p) return NO_CAPS;
  return {
    followups: canAccessFollowUps(p), people: canAccessPeople(p), finance: canAccessFinance(p), settings: canAccessSettings(p),
    name: p.full_name || p.email || "", role: p.role || "member", demo: false,
  };
}

let state = { active: "", caps: NO_CAPS, root: null };

function visibleItems(caps) { return NAV.filter((n) => n.show(caps)); }

function navLink(item, active, cls = "") {
  const label = item.label[getLang()];
  return `<a class="${cls}" href="${item.href}"${item.id === active ? ' aria-current="page"' : ""}>${svg(item.id)}<span>${esc(label)}</span></a>`;
}

function render() {
  const { root, active, caps } = state;
  if (!root) return;
  const items = visibleItems(caps);
  const lang = getLang();

  /* Phone: up to five tabs. With more, the first four by rank plus "More". */
  const needMore = items.length > 5;
  const tabItems = needMore ? items.slice(0, 4) : items;
  const overflow = needMore ? items.slice(4) : [];
  const inOverflow = overflow.some((i) => i.id === active);

  const roleLabel = caps.demo ? t("demo") : caps.role === "admin" ? t("roleAdmin") : caps.role === "finance" ? t("roleFinance") : caps.name ? t("roleMember") : "";
  const langSwitch = `<div class="langs" role="group" aria-label="${esc(t("language"))}">
      <button type="button" data-lang="es" aria-pressed="${lang === "es"}">ES</button>
      <button type="button" data-lang="en" aria-pressed="${lang === "en"}">EN</button></div>`;
  const brand = `<a class="brand" href="/index.html"><span class="brand-mark"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2.5v13M4 7h10"/></svg></span><span>Somos Reino</span></a>`;

  root.side.innerHTML = `${brand}
    <nav aria-label="${esc(t("menu"))}"><ul class="menu">${items.map((i) => `<li>${navLink(i, active)}</li>`).join("")}</ul></nav>
    <div class="side-foot">${langSwitch}
      <div class="me"><span class="avatar-btn" aria-hidden="true">${esc(initials(caps.name))}</span>
        <div style="min-width:0"><div class="me-name">${esc(caps.name || "…")}</div><div class="me-role">${esc(roleLabel)}</div></div></div>
      ${caps.demo || !caps.name ? "" : `<button class="btn ghost" type="button" data-act="signout">${svg("out").replace("<svg ", '<svg width="18" height="18" style="stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round" ')}${esc(t("signOut"))}</button>`}
    </div>`;

  root.bar.innerHTML = `${brand}<div class="bar-tools">${langSwitch}</div>`;

  root.tabs.innerHTML = tabItems.map((i) => navLink(i, active, "tab")).join("") +
    (needMore ? `<button class="tab" type="button" data-act="more" aria-haspopup="dialog"${inOverflow ? ' aria-current="page"' : ""}>${svg("more").replace("<svg ", '<svg style="stroke-width:3" ')}<span>${esc(t("more"))}</span></button>` : "");
  state.overflow = overflow;
}

function openMore() {
  const caps = state.caps, lang = getLang();
  document.getElementById("shell-sheet")?.remove();
  const sheet = document.createElement("div");
  sheet.className = "scrim"; sheet.id = "shell-sheet";
  sheet.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(t("more"))}">
    <ul class="menu" style="display:flex;flex-direction:column;gap:2px;list-style:none;margin:-6px 0 8px">${(state.overflow || []).map((i) =>
      `<li><a href="${i.href}" style="display:flex;align-items:center;gap:14px;min-height:50px;padding:0 6px;font-weight:600;font-size:16px;border-radius:12px"${i.id === state.active ? ' aria-current="page"' : ""}>
        <svg viewBox="0 0 18 18" width="22" height="22" aria-hidden="true" style="stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><path d="${ICONS[i.id]}"/></svg>${esc(i.label[lang])}</a></li>`).join("")}</ul>
    ${caps.demo || !caps.name ? "" : `<button class="btn" type="button" data-act="signout" style="width:100%">${esc(t("signOut"))}</button>`}
  </div>`;
  document.body.appendChild(sheet);
  const close = () => { sheet.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  sheet.addEventListener("mousedown", (e) => { if (e.target === sheet) close(); });
  sheet.querySelector("a, button")?.focus();
  sheet.addEventListener("click", (e) => { if (e.target.closest("[data-act=signout]")) doSignOut(); });
}

async function doSignOut() {
  try { await signOut(); } catch (e) { /* signOut navigates away on success; a failure leaves the page as it was */ }
}

/**
 * Build the frame around the page's existing `.wrap` content and paint it.
 * @param {{active:string}} options `active` is the nav id of the current page.
 * @returns {{update:(session:object)=>void}}
 */
export function mountShell({ active }) {
  if (state.root) return { update };
  const content = document.querySelector(".wrap");
  const app = document.createElement("div");
  app.className = "app";
  app.innerHTML = `<a class="skip-link" href="#main">${esc(t("skip"))}</a>
    <aside class="side"></aside>
    <div class="main"><header class="topbar"></header><main id="main" tabindex="-1"></main></div>
    <nav class="tabbar" aria-label="${esc(t("menu"))}"></nav>`;
  app.querySelector("main").appendChild(content);
  document.body.prepend(app);

  state = { active, caps: readCaps(), overflow: [], root: { side: app.querySelector(".side"), bar: app.querySelector(".topbar"), tabs: app.querySelector(".tabbar") } };
  render();

  app.addEventListener("click", (e) => {
    const lang = e.target.closest("[data-lang]");
    if (lang) {
      if (lang.dataset.lang !== getLang()) { safe(() => localStorage.setItem(LANG_KEY, lang.dataset.lang)); location.reload(); }
      return;
    }
    if (e.target.closest("[data-act=more]")) return openMore();
    if (e.target.closest("[data-act=signout]")) doSignOut();
  });
  document.documentElement.lang = getLang();
  return { update };
}

/** Tell the shell who is signed in (or that this is demo mode). */
export function update(session) {
  const caps = capsFromSession(session);
  if (JSON.stringify(caps) === JSON.stringify(state.caps)) return;
  state.caps = caps;
  writeCaps(caps);
  render();
}
