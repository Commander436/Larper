"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createStore } = require("./messaging");

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function addProfiles(store) {
  store.registerProfile({ id: "mentor-1", name: "Mentor One", role: "mentor" });
  store.registerProfile({ id: "mentor-2", name: "Mentor Two", role: "mentor" });
  store.registerProfile({ id: "learner-1", name: "Learner One", role: "mentee" });
}

test("contacts are limited to the opposite role and exclude the current profile", () => {
  const store = createStore(memoryStorage());
  addProfiles(store);

  assert.deepEqual(store.getContacts("mentor-1").map((profile) => profile.id), ["learner-1"]);
  assert.deepEqual(store.getContacts("learner-1").map((profile) => profile.id), ["mentor-1", "mentor-2"]);
});

test("either role can start and reply in the same one-to-one conversation", () => {
  const store = createStore(memoryStorage());
  addProfiles(store);

  const openedByLearner = store.startConversation("learner-1", "mentor-1");
  const openedByMentor = store.startConversation("mentor-1", "learner-1");
  assert.equal(openedByMentor.id, openedByLearner.id);

  store.sendMessage(openedByLearner.id, "learner-1", "I'd like to learn Python.");
  store.sendMessage(openedByLearner.id, "mentor-1", "Let's talk about your goals.");
  assert.equal(store.getThreads("learner-1")[0].latest.body, "Let's talk about your goals.");
  assert.equal(store.getThreads("mentor-1")[0].messages.length, 2);
});

test("same-role, unauthorized, empty, and oversized messages are rejected", () => {
  const store = createStore(memoryStorage());
  addProfiles(store);
  const conversation = store.startConversation("mentor-1", "learner-1");

  assert.throws(() => store.startConversation("mentor-1", "mentor-2"), /only available between a mentor and a learner/);
  assert.throws(() => store.sendMessage(conversation.id, "mentor-2", "Hello"), /don't have access/);
  assert.throws(() => store.sendMessage(conversation.id, "mentor-1", "  "), /Write a message/);
  assert.throws(() => store.sendMessage(conversation.id, "mentor-1", "x".repeat(2001)), /2000 characters/);
});
