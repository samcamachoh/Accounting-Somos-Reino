/* ============================================================
   Somos Reino — live
   ------------------------------------------------------------
   A running clock against the plan, for whoever is calling the
   service from the back. It answers one question, loudly: are
   we ahead or behind, and by how much.

   The interval is owned by mount() and cleared before the next
   one starts, so routing away from this view does not leave a
   timer running against a screen nobody is looking at.
   ============================================================ */
import { esc, emptyState } from "../lib/ui.js";
import { t } from "../lib/i18n.js";
import { state, planById, songById, notify } from "../lib/store.js";
import { planMinutes } from "./plans.js";

const ui = () => {
  state.ui.live ??= { planId: null, startedAt: null, index: 0 };
  return state.ui.live;
};

const currentPlan = () => planById(ui().planId) || state.data.plans[0] || null;

/* One interval for the whole view, held at module scope so a
   re-render cannot start a second one. */
let ticker = null;

const stopTicker = () => {
  clearInterval(ticker);
  ticker = null;
};

const elapsedSeconds = () => {
  const { startedAt } = ui();
  return startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
};

const clockText = (seconds) => {
  const sign = seconds < 0 ? "-" : "";
  const total = Math.abs(seconds);
  return `${sign}${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export default {
  id: "live",
  group: "services",
  cap: "serve",
  icon: "M9 3v12M5 6v6M13 6v6M2.5 8v2M15.5 8v2",
  label: () => t("navLive"),
  crumb: () => t("crumbLive"),
  title: () => t("navLive"),

  render() {
    const plan = currentPlan();
    if (!plan) return emptyState(t("noPlans"));
    if (!ui().planId) ui().planId = plan.id;

    const live = ui();
    const running = Boolean(live.startedAt);
    /* Where the plan says we should be by now, versus where we are. */
    const plannedSeconds = plan.items.slice(0, live.index).reduce((sum, item) => sum + item.minutes * 60, 0);
    const drift = running ? elapsedSeconds() - plannedSeconds : 0;

    return `
      <div class="side">
        <div class="stack">
          <div class="card">
            <div class="card-bd" style="text-align:center;padding:28px 20px">
              <div class="eyebrow">${esc(plan.title)} · ${esc(plan.time)}</div>
              <div class="clock" id="liveClock">${clockText(elapsedSeconds())}</div>
              <div class="lead" id="liveDrift" style="margin-top:4px;color:${drift > 60 ? "var(--coral-deep)" : "var(--sage)"}">
                ${running ? esc(driftLabel(drift)) : esc(t("runningTime"))} · ${planMinutes(plan)}m
              </div>
              <div class="row" style="justify-content:center;margin-top:18px">
                ${
                  running
                    ? `<button class="btn" data-act="live:stop">${esc(t("stopService"))}</button>
                       <button class="btn btn-primary" data-act="live:next">${esc(t("nextItem"))}</button>`
                    : `<button class="btn btn-primary btn-lg" data-act="live:start">${esc(t("startService"))}</button>`
                }
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-hd"><span class="card-title">${esc(t("orderOfService"))}</span></div>
            ${plan.items
              .map((item, index) => {
                const done = running && index < live.index;
                const now = running && index === live.index;
                return `
                  <div class="plan-item" style="${now ? "background:var(--coral-wash)" : done ? "opacity:.45" : ""}">
                    <span class="plan-pos num">${index + 1}</span>
                    <span style="min-width:0">
                      <span style="font-weight:${now ? 700 : 600};display:block">${esc(item.title)}</span>
                      ${songMeta(item)}
                    </span>
                    <span class="plan-len">${item.minutes}m</span>
                  </div>`;
              })
              .join("")}
          </div>
        </div>

        <div class="stack">
          <div class="pills">
            ${state.data.plans
              .map(
                (p) => `<button class="pill" data-act="live:pick" data-id="${esc(p.id)}" aria-pressed="${p.id === plan.id}">
                  ${esc(p.title)}
                </button>`,
              )
              .join("")}
          </div>
        </div>
      </div>`;
  },

  /* The clock updates in place once a second; re-rendering the
     whole view at 1 Hz would fight every click on the page. */
  mount() {
    stopTicker();
    if (!ui().startedAt) return;

    ticker = setInterval(() => {
      const clock = document.getElementById("liveClock");
      if (!clock) return stopTicker();

      const plan = currentPlan();
      const plannedSeconds = plan.items.slice(0, ui().index).reduce((sum, item) => sum + item.minutes * 60, 0);
      const drift = elapsedSeconds() - plannedSeconds;

      clock.textContent = clockText(elapsedSeconds());
      const label = document.getElementById("liveDrift");
      if (label) {
        label.textContent = `${driftLabel(drift)} · ${planMinutes(plan)}m`;
        label.style.color = drift > 60 ? "var(--coral-deep)" : "var(--sage)";
      }
    }, 1000);
  },

  handlers: {
    "live:pick": ({ id }) => {
      stopTicker();
      Object.assign(ui(), { planId: id, startedAt: null, index: 0 });
      notify();
    },
    "live:start": () => {
      Object.assign(ui(), { startedAt: Date.now(), index: 0 });
      notify();
    },
    "live:stop": () => {
      stopTicker();
      Object.assign(ui(), { startedAt: null, index: 0 });
      notify();
    },
    "live:next": () => {
      const plan = currentPlan();
      ui().index = Math.min(ui().index + 1, plan.items.length - 1);
      notify();
    },
  },
};

function driftLabel(drift) {
  if (Math.abs(drift) < 30) return t("onTime");
  return drift > 0 ? t("runningLong", { t: clockText(drift) }) : t("runningShort", { t: clockText(-drift) });
}

function songMeta(item) {
  if (item.kind !== "song") return "";
  const song = songById(item.song_id);
  if (!song) return "";
  return `<span class="lead" style="font-size:11.5px">${esc(t("songKey"))} ${esc(song.key)} · ${song.bpm} BPM</span>`;
}
