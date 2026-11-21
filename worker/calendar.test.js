import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "./index.js";
import { eventLocalDate, reminderTypeForEvent, validateCalendarEvent } from "./calendar-utils.js";

globalThis.crypto = webcrypto;

const originalFetch = globalThis.fetch;
let privateKey;
let publicKeyPem;
const sentEmails = [];

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function tokenFor(sub, email) {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: "calendar-test" }));
  const payload = base64Url(JSON.stringify({
    iss: "https://team.example/",
    aud: ["calendar-test"],
    sub,
    email,
    name: sub,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }));
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input));
  return `${input}.${base64Url(signature)}`;
}

class FakeD1 {
  constructor() {
    this.users = new Map();
    this.events = new Map();
    this.deliveries = new Map();
  }

  prepare(query) {
    return new FakeStatement(this, query);
  }
}

class FakeStatement {
  constructor(db, query) {
    this.db = db;
    this.query = query;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    if (this.query.includes("FROM calendar_events WHERE id = ? AND user_id = ?")) {
      const event = this.db.events.get(this.args[0]);
      return event?.user_id === this.args[1] ? { id: event.id } : null;
    }
    return null;
  }

  async all() {
    if (this.query.includes("FROM calendar_events WHERE user_id = ?")) {
      return {
        results: [...this.db.events.values()]
          .filter((event) => event.user_id === this.args[0])
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          .map(({ id, title, description, starts_at, timezone, created_at, updated_at }) =>
            ({ id, title, description, starts_at, timezone, created_at, updated_at })),
      };
    }
    if (this.query.includes("FROM calendar_events e")) {
      return {
        results: [...this.db.events.values()]
          .filter((event) => event.starts_at > this.args[0] && event.starts_at <= this.args[1])
          .map((event) => ({ ...event, email: this.db.users.get(event.user_id)?.email })),
      };
    }
    return { results: [] };
  }

  async run() {
    if (this.query.startsWith("INSERT INTO users")) {
      this.db.users.set(this.args[0], { id: this.args[0], name: this.args[1], email: this.args[2] });
    } else if (this.query.startsWith("INSERT INTO calendar_events")) {
      const [id, user_id, title, description, starts_at, event_local_date, timezone] = this.args;
      this.db.events.set(id, {
        id, user_id, title, description, starts_at, event_local_date, timezone,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      });
    } else if (this.query.startsWith("UPDATE calendar_events")) {
      const [title, description, starts_at, event_local_date, timezone, id, user_id] = this.args;
      const event = this.db.events.get(id);
      if (event?.user_id === user_id) Object.assign(event, { title, description, starts_at, event_local_date, timezone });
    } else if (this.query.startsWith("DELETE FROM calendar_events")) {
      const [id, user_id] = this.args;
      if (this.db.events.get(id)?.user_id === user_id) this.db.events.delete(id);
    } else if (this.query.startsWith("INSERT OR IGNORE INTO calendar_reminder_deliveries")) {
      const [event_id, reminder_type] = this.args;
      const key = `${event_id}:${reminder_type}`;
      if (this.db.deliveries.has(key)) return { meta: { changes: 0 } };
      this.db.deliveries.set(key, { event_id, reminder_type, status: "sending" });
      return { meta: { changes: 1 } };
    } else if (this.query.startsWith("UPDATE calendar_reminder_deliveries")) {
      const [event_id, reminder_type] = this.args;
      const delivery = this.db.deliveries.get(`${event_id}:${reminder_type}`);
      if (delivery) delivery.status = "sent";
    } else if (this.query.startsWith("DELETE FROM calendar_reminder_deliveries")) {
      this.db.deliveries.delete(`${this.args[0]}:${this.args[1]}`);
    }
    return { meta: { changes: 1 } };
  }
}

