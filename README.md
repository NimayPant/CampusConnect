# Campus Connect

A full-stack Web Technology assignment by **Nimay Pant** and **Tapash Upadhyay Bhattarai**. The project uses semantic HTML rendered by React, a separate handwritten CSS stylesheet, JavaScript, Node.js and Express. There is no CSS framework, icon pack or charting library.

## Start in VS Code

1. Open the complete project folder containing `package.json` in VS Code. Keep all files in their supplied folders.
2. Use Node.js 22.12 or newer. Check with `node --version`.
3. In the VS Code terminal run:

```powershell
npm install
npm run dev
```

Open the **Local URL printed by Vite**, normally **http://127.0.0.1:5173**. Port 4000 is the API, not the website. Do not open `index.html` directly or use Live Server. Use Ctrl+C to stop both servers; run `npm run dev` to restart them.

The first launch creates local posters and four JSON collections. It includes 20 events, 24 students, one admin, 110 active registrations, nine cancellations and 30 feedback records. Six events are in the past and 14 are upcoming, with dates relative to the first seeding date. Existing nonempty files are preserved. If an old project has only four events, starting it will deliberately keep those four; use an explicit reset to replace them with the new demonstration set.

## Development demonstration accounts

| Role | Username | Password |
| --- | --- | --- |
| Administrator | admin | Admin@12345 |
| Student | student | Student@12345 |
| Additional students | student2 through student24 | Student@12345 |

These are public development credentials, not real accounts. Each seeded password has a separate random salt and scrypt hash. New sign-ups always get the student role. No admin selection is offered on the public form.

## Features and demonstration route

1. Sign up, log out and log in. Try an existing username or email to see validation.
2. Browse events; use search, category, date and sort controls. Open details and save a bookmark.
3. Register with a student account and open My schedule. Unregister and observe the seat count change. Use student24 to demonstrate a full event for which that student is not registered.
4. Open a past event as `student`, select HTML and CSS Practical Session and edit its seeded feedback. The last of the six past events has some registered students without feedback, so a new submission can also be demonstrated.
5. Open Profile; edit name/email and change the password. Changing a password invalidates that user's other sessions.
6. Log in as admin; use Manage events to create/edit/delete an event, supply its capacity and upload a poster with descriptive alternative text. Confirm before deleting.
7. Open Admin dashboard for computed statistics, the capacity table and category chart. Admins can remove feedback from past event details.
8. Open Help for an actual audio guide, its full transcript, keyboard instructions, site map and privacy/contact information. Open About for ownership and personal progress reset.

## Starting again and upgrading

**Reset my progress** cancels the signed-in student's active registrations on the server and clears that account's bookmarks in this browser. It leaves the account, feedback, published events and other users unchanged. The admin version only clears the admin's bookmarks.

To populate missing or empty collections without replacing nonempty files:

```powershell
npm run seed
```

To replace the complete demonstration dataset, stop the running server first:

```powershell
npm run seed:reset
```

Read the warning, then type `RESET`. The command backs up existing JSON files under `server/backups/` before replacing them; uploaded posters are retained. Restart with `npm run dev`. Do not run reset or seed commands while the API is processing requests.

When updating an old copy, back up the whole folder first. Replace source files and `package.json`/`package-lock.json`, keeping `server/data/` and `server/uploads/` if you need existing data. Run `npm install` again because uploads now use Multer and Sharp. Old events receive capacity 50 and missing timestamps without being deleted. If old registrations remain in the account's browser localStorage, an **Import earlier registrations** button appears. Each registration is revalidated on the server; full, past and deleted events cannot be imported. Bookmarks remain account-specific in localStorage.

## Architecture

| Layer | Files | Responsibility |
| --- | --- | --- |
| HTML entry | index.html | Document language, metadata, viewport and React root |
| React interface | src/main.jsx | Navigation, listings, search, schedule, management and accessible dialogs |
| Reusable interface | src/components.jsx, src/PosterEditor.jsx | Accounts, profile, capacity, feedback, dashboard, Help and poster preview |
| Browser requests | src/api.js | Fetch, multipart/JSON, session expiry and errors |
| CSS | src/styles.css | Responsive layouts, typography, contrast and focus styling |
| Express entry | server/index.js | Middleware, API installation, controlled image delivery and errors |
| Authentication | server/auth.js | Scrypt hashing, cookies, sessions, roles, account/profile APIs and rate limits |
| Event routes | server/events.js | Events, registrations, feedback and computed dashboard statistics |
| Validation/upload | server/validation.js, server/uploads.js | Field validation, MIME/content/size checks and optimized poster storage |
| Persistence | server/storage.js | Safe reads, array validation, per-file atomic writes, migration and backups |
| Demonstration data | server/seed.js | Linked records, local poster generation, seed/reset commands |

The browser sends requests to `/api`. Vite proxies them to Express on port 4000. Express authenticates the cookie, checks permissions, validates input and reads/writes JSON. Statistics are calculated from source collections rather than saved separately. Poster requests under `/uploads` are also proxied.

## Data model

| Collection | Key fields |
| --- | --- |
| users.json | id, username, fullName, email, role, passwordSalt, passwordHash, createdAt, updatedAt |
| events.json | id, title, category, date, time, location, organizer, description, capacity, imageUrl, imageAlt, imageFilename, imageMimeType, createdAt, updatedAt; deletedAt on deletion |
| registrations.json | id, eventId, userId, status, registeredAt; cancelledAt on cancellation |
| feedback.json | id, eventId, userId, rating, comment, createdAt, updatedAt |

Event deletion is a soft deletion: it disappears from listings and schedules and cannot accept new registrations. Its record and historical references remain. Cancellation retains a registration record with status `cancelled`. Capacity counts only active registrations. Feedback becomes available once the event start date/time has passed; there is no separate event-end field.

