# Tupliq Backend

Production-oriented REST API for **Tupliq Agent** and the Tupliq app. It provides
JWT authentication, AI workflow orchestration, usage limits, run history,
saved outputs, push-token registration, and RevenueCat-backed entitlements.

## Current deployment

- **Repository:** `muhammadsalihu/tupliq-backend`
- **Branch:** `main`
- **API:** `https://tupliq-backend.onrender.com`
- **Health:** `https://tupliq-backend.onrender.com/health`
- **Swagger:** `https://tupliq-backend.onrender.com/docs`
- **Database:** Supabase PostgreSQL via Prisma
- **Runtime:** Render Node web service

The deployed API was smoke-tested successfully for health, authentication,
usage, runs, saved outputs, billing status, and an authenticated AI workflow.

## Architecture

```text
Tupliq Agent mobile (Expo/RN)
        │ HTTPS + JWT
        ▼
NestJS API on Render
        ├── Auth / JWT / user profiles
        ├── Agent orchestration + SSE progress events
        ├── Provider chain
        │     ├── Gemini
        │     ├── OpenAI-compatible providers (including OpenCode Go)
        │     └── Anthropic
        ├── Usage quotas and refunds on failed runs
        ├── Workflow run history and saved outputs
        ├── RevenueCat webhook and server-side entitlements
        └── Prisma ORM
                │
                ▼
        Supabase PostgreSQL
```

The mobile app uses Supabase Auth/profile tables for onboarding data while the
backend maintains its own JWT user and workflow records. The backend does not
use a Supabase secret key; Prisma connects directly to PostgreSQL through
`DATABASE_URL`.

## Stack

- NestJS 10
- Prisma 5
- PostgreSQL
- Supabase PostgreSQL
- Passport JWT
- bcrypt
- Swagger/OpenAPI
- RevenueCat webhooks
- Server-sent events (SSE)
- Gemini, OpenAI-compatible, and Anthropic provider adapters

## Local setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:dev
npm run start:dev
```

The local API runs on `http://localhost:3000` by default.

Swagger UI is available at:

```text
http://localhost:3000/docs
```

Generate local secrets with:

```bash
openssl rand -hex 32
```

Never commit `.env`, database URLs, API keys, webhook secrets, or generated
credentials.

## Environment variables

### Required backend variables

```text
DATABASE_URL=postgresql://...
JWT_SECRET=...
ADMIN_API_KEY=...
```

### AI provider variables

Only providers with configured keys are enabled:

```text
GEMINI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

For OpenCode Go, which exposes an OpenAI-compatible endpoint:

```text
OPENAI_API_KEY=<OpenCode Go API key>
OPENAI_BASE_URL=https://opencode.ai/zen/go/v1
AI_MODEL_OPENAI=glm-5.3-flash
```

The provider appends `/chat/completions` automatically. OpenCode Go requires an
`x-opencode-session` header; the backend generates and preserves one session ID
per agent run.

### Runtime and product variables

```text
JWT_EXPIRES_IN=30d
CORS_ORIGINS=https://<allowed-web-origin>
PORT=3000
AI_TIMEOUT_MS=90000
FREE_MONTHLY_RUN_LIMIT=10
PRO_MONTHLY_RUN_LIMIT=200
APP_URL=https://tupliq.app
```

### RevenueCat variables

```text
REVENUECAT_WEBHOOK_SECRET=...
REVENUECAT_ENTITLEMENT=tupliq-pro
```

The entitlement must match the RevenueCat dashboard and the mobile billing
constants. The client purchase state is not trusted for protected operations;
the backend updates subscription truth from the RevenueCat webhook.

### Optional email variables

```text
RESEND_API_KEY=...
WELCOME_EMAIL_FROM=Tupliq <onboarding@resend.dev>
REGISTRATION_HACKATHON_ID=...
```

## Supabase database setup

1. Create or select the Tupliq Supabase project.
2. Run the mobile profile migration in the Supabase SQL Editor:

```text
../tupliq-agent-mobile/supabase/migrations/20260824000000_init.sql
```

3. In Supabase **Connect**, obtain a PostgreSQL connection string.
4. Set that value as `DATABASE_URL` in Render.
5. Render runs Prisma migrations during deployment:

```bash
npx prisma migrate deploy
```

Use a Supabase pooler/session connection when the deployment environment cannot
reach the direct IPv6 database endpoint. Keep the database password private.

## API

All paths are relative to the deployed base URL. There is no global `/api`
prefix.

### Authentication

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | — | Create a user and return a JWT |
| POST | `/auth/login` | — | Authenticate and return a JWT |
| GET | `/auth/me` | Bearer | Return the current user profile |
| POST | `/auth/forgot-password` | — | Request a password reset |
| POST | `/auth/reset-password` | — | Complete a password reset |

### Agent workflows

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/agent/workflows` | Bearer | List workflow definitions and fields |
| POST | `/agent/run` | Bearer | Execute a workflow and stream SSE events |
| GET | `/usage` | Bearer | Return plan, quota, and remaining runs |
| GET | `/runs` | Bearer | List the user's workflow runs |
| GET | `/runs/:id` | Bearer | Return one run and its result |
| DELETE | `/runs/:id` | Bearer | Delete one run |
| GET | `/saved-outputs` | Bearer | List saved results |
| POST | `/saved-outputs` | Bearer | Save a completed result |
| DELETE | `/saved-outputs/:id` | Bearer | Delete a saved result |

