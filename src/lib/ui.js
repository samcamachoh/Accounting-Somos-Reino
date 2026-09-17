/* ============================================================
   Somos Reino — rendering helpers
   ------------------------------------------------------------
   The views render to HTML strings and hand them to the router,
   so everything here is either a formatter or a string builder.
   The one exception is toast(), which the event handlers call
   directly because a toast outlives the re-render that follows it.
   ============================================================ */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* ------------------------------------------------------------
   Escaping

   Every value that reaches innerHTML goes through esc(). Names,
   descriptions and notes are typed by people and stored verbatim,
   so this is the boundary that keeps a quotation mark in a fund
   name from ending an attribute.
   ------------------------------------------------------------ */
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

/* ------------------------------------------------------------
   Money

   Amounts are carried as dollars in the view layer and as integer
   cents at the API boundary — cents() and dollars() are the two
   places that conversion happens.
   ------------------------------------------------------------ */
export const money = (n) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money0 = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
export const cents = (dollars) => Math.round((Number(dollars) || 0) * 100);
export const dollars = (amountCents) => (Number(amountCents) || 0) / 100;

/* Stripe's published US card rate. Used only to show the giver what
   covering the fee would add; Stripe itself computes the real charge. */
export const feeFor = (amount) => Math.round((amount * 0.029 + 0.3) * 100) / 100;

/* ------------------------------------------------------------
   People
   ------------------------------------------------------------ */
export const initials = (name) =>
  String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const AVATAR_COLORS = ["#F7746D", "#3F7A63", "#A97613", "#5B5470", "#2F6E8F", "#8A4A6B", "#4C6B3F"];

/** Stable colour per name, so the same person looks the same everywhere. */
export const avatarColor = (name) =>
  AVATAR_COLORS[[...String(name || "")].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

export const avatar = (name, size) => {
  const dimension = size ? `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;` : "";
  return `<span class="avatar" style="${dimension}background:${avatarColor(name)};color:#fff" aria-hidden="true">${esc(initials(name))}</span>`;
};

/* ------------------------------------------------------------
   Dates

   Stored dates are ISO day strings. Parsing them at noon avoids the
   off-by-one where "2026-07-27" in a negative UTC offset renders as
   the 26th.
   ------------------------------------------------------------ */
export const parseDay = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`);

const MONTHS = {
  es: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

export const monthNames = (lang) => MONTHS[lang] || MONTHS.en;

/** "Jul 27" in the caller's language. */
export const shortDate = (iso, lang = "en") => {
  if (!iso) return "—";
  const date = parseDay(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return `${monthNames(lang)[date.getMonth()]} ${date.getDate()}`;
};

/** "Jul 27, 2026" — used where the year is not implied by context. */
export const longDate = (iso, lang = "en") => {
  if (!iso) return "—";
  const date = parseDay(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return `${shortDate(iso, lang)}, ${date.getFullYear()}`;
};

/** "12m", "3h", "2d" — relative age for the activity feed. */
export function ago(iso, lang = "en") {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  const days = Math.round(minutes / 1440);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  return shortDate(iso, lang);
}

/* ------------------------------------------------------------
   String builders
   ------------------------------------------------------------ */

/** A status pill. `tone` is one of ok, wait, hot, mute. */
export const tag = (label, tone = "mute") => `<span class="tag t-${tone}">${esc(label)}</span>`;

/** An inline swatch for a fund. */
export const fundDot = (color, size = 9) =>
  `<span class="fund-dot" style="width:${size}px;height:${size}px;background:${esc(color || "#9A9299")}"></span>`;

/** The placeholder a list shows when it has nothing in it. */
export const emptyState = (title, detail = "") =>
  `<div class="empty"><strong>${esc(title)}</strong>${detail ? esc(detail) : ""}</div>`;

/**
 * A stroked icon from a path. Views name icons rather than inlining
 * paths so the same shape means the same thing across the portal.
 */
export const icon = (path, className = "nav-ico") =>
  `<svg class="${className}" viewBox="0 0 18 18" aria-hidden="true"><path d="${path}"/></svg>`;

/* ------------------------------------------------------------
   Toast

   Deliberately not part of the render pass: a toast reports what
   just happened, and the re-render that follows the action would
   wipe it out if it lived in the view's HTML.
   ------------------------------------------------------------ */
let toastTimer = null;

export function toast(message, { tone = "ok" } = {}) {
  const node = $("#toast");
  if (!node) return;
  node.innerHTML = `${tone === "ok" ? '<span class="tick">✓</span>' : ""}<span>${esc(message)}</span>`;
  node.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("on"), 2600);
}

