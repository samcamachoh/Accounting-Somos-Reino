/* ============================================================
   Somos Reino — sample data
   ------------------------------------------------------------
   Demo mode is what the portal does before a Supabase project
   exists: `pnpm dev` works on a fresh clone with no setup.

   The important property of this file is its SHAPE. Every record
   here looks exactly like the row api.js returns — same field
   names, same cents-as-integers, same nested fund. That is what
   lets a view render without ever asking which mode it is in,
   and it is why the portal no longer needs a hydrate() function
   per page translating one shape into another.

   Money is integer cents throughout, as it is in the database.
   Floats lose pennies over a few thousand gifts.
   ============================================================ */

/* Sample data reads as a real July, so anchor it rather than
   letting it drift into the past as the year turns. */
const YEAR = 2026;
const day = (month, date) => `${YEAR}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

export const DEMO_FUNDS = [
  {
    id: "general", slug: "general", color: "#F7746D",
    name: { es: "Fondo General", en: "General Fund" },
    blurb: { es: "Sostiene el ministerio semanal, el personal y la operación de la iglesia.", en: "Supports weekly ministry, staff, and church operations." },
    balance_cents: 4821040, goal_cents: null, raised_cents: null,
  },
  {
    id: "building", slug: "building", color: "#3F7A63",
    name: { es: "Techo Nuevo", en: "New Roof" },
    blurb: { es: "Campaña para reemplazar el techo del santuario.", en: "Campaign to replace the sanctuary roof." },
    balance_cents: 6390075, goal_cents: 15000000, raised_cents: 6390000,
  },
  {
    id: "missions", slug: "missions", color: "#2F6E8F",
    name: { es: "Misiones", en: "Missions" },
    blurb: { es: "Envía a nuestra gente y apoyo a Honduras y más allá.", en: "Sends our people and support to Honduras and beyond." },
    balance_cents: 1284500, goal_cents: null, raised_cents: null,
  },
  {
    id: "benev", slug: "benev", color: "#A97613",
    name: { es: "Benevolencia", en: "Benevolence" },
    blurb: { es: "Ayuda directa para familias en crisis.", en: "Direct help for families in crisis." },
    balance_cents: 765510, goal_cents: null, raised_cents: null,
  },
  {
    id: "youth", slug: "youth", color: "#8A4A6B",
    name: { es: "Jóvenes", en: "Youth" },
    blurb: { es: "Campamentos, retiros y reuniones semanales de jóvenes.", en: "Camps, retreats, and weekly youth gatherings." },
    balance_cents: 412030, goal_cents: null, raised_cents: null,
  },
];

const NO_PERMISSIONS = { finance: false, approve: false, refund: false, people: false, payouts: false };
const person = (id, full_name, role, teams, email, phone, since, background_check, permissions = {}, extra = {}) => ({
  id, full_name, role, teams, email, phone,
  created_at: `${since}-01-01T12:00:00Z`,
  background_check,
  permissions: { ...NO_PERMISSIONS, ...permissions },
  is_active: true,
  ...extra,
});

export const DEMO_PEOPLE = [
  person("p1", "Sam Camacho", "admin", ["Finance", "Media"], "sam@somosreino.org", "(407) 555-0142", "2019", "cleared",
    { finance: true, approve: true, refund: true, people: true, payouts: true }, { last_seen_at: hoursAgo(0.2) }),
  person("p2", "Marisol Ortega", "finance", ["Finance", "Care"], "marisol@somosreino.org", "(407) 555-0198", "2017", "cleared",
    { finance: true, approve: true, refund: true, payouts: true }, { last_seen_at: hoursAgo(2) }),
  person("p3", "Daniel Reyes", "staff", ["Pastoral"], "daniel@somosreino.org", "(407) 555-0110", "2015", "cleared",
    { finance: true, approve: true, people: true }, { last_seen_at: hoursAgo(26) }),
  person("p4", "Crystal Camacho", "staff", ["Hospitality", "Kids"], "crystal@somosreino.org", "(407) 555-0177", "2019", "cleared",
    { approve: true, people: true }, { last_seen_at: hoursAgo(1) }),
  person("p5", "Josué Villanueva", "staff", ["Worship"], "josue@somosreino.org", "(407) 555-0155", "2018", "cleared",
    { approve: true }, { last_seen_at: hoursAgo(72) }),
  person("p6", "Elias Moreno", "member", ["Media", "Production"], "elias@somosreino.org", "(407) 555-0163", "2020", "cleared",
    {}, { last_seen_at: hoursAgo(3) }),
  person("p7", "Ana Beltrán", "member", ["Kids"], "ana@somosreino.org", "(407) 555-0129", "2021", "cleared",
    { people: true }, { last_seen_at: hoursAgo(28) }),
  person("p8", "Karina Espinal", "member", ["Youth"], "karina@somosreino.org", "(407) 555-0184", "2022", "expiring",
    {}, { last_seen_at: hoursAgo(96) }),
  person("p9", "Priscila Duarte", "member", ["Hospitality"], "priscila@somosreino.org", "(407) 555-0136", "2022", "cleared",
    {}, { last_seen_at: hoursAgo(168) }),
  person("p10", "Roberto Salgado", "member", ["Facilities"], "roberto@somosreino.org", "(407) 555-0171", "2020", "cleared",
    {}, { last_seen_at: hoursAgo(120) }),
  person("p11", "Tomás Aguilar", "member", ["Parking", "Facilities"], "tomas@somosreino.org", "(407) 555-0192", "2023", "missing",
    {}, { last_seen_at: hoursAgo(170) }),
  person("p12", "Noelia Ramírez", "member", ["Welcome"], "noelia@somosreino.org", "(407) 555-0148", "2024", "missing",
    {}, { last_seen_at: hoursAgo(340) }),
  person("p13", "Héctor Peña", "member", ["Production", "Media"], "hector@somosreino.org", "(407) 555-0119", "2023", "cleared",
    {}, { last_seen_at: hoursAgo(140) }),
];

/* The person the demo signs you in as. An admin, so a fresh clone
   shows the whole portal rather than a corner of it. */
export const DEMO_ME = DEMO_PEOPLE[0];

export const DEMO_PAYMENT_METHODS = [
  { id: "pm1", profile_id: "p1", brand: "VISA", last4: "4412", exp_month: 8, exp_year: 28, is_default: true },
  { id: "pm2", profile_id: "p1", brand: "MC", last4: "2290", exp_month: 3, exp_year: 27, is_default: false },
];

const gift = (id, profile_id, giver_name, fund_id, amount, occurred_at, method, recurring, covered) => ({
  id, profile_id, giver_name, fund_id,
  amount_cents: Math.round(amount * 100),
  /* Stripe's US card rate; ACH is flat. Stored rather than derived
     because the real rate is whatever Stripe actually charged. */
  fee_cents: Math.round((method === "ACH" ? Math.min(amount * 0.008, 5) : amount * 0.029 + 0.3) * 100),
  fee_covered: covered,
  method, recurring, occurred_at,
});

/* Two kinds of row live here together, exactly as they do in the
   donations table: the signed-in person's own giving (profile_id
   "p1", which the giving views filter to) and everyone else's,
   which only the finance views ever read. */
export const DEMO_DONATIONS = [
  gift("g1", "p1", "Sam Camacho", "building", 1000, day(1, 12), "Card", false, true),
  gift("g2", "p1", "Sam Camacho", "general", 450, day(1, 27), "Card", true, true),
  gift("g3", "p1", "Sam Camacho", "youth", 40, day(2, 14), "Card", false, false),
  gift("g4", "p1", "Sam Camacho", "general", 450, day(2, 24), "Card", true, true),
  gift("g5", "p1", "Sam Camacho", "building", 250, day(3, 15), "Card", false, false),
  gift("g6", "p1", "Sam Camacho", "general", 450, day(3, 29), "Card", true, true),
  gift("g7", "p1", "Sam Camacho", "general", 450, day(4, 26), "Card", true, true),
  gift("g8", "p1", "Sam Camacho", "missions", 100, day(5, 10), "Card", false, false),
  gift("g9", "p1", "Sam Camacho", "general", 450, day(5, 31), "Card", true, true),
  gift("g10", "p1", "Sam Camacho", "general", 450, day(6, 28), "Card", true, true),
  gift("g11", "p1", "Sam Camacho", "youth", 20, day(7, 6), "Card", true, false),
  gift("g12", "p1", "Sam Camacho", "youth", 20, day(7, 13), "Card", true, false),
  gift("g13", "p1", "Sam Camacho", "youth", 20, day(7, 20), "Card", true, false),
  gift("g14", "p1", "Sam Camacho", "general", 450, day(7, 27), "Card", true, true),
  gift("g15", "p1", "Sam Camacho", "youth", 20, day(7, 27), "Card", true, false),

  gift("o1", null, "Anonymous", "building", 1000, day(7, 27), "ACH", false, false),
  gift("o2", "p13", "Héctor Peña", "general", 120, day(7, 27), "Card", true, true),
  gift("o3", "p12", "Noelia Ramírez", "youth", 75, day(7, 26), "Apple Pay", false, false),
  gift("o4", "p11", "Tomás Aguilar", "missions", 250, day(7, 26), "Card", true, true),
  gift("o5", "p9", "Priscila Duarte", "benev", 60, day(7, 25), "Card", false, false),
  gift("o6", "p5", "Josué Villanueva", "general", 300, day(7, 24), "ACH", true, true),
  gift("o7", "p7", "Ana Beltrán", "building", 500, day(7, 23), "Card", false, false),
  gift("o8", "p8", "Karina Espinal", "youth", 40, day(7, 22), "Apple Pay", true, true),
  gift("o9", null, "Anonymous", "general", 25, day(7, 21), "Card", false, false),
  gift("o10", "p2", "Marisol Ortega", "general", 450, day(7, 20), "Card", true, true),
];

export const DEMO_RECURRING = [
  { id: "r1", profile_id: "p1", fund_id: "general", amount_cents: 45000, frequency: "monthly", next_charge_at: day(8, 27), payment_method_id: "pm1", status: "active" },
  { id: "r2", profile_id: "p1", fund_id: "youth", amount_cents: 2000, frequency: "weekly", next_charge_at: day(8, 10), payment_method_id: "pm1", status: "active" },
];

const expense = (id, description, submitter_id, team_name, fund_id, amount, created_at, status, has_receipt, note = "") => ({
  id, description, submitter_id, team_name, fund_id,
  amount_cents: Math.round(amount * 100),
  created_at, status, has_receipt, note,
});

export const DEMO_EXPENSES = [
  expense("e1", "Sound board channel repair", "p6", "Media", "general", 485.0, day(7, 28), "pending", true, "X32 channel 9 preamp"),
  expense("e2", "Kids curriculum — Q3", "p7", "Kids", "general", 1240.0, day(7, 26), "pending", true),
  expense("e3", "Youth camp deposit", "p8", "Youth", "youth", 3000.0, day(7, 25), "pending", false, "Needs a second approval over $2,500"),
  expense("e4", "Coffee & hospitality restock", "p9", "Hospitality", "general", 186.42, day(7, 24), "approved", true),
  expense("e5", "Van fuel — outreach run", "p10", "Facilities", "missions", 92.15, day(7, 21), "approved", true),
  expense("e6", "Missions travel — Honduras", "p3", "Pastoral", "missions", 1845.6, day(7, 15), "reimbursed", true),
  expense("e7", "Streaming license — annual", "p6", "Media", "general", 59.0, day(7, 12), "reimbursed", true, "Recurring every July"),
  expense("e8", "Family assistance — utilities", "p2", "Care", "benev", 340.0, day(7, 10), "approved", true),
  expense("e9", "Stage lighting gels", "p6", "Media", "building", 128.75, day(7, 9), "denied", false, "No receipt attached after 14 days"),
];

export const DEMO_PAYOUTS = [
  { id: "po_4821", reference: "PO-4821", gross_cents: 631844, fees_cents: 17626, net_cents: 614218, gift_count: 71, paid_at: day(7, 27), arrives_at: day(7, 29) },
  { id: "po_4809", reference: "PO-4809", gross_cents: 502011, fees_cents: 13958, net_cents: 488053, gift_count: 58, paid_at: day(7, 20), arrives_at: day(7, 22) },
  { id: "po_4796", reference: "PO-4796", gross_cents: 751462, fees_cents: 20872, net_cents: 730590, gift_count: 83, paid_at: day(7, 13), arrives_at: day(7, 16) },
  { id: "po_4783", reference: "PO-4783", gross_cents: 536340, fees_cents: 14874, net_cents: 521466, gift_count: 64, paid_at: day(7, 6), arrives_at: day(7, 8) },
  { id: "po_4770", reference: "PO-4770", gross_cents: 936228, fees_cents: 25997, net_cents: 910231, gift_count: 96, paid_at: day(6, 29), arrives_at: day(7, 1) },
];

export const DEMO_BANK = [
  { id: "bk_9941", reference: "9941", description: "STRIPE TRANSFER ST-K7QP", amount_cents: 614218, kind: "stripe", posted_at: day(7, 29) },
  { id: "bk_9938", reference: "9938", description: "Counted offering — cash & checks", amount_cents: 241500, kind: "deposit", posted_at: day(7, 27) },
  { id: "bk_9930", reference: "9930", description: "STRIPE TRANSFER ST-K7BM", amount_cents: 488053, kind: "stripe", posted_at: day(7, 22) },
  { id: "bk_9922", reference: "9922", description: "STRIPE TRANSFER ST-K6XR", amount_cents: 730590, kind: "stripe", posted_at: day(7, 16) },
  { id: "bk_9915", reference: "9915", description: "Facility rental — Vida Nueva", amount_cents: 120000, kind: "other", posted_at: day(7, 14) },
  { id: "bk_9908", reference: "9908", description: "STRIPE TRANSFER ST-K6DJ", amount_cents: 521466, kind: "stripe", posted_at: day(7, 8) },
  { id: "bk_9903", reference: "9903", description: "STRIPE TRANSFER ST-K5WT", amount_cents: 910231, kind: "stripe", posted_at: day(7, 1) },
];

/* One payout already reconciled, so the Matched tab is not empty
   on a fresh clone and Undo has something to undo. */
export const DEMO_MATCHES = [
  { id: "m1", payout_id: "po_4770", bank_transaction_id: "bk_9903", matched_at: `${day(7, 2)}T15:00:00Z` },
];

export const DEMO_LEDGER = [];

export const DEMO_ACTIVITY = [
  { id: "a1", actor: "Marisol Ortega", text: "approved Coffee & hospitality restock — $186.42", at: hoursAgo(0.2) },
  { id: "a2", actor: "Stripe", text: "payout PO-4821 sent to Truist ••4417", at: hoursAgo(1) },
  { id: "a3", actor: "Elias Moreno", text: "submitted Sound board channel repair", at: hoursAgo(3) },
  { id: "a4", actor: "Sam Camacho", text: "reconciled PO-4770 against deposit 9903", at: hoursAgo(26) },
  { id: "a5", actor: "Ana Beltrán", text: "added Noelia Ramírez to the Welcome team", at: hoursAgo(50) },
  { id: "a6", actor: "Daniel Reyes", text: "moved $2,000 from General to Benevolence", at: hoursAgo(74) },
];

export const DEMO_WEEKLY = [
  { w: "Jun 01", v: 7420 }, { w: "Jun 08", v: 6180 }, { w: "Jun 15", v: 9310 },
  { w: "Jun 22", v: 6740 }, { w: "Jun 29", v: 9362 }, { w: "Jul 06", v: 5363 },
  { w: "Jul 13", v: 7515 }, { w: "Jul 20", v: 5020 }, { w: "Jul 27", v: 6318 },
];

/* ------------------------------------------------------------
   Services

   There are no services tables in the Supabase schema, so unlike
   everything above this has no live counterpart yet. The views
   read it through the same store and the badge still reports
   whether the *money* is live — see the note in the Plans view.
   ------------------------------------------------------------ */

export const DEMO_SONGS = [
  { id: "s1", title: "Santo Espíritu", author: "Barak", key: "G", bpm: 72, ccli: "7123456", last_played_at: day(7, 20), play_count: 14 },
  { id: "s2", title: "Way Maker", author: "Sinach", key: "E", bpm: 68, ccli: "7115744", last_played_at: day(7, 13), play_count: 22 },
  { id: "s3", title: "Digno Es El Señor", author: "Marcos Witt", key: "D", bpm: 76, ccli: "3037787", last_played_at: day(6, 29), play_count: 9 },
  { id: "s4", title: "Goodness of God", author: "Bethel Music", key: "Ab", bpm: 63, ccli: "7117726", last_played_at: day(7, 27), play_count: 18 },
  { id: "s5", title: "Renuévame", author: "Marcos Witt", key: "C", bpm: 70, ccli: "2418665", last_played_at: day(5, 18), play_count: 6 },
  { id: "s6", title: "Nada Me Faltará", author: "Living", key: "A", bpm: 74, ccli: "7042168", last_played_at: day(7, 6), play_count: 11 },
];

export const DEMO_TEAMS = [
  { id: "t1", name: "Worship", positions: ["Worship lead", "Acoustic", "Bass", "Drums", "Keys", "Vocals"] },
  { id: "t2", name: "Media", positions: ["Sound", "Lights", "Camera", "Slides", "Stream"] },
  { id: "t3", name: "Kids", positions: ["Kids lead", "Check-in", "Elementary", "Nursery"] },
  { id: "t4", name: "Welcome", positions: ["Greeter", "Usher", "Parking", "Café"] },
];

const plan = (id, title, date, time, items, slots) => ({ id, title, date, time, items, slots });

export const DEMO_PLANS = [
  plan("pl1", "Sunday Morning", day(8, 2), "10:00", [
    { id: "i1", title: "Countdown", kind: "media", minutes: 5 },
    { id: "i2", title: "Santo Espíritu", kind: "song", minutes: 6, song_id: "s1" },
    { id: "i3", title: "Goodness of God", kind: "song", minutes: 7, song_id: "s4" },
    { id: "i4", title: "Welcome & announcements", kind: "talk", minutes: 4 },
    { id: "i5", title: "Offering", kind: "talk", minutes: 3 },
    { id: "i6", title: "Message — Romans 8", kind: "talk", minutes: 34 },
    { id: "i7", title: "Nada Me Faltará", kind: "song", minutes: 6, song_id: "s6" },
    { id: "i8", title: "Dismissal", kind: "talk", minutes: 2 },
  ], [
    { id: "sl1", team_id: "t1", position: "Worship lead", person_id: "p5", status: "accepted" },
    { id: "sl2", team_id: "t1", position: "Keys", person_id: "p4", status: "accepted" },
    { id: "sl3", team_id: "t1", position: "Drums", person_id: null, status: "open" },
    { id: "sl4", team_id: "t2", position: "Sound", person_id: "p6", status: "accepted" },
    { id: "sl5", team_id: "t2", position: "Slides", person_id: "p13", status: "invited" },
    { id: "sl6", team_id: "t2", position: "Stream", person_id: "p1", status: "invited" },
    { id: "sl7", team_id: "t3", position: "Kids lead", person_id: "p7", status: "accepted" },
    { id: "sl8", team_id: "t4", position: "Greeter", person_id: "p12", status: "declined" },
  ]),
  plan("pl2", "Sunday Morning", day(8, 9), "10:00", [
    { id: "j1", title: "Countdown", kind: "media", minutes: 5 },
    { id: "j2", title: "Way Maker", kind: "song", minutes: 7, song_id: "s2" },
    { id: "j3", title: "Digno Es El Señor", kind: "song", minutes: 6, song_id: "s3" },
    { id: "j4", title: "Message — Romans 9", kind: "talk", minutes: 32 },
    { id: "j5", title: "Renuévame", kind: "song", minutes: 5, song_id: "s5" },
  ], [
    { id: "sm1", team_id: "t1", position: "Worship lead", person_id: "p5", status: "invited" },
    { id: "sm2", team_id: "t1", position: "Bass", person_id: null, status: "open" },
    { id: "sm3", team_id: "t2", position: "Sound", person_id: "p6", status: "accepted" },
    { id: "sm4", team_id: "t2", position: "Camera", person_id: null, status: "open" },
    { id: "sm5", team_id: "t3", position: "Nursery", person_id: "p9", status: "invited" },
  ]),
  plan("pl3", "Noche de Jóvenes", day(8, 15), "19:00", [
    { id: "k1", title: "Games", kind: "talk", minutes: 15 },
    { id: "k2", title: "Santo Espíritu", kind: "song", minutes: 6, song_id: "s1" },
    { id: "k3", title: "Message", kind: "talk", minutes: 25 },
  ], [
    { id: "sn1", team_id: "t1", position: "Worship lead", person_id: "p8", status: "accepted" },
    { id: "sn2", team_id: "t2", position: "Sound", person_id: null, status: "open" },
  ]),
];

/**
 * A complete store, shaped exactly as api.js returns it.
 * Deep-cloned so a demo edit in one view is visible in the next
 * without ever leaking back into this module's constants.
 */
export function demoStore() {
  return structuredClone({
    profile: DEMO_ME,
    funds: DEMO_FUNDS,
    people: DEMO_PEOPLE,
    /* Newest first, the way every read in api.js orders them. */
    donations: [...DEMO_DONATIONS].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    recurring: DEMO_RECURRING,
    paymentMethods: DEMO_PAYMENT_METHODS,
    expenses: DEMO_EXPENSES,
    payouts: DEMO_PAYOUTS,
    bankTransactions: DEMO_BANK,
    matches: DEMO_MATCHES,
    ledgerEntries: DEMO_LEDGER,
    activity: DEMO_ACTIVITY,
    weekly: DEMO_WEEKLY,
    songs: DEMO_SONGS,
    teams: DEMO_TEAMS,
    plans: DEMO_PLANS,
  });
}
