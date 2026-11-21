/*
 * Local profile preview only. This does not authenticate users or create
 * accounts; connect a trusted backend before enabling sign-up or sign-in.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const paneRole = $("pane-role");
  const paneForm = $("pane-form");
  const form = $("auth-form");
  const displayName = $("display-name");
  const errorEl = $("auth-error");
  let role = null;
  let legacyDataCleared = true;

  try {
    localStorage.removeItem("tfw_session");
    localStorage.removeItem("tfw_profile");
  } catch (error) {
    legacyDataCleared = false;
    $("auth-notice").textContent = "We couldn't clear data saved by the old preview. Check browser storage settings before continuing.";
  }

  function show(pane) {
    paneRole.classList.toggle("hidden", pane !== "role");
    paneForm.classList.toggle("hidden", pane !== "form");
    errorEl.textContent = "";
  }

  function startPreview() {
    if (!legacyDataCleared) {
      errorEl.textContent = "Close and reopen the page after enabling browser storage so old profile data can be removed.";
      return;
    }
    const name = displayName.value.trim();
    if (name.length < 2 || name.length > 40) {
      errorEl.textContent = "Enter a name between 2 and 40 characters.";
      displayName.focus();
      return;
    }

    try {
      sessionStorage.setItem("tfw_session", JSON.stringify({
        displayName: name,
        role: role,
        preview: true,
      }));
      sessionStorage.setItem("tfw_profile", JSON.stringify({
        name: name,
        role: role,
        step: 0,
        complete: false,
      }));
    } catch (error) {
      errorEl.textContent = "This browser can't save the preview. Check your storage settings and try again.";
      return;
    }

    window.location.href = "onboarding.html";
  }

  document.querySelectorAll(".role").forEach((button) => {
    button.addEventListener("click", () => {
      role = button.dataset.role;
      $("form-sub").textContent = role === "mentor"
        ? "Previewing the mentor profile setup"
        : "Previewing the learner profile setup";
      show("form");
      displayName.focus();
    });
  });

  $("back-to-role").addEventListener("click", () => show("role"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    startPreview();
  });
})();
