/* Sign-in UI and Supabase connection. Data merging lives in sync.js. */
const WaypointCloud = (() => {
  function create({ initial, onData, onSignedOut }) {
    const config = window.WAYPOINT_CONFIG || {};
    const root = document.getElementById("cloud-root");
    const panel = document.getElementById("cloud-panel");
    const escape = (value) =>
      String(value ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    let user = null,
      state = { state: "signed-out", message: "Local only · Sign in to sync" },
      engine,
      client,
      timer;
    let authBusy = false,
      panelOpen = false,
      recovery = false;
    const configured =
      /^https:\/\/[^/]+$/.test(config.supabaseUrl || "") &&
      !!config.supabasePublishableKey;
    function renderStatus() {
      root.innerHTML = `<div class="cloud-bar"><span role="status" aria-live="polite">${escape(state.message)}</span><button class="btn small" data-cloud-action="account">${user ? "Account & sync" : configured ? "Sign in" : "Cloud setup"}</button></div>`;
      if (panelOpen && !authBusy) renderPanel();
    }
    function message(text) {
      const element = document.getElementById("cloud-message");
      if (element) element.textContent = text;
    }
    function renderPanel() {
      panelOpen = true;
      let content;
      if (!configured) {
        content = `<p>Cloud sync needs a Supabase project. Follow <a href="./CLOUD_SETUP.md" target="_blank" rel="noopener">the setup guide</a>, then reload this page.</p>`;
      } else if (user && !recovery) {
        content = `<p>Signed in as <strong>${escape(user.email)}</strong></p><p>${escape(state.message)}</p>
          ${state.state === "conflict" ? `<div class="notice"><p>Two devices changed the same item. Other changes will be combined. For competing edits (including a deletion), choose which device's version to keep:</p><button class="btn" data-cloud-action="local">Keep this device's conflicting edits</button> <button class="btn" data-cloud-action="cloud">Keep cloud's conflicting edits</button></div>` : ""}
          <div class="actions"><button class="btn primary" data-cloud-action="sync">Sync now</button><button class="btn" data-cloud-action="signout">Sign out</button></div>`;
      } else {
        content = `<form id="cloud-auth-form" class="cloud-form">
          ${recovery ? "" : '<label for="cloud-email">Email</label><input id="cloud-email" class="field" type="email" name="email" autocomplete="email" required>'}
          <label for="cloud-password">${recovery ? "New password" : "Password"}</label><input id="cloud-password" class="field" name="password" type="password" minlength="8" autocomplete="${recovery ? "new-password" : "current-password"}" required>
          <div class="actions"><button class="btn primary" type="submit">${recovery ? "Save new password" : "Sign in"}</button>${recovery ? "" : '<button class="btn" type="button" data-cloud-action="signup">Create account</button><button class="btn ghost" type="button" data-cloud-action="reset">Forgot password?</button>'}</div>
          </form><p class="hint">Use the same account on your phone and computer. Existing local-only tasks are kept separate; your cloud account starts fresh.</p>`;
      }
      panel.innerHTML = `<div class="dialog-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-title"><div class="section-head"><h2 id="cloud-title">Cloud sync</h2><button class="btn small" data-cloud-action="close">Close</button></div>${content}<p id="cloud-message" class="hint" role="status" aria-live="polite"></p></section></div>`;
    }
    async function auth(action) {
      if (authBusy) return;
      const form = document.getElementById("cloud-auth-form");
      if (!form) return;
      const email = form.elements.email?.value.trim();
      const password = form.elements.password.value;
      if (action === "reset") {
        if (!form.elements.email.reportValidity()) return;
      } else if (!form.reportValidity()) return;
      authBusy = true;
      form
        .querySelectorAll("button")
        .forEach((button) => (button.disabled = true));
      message("Connecting…");
      try {
        const redirectTo = location.origin + location.pathname;
        const result =
          action === "reset"
            ? await client.auth.resetPasswordForEmail(email, { redirectTo })
            : recovery
              ? await client.auth.updateUser({ password })
              : action === "signup"
                ? await client.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: redirectTo },
                  })
                : await client.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (action === "reset")
          message(
            "If an account exists, a password reset email is on its way.",
          );
        else if (action === "signup" && !result.data.session)
          message(
            "Check your email to confirm your account, then return here and sign in.",
          );
        else {
          recovery = false;
          panelOpen = false;
          panel.innerHTML = "";
        }
      } catch (error) {
        message(error.message || "Unable to sign in. Try again.");
      } finally {
        authBusy = false;
        form
          .querySelectorAll("button")
          .forEach((button) => (button.disabled = false));
      }
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => engine?.sync(), 600);
    }
    document.addEventListener("submit", (event) => {
      if (event.target.id === "cloud-auth-form") {
        event.preventDefault();
        auth("signin");
      }
    });
    document.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-cloud-action]")?.dataset
        .cloudAction;
      if (!action) return;
      try {
        if (action === "account") renderPanel();
        if (action === "close" && !authBusy) {
          panelOpen = false;
          panel.innerHTML = "";
        }
        if (action === "signup" || action === "reset") await auth(action);
        if (action === "sync") await engine.sync();
        if (action === "local" || action === "cloud")
          await engine.resolve(action);
        if (action === "signout") {
          const result = await client.auth.signOut({ scope: "local" });
          if (result.error) throw result.error;
        }
      } catch (error) {
        message(error.message || "Please try again.");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !authBusy) {
        panelOpen = false;
        panel.innerHTML = "";
      }
    });
    renderStatus();
    if (configured) {
      try {
        if (config.supabasePublishableKey.startsWith("sb_secret_"))
          throw Error("Use a publishable key, never a secret key.");
        if (config.supabasePublishableKey.split(".").length === 3) {
          const payload = JSON.parse(
            atob(
              config.supabasePublishableKey
                .split(".")[1]
                .replace(/-/g, "+")
                .replace(/_/g, "/"),
            ),
          );
          if (payload.role !== "anon")
            throw Error(
              "Use a publishable or anon key, never a service_role key.",
            );
        }
        client = window.supabase.createClient(
          config.supabaseUrl,
          config.supabasePublishableKey,
        );
        engine = WaypointSync.create({
          client,
          storage: localStorage,
          namespace: config.supabaseUrl,
          initial,
          onData,
          online: () => navigator.onLine !== false,
          onStatus: (next) => {
            state = next;
            renderStatus();
          },
        });
        client.auth.onAuthStateChange((event, session) => {
          // Run outside Supabase's auth callback lock.
          setTimeout(() => {
            try {
              const next = session?.user || null;
              const changed = user?.id !== next?.id;
              if (changed && next) onData(initial());
              user = next;
              engine.setUser(next);
              if (changed && !next) onSignedOut();
              if (event === "PASSWORD_RECOVERY") {
                recovery = true;
                renderPanel();
              }
              if (next) schedule();
            } catch (error) {
              state = { state: "error", message: error.message };
              renderStatus();
            }
          }, 0);
        });
        setInterval(() => {
          if (!document.hidden) engine.sync();
        }, 15000);
        window.addEventListener("online", schedule);
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) schedule();
        });
      } catch (error) {
        state = { state: "error", message: error.message };
        renderStatus();
      }
    } else {
      state.message = "Local only · Cloud setup needed";
      renderStatus();
    }
    return {
      get signedIn() {
        return !!user;
      },
      change(data) {
        engine.change(data);
        schedule();
      },
    };
  }
  return { create };
})();
