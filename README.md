# ScholarHub

Online scholarship monitoring system. Students register, confirm their email,
browse scholarships, submit applications with supporting documents, track their
status, and withdraw or amend an application while it is still awaiting review.
Admins post scholarships and announcements, review applicants, manage accounts,
and export reports. Coordinators also get an analytics dashboard, a reports desk
and an audit trail; students get an eligibility, GPA and renewal view of their
own record.

- **Client** — React 19 + Vite single page app (`client/`)
- **Server** — Express 5 + Postgres, runs as a Netlify function in production (`server/`)
- **Database** — Supabase Postgres (`database/schema.sql`)
- **File storage** — Supabase Storage (uploads never touch the local disk)

## Getting started

You need Node 20+, a Supabase project, and about ten minutes.

### 1. Create the database

Open the Supabase SQL Editor and run `database/schema.sql`.

> The file starts with `DROP TABLE` statements. On a new project there is
> nothing to lose; on a project with real data, back it up first.

### 2. Create a storage bucket

In the Supabase dashboard go to **Storage** and create a bucket named `uploads`.

### 3. Configure the server

```bash
cp server/.env.example server/.env
```

Fill in `server/.env`. Two values are required before anything will work:

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Supabase **Transaction pooler** connection string (port 6543) |
| `JWT_SECRET` | yes | Random string, 32+ characters. Signs every session token |
| `SUPABASE_URL` | for uploads | Project URL from Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | for uploads | service_role key from Settings → API |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first run | Creates the first admin account |
| `RESEND_API_KEY` | optional | Sends password reset and status emails |
| `CORS_ALLOWED_ORIGINS` | optional | Extra browser origins allowed to call the API |
| `REQUIRE_EMAIL_VERIFICATION` | optional | `false` turns off the confirm-before-you-apply step |
| `ALLOWED_EMAIL_DOMAINS` | optional | Limits self-registration to campus addresses |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 4. Create the first admin

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, start the server once, then **remove
`ADMIN_PASSWORD` from `.env`**. The account is only created if it is missing, so
it will never overwrite a password you later change.

### 5. Run it

```bash
npm run install:all   # once: root, server and client dependencies
npm start             # API on :5001, client on http://localhost:5173
```

`npm start` runs both halves in one terminal and prefixes their output with
`[server]` and `[client]`; Ctrl+C stops both. To run them separately:

```bash
# terminal 1
cd server && npm install && npm run dev     # http://127.0.0.1:5001

# terminal 2
cd client && npm install && npm run dev     # http://localhost:5173
```

## Tests and checks

```bash
cd server && npm test        # syntax check + unit tests
cd client && npm run lint    # eslint
cd client && npm run build   # production build
```

`npm test` covers three modules, all of which are pure by construction so they
can be exercised without a database or an HTTP request:

| File | What it protects |
| --- | --- |
| `auth.test.js` | Hashing, token signing, file-token scoping |
| `analytics.test.js` | The scoring and prediction rules |
| `rules.test.js` | The rules the app *refuses* on |

`rules.js` exists because of that third row. The decisions that matter most —
whether a slot moves, whether a renewal is mistaken for a duplicate, whether the
last admin account can be deactivated — used to live inside request handlers,
reachable only by standing up Postgres and posting a multipart form at it, which
is exactly why they had no tests. They are now pure functions that take a row
and return either `null` or `{ status, message }`, and `server.js` calls them.

## Analytics, predictions and reports

Four screens are built on the same set of application records:

| Screen | Who | What it shows |
| --- | --- | --- |
| `/admin-dashboard` | Admin | Six summary counts and eight charts, filtered by year, semester, program, scholarship, status and type |
| `/reports` | Admin | Ten standing reports over the same filtered slice, with CSV export and a print/PDF layout |
| `/student-dashboard` | Student | Condensed standing: status, eligibility, GPA, documents, award, warnings, next steps |
| `/analytics` | Student | The full record: GPA trend, eligibility breakdown, renewal prediction, disbursement estimate |
| `/audit-log` | Admin | Who changed what, and when — every decision, deletion and account change |

