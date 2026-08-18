/* ============================================================
   Somos Reino — portal navigation
   ------------------------------------------------------------
   One sidebar for the whole app: Account, Giving, Services,
   Finance, Settings. Every page mounts the same list, so moving
   between portals works the same way wherever you are.

   On a phone the rail becomes a drawer behind a hamburger in the
   top right corner, since 236px of permanent chrome is most of a
   phone's width.

   Which items appear is decided by canAccessFinance and
   canAccessSettings — the same predicates the pages themselves
   gate on, so the sidebar never advertises a locked door. They
   answer "should this be offered", not "is this allowed": RLS
   and the admin-users function remain the enforcement.
   ============================================================ */
import { canAccessFinance, canAccessSettings } from "./auth.js";

/** Breakpoint where the drawer becomes a permanent rail. */
const RAIL_QUERY = "(min-width:900px)";

const ITEMS = [
  { id:"account",  href:"/index.html",    label:{es:"Cuenta",       en:"Account"},
    ico:"M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 15.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" },
  { id:"giving",   href:"/giving.html",   label:{es:"Aportaciones", en:"Giving"},
    ico:"M9 3.5v11M3.5 9h11" },
  { id:"services", href:"/services.html", label:{es:"Servicios",    en:"Services"},
    ico:"M3.5 3.5h11v11h-11zM3.5 7h11M6.5 10h5M6.5 12h3" },
  { id:"finance",  href:"/finance.html",  label:{es:"Finanzas",     en:"Finance"},
    gate:"finance", ico:"M2.5 15.5h13M5 13V9M9 13V4M13 13v-6" },
  { id:"settings", href:"/settings.html", label:{es:"Ajustes",      en:"Settings"},
    gate:"settings", ico:"M2.5 6.5h4M10.5 6.5h5M2.5 11.5h9M13.5 11.5h2M8.5 4.5v4M11.5 9.5v4" },
];

const STYLE_ID = "sr-nav-style";
const CSS = `
  :root{--sr-rail-w:236px}

  .sr-rail{
    position:fixed; top:0; bottom:0; left:0; width:var(--sr-rail-w); z-index:100;
    background:#17151C; color:#B9B2C0;
    display:flex; flex-direction:column; gap:3px; padding:18px 12px;
    font-family:"Schibsted Grotesk",system-ui,sans-serif;
    overflow-y:auto; overscroll-behavior:contain;
  }
  .sr-brand{display:flex; align-items:center; gap:10px; padding:6px 10px 16px; color:#fff; text-decoration:none}
  .sr-brand svg{width:24px; height:24px; fill:#F7746D; flex:0 0 auto}
  .sr-brand span{font-family:"Bricolage Grotesque","Schibsted Grotesk",sans-serif;font-weight:800;font-size:17px;letter-spacing:-.03em}
  .sr-brand:hover span{color:#F7746D}
  .sr-eyebrow{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:#6E6678;padding:0 12px 8px}

  .sr-item{
    display:flex; align-items:center; gap:11px; min-height:44px; padding:10px 12px;
    border-radius:12px; color:#8B8394; text-decoration:none;
    font-size:14px; font-weight:600; transition:background .14s,color .14s;
  }
  .sr-item svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
  .sr-item:hover{background:#221F29;color:#EDE8EA}
  .sr-item[aria-current="page"]{background:#2A2632;color:#fff}
  .sr-item[aria-current="page"] svg{stroke:#F7746D}
  .sr-rail :focus-visible{outline:2px solid #F7746D;outline-offset:2px}

  /* The hamburger lives in whatever header the page already has, so
     there is one bar at the top of the page rather than two. */
  .sr-burger{
    display:none; align-items:center; justify-content:center;
    width:40px; height:40px; margin-right:-6px; border:0; border-radius:12px;
    background:none; color:inherit; cursor:pointer; flex:0 0 auto;
  }
  .sr-burger svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round}
  .sr-burger:hover{background:rgba(23,21,28,.06)}

  .sr-scrim{
    position:fixed; inset:0; z-index:99; background:rgba(23,21,28,.42);
    opacity:0; pointer-events:none; transition:opacity .26s ease;
  }
  .sr-scrim.sr-open{opacity:1; pointer-events:auto}

  @media ${RAIL_QUERY}{
    body.sr-has-rail{padding-left:var(--sr-rail-w)}
    .sr-scrim{display:none}
    /* The rail carries the wordmark once the page is wide enough to show
       it, so a page header marked with this class drops its own copy
       rather than printing "Somos Reino" twice across the top. */
    body.sr-has-rail .sr-wordmark{display:none}
  }

  /* Phone: a drawer that slides in, and a page that keeps its full width. */
  @media not all and ${RAIL_QUERY}{
    .sr-rail{
      width:min(82vw,300px); box-shadow:8px 0 34px rgba(23,21,28,.28);
      transform:translateX(-100%); transition:transform .26s cubic-bezier(.22,.61,.36,1);
    }
    .sr-rail.sr-open{transform:none}
    .sr-burger{display:inline-flex}
  }

  @media (prefers-reduced-motion:reduce){
    .sr-rail,.sr-scrim{transition-duration:.01ms}
  }
`;

