(function () {
  let session;
  let profile;
  try {
    session = JSON.parse(sessionStorage.getItem("tfw_session") || "null");
    profile = JSON.parse(sessionStorage.getItem("tfw_profile") || "null");
  } catch (error) {
    window.location.replace("index.html");
    return;
  }
  if (!session || (!session.preview && !session.authProvider)) {
    window.location.replace("index.html");
    return;
  }
  if (!profile || !profile.complete) {
    window.location.replace("onboarding.html");
    return;
  }

  const $ = (id) => document.getElementById(id);
  const API = (window.TFW_API_URL || "").replace(/\/$/, "");
  const mentor = profile.role === "mentor";
  if (session.authProvider === "cloudflare-access") $("sign-out").textContent = "Sign out";
  if (typeof profile.id !== "string" || !profile.id) profile.id = window.TfwMessaging.createProfileId();
  $("role-badge").textContent = mentor ? "Mentor" : "Learner";
  $("profile-name").textContent = profile.name || session.displayName || "Your profile";
  $("profile-subtitle").textContent = mentor
    ? "Sharing skills and helping others grow."
    : "Learning new skills and finding a mentor.";
  if (!mentor) {
    try {
      const streak = window.TfwLearningStreak.createStore(window.localStorage).recordLogin(profile.id);
      $("profile-streak-count").textContent = String(streak.count);
      $("profile-streak-label").textContent = streak.count === 1 ? " day learning streak" : " days learning streak";
      $("profile-learning-streak").hidden = false;
    } catch (error) {
      $("profile-streak-status").textContent = error.message;
    }
  }
  $("about-text").textContent = profile.about || "Add a little about yourself to help the community get to know you.";
  $("topics-heading").textContent = mentor ? "What I teach" : "What I want to learn";

  const avatar = $("avatar");
  if (typeof profile.photo === "string" && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(profile.photo)) {
    avatar.style.backgroundImage = `url("${profile.photo}")`;
    avatar.textContent = "";
  }

  const topicTags = $("topic-tags");
  (Array.isArray(profile.topics) ? profile.topics : []).filter((topic) => typeof topic === "string").forEach((topic) => {
    const tag = document.createElement("span");
    tag.className = "topic-tag";
    tag.textContent = topic.split(" › ").pop();
    topicTags.append(tag);
  });
  if (!topicTags.childElementCount) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "No topics added yet";
    topicTags.append(empty);
  }
  window.TfwMessaging.init(profile);

  const adCard = $("ad-card");
  if (mentor) {
    $("ad-heading").textContent = profile.title || "Your teaching ad";
    $("ad-lessons").textContent = profile.lessons || "Add details about your lessons to complete your ad.";
    const location = profile.location || {};
    const formats = [];
    if (location.publicPlace) formats.push("Public meeting place");
    if (location.travel) formats.push(`Can travel up to ${location.miles} miles`);
    if (location.online) formats.push("Online");
    $("lesson-formats").textContent = formats.join(" · ") || "Lesson format not selected";
  } else {
    adCard.classList.add("learner-goals");
    adCard.querySelector(".section-kicker").textContent = "Your learning plan";
    $("ad-heading").textContent = "Learning goals";
    $("ad-lessons").textContent = "Your interests help connect you with mentors who teach the skills you want to learn.";
    $("lesson-formats").textContent = "";
  }

  $("edit-profile").addEventListener("click", () => {
    profile.complete = false;
    profile.step = 0;
    try {
      sessionStorage.setItem("tfw_profile", JSON.stringify(profile));
      window.location.href = "onboarding.html";
    } catch (error) {
      window.alert("Your browser couldn't save the profile changes. Check your storage settings and try again.");
    }
  });
  $("sign-out").addEventListener("click", () => {
    const usesCloudflareAccess = session.authProvider === "cloudflare-access";
    sessionStorage.removeItem("tfw_session");
    sessionStorage.removeItem("tfw_profile");
    window.location.href = usesCloudflareAccess ? `${API}/api/auth/logout` : "index.html";
  });
})();
