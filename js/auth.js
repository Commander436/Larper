/*
 * Landing page: choose role (mentor / mentee) -> create account or log in.
 *
 * NOTE: There is no backend yet. The session and chosen role are kept in the
 * browser's localStorage so the flow can be tested end to end. Passwords are NOT
 * stored. Replace `proceed()` with real API calls (and real Google / Apple
 * OAuth) once the backend exists.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const paneRole = $("pane-role");
  const paneForm = $("pane-form");
  const form = $("auth-form");
  const email = $("email");
  const username = $("username");
  const password = $("password");
  const errorEl = $("auth-error");

  let mode = "signup"; // "signup" | "login"
  let role = null;     // "mentor" | "mentee"

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  function show(pane) {
    paneRole.classList.toggle("hidden", pane !== "role");
    paneForm.classList.toggle("hidden", pane !== "form");
    errorEl.textContent = "";
  }

  function renderForm() {
    const signup = mode === "signup";
    $("form-title").textContent = signup ? "Create your account" : "Welcome back";
    $("form-sub").textContent = signup
      ? (role === "mentor" ? "Signing up as a mentor" : "Signing up as a mentee")
      : "Log in to continue";
    $("username-row").classList.toggle("hidden", !signup);
    $("auth-submit").textContent = signup ? "Create account" : "Log in";
    password.autocomplete = signup ? "new-password" : "current-password";
    $("switch-line").innerHTML = signup
      ? 'Already have an account? <button type="button" id="switch-btn">Log in</button>'
      : 'New here? <button type="button" id="switch-btn">Create an account</button>';
    $("switch-btn").addEventListener("click", () => {
      if (signup) { mode = "login"; renderForm(); }
      else { mode = "signup"; show("role"); }
    });
    show("form");
  }

  // Role selection
  document.querySelectorAll(".role").forEach((btn) => {
    btn.addEventListener("click", () => {
      role = btn.dataset.role;
      mode = "signup";
      renderForm();
      email.focus();
    });
  });
  $("go-login").addEventListener("click", () => { mode = "login"; renderForm(); });
  $("back-to-role").addEventListener("click", () => show("role"));

  function proceed(userEmail, userName) {
    const existing = store.get("tfw_profile");
    // Logging in: reuse the saved role. Signing up: use the chosen one.
    const finalRole = mode === "login" ? (existing && existing.role) || role || "mentor" : role;
    store.set("tfw_session", { email: userEmail, username: userName || null, role: finalRole, at: Date.now() });

    if (mode === "signup" && (!existing || existing.role !== finalRole)) {
      store.set("tfw_profile", { role: finalRole, step: 0, complete: false });
    }
    const profile = store.get("tfw_profile");
    window.location.href = profile && profile.complete ? "profile.html" : "onboarding.html";
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    [email, username, password].forEach((f) => f.classList.remove("invalid"));
    const fail = (field, msg) => { field.classList.add("invalid"); errorEl.textContent = msg; field.focus(); };

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return fail(email, "Please enter a valid email address.");
    if (mode === "signup" && !/^[A-Za-z0-9_]{3,20}$/.test(username.value.trim()))
      return fail(username, "Usernames are 3 to 20 letters, numbers or underscores.");
    if (password.value.length < 8) return fail(password, "Your password needs at least 8 characters.");

    proceed(email.value.trim(), username.value.trim());
  });

  document.querySelectorAll(".social").forEach((btn) => {
    btn.addEventListener("click", () => {
      errorEl.textContent = "Google and Apple sign-in will be connected once the backend is ready. Please use email for now.";
    });
  });
})();