function ensureStyle(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/**
 * Items this visitor may actually open.
 *
 * The page you are standing on is always listed, whatever the gate says
 * — a sidebar that omits the current page reads as a bug, and the page
 * itself has already decided you may be here.
 */
export function portalItems({ mode = "demo", profile = null, current = null } = {}) {
  /* Demo mode has no profile to judge by, so it previews the finance
     portal. Settings stays out: it manages real accounts, and in demo
     there are none. */
  const allowed = mode === "demo"
    ? { finance:true, settings:false }
    : { finance:canAccessFinance(profile), settings:canAccessSettings(profile) };
  return ITEMS.filter(item => !item.gate || allowed[item.gate] || item.id === current);
}

const icon = d => `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="${d}"/></svg>`;

/* Drawn here rather than referenced as <use href="#mark">, because not
   every page defines that symbol and the sidebar is on all of them. */
const MARK = `<svg viewBox="0 0 3000 3000" aria-hidden="true"><path d="M1914.98,332.31v1173.34c0,32.11-26.03,58.14-58.14,58.14h-70.1c-128.63,0-235.16-95.02-253.15-218.75-1.77-12.1-2.68-24.46-2.68-37.08V270.71c-2.49-.07-5.04-.07-7.52-.07-699.8,0-1267.11,567.31-1267.11,1267.11,0,559.27,362.29,1033.91,865.06,1201.98v-1101.4c0-32.11,26.03-58.14,58.2-58.14h70.04c128.7,0,235.16,95.02,253.15,218.75,1.77,12.1,2.68,24.46,2.68,37.08v968.71c5.95.07,11.97.13,17.98.13,699.8,0,1267.11-567.31,1267.11-1267.11,0-563.12-367.33-1040.45-875.52-1205.44ZM1106.29,1790.84c0,12.62-.92,24.98-2.68,37.08-17.98,123.66-124.45,218.75-253.15,218.75h-80.57c-26.29,0-47.67-21.38-47.67-47.74v-861.72c0-26.35,21.38-47.67,47.67-47.67h288.72c26.29,0,47.67,21.32,47.67,47.67v653.63ZM1505.4,1312.27c0,12.62-.92,24.98-2.68,37.08-17.98,123.66-124.45,218.75-253.15,218.75h-80.57c-26.29,0-47.67-21.38-47.67-47.74v-861.72c0-26.35,21.38-47.67,47.67-47.67h288.72c26.29,0,47.67,21.32,47.67,47.67v653.63ZM1914.98,2489.66c0,26.29-21.38,47.67-47.67,47.67h-288.66c-26.35,0-47.74-21.38-47.74-47.67v-653.63c0-12.62.92-24.98,2.68-37.08,17.98-123.73,124.51-218.75,253.15-218.75h80.57c26.29,0,47.67,21.32,47.67,47.67v861.79ZM2324.55,2118.14c0,32.11-26.03,58.14-58.14,58.14h-267.73c-32.11,0-58.2-26.03-58.2-58.14V867.77c0-32.11,26.09-58.14,58.2-58.14h70.04c128.7,0,235.16,95.02,253.15,218.75,1.77,12.1,2.68,24.46,2.68,37.08v1052.68Z"/></svg>`;

/**
 * Mount the portal navigation.
 *
 * @param {object} options
 * @param {string} options.current  Item id to mark as the current page.
 * @param {string} options.mode     Portal mode from getPortalSession().
 * @param {object} [options.profile] The signed-in profile, in live mode.
 * @param {string} [options.lang]   "es" or "en".
 * @param {string|Element} [options.burgerInto] Where the hamburger goes —
 *        a selector or element inside the page's own header. It is
 *        appended, so it lands at the right-hand end of the row.
 * @returns {{setLang:(lang:string)=>void, close:()=>void}}
 */
export function mountPortalNav({ current, mode = "demo", profile = null, lang = "es", burgerInto } = {}) {
  ensureStyle();
  document.getElementById("sr-rail")?.remove();
  document.getElementById("sr-scrim")?.remove();
  document.querySelector(".sr-burger")?.remove();

  let currentLang = lang;
  const items = portalItems({ mode, profile, current });

  const rail = document.createElement("nav");
  rail.id = "sr-rail";
  rail.className = "sr-rail";
  rail.setAttribute("aria-label", currentLang === "es" ? "Portales" : "Portals");

  const scrim = document.createElement("div");
  scrim.id = "sr-scrim";
  scrim.className = "sr-scrim";

  const burger = document.createElement("button");
  burger.type = "button";
  burger.className = "sr-burger";
  burger.setAttribute("aria-expanded", "false");
  burger.setAttribute("aria-controls", "sr-rail");
  burger.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 5h13M2.5 9h13M2.5 13h13"/></svg>`;

  function paint(){
    rail.innerHTML = `
      <a class="sr-brand" href="/index.html">
        ${MARK}
        <span>Somos Reino</span>
      </a>
      <div class="sr-eyebrow">${currentLang === "es" ? "Portales" : "Portals"}</div>
      ${items.map(item => `
        <a class="sr-item" href="${item.href}"${item.id === current ? ' aria-current="page"' : ""}>
          ${icon(item.ico)}<span>${item.label[currentLang] || item.label.es}</span>
        </a>`).join("")}`;
    burger.setAttribute("aria-label", currentLang === "es" ? "Abrir el menú" : "Open menu");
  }
  paint();

  document.body.appendChild(scrim);
  document.body.appendChild(rail);
  document.body.classList.add("sr-has-rail");

  const host = typeof burgerInto === "string" ? document.querySelector(burgerInto) : burgerInto;
  if (host) host.append(burger);

  /* ---- open / close (phones only) ---- */
  const wide = window.matchMedia(RAIL_QUERY);
  let open = false;

  function setOpen(next){
    if (wide.matches) next = false;
    open = next;
    rail.classList.toggle("sr-open", open);
    scrim.classList.toggle("sr-open", open);
    burger.setAttribute("aria-expanded", String(open));
    syncInert();
    if (open) rail.querySelector(".sr-item, .sr-brand")?.focus({ preventScroll:true });
  }

  /* A drawer that is off-screen must be out of the tab order too, or
     the first Tab from the header lands on links nobody can see. The
     permanent rail is always reachable. */
  function syncInert(){
    const hidden = !wide.matches && !open;
    rail.inert = hidden;
    rail.setAttribute("aria-hidden", String(hidden));
  }
  syncInert();

  burger.addEventListener("click", () => setOpen(!open));
  scrim.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && open) { setOpen(false); burger.focus(); }
  });
  wide.addEventListener("change", () => { setOpen(false); syncInert(); });

  return {
    setLang(next){ currentLang = next; paint(); syncInert(); },
    close(){ setOpen(false); },
  };
}