Everything is served by two endpoints — `GET /api/admin/analytics` and
`GET /api/student/analytics` — plus `PUT /api/applications/:id/academics`, which
is how the office records the facts the rest depends on.

### What the numbers mean

**Applicants counts people; applications counts forms.** A student who renews
across three terms is one applicant and three applications. Both figures are on
the dashboard because conflating them is the usual way a scholarship report
overstates its reach.

The scoring and prediction rules live in `server/analytics.js`, which touches
neither Express nor Postgres so the rules can be read and unit tested on their
own (`server/analytics.test.js`). Two principles are encoded rather than
assumed:

1. **A prediction is never presented as a decision.** Every predictive function
   returns the `basis` it was computed from, and the UI prints it beside the
   number.
2. **A missing input lowers confidence; it does not become an invented value.**
   A student with no recorded grades gets "not enough history", not a guess
   dressed up as 92%.

| Figure | How it is computed |
| --- | --- |
| Eligibility score | Weighted: academic standing 40, requirements submitted 30, application standing 20, scholarship history 10. A missing GPA scores the academic block at its midpoint and says so |
| Renewal prediction | The eligibility score, adjusted for GPA against the retention minimum, the grade trend, document completion and past renewals. Confidence drops when fewer than two terms of grades exist |
| Estimated award | The amount recorded on the application, else the range this scholarship has actually paid, else a peso figure parsed from its published benefits. With none of those, no number is shown |
| Disbursement date | The median approval-to-release gap for this scholarship applied to the approval date, ± the spread of those releases. With no history, the office's standard 30-day window |
| Document completion | The coordinator's checklist when one exists, otherwise uploads counted against the scholarship's requirement list. Also returned per term, so the card can show whether paperwork is getting better or worse |

### The grading scale

`GPA_SCALE` in `server/analytics.js` is set to a **4.00-point scale where higher
is better and 2.00 is the retention minimum**, matching the wording of the
requirement ("maintain a GPA above 2.0"). A campus running the 1.00–5.00 scale,
where 1.00 is highest, changes those four values and nothing else — every
comparison in the file goes through `gpaQuality()` and `isBetterGpa()`.

### Where the data comes from

Six columns on `applications` carry everything the dashboards group and predict
on: `academic_year`, `semester`, `program`, `application_type`, `gpa`,
`award_amount`, `disbursed_at` and `documents_json`.

A new application stamps its own term (from the academic calendar), programme
and type (renewal if the student has applied for that scholarship before). The
grade, the award and the requirement checklist are entered by the office from
**Manage Applicants → Edit record**. Students never write to these fields: a
self-reported GPA feeding a renewal prediction would make the prediction
worthless.

After pulling these changes, add the new columns to an existing database:

```bash
cd server && npm run db:setup
```

### Seeing it populated

A fresh install has no grades, terms or awards, so the charts are empty by
design rather than filled with invented numbers. To demonstrate or review the
screens:

```bash
cd server && npm run db:seed-demo -- --confirm   # a term of realistic activity
cd server && npm run db:seed-demo -- --remove    # take it all out again
```

It refuses to run if the database already holds real applications, and every
row it writes is tagged so `--remove` never touches a genuine record.

## Application rules

Four rules are enforced in `createApplication` and `updateApplicationStatus`
rather than only in the client, because the client hides cards and the API
accepts ids.

**A closed or expired scholarship takes no applications.** The submission
handler reads `status` and `deadline` off the scholarship row and refuses with
a 409. The deadline is compared against the Manila calendar date, not the
database's UTC one, so a scholarship does not close eight hours early for the
students applying to it.

**One live application per student per scholarship.** A submission is refused
when the student already has one awaiting review, or one already approved for
the term being applied for. A *rejected* application blocks nothing, so a
student who was turned down can apply again; an approval from an *earlier* term
blocks nothing either, which is what keeps renewals working.

**A slot is an award, not an applicant.** `available_slots` moves only when an
application enters or leaves the `Approved` state:

| Event | Effect |
| --- | --- |
| Application submitted | nothing |
| Approved | one slot claimed; refused with a 409 if none are left |
| Approval reversed to Rejected or Pending Review | slot returned |
| Approved application deleted | slot returned |

