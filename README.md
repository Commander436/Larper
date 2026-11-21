# Larper – Tech for Women

Website for **Tech for Women**, a nonprofit bringing tech education to underserved students across the Valley through free workshops and classes. The site makes it easier for mentors and mentees to connect online (calls, chat) or in person, with community posts to follow (coming later).

## What's built so far

Everything starts on `index.html`, where the user first chooses **mentor** or **mentee**, then creates an account (email, username, password) or logs in.

**Mentor flow** (`onboarding.html`): what you teach (broad to specific, up to 4) → ad title (12+ words) → about your lessons (40+ words) → about you (30+ words) → location (house / travel / online) → phone → profile photo.

**Mentee flow**: what you're interested in learning (up to 6) → profile photo.

Both end on `profile.html`, a placeholder summary (the real profile page is coming).

## Run it

No build step. Open `index.html` in a browser, or run `python3 -m http.server` and visit http://localhost:8000.

## Notes

- **No backend yet.** Sign-in state and answers are stored in the browser's `localStorage` (keys `tfw_session`, `tfw_profile`). Passwords are not stored. Google/Apple buttons are placeholders.
- Colors are provisional. All of them are tokens at the top of `css/styles.css`, so matching the nonprofit's brand colors is a one-block change.
- Profile photos are resized to a 512px square in the browser before saving.
- Word minimums, topic limits, photo rules, etc. are in `CONFIG` at the top of `js/onboarding.js`. Topics live in `js/topics.js`.
- Text fields reject links, emails and phone numbers, since contact details shouldn't appear in public text.
