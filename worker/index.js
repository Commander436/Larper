import { clamp, parseTopics, rankPosts, validatePost } from "./feed-utils.js";
import { eventLocalDate, reminderTypeForEvent, validateCalendarEvent } from "./calendar-utils.js";
import {
  PASSWORD_ITERATIONS,
  SESSION_MAX_AGE_SECONDS,
  base64UrlDecode as decodeAuthBase64Url,
  base64UrlEncode,
  hashPassword,
  hashSessionToken,
  normalizeUsername,
  validateAccountRegistration,
  validateLoginCredentials,
  verifyPassword,
} from "./auth-utils.js";

const encoder = new TextEncoder();
const SESSION_COOKIE = "__Host-larper_session";

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
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!verified) return null;
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return {
      id: `access:${payload.sub}`,
      name: String(payload.name || payload.email || "Community member").slice(0, 60),
      email: typeof payload.email === "string" && payload.email.length <= 254 ? payload.email : null,
    };
  } catch (_) {
    return null;
  }
}

function cloudflareAccessConfigured(env) {
  return env.FEED_AUTH_MODE === "cloudflare-access" &&
    Boolean(env.CF_ACCESS_TEAM_DOMAIN) &&
    Boolean(env.CF_ACCESS_AUD);
}

async function authenticate(request, env) {
  const accessConfigured = cloudflareAccessConfigured(env);
  if (accessConfigured) {
    const identity = await verifyCloudflareAccess(request, env);
    if (identity) return { identity: { ...identity, authProvider: "cloudflare-access" } };
  }

  const sessionIdentity = await getAccountSession(request, env);
  if (sessionIdentity) {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !sameOriginRequest(request)) {
      return { response: json({ error: "Cross-origin account changes are not allowed." }, 403) };
    }
    return { identity: sessionIdentity };
  }

  if (!accessConfigured && !env.FEED_DB) {
    return { response: json({
      error: "Authentication is not configured",
      code: "AUTH_NOT_CONFIGURED",
    }, 503) };
  }
  return { response: json({ error: "Sign in with your account or configured identity provider.", code: "AUTH_REQUIRED" }, 401) };
}

async function ensureUser(db, identity, saveEmail = false) {
  if (saveEmail) {
    const email = identity.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) ? identity.email : null;
    await db.prepare("INSERT INTO users (id, display_name, email) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, email = COALESCE(excluded.email, users.email)")
      .bind(identity.id, identity.name, email).run();
    return;
  }
  await db.prepare("INSERT INTO users (id, display_name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name")
    .bind(identity.id, identity.name).run();
}

function parseJsonBody(request) {
  return request.json().catch(() => null);
}

function sameOriginRequest(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function sessionToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  const prefix = `${SESSION_COOKIE}=`;
  const pair = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return pair ? pair.slice(prefix.length) : "";
}

