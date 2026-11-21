# Tech for Women

By Darris Koikkara and Nithis Nagappan

Website for **Tech for Women**, a nonprofit bringing tech education to underserved students across the Valley through free workshops and classes. The site makes it easier for mentors and mentees to connect online (calls, chat) or in person, with community posts and private calendar email reminders.

## Run it

No build step. Open `index.html` in a browser, or run `python3 -m http.server` and visit http://localhost:8000.
Run the focused messaging tests with `node --test js/messaging.test.js`, focused streak tests with `node --test js/streak.test.js`, and the configured worker/streak suite with `npm test`.

## Notes

- **Profile and onboarding details are a local preview, not account storage.** The app never collects or stores passwords. Optional secure sign-in uses Cloudflare Access; its edge-managed session is verified by the Worker and no Access token is stored in browser storage. The role and profile preview are still stored in `sessionStorage` and clear when the browser tab closes.
- **Messaging is a local prototype, not private communication.** Completed profiles are listed to the other role in the same browser, and conversations are saved in `localStorage` so another preview in that browser can reply. It does not work across devices or browsers, and anyone using this browser can read or change the preview messages. A real service needs authenticated accounts, server-side role/participant authorization, and secure message storage.
- Learner learning streaks are stored in browser `localStorage` by profile ID. A learner's first visit starts a one-day streak, same-day visits count once, and returning after a missed local calendar day starts a new streak. This local preview data is not synced or secure account storage.
- The previous prototype stored profiles persistently in `localStorage`; opening `index.html` removes only its old `tfw_session` and `tfw_profile` keys. Cloudflare Access is disabled in the checked-in Wrangler config, so secure sign-in remains unavailable until deployment infrastructure is configured.
- Colors are provisional. All of them are tokens at the top of `css/styles.css`, so matching the nonprofit's brand colors is a one-block change.
- Profile photos are resized to a 512px square in the browser before saving to the current tab's session storage.
- Word minimums, topic limits, photo rules, etc. are in `CONFIG` at the top of `js/onboarding.js`. Topics live in `js/topics.js`.
- Text fields reject links, emails and phone numbers, since contact details shouldn't appear in public text.

## Community feed and private calendar

`feed.html` provides a searchable community feed. The **For You** view shows mentor advice publications to both mentors and mentees; **Following** retains the broader post view, including mentee questions. The feed also supports comments and replies, and up/down voting. `profile.html` also contains a private calendar for appointments and events. Calendar reads and changes are always scoped to the identity verified by Cloudflare Access; client-supplied profile IDs are not used. Reminders are scheduled for 9 a.m. in the event's time zone on the day before and the day of the event.

The feed and calendar use a Cloudflare Worker and D1. Neither is shared or writable until Cloudflare resources and identity are configured:

1. The production `FEED_DB` binding uses the D1 database `yo` and its configured production ID. Apply both migrations to it with `npx wrangler d1 migrations apply yo --remote`.
2. Protect profile/feed pages and private Worker API routes with Cloudflare Access. Keep `index.html`, `/api/auth/status`, `/api/auth/login`, and `/api/auth/logout` reachable without an existing Access session so the sign-in flow can start and finish. Require Access on `/api/auth/session` and the private APIs. Configure the Worker `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` bindings and set `FEED_AUTH_MODE` to `cloudflare-access`. The sign-in page redirects through the configured Access application; the Worker verifies its signed JWT for `/api/auth/session` and private APIs. The Access JWT must include each user's stable `sub`; calendar writes also require a valid `email` claim. Sign-out clears local preview state and redirects through Cloudflare Access logout.
3. Configure a Resend account with a verified sending domain. Set the Worker secret with `npx wrangler secret put RESEND_API_KEY`, and set the non-secret `REMINDER_FROM_EMAIL` Worker variable to a sender address on that verified domain. Do not put credentials in `wrangler.toml` or source control.
4. The Worker declares an hourly Cron Trigger. Deploy the Worker and assets to enable it; reminders will not be sent until D1, Access, the Resend API key, and sender address are configured.

The current secure boundary rejects protected API requests unless `FEED_AUTH_MODE=cloudflare-access` and a valid RS256 `CF-Access-Jwt-Assertion` is verified against the configured team domain and audience. Calendar data is never returned in public feed responses, and the local profile role and name are never accepted as authenticated identity. Reminder delivery is recorded by event and reminder type, and Resend receives a stable idempotency key so scheduled retries do not duplicate successful sends.

Preview deployments intentionally have no D1 binding until a separate Preview database ID is configured; the production database is never exposed to Preview. Feed and comment reads return HTTP 503 while Preview has no database, and calendar writes remain disabled unless Preview authentication is configured.

The existing profile is a local preview, not a real account. Calendar data is not saved in that browser preview; it appears only when the page is served behind configured Access and the Worker/D1 are available. No email will be sent until the deployment prerequisites above are complete.

Run feed and calendar tests with:

```sh
npm test
```
