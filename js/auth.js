/*
 * Sign-up / login page logic.
 *
 * NOTE: There is no backend yet. Accounts are kept in the browser's localStorage
 * so the flow can be tested end to end. Passwords are NOT stored here (only a
 * session marker). Replace the `Auth` object with real API calls (and real
 * Google / Apple OAuth) when the backend exists.
 */
(function () {
  const form = document.getElementById("auth-form");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const errorEl = document.getElementById("auth-error");
  const submit = document.getElementById("auth-submit");
  const title = document.getElementById("card-title");
  const switchLine = document.getElementById("switch-line");

  let mode = "signup"; // or "login"

  const Auth = {
    start(userEmail) {
      try {
        localStorage.setItem("tfw_session", JSON.stringify({ email: userEmail, at: Date.now() }));
      } catch (e) { /* storage unavailable; continue */ }
    },
    hasProfile() {
      try { return !!JSON.parse(localStorage.getItem("tfw_profile") || "null")?.complete; }
      catch (e) { return false; }
    },
  };

  function setMode(next) {
    mode = next;
    const signup = mode === "signup";
    title.textContent = signup ? "Create your profile" : "Welcome back";
    submit.textContent = signup ? "Sign up by email" : "Log in";
    password.autocomplete = signup ? "new-password" : "current-password";
    document.querySelectorAll(".social").forEach((b) => {
      const name = b.dataset.provider === "google" ? "Google" : "Apple";
      b.lastChild.textContent = (signup ? "Sign up with " : "Log in with ") + name;
    });
    switchLine.innerHTML = signup
      ? 'Do you already have an account? <button type="button" id="switch-btn">Login</button>'
      : 'New here? <button type="button" id="switch-btn">Create your profile</button>';
    document.getElementById("switch-btn").addEventListener("click", () => setMode(signup ? "login" : "signup"));
    errorEl.textContent = "";
  }

  function proceed(userEmail) {
    Auth.start(userEmail);
    window.location.href = Auth.hasProfile() ? "profile.html" : "onboarding.html";
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = email.value.trim();
    email.classList.remove("invalid");
    password.classList.remove("invalid");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      email.classList.add("invalid");
      errorEl.textContent = "Please enter a valid email address.";
      return;
    }
    if (password.value.length < 8) {
      password.classList.add("invalid");
      errorEl.textContent = "Your password needs at least 8 characters.";
      return;
    }
    proceed(value);
  });

  // Placeholder for OAuth providers
  document.querySelectorAll(".social").forEach((btn) => {
    btn.addEventListener("click", () => {
      errorEl.textContent = "Google and Apple sign-in will be connected once the backend is ready. Please use email for now.";
    });
  });

  document.getElementById("switch-btn").addEventListener("click", () => setMode("login"));
})();
