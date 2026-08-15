/* ============================================================
   Somos Reino — connection status badge
   ------------------------------------------------------------
   A small fixed marker telling whoever is looking at the page
   whether they are seeing real data. "demo" is not a failure —
   it is the state the portals ship in before credentials exist.

   Sits bottom-right to stay clear of the finance sidebar, the
   centered toast, and the giver portal's mobile tab bar.
   ============================================================ */

const STYLES = {
  demo:  { bg: "#FBF0DC", fg: "#A97613", border: "#E8D5A8", label: "Demo data" },
  ready: { bg: "#E7F1EC", fg: "#3F7A63", border: "#BFDCCE", label: "Live" },
  error: { bg: "#FDECEA", fg: "#C8483F", border: "#F3C9C5", label: "Connection error" },
};

const STYLE_ID = "sr-mode-badge-style";
const CSS = `
  #sr-mode-badge{
    position:fixed; right:16px; bottom:16px; z-index:90;
    display:flex; align-items:center; gap:8px;
    padding:8px 12px; border-radius:999px;
    font:600 12px/1 "Schibsted Grotesk",system-ui,sans-serif;
    box-shadow:0 2px 10px rgba(23,21,28,.08);
    max-width:min(420px,calc(100vw - 32px));
  }
  #sr-mode-badge span.sr-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
  #sr-mode-badge span.sr-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  /* Clear the giver portal's fixed tab bar on narrow screens. */
  @media(max-width:860px){ #sr-mode-badge{bottom:84px} }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/**
 * Render (or replace) the status badge.
 * @param {{mode:"demo"|"ready"|"error", portal:string, error?:string}} options
 */
export function showModeBadge({ mode, portal, error } = {}) {
  const style = STYLES[mode] || STYLES.error;
  ensureStyle();
  document.getElementById("sr-mode-badge")?.remove();

  const badge = document.createElement("div");
  badge.id = "sr-mode-badge";
  badge.setAttribute("role", "status");
  badge.style.background = style.bg;
  badge.style.color = style.fg;
  badge.style.border = `1px solid ${style.border}`;

  const dot = document.createElement("span");
  dot.className = "sr-dot";
  badge.appendChild(dot);

  const text = document.createElement("span");
  text.className = "sr-text";
  const label = mode === "error" && error ? `${style.label}: ${error}` : style.label;
  text.textContent = portal ? `${portal} · ${label}` : label;
  badge.appendChild(text);

  if (mode === "error" && error) badge.title = error;

  document.body.appendChild(badge);
  return badge;
}
