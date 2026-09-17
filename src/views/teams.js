/* ============================================================
   Somos Reino — teams
   ------------------------------------------------------------
   Every team and its positions, crossed with the upcoming plans.
   The matrix answers the scheduling question directly: which
   position on which Sunday still has nobody in it.
   ============================================================ */
import { esc, longDate, emptyState, tag } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state, personName } from "../lib/store.js";
import { openSlots } from "./plans.js";

const STATUS_TONE = { accepted: "ok", invited: "wait", declined: "hot", open: "mute" };

export default {
  id: "teams",
  group: "services",
  cap: "serve",
  icon: "M7 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 15c0-2.5 2-4.2 4.5-4.2s4.5 1.7 4.5 4.2M12.5 4.2a2.3 2.3 0 0 1 0 4.4M15.5 15c0-1.9-.9-3.2-2.5-3.8",
  label: () => t("navTeams"),
  crumb: () => t("crumbTeams"),
  title: () => t("navTeams"),
  count: () => state.data.plans.reduce((sum, plan) => sum + openSlots(plan).length, 0),

  render() {
    const { teams, plans } = state.data;
    if (!teams.length) return emptyState(t("noTeams"));

    return `
      <div class="grid">
        <div class="card tbl">
          <div class="card-hd">
            <span class="card-title">${esc(t("scheduleMatrix"))}</span>
            <span class="eyebrow" style="margin-left:auto">${plans.length}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>${esc(t("team"))}</th>
                ${plans.map((plan) => `<th class="ta-r">${esc(longDate(plan.date, lang()))}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${teams.map((team) => matrixRow(team, plans)).join("")}
            </tbody>
          </table>
        </div>

        <div class="duo">
          ${teams.map(teamCard).join("")}
        </div>
      </div>`;
  },
};

function matrixRow(team, plans) {
  return `
    <tr>
      <td><strong>${esc(team.name)}</strong></td>
      ${plans
        .map((plan) => {
          const slots = plan.slots.filter((s) => s.team_id === team.id);
          if (!slots.length) return `<td class="ta-r lead">—</td>`;
          const open = slots.filter((s) => !s.person_id).length;
          const accepted = slots.filter((s) => s.status === "accepted").length;
          return `<td class="ta-r">
            ${open ? tag(t("openSlots", { n: open }), "hot") : tag(t("allSet", { a: accepted, b: slots.length }), "ok")}
          </td>`;
        })
        .join("")}
    </tr>`;
}

function teamCard(team) {
  /* Who has actually served this team across the loaded plans —
     a position with nobody in it anywhere is worth seeing. */
  const assignments = state.data.plans.flatMap((plan) => plan.slots.filter((s) => s.team_id === team.id));

  return `
    <div class="card">
      <div class="card-hd">
        <span class="card-title">${esc(team.name)}</span>
        <span class="eyebrow" style="margin-left:auto">${team.positions.length}</span>
      </div>
      <div class="card-bd">
        ${team.positions
          .map((position) => {
            const filled = assignments.filter((s) => s.position === position && s.person_id);
            const names = [...new Set(filled.map((s) => personName(s.person_id)))];
            const status = filled.length ? filled[0].status : "open";
            return `
              <div class="slot">
                <span style="min-width:0">
                  <span style="font-weight:600;display:block;font-size:13px">${esc(position)}</span>
                  <span class="lead" style="font-size:11.5px">${esc(names.join(", ") || t("openSpot"))}</span>
                </span>
                <span style="margin-left:auto">${tag(t(names.length ? "scheduled" : "openSpot"), STATUS_TONE[status] || "mute")}</span>
              </div>`;
          })
          .join("")}
      </div>
    </div>`;
}