/* ------------------------------------------------------------
   Modal

   modalShell() builds the markup; the router paints it into
   #modalRoot and the global click handler closes it. Keeping the
   modal in app state rather than in the DOM means a re-render
   never loses whichever dialog is open.
   ------------------------------------------------------------ */
export function modalShell({ title, detail = "", body = "", footer = "", wide = false }) {
  return `
    <div class="scrim" data-scrim>
      <div class="modal${wide ? " modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-hd">
          <div class="modal-t">${esc(title)}</div>
          ${detail ? `<div class="modal-d">${esc(detail)}</div>` : ""}
        </div>
        <div class="modal-bd">${body}</div>
        ${footer ? `<div class="modal-ft">${footer}</div>` : ""}
      </div>
    </div>`;
}

/** A labelled input for use inside a modal body. */
export function field({ label, name, value = "", type = "text", placeholder = "", options, rows }) {
  const control = options
    ? `<select class="input" name="${esc(name)}">${options
        .map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(value) ? " selected" : ""}>${esc(o.label)}</option>`)
        .join("")}</select>`
    : rows
      ? `<textarea class="input" name="${esc(name)}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input class="input" name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}">`;
  return `<div class="field"><label>${esc(label)}</label>${control}</div>`;
}

/* ------------------------------------------------------------
   Charts

   One bar chart, drawn as inline SVG. A charting library would be
   larger than this file and the portal draws exactly one shape.
   ------------------------------------------------------------ */
export function barChart(series, { highlightLast = true } = {}) {
  if (!series.length) return emptyState("No data yet");
  const max = Math.max(...series.map((d) => d.v), 1);
  const width = 100 / series.length;

  /* The bars stretch with the card, so the SVG drops its aspect
     ratio. Text inside it would stretch too — hence the labels
     are HTML underneath rather than <text> inside. */
  const bars = series
    .map((d, i) => {
      const height = Math.max(1, (d.v / max) * 100);
      const pale = highlightLast && i < series.length - 1 ? " pale" : "";
      return `<rect class="bar${pale}" x="${i * width + width * 0.18}" y="${100 - height}" width="${width * 0.64}" height="${height}" rx="1">
        <title>${esc(d.w)} — ${money0(d.v)}</title></rect>`;
    })
    .join("");

  const labels = series
    .map((d) => `<span style="flex:1;text-align:center">${esc(d.w)}</span>`)
    .join("");

  return `
    <svg class="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(series.map((d) => `${d.w}: ${money0(d.v)}`).join(", "))}">
      ${bars}
    </svg>
    <div class="chart-labels">${labels}</div>`;
}

/** The fund ribbon: one bar segmented by balance, with a key beneath. */
export function fundRibbon(funds, label) {
  const total = funds.reduce((sum, f) => sum + (f.balance || 0), 0);
  const segments = funds
    .map((f) => `<div class="ribbon-seg" style="flex:${Math.max(f.balance || 0, 1)};background:${esc(f.color)}"></div>`)
    .join("");
  const key = funds
    .map(
      (f) => `<div class="ribbon-key-item">
        <span class="sw" style="background:${esc(f.color)}"></span>
        <span>${esc(f.name)}</span><span class="amt">${money0(f.balance || 0)}</span>
      </div>`,
    )
    .join("");

  return `<div class="ribbon">
    <div class="ribbon-top"><span class="ribbon-total num">${money(total)}</span><span class="eyebrow">${esc(label)}</span></div>
    <div class="ribbon-bar">${segments}</div>
    <div class="ribbon-key">${key}</div>
  </div>`;
}