The claim is a single `UPDATE ... WHERE available_slots > 0`, so two
coordinators approving the last slot at the same moment cannot both succeed —
the second matches no row and is told the scholarship is full. Re-approving an
already-approved application does not take a second slot, because the handler
reads the status it is coming *from* before it writes.

### Repairing the slot counts once

The previous version charged a slot on every *submission*, so on any database
that has been in use the counter is low by roughly the number of applicants who
were never approved. Run this once, after deploying:

```bash
cd server && npm run db:repair-slots              # show the plan, change nothing
cd server && npm run db:repair-slots -- --confirm # apply it
```

It adds back the slots charged to applications that were never approved, which
reconstructs the count exactly. The one case it cannot repair is a scholarship
the old statement drove to 0, where it stopped counting down and the overflow
was lost; the script lists those, and their slot count has to be re-entered in
Manage Scholarship.

## What a student can do to their own application

Until recently: nothing. A form filed by mistake could only be removed by an
admin, and a document that came out unreadable could not be replaced at all —
which made *"your ID scan is blurry, send it again"* a request the system had no
answer to except delete the whole application and start over.

Three actions are now the student's own, all of them limited to an application
still in **Pending Review**:

| Action | Endpoint |
| --- | --- |
| Withdraw | `POST /api/applications/:id/withdraw` |
| Add documents | `POST /api/applications/:id/documents` |
| Remove a document | `DELETE /api/applications/:id/documents/:index` |

The window is the point. Once a coordinator has ruled, the file set is the
evidence the ruling was made on and stops being the student's to edit; the
controls disappear from Track Status and the endpoints answer 409.

**Withdrawal never moves a slot.** It is reachable only from Pending Review, and
a pending application never held one. That is why withdrawal is limited to that
state rather than being a general "take it back" — allowing it after approval
would mean a slot returning to the pool on a path no coordinator ever sees.

**A withdrawn application blocks nothing.** It counts for neither the "already
pending" nor the "already approved this term" test, so a student who files by
mistake can withdraw and file again. That is what makes withdrawal usable as a
correction rather than a dead end.

Ownership is checked against the token in every case. The `requireRole("Student")`
guard says the caller is *a* student; it does not say they are *this* student, so
`isApplicationOwner` compares `user_id` — falling back to the email only for rows
filed before `user_id` was recorded, and only when the row has no owner id at all.

### Withdrawn in the numbers

Adding a fourth status quietly changes arithmetic that assumed three. Two places
were corrected rather than left to drift:

- `normalizeStatus` in `analytics.js` names `Withdrawn` instead of letting it
  fall through to `Pending Review`, which would have put an application nobody is
  waiting on into the review backlog.
- "Not qualified" is now read off the *rejected* rows rather than as "everyone
  who is neither approved nor pending". Those were the same set with three
  statuses; with four they are not, and the leftover form would have counted a
  student who withdrew as one the office turned down.

The dashboard's headline count excludes withdrawn applications, and the status
donut gains a fourth slice only when there are any — the categorical palette is
assigned by position and never cycled, so appending leaves the other three the
colours they already had.

## Accounts

There was no way to reach an account at all. An office could only ever have the
one admin the `ADMIN_PASSWORD` bootstrap created: no second coordinator, no
roster of who had registered, no way to reset a student's password for them, and
no way to retire a graduate.

**Manage Accounts** (`/manage-users`, admin only) lists every account with its
role, state and application count, and can add one, change a role, deactivate,
reactivate, or send a password link.

**Nothing here deletes.** An account is pointed at by its applications, its
awards and its audit entries, so removing the row would orphan the record of who
was given what. Deactivating stops sign-in and leaves the history whole. The
check runs *after* the password is verified, so "this account is deactivated" is
only ever said to the person who owns it.

**The admin never chooses a password.** A coordinator who types one has to
deliver it somehow, and it ends up in a chat message. The account is created with
an unguessable placeholder and its owner is emailed a link to set a real one —
sent to the address on the account, so a coordinator cannot redirect a
colleague's reset to their own inbox. Redeeming that link also confirms the
address, which is what makes the account usable the moment its owner arrives.

