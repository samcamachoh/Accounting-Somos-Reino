/* ============================================================
   Somos Reino — sign in
   ------------------------------------------------------------
   The one screen that renders without a rail: there is nothing
   to navigate to until we know who this is.

   It carries three flows — password, one-time link, and choosing
   a new password after a reset — because they are the same form
   with a different button, and splitting them across pages is
   what made signing in feel like leaving.
   ============================================================ */
import { esc, $, toast } from "../lib/ui.js";
import { t } from "../lib/i18n.js";
import { signInWithPassword, sendMagicLink, requestPasswordReset, updateMyPassword } from "../lib/auth.js";

/* Which form is showing. Not in the store: it is worth exactly
   as much as this screen and dies with it. */
let flow = "password";
let busy = false;

const setBusy = (value) => {
  busy = value;
  const button = $("#signinSubmit");
  if (button) button.disabled = value;
};

const emailValue = () => $("#signinEmail")?.value.trim() || "";
const passwordValue = () => $("#signinPassword")?.value || "";

function card(body) {
  return `
    <div class="signin">
      <div class="signin-card">
        <div class="row" style="gap:9px">
          <svg viewBox="0 0 3000 3000" style="width:26px;height:26px;fill:var(--coral)" aria-hidden="true"><use href="#mark"/></svg>
          <span class="brand-name">${esc(t("appName"))}</span>
        </div>
        ${body}
      </div>
    </div>
    <div id="toast" role="status" aria-live="polite"></div>`;
}

/** Choosing a new password after following a reset link. */
function recoveryForm() {
  return card(`
    <h1>${esc(t("choosePassword"))}</h1>
    <form data-act="signin:recover" style="display:grid;gap:13px;margin-top:18px">
      <div class="field">
        <label for="signinPassword">${esc(t("newPassword"))}</label>
        <input class="input" id="signinPassword" type="password" autocomplete="new-password" minlength="8" required>
      </div>
      <button class="btn btn-primary btn-lg btn-block" id="signinSubmit" type="submit">${esc(t("savePassword"))}</button>
    </form>`);
}

function signInForm() {
  const linkOnly = flow === "magic";
  const resetting = flow === "reset";

  const submitLabel = resetting ? t("sendReset") : linkOnly ? t("magicLink") : t("signInBtn");
  const action = resetting ? "signin:reset" : linkOnly ? "signin:magic" : "signin:password";

  return card(`
    <h1>${esc(t("signInTitle"))}</h1>
    <p class="lead" style="margin-top:6px">${esc(t("signInLead"))}</p>

    <form data-act="${action}" style="display:grid;gap:13px;margin-top:20px">
      <div class="field">
        <label for="signinEmail">${esc(t("email"))}</label>
        <input class="input" id="signinEmail" type="email" autocomplete="email" required>
      </div>
      ${
        linkOnly || resetting
          ? ""
          : `<div class="field">
              <label for="signinPassword">${esc(t("password"))}</label>
              <input class="input" id="signinPassword" type="password" autocomplete="current-password" required>
            </div>`
      }
      <button class="btn btn-primary btn-lg btn-block" id="signinSubmit" type="submit">${esc(submitLabel)}</button>
    </form>

    <div style="display:grid;gap:8px;margin-top:18px;justify-items:start">
      ${
        resetting
          ? `<button class="btn btn-ghost btn-sm" data-act="signin:flow" data-flow="password" style="padding-left:0">${esc(t("backToSignIn"))}</button>`
          : `
            <button class="btn btn-ghost btn-sm" data-act="signin:flow" data-flow="${linkOnly ? "password" : "magic"}" style="padding-left:0">
              ${esc(linkOnly ? t("signInTitle") : t("magicLink"))}
            </button>
            <button class="btn btn-ghost btn-sm" data-act="signin:flow" data-flow="reset" style="padding-left:0">${esc(t("forgot"))}</button>`
      }
    </div>`);
}

export default {
  id: "signin",

  /** The whole document body, rail and all — there isn't one. */
  shell(ctx, modal) {
    return modal?.kind === "recovery" ? recoveryForm() : signInForm();
  },

  mount() {
    $("#signinEmail")?.focus();
  },

  handlers: {
    "signin:flow": ({ flow: next }) => {
      flow = next;
      document.body.innerHTML = signInForm();
      $("#signinEmail")?.focus();
    },

    "signin:password": async () => {
      if (busy) return;
      setBusy(true);
      try {
        await signInWithPassword(emailValue(), passwordValue());
        /* onAuthChange in app.js re-boots into the portal. */
      } finally {
        setBusy(false);
      }
    },

    "signin:magic": async () => {
      if (busy) return;
      setBusy(true);
      try {
        await sendMagicLink(emailValue());
        toast(t("magicSent"));
      } finally {
        setBusy(false);
      }
    },

    "signin:reset": async () => {
      if (busy) return;
      setBusy(true);
      try {
        await requestPasswordReset(emailValue());
        toast(t("resetSent"));
        flow = "password";
      } finally {
        setBusy(false);
      }
    },

    "signin:recover": async () => {
      if (busy) return;
      setBusy(true);
      try {
        await updateMyPassword(passwordValue());
        toast(t("passwordSaved"));
        /* Drop the recovery fragment so a refresh doesn't reopen
           this form with a spent link. */
        window.location.replace(window.location.origin);
      } finally {
        setBusy(false);
      }
    },
  },
};
