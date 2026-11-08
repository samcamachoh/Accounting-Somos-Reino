/* ============================================================
   Somos Reino — recurring events
   ------------------------------------------------------------
   Turns "every Sunday for 12 weeks" into a list of dates, and
   into the RFC 5545 RRULE string stored on event_series.

   Dates here are bare local days ("2026-11-15"), never instants.
   Each occurrence is later combined with a wall-clock time in the
   browser's own zone, so a 10:00 service stays at 10:00 across a
   daylight-saving change instead of drifting an hour.

   Supported: daily, weekly (chosen weekdays), and monthly by day
   of month or by "nth weekday" (the 2nd Sunday). A monthly rule
   on the 31st skips months that have no 31st rather than
   quietly moving to the 30th.
   ============================================================ */

export const MAX_OCCURRENCES = 104;
const HORIZON_DAYS = 366 * 5;
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const parse = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  /* Noon, so DST shifts at midnight can never move the date. */
  return new Date(y, m - 1, d, 12);
};
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayDiff = (a, b) => Math.round((b - a) / 864e5);
const monthDiff = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const isLastOfWeekdayInMonth = (d) => d.getDate() + 7 > daysInMonth(d);
const nthOfWeekday = (d) => Math.ceil(d.getDate() / 7);

/**
 * @typedef {object} Rule
 * @property {string} start       First occurrence, YYYY-MM-DD.
 * @property {"daily"|"weekly"|"monthly"} freq
 * @property {number} [interval]  Every N days/weeks/months. Default 1.
 * @property {number[]} [byday]   Weekly: weekdays, 0 = Sunday. Default: the start day.
 * @property {"day"|"nth"} [monthly]  Monthly: same date, or same nth weekday. Default "day".
 * @property {string|null} [until]    Last allowed date, inclusive.
 * @property {number|null} [count]    Total occurrences, including the first.
 */

/**
 * Expand a rule into dates. Always includes the start date when it
 * fits the rule; a rule with neither `until` nor `count` is refused,
 * because an open-ended series cannot be materialised.
 * @param {Rule} rule
 * @returns {string[]}
 */
export function expand(rule, limit = MAX_OCCURRENCES) {
  const { freq, until = null, count = null } = rule;
  if (!["daily", "weekly", "monthly"].includes(freq)) throw new Error("Choose how often it repeats.");
  if (!until && !count) throw new Error("Say when the repeating stops.");
  if (until && until < rule.start) throw new Error("The repeat can't end before it starts.");

  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const start = parse(rule.start);
  const last = until ? parse(until) : addDays(start, HORIZON_DAYS);
  const cap = Math.min(limit, count || limit);

  const byday = freq === "weekly" ? (rule.byday?.length ? [...new Set(rule.byday)] : [start.getDay()]) : [];
  const weekOne = addDays(start, -start.getDay());
  const nth = rule.monthly === "nth";
  const startIsLast = nth && isLastOfWeekdayInMonth(start) && nthOfWeekday(start) >= 5;
  const startNth = nthOfWeekday(start);

  const matches = (d) => {
    if (freq === "daily") return dayDiff(start, d) % interval === 0;
    if (freq === "weekly") {
      return byday.includes(d.getDay()) && Math.floor(dayDiff(weekOne, d) / 7) % interval === 0;
    }
    if (monthDiff(start, d) % interval !== 0) return false;
    if (!nth) return d.getDate() === start.getDate();
    if (d.getDay() !== start.getDay()) return false;
    return startIsLast ? isLastOfWeekdayInMonth(d) : nthOfWeekday(d) === startNth;
  };

  const out = [];
  for (let d = start; d <= last && out.length < cap; d = addDays(d, 1)) {
    if (matches(d)) out.push(fmt(d));
  }
  return out;
}

/** The RRULE string stored with the series, e.g. FREQ=WEEKLY;BYDAY=SU,WE;COUNT=12 */
export function toRRule(rule) {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);

  if (rule.freq === "weekly") {
    const days = rule.byday?.length ? rule.byday : [parse(rule.start).getDay()];
    parts.push(`BYDAY=${[...new Set(days)].sort().map((d) => DAY_CODES[d]).join(",")}`);
  }
  if (rule.freq === "monthly") {
    const s = parse(rule.start);
    if (rule.monthly === "nth") {
      const last = isLastOfWeekdayInMonth(s) && nthOfWeekday(s) >= 5;
      parts.push(`BYDAY=${last ? -1 : nthOfWeekday(s)}${DAY_CODES[s.getDay()]}`);
    } else parts.push(`BYMONTHDAY=${s.getDate()}`);
  }
  if (rule.until) parts.push(`UNTIL=${rule.until.replaceAll("-", "")}`);
  else if (rule.count) parts.push(`COUNT=${rule.count}`);
  return parts.join(";");
}

const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORD = { 1: "first", 2: "second", 3: "third", 4: "fourth", "-1": "last" };

/** "Every week on Sunday" — for showing a series in plain words. Unknown rules fall back to "Repeats". */
export function describe(rrule) {
  if (!rrule) return "";
  const p = Object.fromEntries(String(rrule).split(";").map((x) => x.split("=")));
  const n = Number(p.INTERVAL || 1);
  const every = (unit) => (n > 1 ? `Every ${n} ${unit}s` : `Every ${unit}`);
  const dayOf = (code) => NAMES[DAY_CODES.indexOf(code)];

  if (p.FREQ === "DAILY") return every("day");
  if (p.FREQ === "WEEKLY") {
    const days = (p.BYDAY || "").split(",").map(dayOf).filter(Boolean);
    return `${every("week")}${days.length ? ` on ${days.join(", ")}` : ""}`;
  }
  if (p.FREQ === "MONTHLY") {
    const m = /^(-?\d)([A-Z]{2})$/.exec(p.BYDAY || "");
    if (m) return `${every("month")} on the ${ORD[m[1]] || m[1]} ${dayOf(m[2])}`;
    return `${every("month")}${p.BYMONTHDAY ? ` on day ${p.BYMONTHDAY}` : ""}`;
  }
  return "Repeats";
}
