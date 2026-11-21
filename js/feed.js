import { filterMentorPublications, hasFeedProfile } from "./feed-utils.js";

(function () {
  let session = null;
  let profile = null;
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
  if (!profile || !profile.complete || !hasFeedProfile(profile, session)) {
    window.location.replace("onboarding.html");
    return;
  }

  const API = (window.TFW_API_URL || "").replace(/\/$/, "");
  const api = (path) => `${API}${path}`;
  const $ = (id) => document.getElementById(id);
  let mode = "for-you";
  let search = "";
  let auth = { enabled: false };

  function escapeHtml(value) {
    const span = document.createElement("span");
    span.textContent = String(value ?? "");
    return span.innerHTML;
  }

  function interests() {
    const values = profile && Array.isArray(profile.topics)
      ? profile.topics.map((topic) => topic.split(" › ").pop())
      : [];
    return [...new Set(values)].slice(0, 6);
  }

  function initProfile() {
    if (!profile) return;
    $("feed-profile-name").textContent = profile.name || "Community member";
    $("feed-profile-role").textContent = profile.role === "mentor" ? "Mentor" : "Learner";
    if (profile.role === "mentee" && typeof profile.id === "string" && profile.id) {
      try {
        const streak = window.TfwLearningStreak.createStore(window.localStorage).recordLogin(profile.id);
        $("feed-streak-count").textContent = String(streak.count);
        $("feed-streak-label").textContent = streak.count === 1 ? " day learning streak" : " days learning streak";
        $("feed-learning-streak").hidden = false;
      } catch (error) {
        $("feed-streak-status").textContent = error.message;
      }
    }
    const tags = $("feed-topic-tags");
    interests().forEach((topic) => {
      const tag = document.createElement("span");
      tag.className = "topic-tag";
      tag.textContent = topic;
      tags.append(tag);
    });
    if (!tags.childElementCount) {
      tags.innerHTML = '<span class="muted">Add interests in your profile</span>';
    }
    if (typeof profile.photo === "string" && profile.photo.startsWith("data:image/")) {
      $("feed-avatar").style.backgroundImage = `url("${profile.photo}")`;
      $("feed-avatar").textContent = "";
    }
  }

  async function loadAuth() {
    try {
      const response = await fetch(api("/api/auth/status"), { credentials: "include" });
      if (response.ok) auth = await response.json();
    } catch (_) {
      auth = { enabled: false, reason: "The shared API is not running. Start the Worker or configure TFW_API_URL." };
    }
  }

  function showAuthStatus() {
    const status = $("auth-status");
    if (auth.enabled) {
      status.hidden = true;
      return;
    }
    status.hidden = false;
    status.textContent = auth.reason || "Secure sign-in is not connected yet. Shared posts and votes are read-only until an identity provider is configured.";
  }

  async function loadFeed() {
    const results = $("feed-results");
    results.innerHTML = '<p class="feed-loading">Loading community posts…</p>';
    const params = new URLSearchParams({ mode, search, interests: interests().join(","), limit: "30" });
    try {
      const response = await fetch(api(`/api/feed?${params}`), { credentials: "include" });
      if (!response.ok) throw new Error(`Feed unavailable (${response.status})`);
      const data = await response.json();
      const posts = mode === "for-you"
        ? filterMentorPublications(data.posts)
        : (Array.isArray(data.posts) ? data.posts : []);
      if (posts.length === 0) {
        const title = mode === "for-you"
          ? (search ? "No mentor publications found" : "No mentor publications yet")
          : (search ? "No posts found" : "No posts yet");
        const message = search
          ? `Try a different search or clear it to browse ${mode === "for-you" ? "all mentor publications" : "all posts"}.`
          : mode === "for-you"
            ? "Mentor advice and ideas will appear here when shared."
            : "Community posts will appear here when shared.";
        results.innerHTML = `<div class="feed-empty"><h2>${title}</h2><p>${message}</p>${search ? '<button class="btn btn-ghost" type="button">Clear search</button>' : ""}</div>`;
        results.querySelector("button")?.addEventListener("click", () => {
          search = "";
          $("search-input").value = "";
          loadFeed();
        });
        return;
      }
      results.replaceChildren(...posts.map(renderPost));
    } catch (error) {
      results.innerHTML = `<div class="feed-empty"><h2>Community feed unavailable</h2><p>${escapeHtml(error.message)}</p><p class="muted">Local preview data cannot be shared across users. Deploy the Worker and D1 database to enable the shared feed.</p></div>`;
    }
  }

  function renderPost(post) {
    const article = document.createElement("article");
    article.className = "post-card";
    article.dataset.postId = post.id;

    const topics = Array.isArray(post.topics) ? post.topics : [];
    article.innerHTML = `
      <div class="vote-column" aria-label="Post votes">
        <button type="button" class="vote-button" data-vote="1" aria-label="Upvote">▲</button>
        <strong class="vote-score">${Number(post.score) || 0}</strong>
        <button type="button" class="vote-button" data-vote="-1" aria-label="Downvote">▼</button>
      </div>
      <div class="post-content">
        <div class="post-meta">
          <span class="post-type ${escapeHtml(post.post_type)}">${post.post_type === "advice" ? "Mentor advice" : "Mentee question"}</span>
          <span>Posted by ${escapeHtml(post.author_name || "Community member")}</span>
        </div>
        <h2>${escapeHtml(post.title)}</h2>
        <p class="post-body">${escapeHtml(post.body)}</p>
        <div class="post-topics">${topics.map((topic) => `<span>${escapeHtml(topic)}</span>`).join("")}</div>
        <div class="post-actions">
          <button type="button" class="comment-toggle">💬 <span>${Number(post.comment_count) || 0}</span> comments</button>
        </div>
        <div class="comments hidden" aria-label="Comments"></div>
      </div>`;

    article.querySelectorAll(".vote-button").forEach((button) => {
      button.addEventListener("click", () => vote(post.id, Number(button.dataset.vote), article));
    });
    article.querySelector(".comment-toggle").addEventListener("click", () => toggleComments(post.id, article));
    return article;
  }

  async function vote(postId, value, article) {
    if (!auth.enabled) {
      showAuthStatus();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const result = await mutate(`/api/posts/${encodeURIComponent(postId)}/vote`, "POST", { value });
    if (result?.score !== undefined) {
      article.querySelector(".vote-score").textContent = String(result.score);
    }
  }

  async function mutate(path, method, body) {
    try {
      const response = await fetch(api(path), {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      return data;
    } catch (error) {
      window.alert(error.message);
      return null;
    }
  }

  async function toggleComments(postId, article) {
    const container = article.querySelector(".comments");
    if (!container.classList.contains("hidden")) {
      container.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");
    container.innerHTML = '<p class="muted">Loading comments…</p>';
    try {
      const response = await fetch(api(`/api/posts/${encodeURIComponent(postId)}/comments`), { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comments unavailable");
      const comments = (data.comments || []).map((comment) => `
        <div class="comment${comment.parent_id ? " comment-reply" : ""}" data-comment-id="${escapeHtml(comment.id)}">
          <strong>${escapeHtml(comment.author_name || "Community member")}</strong>
          <p>${escapeHtml(comment.body)}</p>
          <button type="button" class="reply-toggle">Reply</button>
        </div>`).join("");
      container.innerHTML = comments || '<p class="muted">No comments yet.</p>';
      container.querySelectorAll(".reply-toggle").forEach((button) => {
        button.addEventListener("click", () => {
          const comment = button.closest(".comment");
          const existing = comment.querySelector(".inline-reply");
          if (existing) { existing.remove(); return; }
          const reply = document.createElement("form");
          reply.className = "comment-form inline-reply";
          reply.innerHTML = '<input class="field" maxlength="2000" placeholder="Write a reply" required><button class="btn btn-ghost" type="submit">Reply</button>';
          reply.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!auth.enabled) { showAuthStatus(); return; }
            const result = await mutate(`/api/posts/${encodeURIComponent(postId)}/comments`, "POST", {
              body: reply.querySelector("input").value,
              parent_id: comment.dataset.commentId,
            });
            if (result) toggleComments(postId, article);
          });
          comment.append(reply);
        });
      });
      const form = document.createElement("form");
      form.className = "comment-form";
      form.innerHTML = '<label class="sr-only">Add a comment</label><input class="field" maxlength="2000" placeholder="Add a comment" required><button class="btn btn-ghost" type="submit">Reply</button>';
      container.append(form);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!auth.enabled) { showAuthStatus(); return; }
        const input = form.querySelector("input");
        const result = await mutate(`/api/posts/${encodeURIComponent(postId)}/comments`, "POST", { body: input.value });
        if (result) toggleComments(postId, article);
      });
    } catch (error) {
      container.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  }

  document.querySelectorAll(".feed-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      document.querySelectorAll(".feed-tabs button").forEach((tab) => tab.setAttribute("aria-selected", String(tab === button)));
      loadFeed();
    });
  });

  $("feed-search").addEventListener("submit", (event) => {
    event.preventDefault();
    search = $("search-input").value.trim();
    loadFeed();
  });

  const dialog = $("post-dialog");
  $("create-post").addEventListener("click", () => {
    if (!auth.enabled) {
      showAuthStatus();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    dialog.showModal();
  });
  $("post-form").addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (submitter?.value === "cancel") return;
    event.preventDefault();
    const title = $("post-title").value.trim();
    const body = $("post-body").value.trim();
    const topics = $("post-topics").value.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 5);
    const postType = document.querySelector('input[name="post-type"]:checked').value;
    $("post-error").textContent = "";
    if (title.length < 12) { $("post-error").textContent = "Use a title of at least 12 characters."; return; }
    if (body.length < 20) { $("post-error").textContent = "Add at least 20 characters of detail."; return; }
    const result = await mutate("/api/posts", "POST", { title, body, topics, post_type: postType });
    if (result) {
      dialog.close();
      event.target.reset();
      await loadFeed();
    }
  });

  initProfile();
  loadAuth().then(() => {
    showAuthStatus();
    loadFeed();
  });
})();