function sessionCookie(token, maxAge = SESSION_MAX_AGE_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function createAccountSession(db, userId, provider) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64UrlEncode(tokenBytes);
  const tokenHash = await hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
  await db.prepare(
    "INSERT INTO auth_sessions (token_hash, user_id, provider, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(tokenHash, userId, provider, expiresAt).run();
  return token;
}

async function getAccountSession(request, env) {
  if (!env.FEED_DB) return null;
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = await hashSessionToken(token);
  const row = await env.FEED_DB.prepare(`
    SELECT u.id, u.display_name AS name, u.email, c.username, c.role, s.provider AS auth_provider
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN account_credentials c ON c.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, new Date().toISOString()).first();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    username: row.username || null,
    role: row.role || null,
    authProvider: row.auth_provider,
  };
}

async function revokeAccountSession(request, db) {
  const token = sessionToken(request);
  if (!token || !db) return;
  const tokenHash = await hashSessionToken(token);
  await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
}

async function registerAccount(request, env) {
  if (!sameOriginRequest(request)) return json({ error: "Account registration must come from this site." }, 403);
  if (!env.FEED_DB) return json({ error: "Account storage is not configured." }, 503);
  const body = await parseJsonBody(request);
  const validationError = validateAccountRegistration(body);
  if (validationError) return badRequest(validationError);

  const username = normalizeUsername(body.username);
  const userId = randomId("user");
  const displayName = body.display_name.trim();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await hashPassword(body.password, salt);
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64UrlEncode(tokenBytes);
  const tokenHash = await hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  try {
    await env.FEED_DB.batch([
      env.FEED_DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now.toISOString()),
      env.FEED_DB.prepare("INSERT INTO users (id, display_name) VALUES (?, ?)").bind(userId, displayName),
      env.FEED_DB.prepare(
        "INSERT INTO account_credentials (user_id, username, password_salt, password_hash, password_iterations, role) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(userId, username, base64UrlEncode(salt), passwordHash, PASSWORD_ITERATIONS, body.role),
      env.FEED_DB.prepare(
        "INSERT INTO auth_sessions (token_hash, user_id, provider, expires_at) VALUES (?, ?, 'username-password', ?)"
      ).bind(tokenHash, userId, expiresAt),
    ]);
  } catch (error) {
    if (String(error?.message || error).includes("UNIQUE constraint failed: account_credentials.username")) {
      return json({ error: "That username is already in use." }, 409);
    }
    throw error;
  }

  return json({
    identity: { id: userId, name: displayName, username, role: body.role, authProvider: "username-password" },
  }, 201, { "set-cookie": sessionCookie(token) });
}

async function loginAccount(request, env) {
  if (!sameOriginRequest(request)) return json({ error: "Sign-in must come from this site." }, 403);
  if (!env.FEED_DB) return json({ error: "Account storage is not configured." }, 503);
  const body = await parseJsonBody(request);
  if (!validateLoginCredentials(body)) return badRequest("Enter a valid username and password.");

  const username = normalizeUsername(body.username);
  const row = await env.FEED_DB.prepare(`
    SELECT u.id, u.display_name AS name, c.username, c.password_salt, c.password_hash,
      c.password_iterations, c.role
    FROM account_credentials c
    JOIN users u ON u.id = c.user_id
    WHERE c.username = ?
  `).bind(username).first();
  const salt = row ? decodeAuthBase64Url(row.password_salt) : new Uint8Array(16);
  const expectedHash = row ? row.password_hash : base64UrlEncode(new Uint8Array(32));
  const iterations = row ? row.password_iterations : PASSWORD_ITERATIONS;
  const validPassword = await verifyPassword(body.password, salt, expectedHash, iterations);
  if (!row || !validPassword) return json({ error: "Invalid username or password." }, 401);

  const token = await createAccountSession(env.FEED_DB, row.id, "username-password");
  return json({
    identity: {
      id: row.id,
      name: row.name,
      username: row.username,
      role: row.role,
      authProvider: "username-password",
    },
  }, 200, { "set-cookie": sessionCookie(token) });
}

async function calendarEvents(request, env, identity) {
  if (request.method === "GET") {
    const result = await env.FEED_DB.prepare(
      "SELECT id, title, description, starts_at, timezone, created_at, updated_at FROM calendar_events WHERE user_id = ? ORDER BY starts_at ASC"
    ).bind(identity.id).all();
    return json({ events: result.results || [] });
  }

  const body = await parseJsonBody(request);
  if (!body) return badRequest("A JSON request body is required.");
  const validationError = validateCalendarEvent(body);
  if (validationError) return badRequest(validationError);
  if (!identity.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) {
    return json({ error: "Your sign-in provider must supply a valid email address for reminders." }, 422);
  }

  await ensureUser(env.FEED_DB, identity, true);
  const id = randomId("event");
  const values = [
    body.title.trim(),
    body.description.trim(),
    new Date(body.starts_at).toISOString(),
    body.timezone,
  ];
  await env.FEED_DB.prepare(
    "INSERT INTO calendar_events (id, user_id, title, description, starts_at, event_local_date, timezone) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, identity.id, ...values.slice(0, 2), values[2], eventLocalDate(values[2], values[3]), values[3]).run();
  return json({ id }, 201);
}

async function updateCalendarEvent(request, env, identity, eventId, method) {
  const owned = await env.FEED_DB.prepare(
    "SELECT id FROM calendar_events WHERE id = ? AND user_id = ?"
  ).bind(eventId, identity.id).first();
  if (!owned) return json({ error: "Event not found" }, 404);
  if (method === "DELETE") {
    await env.FEED_DB.prepare("DELETE FROM calendar_events WHERE id = ? AND user_id = ?")
      .bind(eventId, identity.id).run();
    return json({ ok: true });
  }

  const body = await parseJsonBody(request);
  if (!body) return badRequest("A JSON request body is required.");
  const validationError = validateCalendarEvent(body);
  if (validationError) return badRequest(validationError);
  await ensureUser(env.FEED_DB, identity, true);
  await env.FEED_DB.prepare(
    "UPDATE calendar_events SET title = ?, description = ?, starts_at = ?, event_local_date = ?, timezone = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND user_id = ?"
  ).bind(
    body.title.trim(),
    body.description.trim(),
    new Date(body.starts_at).toISOString(),
    eventLocalDate(body.starts_at, body.timezone),
    body.timezone,
    eventId,
    identity.id,
  ).run();
  return json({ ok: true });
}

async function sendReminder(env, event, reminderType) {
  const deliveryId = `${event.id}:${reminderType}`;
  const claim = await env.FEED_DB.prepare(
    "INSERT OR IGNORE INTO calendar_reminder_deliveries (event_id, reminder_type, status, attempted_at) VALUES (?, ?, 'sending', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
  ).bind(event.id, reminderType).run();
  if (!claim.meta?.changes) return false;

  try {
    const eventTime = new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: event.timezone,
    }).format(new Date(event.starts_at));
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "Idempotency-Key": `larper-calendar-${deliveryId}`,
      },
      body: JSON.stringify({
        from: env.REMINDER_FROM_EMAIL,
        to: [event.email],
        subject: reminderType === "day_before" ? `Tomorrow: ${event.title}` : `Today: ${event.title}`,
        text: reminderType === "day_before"
          ? `Reminder: "${event.title}" is tomorrow, ${eventTime} (${event.timezone}).`
          : `Reminder: "${event.title}" is today, ${eventTime} (${event.timezone}).`,
      }),
    });
    if (!response.ok) {
      await env.FEED_DB.prepare(
        "DELETE FROM calendar_reminder_deliveries WHERE event_id = ? AND reminder_type = ? AND status = 'sending'"
      ).bind(event.id, reminderType).run();
      console.error("Calendar reminder provider rejected a message", { eventId: event.id, status: response.status });
      return false;
    }
    await env.FEED_DB.prepare(
      "UPDATE calendar_reminder_deliveries SET status = 'sent', sent_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE event_id = ? AND reminder_type = ?"
    ).bind(event.id, reminderType).run();
    return true;
  } catch (error) {
    await env.FEED_DB.prepare(
      "DELETE FROM calendar_reminder_deliveries WHERE event_id = ? AND reminder_type = ? AND status = 'sending'"
    ).bind(event.id, reminderType).run();
    console.error("Calendar reminder delivery failed", { eventId: event.id, message: error.message });
    return false;
  }
}

async function dispatchCalendarReminders(env, scheduledTime) {
  if (!env.FEED_DB || !env.RESEND_API_KEY || !env.REMINDER_FROM_EMAIL) {
    console.warn("Calendar reminders are disabled until D1 and Resend bindings are configured.");
    return;
  }
  const now = new Date(scheduledTime || Date.now());
  const rows = await env.FEED_DB.prepare(`
    SELECT e.id, e.title, e.starts_at, e.event_local_date, e.timezone, u.email
    FROM calendar_events e
    JOIN users u ON u.id = e.user_id
    WHERE e.starts_at > ? AND e.starts_at <= ?
      AND u.email IS NOT NULL AND u.email != ''
    ORDER BY e.starts_at ASC
    LIMIT 500
  `).bind(now.toISOString(), new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()).all();

  for (const event of rows.results || []) {
    const reminderType = reminderTypeForEvent(event, now);
    if (reminderType) await sendReminder(env, event, reminderType);
  }
}

async function getFeed(env, url) {
  if (!env.FEED_DB) return json({ error: "Community storage is not configured." }, 503);
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
    WHERE (? = 'following' OR p.post_type = 'advice')
      AND (? = '' OR p.title LIKE '%' || ? || '%' OR p.body LIKE '%' || ? || '%' OR p.topics LIKE '%' || ? || '%')
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ?
  `).bind(mode, search, search, search, search, limit).all();

  const posts = rankPosts(rows.results || [], interests, mode);
  return json({ posts, mode, search });
}

async function getComments(env, postId) {
  if (!env.FEED_DB) return json({ error: "Community storage is not configured." }, 503);
  const rows = await env.FEED_DB.prepare(
    "SELECT id, post_id, author_name, parent_id, body, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC"
  ).bind(postId).all();
  return json({ comments: rows.results || [] });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/status") {
      const usernamePasswordEnabled = Boolean(env.FEED_DB);
      const cloudflareAccessEnabled = cloudflareAccessConfigured(env);
      const enabled = usernamePasswordEnabled || cloudflareAccessEnabled;
      return json({
        enabled,
        usernamePasswordEnabled,
        cloudflareAccessEnabled,
        reason: enabled ? "" : "Account storage and Cloudflare Access are not configured. Local previews remain available.",
        methods: [
          ...(usernamePasswordEnabled ? ["password"] : []),
          ...(cloudflareAccessEnabled ? ["cloudflare-access"] : []),
        ],
      });
    }
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      return registerAccount(request, env);
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      return loginAccount(request, env);
    }
    if (url.pathname === "/api/auth/login" && request.method === "GET") {
      if (!cloudflareAccessConfigured(env)) {
        return json({ error: "Cloudflare Access is not configured.", code: "AUTH_NOT_CONFIGURED" }, 503);
      }
      const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//, "").replace(/\/$/, "");
      const audience = String(env.CF_ACCESS_AUD).split(",").map((value) => value.trim()).find(Boolean);
      const loginUrl = new URL(`https://${teamDomain}/cdn-cgi/access/login/${encodeURIComponent(audience)}`);
      loginUrl.searchParams.set("redirect_url", new URL("/api/auth/access-session", url.origin).toString());
      return new Response(null, {
        status: 302,
        headers: { location: loginUrl.toString(), "cache-control": "no-store" },
      });
    }
    if (url.pathname === "/api/auth/access-session" && request.method === "GET") {
      if (!cloudflareAccessConfigured(env)) {
        return json({ error: "Cloudflare Access is not configured.", code: "AUTH_NOT_CONFIGURED" }, 503);
      }
      if (!env.FEED_DB) return json({ error: "Account session storage is not configured." }, 503);
      const identity = await verifyCloudflareAccess(request, env);
      if (!identity) return json({ error: "Sign in with the configured Cloudflare Access provider.", code: "AUTH_REQUIRED" }, 401);
      await ensureUser(env.FEED_DB, identity, true);
      const token = await createAccountSession(env.FEED_DB, identity.id, "cloudflare-access");
      return new Response(null, {
        status: 302,
        headers: {
          location: new URL("/index.html?access=complete", url.origin).toString(),
          "set-cookie": sessionCookie(token),
          "cache-control": "no-store",
        },
      });
    }
    if (url.pathname === "/api/auth/logout" && request.method === "GET") {
      await revokeAccountSession(request, env.FEED_DB);
      const headers = { "set-cookie": sessionCookie("", 0), "cache-control": "no-store" };
      if (!cloudflareAccessConfigured(env)) {
        return new Response(null, { status: 302, headers: { ...headers, location: new URL("/index.html", url.origin).toString() } });
      }
      const logoutUrl = new URL("/cdn-cgi/access/logout", url.origin);
      logoutUrl.searchParams.set("returnTo", new URL("/index.html", url.origin).toString());
      return new Response(null, {
        status: 302,
        headers: { ...headers, location: logoutUrl.toString() },
      });
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      if (!sameOriginRequest(request)) return json({ error: "Sign-out must come from this site." }, 403);
      await revokeAccountSession(request, env.FEED_DB);
      return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
    }
    if (url.pathname === "/api/auth/session" && request.method === "GET") {
      const auth = await authenticate(request, env);
      if (auth.response) return auth.response;
      return json({ identity: auth.identity });
    }
    const calendarEventMatch = url.pathname.match(/^\/api\/calendar\/events\/([^/]+)$/);
    if ((url.pathname === "/api/calendar/events" && (request.method === "GET" || request.method === "POST")) ||
        (calendarEventMatch && ["PATCH", "DELETE"].includes(request.method))) {
      const auth = await authenticate(request, env);
      if (auth.response) return auth.response;
      if (!env.FEED_DB) return json({ error: "Calendar storage is not configured." }, 503);
      if (calendarEventMatch) {
        return updateCalendarEvent(request, env, auth.identity, decodeURIComponent(calendarEventMatch[1]), request.method);
      }
      return calendarEvents(request, env, auth.identity);
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
  async scheduled(controller, env) {
    await dispatchCalendarReminders(env, controller.scheduledTime);
  },
};