## API routes

All mutation requests carry `X-Campus-Request: 1`. JSON requests use `Content-Type: application/json`; poster forms use multipart/form-data. Authentication is by HttpOnly cookie. Except login, signup and session checking, user data routes require authentication.

| Method and path | Access and purpose |
| --- | --- |
| POST /api/auth/register | Public, always creates a student |
| POST /api/auth/login | Public, rate limited |
| POST /api/auth/logout | Clear session cookie |
| GET /api/auth/me | Current user or null |
| GET /api/profile | Signed-in profile |
| PUT /api/profile | Update full name and unique email |
| PUT /api/profile/password | Verify current password, replace hash and revoke other sessions |
| POST /api/profile/reset-progress | Student, cancel own active registrations |
| GET /api/events | Signed-in listings with counts, seats and averages |
| GET /api/events/:id | Signed-in details with counts |
| POST /api/events | Admin create; JSON or multipart |
| PUT /api/events/:id | Admin edit; JSON or multipart |
| DELETE /api/events/:id | Admin soft deletion |
| GET /api/registrations/me | Own registration records |
| POST /api/events/:id/register | Student registers self |
| DELETE /api/events/:id/register | Student cancels own registration |
| GET /api/events/:id/feedback | Signed-in ratings, comments and distribution |
| POST /api/events/:id/feedback | Registered student, past event, one rating |
| PUT /api/events/:id/feedback | Student edits own rating/comment |
| DELETE /api/events/:id/feedback | Student removes own feedback through API |
| DELETE /api/admin/feedback/:id | Admin moderation |
| GET /api/admin/stats | Admin-only computed statistics |

Success responses use 200, 201 or 204. Failures use JSON `{ "message": "..." }` and appropriate 400, 401, 403, 404, 409, 413, 415, 429 or 500 status codes. Salts and hashes are excluded from user responses. No email address is included with public feedback.

## Security and limits

Sessions use random 32-byte tokens, expire after eight hours, and are held in memory. Cookies are HttpOnly and SameSite Strict, with Secure enabled in production. Login is limited to ten attempts per IP/path in 15 minutes, returning 429 and Retry-After; a successful login clears its counter. API authorization is enforced even if browser controls are changed.

Passwords need 10–128 characters, uppercase/lowercase letters and a digit. Usernames are 3–30 letters/numbers/underscores starting with a letter. Emails/usernames are normalized and checked for uniqueness. Uploads allow JPEG, PNG and WebP up to 5 MB; the server decodes actual bytes, checks the format and dimensions, strips metadata through re-encoding and writes a generated UUID WebP filename. Original filenames are ignored. Old uploaded posters are removed only when no live event references them. Seed posters are shared and retained.

This is a **single-process local academic demonstration**. Synchronous read/check/write operations serialize registration changes within that process; atomic rename prevents partially written individual JSON files. This is not a database transaction across several files, a multi-process lock or a production-grade relational database. Sessions/rate counters reset when the server restarts. Use PostgreSQL, MySQL or MongoDB with appropriate constraints, transactions and a shared session store for a deployed multi-user service. Production also needs HTTPS, operational backups and a reviewed deployment setup.

`NODE_ENV=production` requires non-demo `ADMIN_PASSWORD` and `STUDENT_PASSWORD` environment variables and rejects stored default demo passwords. Existing accounts are not silently overwritten by setting these variables. Development passwords must be changed or the demo data explicitly reset before production mode will start. Environment variables `PORT`, `CAMPUS_DATA_DIR` and `CAMPUS_UPLOAD_DIR` support isolated test instances. Never commit real user data or credentials.

## Build and checks

```powershell
npm test
npm run build
```

The automated API integration test uses temporary data, exercises seeding, permissions, concurrency at one remaining seat, feedback, profile/password operations, uploads, persistence, rate limits, migrations and reset backups. It does not reset your project data. To inspect the compiled UI, keep `npm run server` running in one terminal and run `npm run preview` in another; open Vite's preview URL.

The submitted interface was also checked in Chromium at desktop and 390px mobile widths, including dialogs, validation focus, poster preview, student actions, feedback, profile, error/retry and transcript presence. These are specific checks, not a claim of full WCAG certification. See `REPORT.md` for the assessment mapping and screenshots.

## Equal contribution plan

| Member | Four owned modules | Frontend scope | Backend scope |
| --- | --- | --- | --- |
| Tapash Upadhyay Bhattarai | Authentication; event management/capacity; feedback; admin dashboard | Login/session UI; management forms; ratings UI; statistics views | Login/session/role middleware; event CRUD/capacity; feedback routes; stats endpoint |
| Nimay Pant | Signup/profile; registrations/schedule; posters; storage/seed | Account/profile forms; schedule/cancellation; preview/alt controls; seeded and empty-state integration | Signup/profile/password APIs consuming shared auth; registration routes; upload processing; atomic JSON and seed/reset |

Both own four frontend deliverables and four matching backend deliverables, with shared integration, rubric review and report work allocated equally. This is a planned 50% share each, not an invented measurement of hours, commits or lines. Tapash owns the underlying authentication/session permissions; Nimay's account pages use that shared contract. During assessment each demonstrates two broad workflows combining their four modules. Actual contribution evidence should come from commits, review notes and each student's explanation.

## Asset sources

Four category posters are created locally by `server/seed.js` from original SVG text/layout and converted to PNG. No external images are hotlinked. The Help divider is an original decorative SVG. The audio guide was generated from the supplied `public/media/transcript.txt` using FFmpeg's Flite speech synthesis; the entire spoken content is visible on Help. All event/account content is fictional demonstration data.
