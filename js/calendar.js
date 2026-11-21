(function () {
  const apiBase = (window.TFW_API_URL || "").replace(/\/$/, "");
  const api = (path) => `${apiBase}${path}`;
  const form = document.getElementById("calendar-form");
  const eventsEl = document.getElementById("calendar-events");
  const statusEl = document.getElementById("calendar-status");
  const timezoneEl = document.getElementById("calendar-timezone");
  const titleEl = document.getElementById("event-title");
  const descriptionEl = document.getElementById("event-description");
  const startsAtEl = document.getElementById("event-starts-at");
  const cancelEl = document.getElementById("cancel-event-edit");
  let editingId = null;
  let previewMode = false;
  const previewKey = "tfw_preview_calendar_events";

  if (!form || !eventsEl) return;
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  timezoneEl.textContent = localTimeZone;

  async function request(path, options = {}) {
    const response = await fetch(api(path), {
      credentials: "include",
      ...options,
      headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Calendar request failed (${response.status}).`);
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function previewEvents() {
    try {
      const events = JSON.parse(localStorage.getItem(previewKey) || "[]");
      return Array.isArray(events) ? events : [];
    } catch (_) {
      return [];
    }
  }

  function savePreviewEvents(events) {
    localStorage.setItem(previewKey, JSON.stringify(events));
  }

  function previewId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `preview_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function localInputValue(instant) {
    const date = new Date(instant);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
  }

  function formatEventTime(event) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: event.timezone,
    }).format(new Date(event.starts_at));
  }

  function makeEventCard(event) {
    const article = document.createElement("article");
    article.className = "calendar-event";
    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = event.title;
    const date = document.createElement("p");
    date.className = "calendar-event-date";
    date.textContent = `${formatEventTime(event)} (${event.timezone})`;
    details.append(title, date);
    if (event.description) {
      const description = document.createElement("p");
      description.textContent = event.description;
      details.append(description);
    }

    const actions = document.createElement("div");
    actions.className = "calendar-event-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn btn-ghost";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      editingId = event.id;
      titleEl.value = event.title;
      descriptionEl.value = event.description;
      startsAtEl.value = localInputValue(event.starts_at);
      form.querySelector('[type="submit"]').textContent = "Save changes";
      cancelEl.hidden = false;
      titleEl.focus();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-ghost";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Delete "${event.title}" from your calendar?`)) return;
      try {
        if (previewMode) {
          savePreviewEvents(previewEvents().filter((item) => item.id !== event.id));
        } else {
          await request(`/api/calendar/events/${encodeURIComponent(event.id)}`, { method: "DELETE" });
        }
        await loadEvents();
      } catch (error) {
        statusEl.textContent = error.message;
      }
    });
    actions.append(edit, remove);
    article.append(details, actions);
    return article;
  }

  async function loadEvents() {
    if (previewMode) {
      const events = previewEvents();
      eventsEl.replaceChildren();
      if (!events.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "No appointments yet. Add one above.";
        eventsEl.append(empty);
        return;
      }
      eventsEl.append(...events.map(makeEventCard));
      return;
    }
    const { events } = await request("/api/calendar/events");
    eventsEl.replaceChildren();
    if (!events.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No appointments yet. Add one above.";
      eventsEl.append(empty);
      return;
    }
    eventsEl.append(...events.map(makeEventCard));
  }

  function clearEdit() {
    editingId = null;
    form.reset();
    form.querySelector('[type="submit"]').textContent = "Add appointment";
    cancelEl.hidden = true;
  }

  cancelEl.addEventListener("click", clearEdit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "";
    const startsAt = new Date(startsAtEl.value);
    if (!Number.isFinite(startsAt.getTime())) {
      statusEl.textContent = "Choose a valid date and time.";
      return;
    }
    const body = {
      title: titleEl.value.trim(),
      description: descriptionEl.value.trim(),
      starts_at: startsAt.toISOString(),
      timezone: localTimeZone,
    };
    try {
      if (previewMode) {
        const events = previewEvents();
        if (editingId) {
          const index = events.findIndex((item) => item.id === editingId);
          if (index !== -1) events[index] = { ...events[index], ...body, updated_at: new Date().toISOString() };
        } else {
          events.push({
            id: previewId(),
            ...body,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        savePreviewEvents(events);
      } else {
        await request(editingId
          ? `/api/calendar/events/${encodeURIComponent(editingId)}`
          : "/api/calendar/events", {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(body),
        });
      }
      clearEdit();
      await loadEvents();
      statusEl.textContent = previewMode ? "Preview calendar updated." : "Calendar updated.";
    } catch (error) {
      statusEl.textContent = error.message;
    }
  });

  loadEvents().catch((error) => {
    if (error.code === "AUTH_NOT_CONFIGURED" || error.status === 503) {
      previewMode = true;
      statusEl.textContent = "Preview mode: appointments are saved only in this browser. Secure sign-in and calendar storage are not configured.";
      loadEvents().catch(() => {
        statusEl.textContent = "This browser cannot access calendar preview storage.";
      });
    } else {
      statusEl.textContent = `${error.message} Secure sign-in is required to access the private calendar.`;
      form.hidden = true;
    }
  });
})();
