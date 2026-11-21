import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

test("For You feed returns mentor advice cards and excludes questions", async () => {
  const rows = [
    {
      id: "mentor-1",
      author_id: "mentor-1",
      author_name: "Ari",
      post_type: "advice",
      title: "Build a portfolio",
      body: "Start with a small project.",
      topics: '["Career"]',
      created_at: "2026-01-02T00:00:00Z",
      score: 3,
      comment_count: 2,
    },
    {
      id: "mentee-1",
      author_id: "mentee-1",
      author_name: "Sam",
      post_type: "question",
      title: "Which language?",
      body: "What should I learn first?",
      topics: '["Beginner"]',
      created_at: "2026-01-01T00:00:00Z",
      score: 0,
      comment_count: 0,
    },
  ];
  let feedQuery = "";
  let feedArgs = [];
  const db = {
    prepare(query) {
      feedQuery = query;
      return {
        bind(...args) {
          feedArgs = args;
          return this;
        },
        async all() {
          const following = feedArgs[0] === "following";
          return { results: following ? rows : rows.filter((post) => post.post_type === "advice") };
        },
      };
    },
  };

  const response = await worker.fetch(new Request("https://larper.test/api/feed"), { FEED_DB: db });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(feedQuery, /\? = 'following' OR p\.post_type = 'advice'/);
  assert.deepEqual(data.posts.map(({ id }) => id), ["mentor-1"]);
  assert.equal(data.posts[0].author_name, "Ari");
  assert.equal(data.posts[0].title, "Build a portfolio");
  assert.equal(data.posts[0].body, "Start with a small project.");
  assert.deepEqual(data.posts[0].topics, ["Career"]);

  const followingResponse = await worker.fetch(new Request("https://larper.test/api/feed?mode=following"), { FEED_DB: db });
  const followingData = await followingResponse.json();
  assert.deepEqual(followingData.posts.map(({ id }) => id), ["mentor-1", "mentee-1"]);
});

test("Cloudflare Access sign-in endpoints expose status and safe redirects", async () => {
  const disabledResponse = await worker.fetch(
    new Request("https://larper.test/api/auth/status"),
    { FEED_AUTH_MODE: "disabled" },
  );
  assert.deepEqual(await disabledResponse.json(), {
    enabled: false,
    reason: "Secure sign-in requires Cloudflare Access configuration. Local previews remain read-only.",
  });

  const env = {
    FEED_AUTH_MODE: "cloudflare-access",
    CF_ACCESS_TEAM_DOMAIN: "team.example",
    CF_ACCESS_AUD: "app-audience",
  };
  const statusResponse = await worker.fetch(new Request("https://larper.test/api/auth/status"), env);
  assert.equal((await statusResponse.json()).enabled, true);

  const loginResponse = await worker.fetch(
    new Request("https://larper.test/api/auth/login?return_to=https://evil.example"),
    env,
  );
  assert.equal(loginResponse.status, 302);
  const loginLocation = new URL(loginResponse.headers.get("location"));
  assert.equal(loginLocation.origin, "https://team.example");
  assert.equal(loginLocation.pathname, "/cdn-cgi/access/login/app-audience");
  assert.equal(loginLocation.searchParams.get("redirect_url"), "https://larper.test/index.html?access=complete");

  const logoutResponse = await worker.fetch(new Request("https://larper.test/api/auth/logout"), env);
  const logoutLocation = new URL(logoutResponse.headers.get("location"));
  assert.equal(logoutLocation.origin, "https://larper.test");
  assert.equal(logoutLocation.pathname, "/cdn-cgi/access/logout");
  assert.equal(logoutLocation.searchParams.get("returnTo"), "https://larper.test/index.html");

  const sessionResponse = await worker.fetch(new Request("https://larper.test/api/auth/session"), env);
  assert.equal(sessionResponse.status, 401);
});
