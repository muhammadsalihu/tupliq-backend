# Tupliq Backend

Independent REST API for the Tupliq app — NestJS + PostgreSQL (via Prisma),
replacing the Firebase Auth/Firestore backend with the same data model and
behavior, so swapping the mobile app over is a drop-in.

## Stack

NestJS, Prisma ORM, PostgreSQL (Render Postgres), JWT auth (Passport),
bcrypt password hashing.

## Local setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, ADMIN_API_KEY (see below)
npx prisma migrate dev --name init   # creates tables in your local/dev Postgres
npm run prisma:seed                   # optional: seeds 3 demo hackathons + invite code RACE-4821
npm run start:dev
```

Generate secrets for `JWT_SECRET` / `ADMIN_API_KEY` with:
```bash
openssl rand -hex 32
```

## API

All endpoints are prefixed with the deployed base URL (no global `/api` prefix).

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | — | `{ name, email, password }` → `{ accessToken, user }` |
| POST | `/auth/login` | — | `{ email, password }` → `{ accessToken, user }` |
| GET | `/auth/me` | Bearer | current user profile |
| PATCH | `/users/me/onboarding` | Bearer | `{ selectedInterests }`, sets `onboardingComplete = true` |
| PATCH | `/users/me/interests` | Bearer | `{ selectedInterests }` |
| PATCH | `/users/me/settings` | Bearer | `{ notificationsOn?, darkModeOn? }` |
| POST | `/users/me/agents-explored/:agentId` | Bearer | idempotent, `agentId` = `claude`\|`chatgpt`\|`gemini` |
| GET | `/hackathons` | Bearer | list (no per-user fields — cross-reference against your own profile) |
| GET | `/hackathons/:id` | Bearer | detail incl. lessons/videos/partners |
| POST | `/hackathons/:id/join` | Bearer | `{ code }` → redeems an invite code, same result shape as the old Firestore flow: `{ ok: true }` or `{ ok: false, reason: 'not_found'\|'already_used'\|'wrong_hackathon' }` |
| POST | `/hackathons/:id/leave` | Bearer | removes the user from the hackathon |
| POST | `/hackathons/lessons/:lessonId/toggle` | Bearer | toggles that lesson's completion for the user |
| POST | `/hackathons` | `x-admin-key` | create a hackathon (with nested `lessons`/`videos`/`partners`) |
| PATCH | `/hackathons/:id` | `x-admin-key` | update; any of `lessons`/`videos`/`partners` provided fully replaces the existing set |
| DELETE | `/hackathons/:id` | `x-admin-key` | |
| POST | `/invite-codes` | `x-admin-key` | `{ code, hackathonId, invitedEmail? }` |
| GET | `/health` | — | for Render's health check |

`Bearer` = `Authorization: Bearer <accessToken>` from register/login.
`x-admin-key` = header matching the `ADMIN_API_KEY` env var — use this from
an admin tool/script, never from the mobile app itself.

## Deploying to Render

1. Push this folder to its own GitHub repo (or a subdirectory Render can target).
2. In the Render dashboard: **New → Blueprint**, point it at the repo — `render.yaml`
   provisions both the Postgres database and the web service, and
   auto-generates `JWT_SECRET`/`ADMIN_API_KEY` for you.
3. First deploy runs `prisma migrate deploy` automatically (see `buildCommand`
   in `render.yaml`) to create the schema. To seed demo data afterward, run
   `npm run prisma:seed` from a Render shell (or point `DATABASE_URL` at the
   Render DB locally and run it from your machine).
4. Grab the deployed URL (e.g. `https://tupliq-backend.onrender.com`) — that's
   what gets added to the mobile app once it's switched over from Firebase.

**Note:** Render's free-tier web services spin down after inactivity and take
~30–60s to wake on the next request — expect a cold-start delay on the first
request after idling.

## What's NOT included (yet)

- **Password reset emails** — needs an email provider (Resend/SendGrid/etc);
  not wired up. The mobile app's "Forgot password?" link will need a decision
  on that before it can work against this backend.
- **Admin dashboard UI** — hackathons/invite codes are managed via the
  `x-admin-key`-gated REST endpoints above (curl, Postman, or a future admin
  tool), not a web UI.
