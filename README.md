**Tech for Women mentor and mentee platform**

**Team:** Darris Koikkara and Nithis Nagappan
**Nonprofit partner:** Tech for Women

## The problem

Underserved students worldwide often lack easy access to technology education and a clear way to find people who can guide them. Tech for Women provides free workshops and classes, but mentors and mentees need a simple place to discover interests, learn from one another, and keep track of community learning and appointments. It is also clear that mentees often abandon/ghost their learning paths and mentors - a problem which this system will help prevent

This is web experience that brings mentor and mentee onboarding, community discussion, calendars/scheduling, and learning streaks into one project. The goal is to make Tech for Women's programs easier to navigate and to support meaningful mentor-mentee connections.

## How it works

Visitors begin at `index.html`, choose whether they are a mentor or mentee, and complete a guided profile flow. The onboarding experience collects a role, interests or teaching topics, a short profile, lesson format, and a profile photo.

The mentor and mentee profiles feed into the app's profile experience, community feed, calendar, and local messaging preview:

- Mentors describe what they teach and how they offer lessons.
- Mentees describe what they want to learn.
- The community feed supports mentor advice, mentee questions, comments, replies, search, and votes.
- Profile pages include a private calendar for appointments and events, with email reminders scheduled for 9 a.m. in the event's time zone on the day before and day of an event once deployment is configured.
- The current browser-based data flows demonstrate the intended experience even before every integration is deployed.

The server-side implementation uses a Cloudflare Worker and D1 database for account sessions, posts, comments, votes, calendar events, reminder delivery records, and Cloudflare Access identity verification.

## Tech stack

- **Frontend:** HTML5, CSS3, and browser-native JavaScript
- **Module format:** ES modules
- **Server/API:** Cloudflare Workers
- **Database:** Cloudflare D1 with SQLite migrations
- **Authentication:** PBKDF2 password hashing and secure HTTP-only sessions, plus Cloudflare Access JWT verification
- **Email reminders:** Resend
- **Testing:** Node.js built-in `node:test`
- **Deployment:** Cloudflare Workers assets and Cron Triggers

## Run locally

### Static preview

No package build is required. From the repository root:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

The landing page is `index.html`. Direct links to `onboarding.html`, `profile.html`, and `feed.html` are also available.

### Tests

```sh
npm test
```

The test suite is defined in `package.json` and covers the Worker feed and calendar routes, authentication utilities, feed ranking, messaging, and learning streak behavior.

### Cloudflare preview

The checked-in Wrangler configuration disables secure authentication and does not enable D1 for preview deployments. To work with the full server-side app:

1. Install [Node.js](https://nodejs.org/) and [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/).
2. Provision a Cloudflare D1 database and update `wrangler.toml`.
3. Apply the migrations:

   ```sh
   npx wrangler d1 migrations apply yo --remote
   ```

4. Configure Cloudflare Access variables for `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `FEED_AUTH_MODE=cloudflare-access`.
5. For calendar email reminders, configure `RESEND_API_KEY` and `REMINDER_FROM_EMAIL`, and deploy the hourly Cron Trigger.

Details and security requirements are documented in the sections below.

## What is finished

- Responsive landing page and visual design
- Mentor and mentee onboarding flows with topic limits and profile validation
- Profile home with mentor ad or mentee learning-plan content
- Username/password account creation and session handling
- Cloudflare Access verification for deployed identities
- Community feed with advice and question posts, search, comments, replies, and voting
- Private calendar create, read, update, and delete routes
- D1 migrations for users, feed content, calendar events, reminders, credentials, and sessions
- Time-zone-aware reminder scheduling and idempotent delivery records

## What is mocked or not connected yet

- **Profile storage:** profile details remain in `sessionStorage` and are preview data, not a synchronized account profile.
- **Mentor-mentee matching:** matching and real mentor discovery are represented in the interface but are not implemented as a server-side matching system.
- **Messaging:** conversations are a browser-only prototype using `localStorage`. They do not work across devices or provide real private communication.
- **Learning streaks:** streaks are calculated and stored in browser `localStorage`; they are not linked to a secure account or synchronized.
- **Live feed and calendar:** the checked-in deployment mode has authentication and D1 disabled, so server-backed feed/calendar operations require production configuration.
- **Email reminders:** the Worker Cron Trigger, D1 bindings, Resend credentials, and Cloudflare Access must be deployed and configured before reminders send.

These limitations are deliberate boundaries for a prototype: the UI and core logic can be reviewed locally, while real identity, access control, and shared storage require deployment setup.

## What comes next
1. Replace local profile and messaging state with authenticated, server-side accounts and conversations.
2. Implement real mentor-mentee matching and searchable mentor profiles.
3. Expand calendar notifications and add real in-app or email meeting invitations.
4. Add email reminders and text messages to help improve retention. 
5. Add production monitoring, moderation, privacy controls, and data retention policies.

## Links

- **Repository:** [Commander436/Larper](https://github.com/Commander436/Larper)
- **Demo video:** https://www.canva.com/design/DAHblFVOvT4/iA36ZAVQZ87P5cAfeBTqow/edit?ui=e30
- **Cloudflare app:** https://larper.darris-dk.workers.dev/