Two changes are refused, and both are the same failure — an office locked out of
its own system with no way back in:

1. **You cannot change your own role or deactivate yourself.** A slip there
   cannot be undone from inside the app.
2. **The last active admin cannot be demoted or deactivated by anyone.** The
   page prints the active admin count for that reason.

## Email confirmation

Anyone could register with anybody's address. That matters here beyond the usual
reasons: status emails go to the address on the application, so an unverified one
means a decision about somebody's scholarship is mailed to a stranger.

**The gate is on submitting an application, not on signing in.** A student who
mistypes their address has to be able to get in and correct it; locking the
account only turns a typo into a support ticket. `POST /api/applications` answers
403 with `code: "EMAIL_NOT_VERIFIED"` until the address is confirmed.

Accounts that existed before this was added are grandfathered as verified — once,
at the moment the column is created, rather than by an `UPDATE` that would
re-run on the next boot and confirm every address that had not clicked anything.

`ALLOWED_EMAIL_DOMAINS` optionally limits *self-registration* to campus
addresses, subdomains included. It is deliberately not applied to an account a
coordinator creates: adding a colleague with an external address is a decision,
not a mistake. Left unset the check is skipped entirely rather than guessing a
domain, because guessing wrong locks every student out of a new deployment.

## Announcements

An announcement used to be a title, a body and nothing else: visible to everyone
the moment it was written, forever. It could be edited but never removed, so the
only remedy for a wrong one on every student's screen was to edit it into saying
something else.

It now carries an **audience** (`All`, `Students`, `Admins`), an optional
**publish time** and an optional **expiry**, and it can be deleted. Both times
stay `NULL` for the ordinary case — post it now, leave it up.

The window is filtered in SQL for students, so an announcement that has not gone
out yet never reaches the browser. An admin gets every row and a Live /
Scheduled / Expired tag, because the page they manage announcements on has to
show the scheduled and expired ones or they could never be edited.

## Notifications

**The feed is derived, not stored.** An item is an announcement or a decision on
an application, and both of those are already rows; duplicating them into a
notifications table would mean two places to keep in step and a second thing to
get wrong when a status changes.

What could *not* be derived was whether a person had seen one, which is why the
bell could never clear. Only that is stored, in `notification_reads`.

The key carries the status as well as the id — `application-88-Approved` — so a
later decision on the same application arrives as a new unread item instead of
inheriting the read state of the one before it.

`GET /api/notifications` returns the merged, sorted, read-tagged list for either
role. The navbar and the notifications page both read it, where each previously
assembled its own version from `/announcements` and `/applications/student` and
could disagree with the other about what existed. An admin now has a feed too —
the review queue and withdrawals — where before there was no admin notifications
page at all.

## Throttling

Sign-in was the only endpoint with a ceiling, which left the three that cost real
money or real mail wide open. `/password/forgot` in particular sent an email for
every call it received, whether or not the address existed.

One counter table (`rate_limits`, which replaces `login_attempts`) serves them
all, namespaced by action. What is counted differs by endpoint and is decided at
the call site:

| Action | Ceiling | Counts |
| --- | --- | --- |
| `login` | 8 per 15 min | failures — signing in correctly fifty times is not an attack |
| `register` | 5 per hour | every request — each writes a row and sends mail |
| `password-forgot` | 5 per hour | every request — each sends mail |
| `password-reset` | 10 per hour | failures — the cost is a scrypt hash per attempt |
| `email-verify` | 8 per hour | failures and resends |

The identifier is address *and* IP together: keying on the address alone lets one
machine walk a list of addresses, and keying on the IP alone locks out a whole
campus NAT. A counter that cannot be read never blocks the underlying action —
a database hiccup must not stop people registering.

## The audit trail

`status_updated_at` recorded *when* a decision was made and nothing recorded
*who*, which is the first question asked about any award.

Every write a coordinator makes now leaves an entry in `audit_log`: application
decisions and deletions, academic records, scholarship and announcement changes,
and every account change. Student withdrawals and document changes are recorded
too. `/audit-log` reads it, filtered by record type or narrowed to a single
record.

Two decisions are worth stating:

