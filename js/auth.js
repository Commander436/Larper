/*
 * Credentials are sent only to the Worker. Passwords and session tokens are
 * never written to browser storage; only the Worker-issued HttpOnly cookie persists.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const paneRole = $("pane-role");
  const paneForm = $("pane-form");
  const loginForm = $("login-form");
  const loginUsername = $("login-username");
  const loginPassword = $("login-password");
  const loginError = $("login-error");
  const loginSubmit = $("login-submit");
  const form = $("auth-form");
  const displayName = $("display-name");
  const username = $("auth-username");
  const password = $("auth-password");
  const passwordConfirm = $("auth-password-confirm");
  const errorEl = $("auth-error");
  const submit = $("auth-submit");
  const secureSignIn = $("secure-sign-in");
  const authNotice = $("auth-notice");
  let selectedRole = null;
  let usernamePasswordEnabled = false;
  let cloudflareAccessEnabled = false;
  let providerIdentity = null;
  const API = (window.TFW_API_URL || "").replace(/\/$/, "");
  const api = (path) => `${API}${path}`;

  function show(pane) {
    paneRole.classList.toggle("hidden", pane !== "role");
    paneForm.classList.toggle("hidden", pane !== "form");
    errorEl.textContent = "";
  }

  function localProfileKey(userId) {
    return `tfw_account_profile:${encodeURIComponent(userId)}`;
  }

  function loadSavedProfile(identity, role) {
    if (!identity || typeof identity.id !== "string" || !identity.id) return null;
    try {
      const saved = JSON.parse(localStorage.getItem(localProfileKey(identity.id)) || "null");
      if (!saved || saved.id !== identity.id || saved.complete !== true ||
          (role && saved.role !== role) || !["mentor", "mentee"].includes(saved.role)) return null;
      return saved;
    } catch (error) {
      return null;
    }
  }

  function startAuthenticatedSession(identity, provider, role) {
    const activeRole = identity.role || role;
    if (provider === "username-password" && !["mentor", "mentee"].includes(activeRole)) {
      loginError.textContent = "This account is missing a profile role. Contact support.";
      return;
    }
    if (!["mentor", "mentee"].includes(activeRole)) {
      providerIdentity = identity;
      authNotice.textContent = `Signed in securely as ${identity.name}. Choose a role to set up your profile.`;
      secureSignIn.disabled = true;
      secureSignIn.textContent = "Signed in with Cloudflare Access";
      return;
    }

    const savedProfile = loadSavedProfile(identity, activeRole);
    const profile = savedProfile || {
      id: identity.id,
      name: identity.name,
      role: activeRole,
      step: 0,
      topics: [],
      title: "",
      lessons: "",
      about: "",
      photo: "",
      location: { publicPlace: false, travel: false, online: false, miles: "" },
      complete: false,
    };
    profile.id = identity.id;
    profile.name = identity.name;
    profile.role = activeRole;
    try {
      sessionStorage.setItem("tfw_session", JSON.stringify({
        authenticated: true,
        preview: false,
        authProvider: provider,
        userId: identity.id,
        username: identity.username || null,
        displayName: identity.name,
        role: activeRole,
      }));
      sessionStorage.setItem("tfw_profile", JSON.stringify(profile));
    } catch (error) {
      loginError.textContent = "This browser cannot save your session. Check storage settings and try again.";
      return;
    }
    window.location.href = profile.complete ? "profile.html" : "onboarding.html";
  }

  function startLocalPreview(name) {
    if (name.length < 2 || name.length > 40) {
      errorEl.textContent = "Enter a name between 2 and 40 characters.";
      displayName.focus();
      return;
    }
    try {
      sessionStorage.setItem("tfw_session", JSON.stringify({
        displayName: name,
        role: selectedRole,
        preview: true,
      }));
      sessionStorage.setItem("tfw_profile", JSON.stringify({
        name,
        role: selectedRole,
        step: 0,
        complete: false,
      }));
    } catch (error) {
      errorEl.textContent = "This browser can't save the preview. Check your storage settings and try again.";
      return;
    }
    window.location.href = "onboarding.html";
  }

  async function sendCredentials(path, body) {
    const response = await fetch(api(path), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Account request failed (${response.status}).`);
    if (!data.identity || typeof data.identity.id !== "string" || typeof data.identity.name !== "string") {
      throw new Error("The account service returned an invalid session.");
    }
    return data.identity;
  }

  async function signInWithPassword(event) {
    event.preventDefault();
    loginError.textContent = "";
    if (!usernamePasswordEnabled) {
      loginError.textContent = "Username and password sign-in is unavailable until account storage is configured.";
      return;
    }
    const usernameValue = loginUsername.value.trim().toLowerCase();
    const passwordValue = loginPassword.value;
    if (!/^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/.test(usernameValue)) {
      loginError.textContent = "Enter a valid 3–32 character username.";
      loginUsername.focus();
      return;
    }
    if (!passwordValue || passwordValue.length > 128) {
      loginError.textContent = "Enter your password.";
      loginPassword.focus();
      return;
    }

    loginSubmit.disabled = true;
    try {
      const identity = await sendCredentials("/api/auth/login", { username: usernameValue, password: passwordValue });
      startAuthenticatedSession(identity, "username-password");
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      loginPassword.value = "";
      loginSubmit.disabled = false;
    }
  }

  async function signUp(event) {
    event.preventDefault();
    errorEl.textContent = "";
    if (!usernamePasswordEnabled) {
      errorEl.textContent = "Account storage is unavailable. You can continue with a local preview.";
      return;
    }
    const name = displayName.value.trim();
    const usernameValue = username.value.trim().toLowerCase();
    const passwordValue = password.value;
    if (name.length < 2 || name.length > 40) {
      errorEl.textContent = "Enter a display name between 2 and 40 characters.";
      displayName.focus();
      return;
    }
    if (!/^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/.test(usernameValue)) {
      errorEl.textContent = "Use a 3–32 character username with letters, numbers, dots, underscores, or hyphens.";
      username.focus();
      return;
    }
    if (passwordValue.length < 12 || passwordValue.length > 128) {
      errorEl.textContent = "Use a password between 12 and 128 characters.";
      password.focus();
      return;
    }
    if (passwordValue !== passwordConfirm.value) {
      errorEl.textContent = "The passwords do not match.";
      passwordConfirm.focus();
      return;
    }

    submit.disabled = true;
    try {
      const identity = await sendCredentials("/api/auth/register", {
        username: usernameValue,
        password: passwordValue,
        display_name: name,
        role: selectedRole,
      });
      startAuthenticatedSession(identity, "username-password", selectedRole);
    } catch (error) {
      errorEl.textContent = error.message;
    } finally {
      password.value = "";
      passwordConfirm.value = "";
      submit.disabled = false;
    }
  }

  async function checkSecureSignIn() {
    try {
      const response = await fetch(api("/api/auth/status"), { credentials: "include" });
      if (!response.ok) throw new Error(`Sign-in status unavailable (${response.status})`);
      const status = await response.json();
      usernamePasswordEnabled = status.usernamePasswordEnabled === true;
      cloudflareAccessEnabled = status.cloudflareAccessEnabled === true ||
        (Array.isArray(status.methods) && status.methods.includes("cloudflare-access"));
      loginSubmit.disabled = !usernamePasswordEnabled;
      if (!usernamePasswordEnabled) {
        authNotice.textContent = status.reason || "Username/password sign-in requires account storage.";
      } else {
        authNotice.textContent = "Your username and password are stored securely by the app.";
      }

      secureSignIn.disabled = !cloudflareAccessEnabled;
      secureSignIn.textContent = cloudflareAccessEnabled
        ? "Sign in with Cloudflare Access"
        : "Cloudflare Access unavailable";

      const sessionResponse = await fetch(api("/api/auth/session"), { credentials: "include" });
      if (sessionResponse.ok) {
        const data = await sessionResponse.json();
        if (data.identity?.authProvider === "username-password") {
          startAuthenticatedSession(data.identity, "username-password");
          return;
        }
        if (data.identity?.authProvider === "cloudflare-access" ||
            new URLSearchParams(window.location.search).get("access") === "complete") {
          providerIdentity = data.identity;
          if (!providerIdentity || typeof providerIdentity.name !== "string" || !providerIdentity.name.trim()) {
            throw new Error("The sign-in provider did not return a usable identity.");
          }
          const cachedProfile = loadSavedProfile(providerIdentity, null);
          if (cachedProfile) {
            startAuthenticatedSession(providerIdentity, "cloudflare-access", cachedProfile.role);
            return;
          }
          authNotice.textContent = `Signed in securely as ${providerIdentity.name}. Choose your profile role to continue.`;
          secureSignIn.disabled = true;
          secureSignIn.textContent = "Signed in with Cloudflare Access";
        }
      } else if (sessionResponse.status !== 401) {
        throw new Error(`Sign-in session unavailable (${sessionResponse.status})`);
      }
    } catch (error) {
      if (!usernamePasswordEnabled) loginSubmit.disabled = true;
      authNotice.textContent = `Secure sign-in is unavailable: ${error.message}`;
    }
  }

  loginForm.addEventListener("submit", signInWithPassword);
  form.addEventListener("submit", signUp);
  $("continue-preview").addEventListener("click", () => startLocalPreview(displayName.value.trim()));
  secureSignIn.addEventListener("click", () => {
    if (!secureSignIn.disabled) window.location.assign(api("/api/auth/login"));
  });

  document.querySelectorAll(".role").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRole = button.dataset.role;
      $("form-sub").textContent = selectedRole === "mentor"
        ? "Create a mentor account or continue with a local preview."
        : "Create a learner account or continue with a local preview.";
      show("form");
      displayName.focus();
    });
  });

  $("back-to-role").addEventListener("click", () => show("role"));
  checkSecureSignIn();
})();
