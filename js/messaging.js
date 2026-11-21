(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TfwMessaging = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const PROFILE_KEY = "tfw_message_profiles";
  const CONVERSATION_KEY = "tfw_message_conversations";
  const MAX_MESSAGE_LENGTH = 2000;
  const roles = new Set(["mentor", "mentee"]);

  function createProfileId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function createStore(storage) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new Error("Browser storage is unavailable. Enable storage to use messaging.");
    }

    function readArray(key, label) {
      const raw = storage.getItem(key);
      if (raw === null) return [];
      let value;
      try {
        value = JSON.parse(raw);
      } catch (error) {
        throw new Error(`Saved ${label} data could not be read. Clear this preview's browser storage and try again.`);
      }
      if (!Array.isArray(value)) {
        throw new Error(`Saved ${label} data is invalid. Clear this preview's browser storage and try again.`);
      }
      return value;
    }

    function getProfiles() {
      return readArray(PROFILE_KEY, "profile");
    }

    function getConversations() {
      return readArray(CONVERSATION_KEY, "conversation");
    }

    function registerProfile(profile) {
      if (!profile || typeof profile.id !== "string" || !profile.id ||
          typeof profile.name !== "string" || !profile.name.trim() ||
          !roles.has(profile.role)) {
        throw new Error("This profile is missing the information needed to enable messaging.");
      }
      const saved = {
        id: profile.id,
        name: profile.name.trim().slice(0, 40),
        role: profile.role,
        topics: Array.isArray(profile.topics)
          ? profile.topics.filter((topic) => typeof topic === "string").slice(0, 6)
          : [],
        title: typeof profile.title === "string" ? profile.title : "",
        about: typeof profile.about === "string" ? profile.about : "",
      };
      const profiles = getProfiles().filter((item) => item && item.id !== saved.id);
      profiles.push(saved);
      storage.setItem(PROFILE_KEY, JSON.stringify(profiles));
      return saved;
    }

    function getContacts(profileId) {
      const current = getProfiles().find((profile) => profile && profile.id === profileId);
      if (!current || !roles.has(current.role)) return [];
      return getProfiles()
        .filter((profile) => profile && profile.id !== profileId &&
          typeof profile.id === "string" && typeof profile.name === "string" &&
          profile.role !== current.role && roles.has(profile.role))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    function getThreads(profileId) {
      const profiles = getProfiles();
      const conversations = getConversations();
      const current = profiles.find((profile) => profile && profile.id === profileId);
      if (!current || !roles.has(current.role)) return [];
      return conversations
        .filter((conversation) =>
          conversation && Array.isArray(conversation.participantIds) &&
          conversation.participantIds.length === 2 &&
          new Set(conversation.participantIds).size === 2 &&
          conversation.participantIds.includes(profileId))
        .map((conversation) => {
          const otherId = conversation.participantIds.find((id) => id !== profileId);
          const other = profiles.find((profile) => profile && profile.id === otherId);
          if (!other || !roles.has(other.role) || other.role === current.role) {
            return null;
          }
          const messages = Array.isArray(conversation.messages)
            ? conversation.messages.filter((message) =>
              message && conversation.participantIds.includes(message.senderId) &&
              typeof message.body === "string" && typeof message.sentAt === "string")
            : [];
          const latest = messages[messages.length - 1];
          return { ...conversation, messages, other, latest };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const aTime = a.latest ? Date.parse(a.latest.sentAt) || 0 : 0;
          const bTime = b.latest ? Date.parse(b.latest.sentAt) || 0 : 0;
          return bTime - aTime;
        });
    }

    function startConversation(senderId, recipientId) {
      if (senderId === recipientId) throw new Error("You can't start a conversation with yourself.");
      const profiles = getProfiles();
      const sender = profiles.find((profile) => profile && profile.id === senderId);
      const recipient = profiles.find((profile) => profile && profile.id === recipientId);
      if (!sender || !recipient || !roles.has(sender.role) || !roles.has(recipient.role) ||
          sender.role === recipient.role) {
        throw new Error("Conversations are only available between a mentor and a learner.");
      }
      const participantIds = [senderId, recipientId].sort();
      const conversations = getConversations();
      let conversation = conversations.find((item) =>
        item && Array.isArray(item.participantIds) &&
        item.participantIds.length === 2 &&
        item.participantIds[0] === participantIds[0] &&
        item.participantIds[1] === participantIds[1]);
      if (!conversation) {
        conversation = { id: createProfileId(), participantIds, messages: [] };
        conversations.push(conversation);
        storage.setItem(CONVERSATION_KEY, JSON.stringify(conversations));
      }
      return conversation;
    }

    function sendMessage(conversationId, senderId, body) {
      const messageBody = typeof body === "string" ? body.trim() : "";
      if (!messageBody) throw new Error("Write a message before sending.");
      if (messageBody.length > MAX_MESSAGE_LENGTH) {
        throw new Error(`Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
      }
      const conversations = getConversations();
      const conversation = conversations.find((item) => item && item.id === conversationId);
      if (!conversation || !Array.isArray(conversation.participantIds) ||
          conversation.participantIds.length !== 2 ||
          new Set(conversation.participantIds).size !== 2 ||
          !conversation.participantIds.includes(senderId)) {
        throw new Error("You don't have access to this conversation.");
      }
      const sender = getProfiles().find((profile) => profile && profile.id === senderId);
      const recipientId = conversation.participantIds.find((id) => id !== senderId);
      const recipient = getProfiles().find((profile) => profile && profile.id === recipientId);
      if (!sender || !recipient || !roles.has(sender.role) || !roles.has(recipient.role) ||
          sender.role === recipient.role) {
        throw new Error("This conversation is only available between a mentor and a learner.");
      }
      if (!Array.isArray(conversation.messages)) conversation.messages = [];
      const message = {
        id: createProfileId(),
        senderId,
        body: messageBody,
        sentAt: new Date().toISOString(),
      };
      conversation.messages.push(message);
      storage.setItem(CONVERSATION_KEY, JSON.stringify(conversations));
      return message;
    }

    return { getContacts, getThreads, registerProfile, sendMessage, startConversation };
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function init(profile) {
    const app = document.getElementById("messaging-app");
    if (!app) return;
    const status = document.getElementById("messaging-status");
    if (!profile.id) profile.id = createProfileId();

    let store;
    try {
      store = createStore(window.localStorage);
      store.registerProfile(profile);
    } catch (error) {
      status.textContent = error.message;
      return;
    }

    let activeConversationId = null;
    let showingContacts = false;

    function displayDate(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
    }

    function render() {
      app.replaceChildren();
      let threads;
      try {
        threads = store.getThreads(profile.id);
      } catch (error) {
        status.textContent = error.message;
        return;
      }
      status.textContent = "Local preview only: messages are saved in this browser and aren't private or synced to an account.";

      const sidebar = element("div", "message-sidebar");
      const sidebarHeading = element("h3", "", "Conversations");
      const newButton = element("button", "btn btn-ghost message-new", showingContacts ? "Cancel" : "New message");
      newButton.type = "button";
      newButton.addEventListener("click", () => {
        showingContacts = !showingContacts;
        render();
      });
      sidebar.append(sidebarHeading, newButton);

      if (showingContacts) {
        let contacts;
        try {
          contacts = store.getContacts(profile.id);
        } catch (error) {
          status.textContent = error.message;
          return;
        }
        const contactForm = element("form", "contact-form");
        const label = element("label", "", `Choose a ${profile.role === "mentor" ? "learner" : "mentor"}`);
        const select = element("select", "field");
        select.setAttribute("aria-label", label.textContent);
        const emptyOption = element("option", "", contacts.length ? "Select a profile" : "No matching profiles yet");
        emptyOption.value = "";
        select.append(emptyOption);
        contacts.forEach((contact) => {
          const option = element("option", "", `${contact.name} · ${contact.role}`);
          option.value = contact.id;
          select.append(option);
        });
        const startButton = element("button", "btn btn-primary", "Open conversation");
        startButton.type = "submit";
        startButton.disabled = contacts.length === 0;
        contactForm.append(label, select, startButton);
        contactForm.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!select.value) return;
          try {
            activeConversationId = store.startConversation(profile.id, select.value).id;
            showingContacts = false;
            render();
          } catch (error) {
            status.textContent = error.message;
          }
        });
        sidebar.append(contactForm);
      }

      const threadList = element("div", "message-thread-list");
      if (!threads.length) {
        threadList.append(element("p", "muted", "No conversations yet. Start one with a mentor or learner in this browser preview."));
      }
      threads.forEach((thread) => {
        const item = element("button", "message-thread" +
          (thread.id === activeConversationId ? " active" : ""));
        item.type = "button";
        item.setAttribute("aria-current", thread.id === activeConversationId ? "true" : "false");
        const name = element("strong", "", thread.other.name);
        const preview = element("span", "", thread.latest ? thread.latest.body : "Start your conversation");
        const time = element("small", "", thread.latest ? displayDate(thread.latest.sentAt) : "");
        item.append(name, preview, time);
        item.addEventListener("click", () => {
          activeConversationId = thread.id;
          showingContacts = false;
          render();
        });
        threadList.append(item);
      });
      sidebar.append(threadList);

      const panel = element("div", "message-panel");
      const active = threads.find((thread) => thread.id === activeConversationId);
      if (!active) {
        panel.append(element("p", "muted message-placeholder", showingContacts
          ? "Choose a profile to begin a conversation."
          : "Select a conversation or start a new one."));
      } else {
        panel.append(element("h3", "message-recipient", active.other.name));
        const transcript = element("div", "message-transcript");
        transcript.setAttribute("aria-live", "polite");
        active.messages.forEach((message) => {
          const bubble = element("article", "message-bubble" +
            (message.senderId === profile.id ? " own" : ""));
          bubble.append(
            element("p", "", message.body),
            element("time", "", displayDate(message.sentAt))
          );
          transcript.append(bubble);
        });
        if (!active.messages.length) {
          transcript.append(element("p", "muted", "Say hello to start the conversation."));
        }
        const composer = element("form", "message-composer");
        const input = element("textarea", "field");
        input.maxLength = MAX_MESSAGE_LENGTH;
        input.required = true;
        input.setAttribute("aria-label", "Write a message");
        input.placeholder = "Write a message...";
        const send = element("button", "btn btn-primary", "Send");
        send.type = "submit";
        composer.append(input, send);
        composer.addEventListener("submit", (event) => {
          event.preventDefault();
          try {
            store.sendMessage(active.id, profile.id, input.value);
            render();
            const nextInput = app.querySelector(".message-composer textarea");
            if (nextInput) nextInput.focus();
          } catch (error) {
            status.textContent = error.message;
          }
        });
        panel.append(transcript, composer);
      }
      app.append(sidebar, panel);
    }

    window.addEventListener("storage", (event) => {
      if (event.key === PROFILE_KEY || event.key === CONVERSATION_KEY) render();
    });
    render();
  }

  return { createProfileId, createStore, init };
});
