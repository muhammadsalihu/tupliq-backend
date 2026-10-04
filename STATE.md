# tupliq-backend — current state

NestJS + Prisma + Supabase (managed Postgres — **there is no local DB**), running as the Docker
container `tupliq-backend` on the VPS: `127.0.0.1:3002` → **https://api.airbills.digital** via Caddy.
Read this before changing endpoints, migrations or email.

_Last updated: 2026-10-04 (cloud-agent Pro gate + notify + cron parser)._


## Cloud agent hardening — _verified live 2026-10-04_

- **ProGuard** (`src/cloud-agent/guards/pro-guard.ts`): class-level `@UseGuards(JwtAuthGuard, ProGuard)` +
  `@ProOnly()` on `CloudAgentController`. Free users get **402** with
  `Cloud Agent is a Pro feature. Upgrade to Tupliq Pro...` (a thrown `HttpException` — the earlier
  `response.status(402)+false` shape produced Nest's default 403 body). Verified live: free JWT →
  402 on `/cloud-agent/status` and `/cloud-agent/provision`; owner JWT → passes.
- **`/cloud-agent/notify` is real now** — it was a stub behind JwtAuthGuard (every bot push 401'd).
  It is its own controller class (`CloudAgentNotifyController`, NO class-level guards) because
  `@UseGuards` cannot be opt-out per route. Auth is the per-instance `GROKBOT_NOTIFY_TOKEN` from
  `X-Notify-Token` or `Authorization: Bearer`; on match it resolves the Bot by handle and sends a
  real Expo push via `PushService.sendToUser`. Verified live: no token → missing-token 400-shaped
  reply; bogus token → `{ok:false,reason:"Unauthorized"}`.
- **`CronParserService`** (`src/cloud-agent/cron-parser.service.ts`): plain English → 5-field cron
  ("every weekday at 9am", "daily at 14:30", "every 30 minutes", "mondays at noon", "every morning",
  noon/midnight, word numbers). Raw cron passes through after structural validation; anything
  unparseable → 400 with a suggestion. `createRoutine` parses BEFORE calling Agent37, so clients
  cannot push arbitrary schedules. 34/34 unit cases pass (`/tmp/crontest/cron-test*.ts`).
- **`GET /cloud-agent/bots/:id/sessions`** returns `Bot.sessions` (`[{id,label}]`) for the mobile
  session drawer. Note: switching session does NOT replay history (Agent37 doesn't expose past
  messages); the label list is server truth.
- Module wiring: `CloudAgentModule` imports `PushModule` + `BillingModule` (both exported their
  services), provides `CronParserService`. `nest build` clean; deployed 2026-10-04 and the new
  tokens verified inside the running container's `/app/dist`.

## Promo codes (Pro grants via redeemable codes)

- `POST /promo/redeem` (JWT): idempotent per (code, user); grants `tupliq-pro` for the
  code's `durationDays` from NOW, extending an existing active sub rather than overwriting.
  Seat consumed atomically with the redemption row; `productId: promo:<CODE>`, `store: 'promo'`
  so manual grants stay distinguishable. Admin routes use `ADMIN_API_KEY` header
  (`/promo/admin/codes` create + list, `/:id/deactivate`).
- **Mint/list codes with `~/.local/bin/tupliq-promo.sh`** on the VPS:
  `tupliq-promo.sh new <count> <maxRedemptions> <durationDays> <prefix> <description>`.
  First batch Oct 4 2026: 10 x 1-seat, 30-day codes, prefix `PRO`, description
  "First-10-users free Pro access (Oct 2026)" — retrieve with `tupliq-promo.sh list`.
- E2E verified live (QA user redeem -> sub row -> cleanup).

## AI provider chain (multi-provider, tier-routed) — _updated 2026-10-04_

Chain lives in `src/agent/providers/` + `provider-chain.service.ts`:

- **Free tier:** Groq (`openai/gpt-oss-120b` via `OPENAI_BASE_URL=https://api.groq.com/openai/v1`)
  → Gemini (`GEMINI_API_KEY`, `gemini-3.1-flash-lite`) → Anthropic (`ANTHROPIC_API_KEY`, unset)
  → llm7.io keyless backstop (`DeepSeek-V4-Flash-0731`; anonymous daily token quota is SMALL —
  emergency only). Gemini `2.5-flash` is retired for new API keys; the alias `gemini-flash-latest`
  503s intermittently — use pinned `3.1-flash-lite` and bump when it's retired.
- **Pro tier:** Nebius first (paid, `NEBIUS_API_KEY`, model `zai-org/GLM-5.3-Flash` ~$0.15/$0.50
  per 1M, `reasoning_effort: low`), then the free chain. Non-pro users can NEVER hit Nebius
  (`available()` omits it); daily cron asserts `nebius-nonpro-violations:0`.
- `generateWithFallback(request, preference, isPro)` — `isPro` flows from
  `billing.isPro(user.id)` in `AgentService.runStream`; the intent router intentionally stays on
  the free chain.
- OpenCode is a dead end (Go 403 lapsed sub; Zen paid = insufficient funds; Zen free =
  client-locked `FreeTierError`).
- **Daily cron `Tupliq provider health daily`** (job `c5dfad587649`, ~9am, no_agent): runs
  `~/.hermes/scripts/tupliq-provider-health.sh` → probes Groq/Gemini/Nebius/llm7, E2E
  `/agent/run` with a minted owner JWT (test run row deleted after), Nebius spend guard.


## Endpoints added this session

| Route | Auth | Behaviour |
|---|---|---|
| `POST /waitlist` | none (public) | `{email, name?, goal?, source?}`. Lowercases the address; a repeat returns `{ok:true, alreadyOnList:true}` (a double-tap must never look like a failure). Invalid email → 400. Emails the owner on each **new** entry. |
| `GET /waitlist?limit=` | `x-admin-key: $ADMIN_API_KEY` | `{total, returned, entries}` newest first. |

- Code: `src/waitlist/{waitlist.module,waitlist.controller,waitlist.service}.ts`, registered in
  `src/app.module.ts`. Table `agent_waitlist_entries` / Prisma model `AgentWaitlistEntry`.
- The front end that feeds it is in **tupliq-web** (`/agent` + home forms). A signup notifies
  `WAITLIST_NOTIFY_EMAIL` (default `muhammad@airbills.ng`) with the visitor's address and goal, so a
  demo can be booked straight from the inbox.
- Read the list without curl: `bash ~/workspace/check-waitlist.sh` (pulls the admin key from the deploy `.env`).

## Migrations

Six now, applied to Supabase (the container command runs `npx prisma migrate deploy` before boot, so a
rebuild applies new ones):

```
20260824000000_tupliq_agent
20260825060931_add_push_tokens
20260921000000_add_google_auth
20260923_add_user_instances
20260924120000_add_agent_waitlist   ← new
```

Write the SQL by hand in `prisma/migrations/<ts>_name/migration.sql` (never model Supabase-managed
schemas, never add a `Profile { ... @@ignore }`). Confirm with
`docker exec tupliq-backend sh -c 'cd /app && npx prisma migrate status'` → "Database schema is up to date!".

## Email (Resend)

- `src/email/email.service.ts` — `layout()` / `stepsHtml()` clone the real brand tokens
  (`#1F6E4A` circuit green, Quicksand / Plus Jakarta). Added `sendWaitlistNotification({email, name, goal, source})`.
- **Sender identity is `WELCOME_EMAIL_FROM` on the VPS `.env`**, now `Tupliq Agent <agent@tupliq.com>`.
  That applies to **every** transactional mail (verification, reset, welcome), not just lifecycle mail.
- **Deliverability:** `muhammad@airbills.ng` is **Zoho Mail** (MX `mx.zoho.com`). Resend reports
  `delivered` once Zoho accepts, which is *not* inbox delivery — a 3.2 MB MP4 attachment plus
  marketing-shaped HTML landed in spam. Send lifecycle mail without attachments, keep a plain-text part,
  and add `List-Unsubscribe` (+ a postal address) before scheduling anything bulk.
- **There is no drip / onboarding-sequence code at all** (grep `day.?3|drip|sequence|campaign` → 0
  matches). The Day-3 mail the owner received was composed and sent one-off, not generated by the app.

## Verified

- `curl https://api.airbills.digital/health` → `{"status":"ok"}`; container healthy after rebuild.
- `POST /waitlist` → 201 `{ok:true,alreadyOnList:false}`; duplicate → `alreadyOnList:true`;
  `{"email":"not-an-email"}` → 400; `GET /waitlist` without the key → 401; with the key → the row.
- Waitlist notification mails delivered from `Tupliq Agent <agent@tupliq.com>`.
- QA rows were deleted after testing — the list is real, keep it clean.
- Test account `muhammad@airbills.ng`: `emailVerified: true` (token used 2026-09-24 09:29:49Z),
  no subscription, 8 of 10 free runs left.

## Deploy

```bash
# 1. copy ONLY the changed files into the deploy tree (never rsync over .env)
cp src/waitlist/*.ts /srv/production/tupliq-backend/src/waitlist/
cp prisma/schema.prisma /srv/production/tupliq-backend/prisma/
md5sum <src> <dst>            # verify the hash matches before building
# 2. rebuild + recreate (background + notify; the gateway refuses a foreground `up -d`)
cd /srv/production/tupliq-backend && docker compose build api && docker compose up -d api
# 3. prove the new code is running: health, image/container timestamps, compiled artifact, migrate status
```

Full procedure, gotchas and the `.env`-wiping pitfall: the `tupliq` skill, section "Deploy backend to VPS".

## Open items

- **No day-N lifecycle sequence exists.** `sendDayThreeEmail()` still has to be written and wired to
  `createdAt + 3 days`; add a one-click unsubscribe + postal address first.
- Decide whether transactional mail (verification/reset) should keep the `Tupliq Agent` display name or
  revert to `Tupliq` — one line in the VPS `.env` either way.
- No admin UI for the waitlist; it is read through the API / `check-waitlist.sh`.