- **Writing the entry never fails the action it describes.** An award that was
  granted stays granted even if the log line could not be stored; the failure is
  logged instead. Refusing an approval because an audit insert timed out is worse
  for the student and no safer.
- **Deletions name what they deleted.** For a row that no longer exists, the
  audit entry is the only surviving record that it ever did, so it carries the
  student and the scholarship rather than an id that now points at nothing.

`actor_email` is denormalised on purpose: it is the address that held the account
at the time, and it has to survive a later rename or deactivation for the entry
to still mean anything.

## Uploaded file types

Requirement files are accepted only as PDF, Word, or JPG/PNG/HEIC/WEBP images,
at most 10 files of 10 MB each. The list is not about tidiness: uploads are
handed back to the coordinator through `/api/applications/:id/file`, so an HTML
or SVG file rendered inline would run as script in the app's own origin against
the person reviewing the application.

The browser declares the type, so the upload filter is the first gate rather
than the only one. `getApplicationFile` sends `X-Content-Type-Options: nosniff`
and serves anything outside the allowlist as an `application/octet-stream`
attachment instead of rendering it — which also covers the files uploaded
before the allowlist existed.

## Deploying to Netlify

`netlify.toml` is already set up: the SPA builds to `client/dist`, and the
Express app runs as a single function that serves `/api/*` and `/uploads/*`.

Set every server variable from the table above in **Site settings →
Environment variables**. `JWT_SECRET` in particular has no default — sign-in
returns a clear error until it is set.

## How authentication works

Sign-in returns a JSON Web Token. The client keeps it in `localStorage` and
sends it as `Authorization: Bearer <token>` on every request; tokens expire
after 8 hours, and a 401 clears the session and returns the user to `/login`.

Passwords are stored as **scrypt** hashes (`scrypt$N$r$p$salt$hash`). Accounts
created before hashing existed are upgraded automatically the next time their
owner signs in successfully.

Two rules are worth stating plainly, because the previous version of this app
broke both:

1. **The route guards in `App.jsx` are not security.** They decide what to
   render. Anyone can edit `localStorage` and set their role to `Admin`; that
   changes the menu they see and nothing else, because every endpoint
   re-checks the role from the signed token.
2. **Identity never comes from the request body or query string.** A student's
   own applications are looked up from the token, not from an `email=`
   parameter.

### Uploaded documents

Student documents are not publicly reachable. `/uploads/*` serves avatars only.
Application files go through `/api/applications/:id/file`, which checks that the
caller is the owner or an admin.

Because a browser cannot attach an `Authorization` header to `<a href>` or
`<img src>`, the client first calls `/api/applications/:id/file-token` and gets
a token that is valid for five minutes and for that one application.

## Project layout

```
client/src/
  api.js               axios instance, token storage, 401 handling
  App.jsx              routes and render-time role guards
  pages/               one file per screen
  authRules.js         the client half of the password rule
  components/Navbar.jsx  nav, profile menu, notifications
  components/charts.jsx  SVG chart kit (no charting dependency)
  components/vizTokens.js  chart palette, status tones, number formatters
  components/ui.jsx    stat tiles, filter bar, callouts, checklists
  components/AcademicRecordDialog.jsx  admin editor for term, GPA, award, documents
server/
  server.js            Express app, routes, all handlers
  auth.js              password hashing, JWT sign/verify
  rules.js             the rules the app refuses on (no DB, no Express)
  analytics.js         scoring and prediction rules (no DB, no Express)
  analyticsRoutes.js   the analytics, reports and academic-record endpoints
  mailer.js            outbound email (no-ops when unconfigured)
  storage.js           Supabase Storage REST client
  scripts/seed-demo-data.js  reversible demo data for the dashboards
database/schema.sql    full schema, run once in Supabase
```

### The visual language

The analytics screens share one look, built from four primitives in
`components/ui.jsx` and `components/icons.jsx`:

- **`HeroBanner`** — the peach page banner: a pill, the title, an
  illustration. It is the one place on a page allowed to be decorative,
  which is what buys the restraint everywhere below it.
- **`InsightCard`** — the workhorse card: title left, a tinted rounded
  square holding one line icon right, one large figure in the tone colour,
  then whatever the card is about. Student screens use it throughout.
