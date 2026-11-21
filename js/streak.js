(function (root, factory) {
  const api = factory();
  if (root) root.TfwLearningStreak = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const KEY_PREFIX = "tfw_learning_streak:";

  function localDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateNumber(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return timestamp / 86400000;
  }

  function createStore(storage) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new Error("Browser storage is unavailable. Enable storage to save your learning streak.");
    }

    function recordLogin(profileId, today = localDate()) {
      if (typeof profileId !== "string" || !profileId.trim()) {
        throw new Error("Your profile is missing the information needed to save a learning streak.");
      }
      const todayNumber = dateNumber(today);
      if (todayNumber === null) throw new Error("The current date is invalid. Your learning streak could not be saved.");

      const key = `${KEY_PREFIX}${encodeURIComponent(profileId)}`;
      const raw = storage.getItem(key);
      let previous = null;
      if (raw !== null) {
        try {
          previous = JSON.parse(raw);
        } catch (error) {
          throw new Error("Saved learning streak data could not be read. Clear this preview's browser storage and try again.");
        }
        if (!previous || !Number.isInteger(previous.count) || previous.count < 1 ||
            dateNumber(previous.lastActiveDate) === null) {
          throw new Error("Saved learning streak data is invalid. Clear this preview's browser storage and try again.");
        }
      }

      const previousNumber = previous ? dateNumber(previous.lastActiveDate) : null;
      if (previous && todayNumber <= previousNumber) return previous;
      const count = previous && todayNumber - previousNumber === 1 ? previous.count + 1 : 1;
      const streak = { count, lastActiveDate: today };
      storage.setItem(key, JSON.stringify(streak));
      return streak;
    }

    return { recordLogin };
  }

  return { createStore };
});
