import assert from "node:assert/strict";
import { test } from "node:test";
import "./streak.js";

const { createStore } = globalThis.TfwLearningStreak;

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

test("consecutive calendar-day visits increase a learner's streak", () => {
  const store = createStore(memoryStorage());

  assert.deepEqual(store.recordLogin("learner-1", "2026-11-19"), {
    count: 1,
    lastActiveDate: "2026-11-19",
  });
  assert.deepEqual(store.recordLogin("learner-1", "2026-11-20"), {
    count: 2,
    lastActiveDate: "2026-11-20",
  });
});

test("multiple visits on the same day do not increase the streak", () => {
  const store = createStore(memoryStorage());
  store.recordLogin("learner-1", "2026-11-19");

  assert.deepEqual(store.recordLogin("learner-1", "2026-11-19"), {
    count: 1,
    lastActiveDate: "2026-11-19",
  });
});

test("missing a calendar day resets the streak and records the new day", () => {
  const store = createStore(memoryStorage());
  store.recordLogin("learner-1", "2026-11-19");
  store.recordLogin("learner-1", "2026-11-20");

  assert.deepEqual(store.recordLogin("learner-1", "2026-11-22"), {
    count: 1,
    lastActiveDate: "2026-11-22",
  });
});

test("streak data persists across store instances and stays scoped to each profile", () => {
  const storage = memoryStorage();
  createStore(storage).recordLogin("learner-1", "2026-11-19");
  createStore(storage).recordLogin("learner-2", "2026-11-19");

  assert.equal(createStore(storage).recordLogin("learner-1", "2026-11-20").count, 2);
  assert.equal(createStore(storage).recordLogin("learner-2", "2026-11-20").count, 2);
});