- **`MiniTrendChart`** — a term-by-term line small enough to sit inside a
  card, with a tick row underneath printing every value as text. The tick
  row is the point of the form: the card carries its own data table, so a
  number is never only reachable through a tooltip. Points sit at the
  centre of their tick cell so each dot lines up with the value beneath it.
- **Line icons** — drawn on one 24-unit grid in `icons.jsx` rather than
  typed as emoji, which render as a different glyph on every platform and
  carry their own colour.

Above the app bar sits a slim institutional strip with the university and
the term the campus is currently in. Its height is the CSS token
`--sh-utility-strip`, which the app bar's offset and the page's top
padding both read, so they cannot drift apart. It has its own colour pair
(`--sh-utility-bg` / `--sh-utility-ink`) rather than borrowing
`--sh-primary-dark`, which inverts to a pale peach in dark mode and would
leave white text on a light bar.

### Why the charts are hand-rolled

`components/charts.jsx` draws its own SVG rather than pulling in a charting
library. Every mark reads its colour from the same CSS custom properties as the
rest of the app, so the dark-mode switch needs no chart-specific code; the
bundle stays free of a ~100 KB dependency on an app that ships as a serverless
function; and the accessibility rules (a legend for two or more series, a table
view behind every chart, values never carried by colour alone) are enforced in
one place instead of per call site.

The categorical palette is assigned by slot in a fixed order and never cycled,
so a series keeps its hue when a filter removes its neighbours. Both the light
and dark columns were checked against the surface they actually render on for
colour-vision separation and contrast; three light slots sit under 3:1 against
white, which is why every chart using them also ships direct labels and a table
view.

## Known gaps

- `Navbar.jsx` and `ApplicationForm.jsx` are large enough to be worth splitting.
  The navbar got smaller with this change — its hand-built notification feed is
  now one request — but not small.
- The admin analytics endpoint aggregates in Node over up to 20,000 application
  rows per request (`ROW_LIMIT` in `analyticsRoutes.js`). That keeps every chart
  on a page consistent with every other chart, which independent `GROUP BY`
  queries could not guarantee under concurrent writes — but it is the first
  thing to move into SQL if the table ever outgrows that.
- Detail reports show the 500 most recent matching applications
  (`DETAIL_ROW_LIMIT`); the page says so and narrowing the filters is the fix.
- `parseRequirements` exists in both `server/analytics.js` and
  `components/AcademicRecordDialog.jsx`. The client and server are separate
  bundles here; if a third caller appears, lift it into a shared package.
- The notification feed is capped at the 50 most recent items per role and is
  polled every five seconds. That is fine for one office; it is the first thing
  to move to a cursor and a push channel if this ever serves several campuses.
- `audit_log` has no retention policy. It only ever grows, which is the correct
  default for an audit trail but will want archiving eventually.
- Read state is stored per synthetic key, so an announcement that is *edited*
  keeps its key and stays read. That is deliberate — a typo fix should not
  re-notify everyone — but a genuinely rewritten announcement will not resurface
  either. Deleting and reposting is the workaround.
- The renewal prediction is a transparent weighted model, not a trained one. It
  is deliberately legible — a student who asks "why 24%?" can be shown the same
  four numbers the system used — but it has never been validated against actual
  renewal outcomes, because there is no historical outcome data to validate it
  against yet.
- Emails are sent from a free Outlook address through Brevo, which lands in
  spam more often than a verified domain would. Verifying a domain in Brevo
  and changing `MAIL_FROM` is the fix, whenever a domain is available.
- Student uploads and the old `admin123` password that were committed to git
  before this cleanup are still present in the repository history, even though
  they are no longer tracked. Removing them for good needs a history rewrite
  (`git filter-repo`) and a force push — worth doing only if the repository is
  ever made public.

Three `react-hooks/set-state-in-effect` disables exist in `Notifications.jsx`,
`ScholarshipPage.jsx` and `TrackStatus.jsx`. They are deliberate: those loaders
set no state synchronously on mount, but the rule only checks whether a called
function contains a `setState` anywhere, so it cannot tell. Each one carries a
comment saying so.
