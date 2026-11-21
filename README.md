# Larper – Tech for Women

Website for **Tech for Women**, a nonprofit bringing tech education to underserved students across the Valley through free workshops and classes. The site makes it easier for mentors and mentees to connect online (calls, chat) or in person, with community posts and private calendar reminders.

## What's built so far

Everything starts on `index.html`, where the user chooses **mentor** or **mentee** and enters a local profile preview. This is not account creation or sign-in.

**Mentor flow** (`onboarding.html`): what you teach (broad to specific, up to 4) → ad title (12+ words) → about your lessons (40+ words) → about you (30+ words) → lesson format (public place / travel / online) → profile photo.

**Mentee flow**: what you're interested in learning (up to 6) → a short profile description → profile photo.

Both end on `profile.html`, the profile home with profile details, a teaching ad or learning plan, and a two-way messaging preview.

## Run it

No build step. Open `index.html` in a browser, or run `python3 -m http.server` and visit http://localhost:8000.
Run the focused messaging tests with `node --test js/messaging.test.js`.

## Notes

- **Profile and onboarding are a local preview, not account sign-up or sign-in.** The app does not collect passwords or email addresses. The preview is stored in `sessionStorage` and clears when the browser tab closes; it is not a secure substitute for the Cloudflare Access identity required by private calendar APIs.
- **Messaging is a local prototype, not private communication.** Completed profiles are listed to the other role in the same browser, and conversations are saved in `localStorage` so another preview in that browser can reply. It does not work across devices or browsers, and anyone using this browser can read or change the preview messages. A real service needs authenticated accounts, server-side role/participant authorization, and secure message storage.
- The previous prototype stored profiles persistently in `localStorage`; opening `index.html` removes only its old `tfw_session` and `tfw_profile` keys. No backend provider or credentials are configured, so production authentication and messaging still require infrastructure setup.
- Colors are provisional. All of them are tokens at the top of `css/styles.css`, so matching the nonprofit's brand colors is a one-block change.
- Profile photos are resized to a 512px square in the browser before saving to the current tab's session storage.
- Word minimums, topic limits, photo rules, etc. are in `CONFIG` at the top of `js/onboarding.js`. Topics live in `js/topics.js`.
- Text fields reject links, emails and phone numbers, since contact details shouldn't appear in public text.

## Community feed and private calendar

`feed.html` provides a personalized, searchable community feed with For You / Following views, mentor advice and mentee question posts, comments and replies, and up/down voting. `profile.html` also contains a private calendar for appointments and events. Calendar reads and changes are always scoped to the identity verified by Cloudflare Access; client-supplied profile IDs are not used. Reminders are scheduled for 9 a.m. in the event's time zone on the day before and the day of the event.

The feed and calendar use a Cloudflare Worker and D1. Neither is shared or writable until Cloudflare resources and identity are configured:

1. Create a Cloudflare D1 database, replace `database_id` in `wrangler.toml` with its real ID, and apply both migrations: `npx wrangler d1 migrations apply larper-community --remote`.
2. Protect the site and Worker API with Cloudflare Access. Configure the Worker `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` bindings and set `FEED_AUTH_MODE` to `cloudflare-access`. The Access JWT must include each user's stable `sub`; calendar writes also require a valid `email` claim.
3. Configure a Resend account with a verified sending domain. Set the Worker secret with `npx wrangler secret put RESEND_API_KEY`, and set the non-secret `REMINDER_FROM_EMAIL` Worker variable to a sender address on that verified domain. Do not put credentials in `wrangler.toml` or source control.
4. The Worker declares an hourly Cron Trigger. Deploy the Worker and assets to enable it; reminders will not be sent until D1, Access, the Resend API key, and sender address are configured.

The current secure boundary rejects calendar reads and writes unless `FEED_AUTH_MODE=cloudflare-access` and a valid RS256 `CF-Access-Jwt-Assertion` is verified against the configured team domain and audience. Calendar data is never returned in public feed responses, and the local profile role and name are never accepted as authenticated identity. Reminder delivery is recorded by event and reminder type, and Resend receives a stable idempotency key so scheduled retries do not duplicate successful sends.

The existing profile is a local preview, not a real account. Calendar data is not saved in that browser preview; it appears only when the page is served behind configured Access and the Worker/D1 are available. No email will be sent until the deployment prerequisites above are complete.

Run feed and calendar tests with:

```sh
npm test
```
