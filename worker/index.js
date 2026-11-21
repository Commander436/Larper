import { clamp, parseTopics, rankPosts, validatePost } from "./feed-utils.js";

const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

function randomId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function pemToDer(pem) {
  const base64 = pem.replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "")
    .replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyCloudflareAccess(request, env) {
  const token = request.headers.get("CF-Access-Jwt-Assertion");
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    if (header.alg !== "RS256" || !payload.sub) return null;

    const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!teamDomain) return null;
    const issuer = `https://${teamDomain}/`;
    if (payload.iss !== issuer && payload.iss !== issuer.slice(0, -1)) return null;

    const audience = env.CF_ACCESS_AUD ? String(env.CF_ACCESS_AUD).split(",").map((value) => value.trim()) : [];
    const tokenAudience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (audience.length && !audience.some((expected) => tokenAudience.includes(expected))) return null;

    const certificatesResponse = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!certificatesResponse.ok) return null;
    const certificates = await certificatesResponse.json();
    const certificate = (certificates.public_key || certificates.public_cert)
      ? (certificates.public_key || certificates.public_cert)
      : (certificates.keys || certificates.certs || []).find((key) => key.kid === header.kid);
    const pem = typeof certificate === "object" ? (certificate.cert || certificate.pem || certificate.x509 || certificate.public_key) : certificate;
    if (!pem) return null;

    const key = await crypto.subtle.importKey(
      "spki",
      pemToDer(pem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlDecode(parts[2]),
      encoder.encode(`${parts[0}.${parts[1]}`),
    );
    if (!verified) return null;
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return {
      id: `access:${payload.sub}`,
      name: String(payload.name || payload.email || "Community member").slice(0, 60),
    };
  } catch (_) {
    return null;
  }
}

async function authenticate(request, env) {
  if (env.FEED_AUTH_MODE !== "cloudflare-access") {
    return { response: json({
      error: "Authentication is not configured",
      code: "AUTH_NOT_CONFIGURED",
    }, 503) };
  }
  const identity = await verifyCloudflareAccess(request, env);
  if (!identity) return { response: json({
    error: "Sign in with the configured Cloudflare Access provider",
    code: "AUTH_REQUIRED",
  }, 401) };
  return { identity };
}

async function ensureUser(db, identity) {
  await db.prepare("INSERT INTO users (id, display_name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name")
    .bind(identity.id, identity.name).run();
}

async function getFeed(env, url) {
  const limit = clamp(url.searchParams.get("limit"), 1, 50, 30);
  const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim().slice(0, 100);
  const interests = url.searchParams.get("interests") || "";
  const mode = url.searchParams.get("mode") === "following" ? "following" : "for-you";

  const rows = await env.FEED_DB.prepare(`
    SELECT p.id, p.author_id, p.author_name, p.post_type, p.title, p.body, p.topics, p.created_at,
      COALESCE(SUM(v.value), 0) AS score,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p
    LEFT JOIN votes v ON v.post_id = p.id
    WHERE (? = '' OR p.title LIKE '%' || ? || '%' OR p.body LIKE '%' || ? || '%' OR p.topics LIKE '%' || ? || '%')
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ?
  `).bind(search, search, search, search, limit).all();

  const posts = rankPosts(rows.results || [], interests, mode);
  return json({ posts, mode, search });
}

async function getComments(env, postId) {
  const rows = await env.FEED_DB.prepare(
    "SELECT id, post_id, author_name, parent_id, body, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC"
  ).bind(postId).all();
  return json({ comments: rows.results || [] });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/status") {
      return json({
        enabled: env.FEED_AUTH_MODE === "cloudflare-access",
        reason: env.FEED_AUTH_MODE === "cloudflare-access"
          ? ""
          : "Shared writes require Cloudflare Access configuration. Local previews remain read-only.",
      });
    }
    if (url.pathname === "/api/feed" && request.method === "GET") {
      return getFeed(env, url);
    }

    const commentsMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
    if (commentsMatch && request.method === "GET") {
      return getComments(env, decodeURIComponent(commentsMatch[1]));
    }

    const voteMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/vote$/);
    if (voteMatch && request.method === "POST") {
      const auth = await authenticate(request, env);
      if (auth.response) return auth.response;
      let body;
      try { body = await request.json(); } catch (_) { return badRequest("A JSON request body is required."); }
      if (body.value !== 1 && body.value !== -1) return badRequest("Vote value must be 1 or -1.");
      await ensureUser(env.FEED_DB, auth.identity);
      const postId = decodeURIComponent(voteMatch[1]);
      const post = await env.FEED_DB.prepare("SELECT id FROM posts WHERE id = ?").bind(postId).first();
      if (!post) return json({ error: "Post not found" }, 404);
      await env.FEED_DB.prepare(
        "INSERT INTO votes (post_id, user_id, value) VALUES (?, ?, ?) ON CONFLICT(post_id, user_id) DO UPDATE SET value = excluded.value"
      ).bind(postId, auth.identity.id, body.value).run();
      const score = await env.FEED_DB.prepare("SELECT COALESCE(SUM(value), 0) AS score FROM votes WHERE post_id = ?").bind(postId).first();
      return json({ score: Number(score.score) });
    }

    if (url.pathname === "/api/posts" && request.method === "POST") {
      const auth = await authenticate(request, env);
      if (auth.response) return auth.response;
      let body;
      try { body = await request.json(); } catch (_) { return badRequest("A JSON request body is required."); }
      const validationError = validatePost(body);
      if (validationError) return badRequest(validationError);
      await ensureUser(env.FEED_DB, auth.identity);
      const id = randomId("post");
      const title = body.title.trim();
      const text = body.body.trim();
      const topics = [...new Set(parseTopics(body.topics, 5))];
      await env.FEED_DB.prepare(
        "INSERT INTO posts (id, author_id, author_name, post_type, title, body, topics) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, auth.identity.id, auth.identity.name, body.post_type, title, text, JSON.stringify(topics)).run();
      return json({ id }, 201);
    }

    if (commentsMatch && request.method === "POST") {
      const auth = await authenticate(request, env);
      if (auth.response) return auth.response;
      let body;
      try { body = await request.json(); } catch (_) { return badRequest("A JSON request body is required."); }
      if (typeof body.body !== "string" || body.body.trim().length < 1 || body.body.trim().length > 2000) {
        return badRequest("Comments must be between 1 and 2000 characters.");
      }
      await ensureUser(env.FEED_DB, auth.identity);
      const postId = decodeURIComponent(commentsMatch[1]);
      const post = await env.FEED_DB.prepare("SELECT id FROM posts WHERE id = ?").bind(postId).first();
      if (!post) return json({ error: "Post not found" }, 404);
      if (body.parent_id != null) {
        const parentId = String(body.parent_id).slice(0, 80);
        const parent = await env.FEED_DB.prepare("SELECT id FROM comments WHERE id = ? AND post_id = ?").bind(parentId, postId).first();
        if (!parent) return json({ error: "Reply target not found" }, 404);
      }
      const id = randomId("comment");
      await env.FEED_DB.prepare(
        "INSERT INTO comments (id, post_id, author_id, author_name, parent_id, body) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(id, postId, auth.identity.id, auth.identity.name, body.parent_id ? String(body.parent_id).slice(0, 80) : null, body.body.trim()).run();
      return json({ id }, 201);
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: "Not found" }, 404);
  },
};
