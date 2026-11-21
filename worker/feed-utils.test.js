import test from "node:test";
import assert from "node:assert/strict";
import { clamp, parseTopics, rankPosts, safeTopics, validatePost } from "./feed-utils.js";

test("clamp keeps feed limits in range", () => {
  assert.equal(clamp("100", 1, 50, 30), 50);
  assert.equal(clamp("-2", 1, 50, 30), 1);
  assert.equal(clamp("nope", 1, 50, 30), 30);
});

test("parseTopics trims, deduplicates and caps topics", () => {
  assert.deepEqual(parseTopics(" Python, Career, , JavaScript ", 5), ["Python", "Career", "JavaScript"]);
  assert.deepEqual(parseTopics(["Python", "", "Career"], 5), ["Python", "Career"]);
});

test("rankPosts uses title, body and topic interests", () => {
  const posts = [
    { id: "a", title: "General advice", body: "A broad answer", topics: '["Career"]', score: 5 },
    { id: "b", title: "Python study plan", body: "Learn Python projects", topics: '["Python","Beginner"]', score: 1 },
  ];
  const ranked = rankPosts(posts, "Python, Career", "for-you");
  assert.equal(ranked[0].id, "b");
  assert.deepEqual(ranked[0].topics, ["Python", "Beginner"]);
});

test("safeTopics tolerates malformed topic JSON", () => {
  assert.deepEqual(safeTopics("not-json"), []);
  assert.deepEqual(safeTopics('["Python","Career"]'), ["Python", "Career"]);
});

test("validatePost rejects invalid feed posts", () => {
  assert.match(validatePost({ post_type: "other", title: "A title", body: "Enough details" }), /Choose/);
  assert.match(validatePost({ post_type: "advice", title: "Short", body: "Not enough" }), /title/);
  assert.equal(validatePost({
    post_type: "advice",
    title: "A useful title for beginners",
    body: "This is detailed enough to help a member of the community.",
    topics: ["Python"],
  }), null);
});
