# Larper – Tech for Women

Website for **Tech for Women**, a nonprofit bringing tech education to underserved students across the Valley through free workshops and classes. The site makes it easier for mentors and mentees to connect online (calls, chat) or in person, with community posts to follow (coming later).

## What's built so far

Sign-up flow for mentors/teachers:

1. `index.html` – sign up / log in (short nonprofit description, email, Google, Apple)
2. `onboarding.html` – step-by-step profile setup:
   1. What you teach (broad → specific, up to 4)
   2. Title of your ad (12+ words)
   3. About your lessons (40+ words)
   4. About you (30+ words)
   5. Location: at your house / you can travel / online
   6. Telephone number
3. `profile.html` – placeholder summary (real profile page coming)

## Run it

No build step. Open `index.html` in a browser, or run `python3 -m http.server` and visit http://localhost:8000.

## Notes

- **No backend yet.** Sign-in state and answers are stored in the browser's `localStorage` (keys `tfw_session`, `tfw_profile`). Passwords are not stored. Google/Apple buttons are placeholders.
- Word minimums, the topic limit, etc. are in `CONFIG` at the top of `js/onboarding.js`. Topics live in `js/topics.js`.
- Text fields reject links, emails and phone numbers, since contact details shouldn't appear in public text.
