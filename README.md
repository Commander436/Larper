# Larper - Tech for Women

**Project name:** Larper

**Nonprofit:** Tech for Women

**Team members:** Darris Koikkara and Nithis Nagappan

**Live app:** [larper.darris-dk.workers.dev](https://larper.darris-dk.workers.dev/)

## The problem

Women and students in underserved communities across the Phoenix Valley can have limited access to free technology education and mentorship. Tech for Women needs an accessible place for learners and mentors to find each other, share advice, and coordinate learning.

## Tech stack

- Frontend: HTML, CSS, and vanilla JavaScript
- Backend: Cloudflare Workers and Cloudflare D1
- Identity: username/password accounts and optional Cloudflare Access
- Reminders: Resend API and a Cloudflare Cron Trigger
- Tests: Node.js built-in test runner

## How to run it

To preview the frontend locally, run:

```sh
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000). There is no frontend build step. This runs the local preview, not the production authentication service.

Run the tests with Node.js installed:

```sh
npm test
```

## What's finished

- Mentor and mentee onboarding and profile previews, including topic selection and photo handling.
- Secure username/password account registration and sign-in. Passwords are stored as salted PBKDF2 hashes in D1; session tokens are hashed in storage and issued only in `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- Worker API logic for searchable community posts, comments, replies, and votes.
- Calendar event API with identity-scoped access checks and reminder scheduling logic.
- Cloudflare Access login and JWT verification routes, ready for a configured identity provider such as Google/Gmail.
- Responsive desert-themed sign-in, profile, and home/feed visuals.

## What's mocked up or not enabled

- Profile details and photos remain local browser previews; they are not synchronized as account profile data.
- Messaging is a local prototype stored in this browser, not private or synchronized.
- When secure calendar access is unavailable, the calendar uses a browser-only preview. Preview events are not private or shared, and reminders are not sent.
- Google/Gmail sign-in uses the Cloudflare Access flow, but the live app currently reports Cloudflare Access as disabled. The checked-in `wrangler.toml` also keeps `FEED_AUTH_MODE` disabled. Apple and Microsoft sign-in are not configured.
- The frontend can be previewed without the Worker, but shared feed and account features need the Worker and D1.

## What's next

1. Enable the already-configured Google/Gmail identity provider for this Worker by setting `FEED_AUTH_MODE=cloudflare-access`, `CF_ACCESS_TEAM_DOMAIN`, and `CF_ACCESS_AUD`; verify the live auth status reports Cloudflare Access enabled.
2. Apply the D1 migrations, deploy the Worker and assets, and keep preview storage separate from production.
3. Configure Resend with a verified sender address and API key to enable email reminders.

Do not commit provider credentials or API keys. Set secrets with Wrangler.

## Backend setup notes

The Worker uses the `FEED_DB` binding. Apply the migrations to the production database with:

```sh
npx wrangler d1 migrations apply yo --remote
```

Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` as Worker variables. The Access JWT must include a stable `sub`; calendar writes also require a valid email claim. For reminders, set `RESEND_API_KEY` as a Worker secret and configure `REMINDER_FROM_EMAIL` as a Worker variable. The hourly Cron Trigger is declared in `wrangler.toml`.