before(async () => {
  const keys = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  }, true, ["sign", "verify"]);
  privateKey = keys.privateKey;
  const publicDer = Buffer.from(await crypto.subtle.exportKey("spki", keys.publicKey)).toString("base64");
  publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicDer.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/cdn-cgi/access/certs")) {
      return new Response(JSON.stringify({ public_key: publicKeyPem }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.resend.com/emails") {
      sentEmails.push({ headers: init.headers, body: JSON.parse(init.body) });
      return new Response("{}", { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

function environment(db) {
  return {
    FEED_AUTH_MODE: "cloudflare-access",
    CF_ACCESS_TEAM_DOMAIN: "team.example",
    CF_ACCESS_AUD: "calendar-test",
    FEED_DB: db,
    RESEND_API_KEY: "test-key",
    REMINDER_FROM_EMAIL: "calendar@example.test",
  };
}

async function apiRequest(path, token, method = "GET", body) {
  return worker.fetch(new Request(`https://larper.test${path}`, {
    method,
    headers: {
      "CF-Access-Jwt-Assertion": token,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }), environment(apiRequest.db));
}

test("calendar CRUD is owner-scoped and ignores client-supplied user IDs", async () => {
  const db = new FakeD1();
  apiRequest.db = db;
  const alice = await tokenFor("alice", "alice@example.test");
  const bob = await tokenFor("bob", "bob@example.test");
  const eventBody = {
    title: "Mentor session",
    description: "Plan the next project",
    starts_at: "2026-11-23T18:00:00.000Z",
    timezone: "America/Los_Angeles",
    user_id: "access:bob",
  };

  const create = await apiRequest("/api/calendar/events", alice, "POST", eventBody);
  assert.equal(create.status, 201);
  const { id } = await create.json();
  assert.equal(db.events.get(id).user_id, "access:alice");

  const bobList = await apiRequest("/api/calendar/events", bob);
  assert.deepEqual((await bobList.json()).events, []);
  assert.equal((await apiRequest(`/api/calendar/events/${id}`, bob, "PATCH", eventBody)).status, 404);
  assert.equal((await apiRequest(`/api/calendar/events/${id}`, bob, "DELETE")).status, 404);

  const update = await apiRequest(`/api/calendar/events/${id}`, alice, "PATCH", {
    ...eventBody,
    title: "Updated mentor session",
  });
  assert.equal(update.status, 200);
  const aliceList = await apiRequest("/api/calendar/events", alice);
  assert.equal((await aliceList.json()).events[0].title, "Updated mentor session");
  assert.equal((await apiRequest(`/api/calendar/events/${id}`, alice, "DELETE")).status, 200);
});

test("calendar event validation rejects invalid dates, fields, and time zones", async () => {
  const db = new FakeD1();
  apiRequest.db = db;
  const alice = await tokenFor("alice", "alice@example.test");
  const valid = {
    title: "Mentor session",
    description: "",
    starts_at: "2026-11-23T18:00:00.000Z",
    timezone: "America/Los_Angeles",
  };
  assert.match(validateCalendarEvent({ ...valid, starts_at: "2026-02-31T18:00:00.000Z" }), /valid event date/);
  assert.match(validateCalendarEvent({ ...valid, timezone: "Not/A_Timezone" }), /time zone/);
  const response = await apiRequest("/api/calendar/events", alice, "POST", { ...valid, title: "" });
  assert.equal(response.status, 400);
  assert.equal((await apiRequest("/api/calendar/events", alice, "POST", { ...valid, title: "Line one\nLine two" })).status, 400);
  assert.equal(db.events.size, 0);
});

test("reminders respect event-local days and duplicate cron runs send only once", async () => {
  const db = new FakeD1();
  const start = "2026-11-21T12:00:00.000Z";
  db.users.set("access:alice", { email: "alice@example.test" });
  db.events.set("event_test", {
    id: "event_test",
    user_id: "access:alice",
    title: "Project review",
    description: "",
    starts_at: start,
    event_local_date: eventLocalDate(start, "UTC"),
    timezone: "UTC",
  });
  assert.equal(reminderTypeForEvent(db.events.get("event_test"), new Date("2026-11-20T10:00:00Z")), "day_before");
  assert.equal(reminderTypeForEvent(db.events.get("event_test"), new Date("2026-11-21T10:00:00Z")), "event_day");
  assert.equal(reminderTypeForEvent(db.events.get("event_test"), new Date("2026-11-21T08:00:00Z")), null);
  const afterDstTransition = "2026-11-02T20:00:00.000Z";
  assert.equal(eventLocalDate(afterDstTransition, "America/Los_Angeles"), "2026-11-02");
  assert.equal(reminderTypeForEvent({
    starts_at: afterDstTransition,
    event_local_date: "2026-11-02",
    timezone: "America/Los_Angeles",
  }, new Date("2026-11-02T17:00:00Z")), "event_day");

  const beforeCount = sentEmails.length;
  const env = environment(db);
  const controller = { scheduledTime: new Date("2026-11-21T10:00:00Z").getTime() };
  await worker.scheduled(controller, env);
  await worker.scheduled(controller, env);
  assert.equal(sentEmails.length - beforeCount, 1);
  assert.equal(db.deliveries.get("event_test:event_day").status, "sent");
  assert.equal(sentEmails[sentEmails.length - 1].headers["Idempotency-Key"], "larper-calendar-event_test:event_day");
});