The current built-in workflow keys include:

```text
client_followup
proposal_generator
meeting_to_tasks
daily_planner
research_assistant
content_repurposer
```

`POST /agent/run` emits events such as:

```text
event: step
event: run
event: result
event: error
```

Failed provider runs are refunded and do not consume the user's monthly quota.

### Billing and push

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/billing/status` | Bearer | Return server-side entitlement status |
| POST | `/billing/webhook` | RevenueCat secret | Apply RevenueCat subscription events |
| POST | `/push/register` | Bearer | Register a device push token |
| POST | `/push/test` | Bearer | Test a push notification |
| GET | `/push/tokens` | Bearer | List the user's registered tokens |

### Existing Tupliq app modules

The API also retains the original Tupliq app endpoints for users, hackathons,
lessons, invite codes, and admin management. Admin routes require the
`x-admin-key` header; never put that key in the mobile app.

## Testing

Build the API:

```bash
npm run build
```

Health check:

```bash
curl https://tupliq-backend.onrender.com/health
```

Expected response:

```json
{"status":"ok"}
```

Authenticated smoke test sequence:

```text
POST /auth/register
POST /auth/login
GET  /auth/me
GET  /usage
POST /agent/run
GET  /runs
GET  /saved-outputs
GET  /billing/status
```

For `research_assistant`, the required input key is `research_question`:

```json
{
  "workflowKey": "research_assistant",
  "input": {
    "research_question": "What should I study first for this exam?",
    "context": "Computer science student",
    "target_outcome": "A practical study plan"
  }
}
```

## Render deployment

The service is deployed from the `main` branch.

Recommended Render settings:

```text
Runtime: Node
Build: npm install && npm run build && npx prisma migrate deploy
Start: npm run start:prod
Health check: /health
```

Set secrets and configuration in the Render Environment page. Do not commit
production values to `render.yaml` or `.env.example`.

Render's free service may sleep when inactive, so the first request after idle
can be slow. This does not indicate an application failure.

## Mobile integration

Set these in the mobile app's local `.env` or EAS environment:

```text
EXPO_PUBLIC_API_URL=https://tupliq-backend.onrender.com
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-legacy-anon-key>
EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY=<public-platform-key>
```

The mobile app must use an Expo development build for RevenueCat native
functionality; Expo Go is not sufficient.

## Known limitations

- OpenCode Go is suitable for development and low-volume testing; confirm its
  terms before using it as the production provider for general consumer traffic.
- The current backend and mobile app maintain separate Supabase profile and
  backend JWT user records; unifying identity is a future architectural task.
- Password-reset email delivery requires valid Resend configuration.
- The Render free tier can cold-start after inactivity.
- Store-specific RevenueCat testing still requires Google Play internal testing
  before production release.
