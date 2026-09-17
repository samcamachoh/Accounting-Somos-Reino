/* ============================================================
   Somos Reino — the view registry
   ------------------------------------------------------------
   Every screen in the portal is one module exporting one object:

     id         the route, as it appears after #/ in the address
     group      which heading it sits under in the rail
     cap        the capability it requires (see access.js)
     label()    its name in the rail, in the current language
     crumb()    the line above the title
     title()    the heading
     icon       a 18x18 stroked path
     render()   the view's HTML, as a string
     actions()  optional buttons for the top bar
     count()    optional badge for the rail
     handlers   data-act name -> function, wired by the router
     mount()    optional, runs after the HTML lands in the DOM

   Adding a screen is adding a module and a line here. Nothing
   else in the app needs to know it exists — the rail, the router
   and the access check all read this list.
   ============================================================ */
import account from "./account.js";
import give from "./give.js";
import history from "./history.js";
import recurring from "./recurring.js";
import today from "./today.js";
import reconcile from "./reconcile.js";
import expenses from "./expenses.js";
import giving from "./giving.js";
import people from "./people.js";
import funds from "./funds.js";
import plans from "./plans.js";
import teams from "./teams.js";
import songs from "./songs.js";
import live from "./live.js";
import accounts from "./accounts.js";

/* Order is rail order. Groups appear in the order their first
   view does, which is why Me comes before Money. */
export const VIEWS = [
  account, give, history, recurring,
  today, reconcile, expenses, giving,
  plans, teams, songs, live,
  people, funds, accounts,
];

export const GROUPS = ["me", "money", "services", "church"];

/** The label key for a group heading. */
export const groupLabel = {
  me: "groupMe",
  money: "groupMoney",
  services: "groupServices",
  church: "groupChurch",
};

export const viewById = (id) => VIEWS.find((v) => v.id === id) || null;

/** The views this person may open, in rail order. */
export const viewsFor = (caps) => VIEWS.filter((v) => !v.cap || caps.has(v.cap));

/**
 * Where to land someone who has not asked for anywhere in
 * particular: the first view they can open. A treasurer starts on
 * Today, a member on their account.
 */
export function defaultView(caps) {
  if (caps.has("finance")) return "today";
  const first = viewsFor(caps)[0];
  return first ? first.id : "account";
}
