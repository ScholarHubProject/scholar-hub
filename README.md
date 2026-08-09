# ScholarHub

Online scholarship monitoring system. Students register, browse scholarships,
submit applications with supporting documents, and track their status. Admins
post scholarships and announcements, review applicants, and export reports.

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
# terminal 1
cd server && npm install && npm run dev     # http://127.0.0.1:5001

# terminal 2
cd client && npm install && npm run dev     # http://localhost:5173
```

## Tests and checks

```bash
cd server && npm test        # syntax check + auth unit tests
cd client && npm run lint    # eslint
cd client && npm run build   # production build
```

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
  components/Navbar.jsx  nav, profile menu, notifications
server/
  server.js            Express app, routes, all handlers
  auth.js              password hashing, JWT sign/verify
  mailer.js            outbound email (no-ops when unconfigured)
  storage.js           Supabase Storage REST client
database/schema.sql    full schema, run once in Supabase
```

## Known gaps

- `client/src/components/UserProfileMenu.jsx` is dead code — nothing imports it;
  `Navbar.jsx` has the profile menu that actually renders. It is safe to delete.
- Several pages call `setState` synchronously inside `useEffect`, which the
  React 19 lint rule flags. Pre-existing; `npm run lint` lists them.
- `Navbar.jsx` (2100 lines) and `ApplicationForm.jsx` (970 lines) are large
  enough to be worth splitting.
- Student uploads that were committed to git before this cleanup are still
  present in the repository history, even though they are no longer tracked.
  Removing them for good needs a history rewrite (`git filter-repo`) and a
  force push.
