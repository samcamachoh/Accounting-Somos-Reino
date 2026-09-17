/* ============================================================
   Somos Reino — service plans
   ------------------------------------------------------------
   The order of service, its running time, and who is on it.
   Everyone with an account lands here to answer one question —
   am I on this — so their own invitations sit at the top, above
   the plan itself.

   There are no services tables in Supabase yet, so this section
   reads demo.js in both modes and says so on screen rather than
   letting the badge imply the schedule is real.
   ============================================================ */
import { esc, longDate, avatar, emptyState, tag, toast } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state, planById, personName, songById, teamById, setSlotStatus, notify } from "../lib/store.js";

const STATUS_TONE = { accepted: "ok", invited: "wait", declined: "hot", open: "mute" };
const STATUS_LABEL = { accepted: "accepted", invited: "invited", declined: "declined", open: "openSpot" };

const ui = () => {
  state.ui.plans ??= { planId: null };
  return state.ui.plans;
};

const currentPlan = () => planById(ui().planId) || state.data.plans[0] || null;

export const openSlots = (plan) => plan.slots.filter((s) => s.status === "open" || !s.person_id);
export const planMinutes = (plan) => plan.items.reduce((sum, item) => sum + (item.minutes || 0), 0);

/** Slots inviting the signed-in person that they haven't answered. */
export const myInvitations = () =>
  state.data.plans.flatMap((plan) =>
    plan.slots.filter((slot) => slot.person_id === state.profile?.id && slot.status === "invited").map((slot) => ({ plan, slot })),
  );

export default {
  id: "plans",
  group: "services",
  cap: "serve",
  icon: "M4 3h10v12H4zM6.5 6.5h5M6.5 9.5h5M6.5 12.5h3",
  label: () => t("navPlans"),
  crumb: () => t("crumbPlans"),
  title: () => t("navPlans"),
  count: () => myInvitations().length,

  render() {
    const plans = state.data.plans;
    if (!plans.length) return emptyState(t("noPlans"));

    const plan = currentPlan();
    if (plan && !ui().planId) ui().planId = plan.id;
    const invitations = myInvitations();

    return `
      <div class="grid">
        <div class="banner">${esc(t("servicesDemoNote"))}</div>

        ${invitations.length ? invitationCard(invitations) : ""}

        <div class="pills">
          ${plans
            .map(
              (p) => `<button class="pill" data-act="plans:pick" data-id="${esc(p.id)}" aria-pressed="${p.id === plan.id}">
                ${esc(p.title)} · ${esc(longDate(p.date, lang()))}
                ${openSlots(p).length ? `<span class="c">${openSlots(p).length}</span>` : ""}
              </button>`,
            )
            .join("")}
        </div>

        <div class="side">
          <div class="card">
            <div class="card-hd">
              <span class="card-title">${esc(t("orderOfService"))}</span>
              <span class="eyebrow" style="margin-left:auto">${esc(t("runningTime"))} ${planMinutes(plan)}m</span>
            </div>
            ${plan.items
              .map(
                (item, index) => `
              <div class="plan-item">
                <span class="plan-pos num">${index + 1}</span>
                <span style="min-width:0">
                  <span style="font-weight:600;display:block">${esc(item.title)}</span>
                  ${songItemMeta(item)}
                </span>
                <span class="plan-len">${item.minutes}m</span>
              </div>`,
              )
              .join("")}
          </div>

          <div class="card">
            <div class="card-hd">
              <span class="card-title">${esc(t("navTeams"))}</span>
              <span class="eyebrow" style="margin-left:auto">
                ${openSlots(plan).length ? esc(t("openSlots", { n: openSlots(plan).length })) : esc(t("noOpenSlots"))}
              </span>
            </div>
            <div class="card-bd">
              ${plan.slots.map(slotRow).join("")}
            </div>
          </div>
        </div>
      </div>`;
  },

  handlers: {
    "plans:pick": ({ id }) => { ui().planId = id; notify(); },

    "plans:respond": ({ plan, slot, status }) => {
      setSlotStatus(plan, slot, status);
      toast(t(status === "accepted" ? "accepted" : "declined"));
    },
  },
};

function songItemMeta(item) {
  if (item.kind !== "song") return "";
  const song = songById(item.song_id);
  if (!song) return "";
  return `<span class="lead" style="font-size:11.5px">${esc(song.author)} · ${esc(t("songKey"))} ${esc(song.key)} · ${song.bpm} BPM</span>`;
}

function slotRow(slot) {
  const team = teamById(slot.team_id);
  const filled = Boolean(slot.person_id);
  const status = filled ? slot.status : "open";

  return `
    <div class="slot">
      ${filled ? avatar(personName(slot.person_id)) : `<span class="avatar" style="background:var(--line);color:var(--text-3)" aria-hidden="true">?</span>`}
      <span style="min-width:0">
        <span style="font-weight:600;display:block;font-size:13px">${esc(filled ? personName(slot.person_id) : t("openSpot"))}</span>
        <span class="lead" style="font-size:11.5px">${esc(team?.name || "")} · ${esc(slot.position)}</span>
      </span>
      <span style="margin-left:auto">${tag(t(STATUS_LABEL[status]), STATUS_TONE[status])}</span>
    </div>`;
}

function invitationCard(invitations) {
  return `
    <div class="card">
      <div class="card-hd"><span class="card-title">${esc(t("myRequests"))}</span></div>
      <div class="card-bd">
        ${invitations
          .map(
            ({ plan, slot }) => `
          <div class="slot">
            <span style="min-width:0">
              <span style="font-weight:600;display:block;font-size:13px">${esc(plan.title)} · ${esc(longDate(plan.date, lang()))}</span>
              <span class="lead" style="font-size:11.5px">${esc(teamById(slot.team_id)?.name || "")} · ${esc(slot.position)}</span>
            </span>
            <span class="row" style="margin-left:auto;flex-wrap:nowrap">
              <button class="btn btn-sm btn-ghost" data-act="plans:respond"
                      data-plan="${esc(plan.id)}" data-slot="${esc(slot.id)}" data-status="declined">${esc(t("decline"))}</button>
              <button class="btn btn-sm btn-primary" data-act="plans:respond"
                      data-plan="${esc(plan.id)}" data-slot="${esc(slot.id)}" data-status="accepted">${esc(t("accept"))}</button>
            </span>
          </div>`,
          )
          .join("")}
      </div>
    </div>`;
}
