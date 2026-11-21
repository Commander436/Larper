import test from "node:test";
import assert from "node:assert/strict";
import { filterMentorPublications, hasFeedProfile } from "./feed-utils.js";

test("both mentors and mentees can access the mentor publication feed", () => {
  const session = { preview: true };
  assert.equal(hasFeedProfile({ role: "mentor", complete: true }, session), true);
  assert.equal(hasFeedProfile({ role: "mentee", complete: true }, session), true);
  assert.equal(hasFeedProfile({ role: "guest", complete: true }, session), false);
  assert.equal(hasFeedProfile({ role: "mentee", complete: false }, session), false);
  assert.equal(hasFeedProfile({ role: "mentor", complete: true }, { preview: false }), false);
});

test("mentor publication discovery keeps advice cards and excludes questions", () => {
  const publications = [
    { id: "mentor-1", post_type: "advice", author_name: "Ari", title: "Build a portfolio", body: "Start small." },
    { id: "mentee-1", post_type: "question", author_name: "Sam", title: "Which language?", body: "What should I learn?" },
  ];

  assert.deepEqual(filterMentorPublications(publications), [publications[0]]);
  assert.deepEqual(filterMentorPublications(null), []);
});
