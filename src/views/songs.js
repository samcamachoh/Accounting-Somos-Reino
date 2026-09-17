/* ============================================================
   Somos Reino — the song library
   ------------------------------------------------------------
   Keys, tempos, CCLI numbers, and when each song was last used.
   That last column is what stops a set from repeating itself
   three weeks running, so the table sorts by it.
   ============================================================ */
import { esc, shortDate, emptyState, tag } from "../lib/ui.js";
import { t, lang } from "../lib/i18n.js";
import { state } from "../lib/store.js";

const ui = () => {
  state.ui.songs ??= { query: "" };
  return state.ui.songs;
};

function visible() {
  const needle = ui().query.trim().toLowerCase();
  const songs = [...state.data.songs].sort((a, b) => String(b.last_played_at).localeCompare(String(a.last_played_at)));
  if (!needle) return songs;
  return songs.filter((song) => `${song.title} ${song.author} ${song.ccli}`.toLowerCase().includes(needle));
}

/** Songs used in the loaded plans, for the CCLI reporting column. */
const planCount = (songId) =>
  state.data.plans.reduce((sum, plan) => sum + plan.items.filter((item) => item.song_id === songId).length, 0);

export default {
  id: "songs",
  group: "services",
  cap: "serve",
  icon: "M6.5 13.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8.5 11.5V3.5l6-1.2v8",
  label: () => t("navSongs"),
  crumb: () => t("crumbSongs"),
  title: () => t("navSongs"),

  render() {
    return `
      <div class="grid">
        <input class="input" style="max-width:340px" type="search" value="${esc(ui().query)}"
               placeholder="${esc(t("search"))}" aria-label="${esc(t("search"))}" data-act-input="songs:search">

        <div class="card tbl" id="songTable">${tableMarkup()}</div>
      </div>`;
  },

  handlers: {
    "songs:search": ({ value }) => {
      ui().query = value;
      /* Repaint the table only. A full re-render would take the
         focus out of the search box mid-word. */
      const table = document.getElementById("songTable");
      if (table) table.innerHTML = tableMarkup();
    },
  },
};

function tableMarkup() {
  const songs = visible();
  if (!songs.length) return emptyState(t("noSongs"));

  return `
    <table>
      <thead>
        <tr>
          <th>${esc(t("navSongs"))}</th>
          <th>${esc(t("songKey"))}</th>
          <th>BPM</th>
          <th>CCLI</th>
          <th>${esc(t("lastPlayed"))}</th>
          <th class="ta-r">${esc(t("plays"))}</th>
        </tr>
      </thead>
      <tbody>
        ${songs
          .map(
            (song) => `
          <tr>
            <td>
              <div style="font-weight:600">${esc(song.title)}</div>
              <div class="lead" style="font-size:11.5px">${esc(song.author)}</div>
            </td>
            <td>${tag(song.key, "mute")}</td>
            <td class="num">${song.bpm}</td>
            <td class="num" style="color:var(--text-2)">${esc(song.ccli)}</td>
            <td class="num" style="font-size:12px;color:var(--text-2)">${esc(shortDate(song.last_played_at, lang()))}</td>
            <td class="ta-r num">${song.play_count}${planCount(song.id) ? ` <span class="lead">(+${planCount(song.id)})</span>` : ""}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}
