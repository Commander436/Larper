# Larper – Tech for Women

Website for **Tech for Women**, a nonprofit bringing tech education to underserved students across the Valley through free workshops and classes. The site makes it easier for mentors and mentees to connect online (calls, chat) or in person, with community posts to follow (coming later).

## What's built so far

Everything starts on `index.html`, where the user chooses **mentor** or **mentee** and enters a local profile preview. This is not account creation or sign-in.

**Mentor flow** (`onboarding.html`): what you teach (broad to specific, up to 4) → ad title (12+ words) → about your lessons (40+ words) → about you (30+ words) → lesson format (public place / travel / online) → profile photo.

**Mentee flow**: what you're interested in learning (up to 6) → a short profile description → profile photo.

Both end on `profile.html`, the profile home with profile details, a teaching ad or learning plan, and a two-way messaging preview.

## Run it

No build step. Open `index.html` in a browser, or run `python3 -m http.server` and visit http://localhost:8000.
Run the focused messaging tests with `node --test js/messaging.test.js`.

## Notes

- **No backend or real accounts yet.** The app intentionally does not collect passwords, email addresses, or offer non-functional Google/Apple buttons. The local preview is stored in `sessionStorage` and clears when the browser tab closes. It is not a secure substitute for a backend; do not enter private contact details or home addresses.
- **Messaging is a local prototype, not private communication.** Completed profiles are listed to the other role in the same browser, and conversations are saved in `localStorage` so another preview in that browser can reply. It does not work across devices or browsers, and anyone using this browser can read or change the preview messages. A real service needs authenticated accounts, server-side role/participant authorization, and secure message storage.
- The previous prototype stored profiles persistently in `localStorage`; opening `index.html` removes only its old `tfw_session` and `tfw_profile` keys. No backend provider or credentials are configured, so production authentication and messaging still require infrastructure setup.
- Colors are provisional. All of them are tokens at the top of `css/styles.css`, so matching the nonprofit's brand colors is a one-block change.
- Profile photos are resized to a 512px square in the browser before saving to the current tab's session storage.
- Word minimums, topic limits, photo rules, etc. are in `CONFIG` at the top of `js/onboarding.js`. Topics live in `js/topics.js`.
- Text fields reject links, emails and phone numbers, since contact details shouldn't appear in public text.

## Community feed

`feed.html` provides a personalized, searchable community feed with For You / Following views, mentor advice and mentee question posts, comments and replies, and up/down voting. It uses the existing session profile for interest-based ranking only.

The shared feed is implemented with a Cloudflare Worker and D1. It is **not shared or writable until Cloudflare resources and identity are configured**:

1. Create a D1 database and replace `database_id` in `wrangler.toml` with the real ID.
2. Apply `migrations/0001_community_feed.sql` to that database.
3. Protect the Worker/site with a real identity provider, preferably Cloudflare Access.
4. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`, and change `FEED_AUTH_MODE` from `disabled` to `cloudflare-access` in Worker bindings.
5. Deploy the Worker and assets. Do not commit credentials or binding secrets.

The current secure boundary rejects post, comment, reply, and vote writes unless `FEED_AUTH_MODE=cloudflare-access` and a valid RS256 `CF-Access-Jwt-Assertion` is verified against the configured team domain and audience. The local profile role and name are never accepted as authenticated identity. Public feed reads remain available, and the UI clearly marks the feed read-only when authentication is absent.

Run focused feed utility tests with:

```sh
npm test
```
