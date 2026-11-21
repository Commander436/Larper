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
