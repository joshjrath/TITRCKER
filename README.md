# Tenth

A private, single-owner tithe tracker. Whenever you receive money, enter it and Tenth records 10% of it as tithe. It
keeps a running record of what you have received and what you still need to give to your church. The first planned
payout is **December 31, 2026**.

Tenth records payments you make elsewhere. It never moves money, connects to a bank, or contacts your church.

- **Main flow:** open the app, enter the money you received, save, and see the updated **Still to give** balance.
- **Behind that flow:**
  - an income ledger with search, filters, refunds, edits, CSV export and JSON backup
  - church payments with explicit period allocations and credits
  - an optional "Set aside" record
  - opening balances, separate CAD and USD ledgers, and a year-end countdown

---

## Money policy (short version)

- **Exact money.** Amounts are stored as integer cents (Postgres `bigint`). Tithe math uses BigInt, never floating point.
- **10% per entry, rounded half-up to the cent.** Accrued tithe is the sum of the rounded entries.
  - CAD 1,750.00 → 175.00
  - CAD 249.99 → 25.00
  - CAD 0.05 → 0.01
  - CAD 0.01 → 0.00 (the entry is still kept)

  Each entry stores its rate (1000 basis points) and rounding policy, so history cannot shift later.
- **The full amount you enter counts.** Nothing is deducted for fees or taxes; you decide what to enter.
- **Accepted amounts.** From 0.01 to 999,999,999.99. The parser is strict:
  - It accepts `1750`, `1,750.00`, `$1,750.5` and `.50`.
  - It rejects signs, scientific notation (`1e3`), more than two decimals, odd grouping (`1,75.00`) and European formats.
- **CAD and USD are separate ledgers.** Every amount keeps its own currency in the records, payments and exports. The
  one exception is display-only: when you have USD activity, the top of the Overview shows **Total still to give in
  CAD**, converting USD at the day's Bank of Canada rate (with a fallback). The CAD and USD amounts and the rate are
  shown underneath (see below).
- **Refunds and corrections** are tied to the original entry and need a reason. They can never exceed what remains of
  the entry. The tithe change is the original rounded tithe minus the rounded tithe on what remains, so a full refund
  reverses exactly the original tithe.
- **Periods are calendar years.** The first period runs from your tracking start (default **Oct 3, 2026**; you can
  backdate it, e.g. to Jan 1) to Dec 31. Unpaid balances carry into later years. A year change never resets anything
  or marks it paid.
- **Church payments** store explicit allocations to periods, oldest outstanding first by default, and you review them
  before saving.
  - **Partial payments** are fine.
  - **Overpaying** asks you to confirm. The extra is kept as an explicit **credit** that applies to later tithe in the
    same currency. Still to give shows 0 and the credit is shown separately.
- **Opening balance:** an existing tithe debt from before your records. It is never counted as income.
- **Set aside** is your own record of money you have reserved. It never changes what you owe.
  **Still to set aside** = still to give − set aside, when positive.
- **Payout status.** "N days until payout", **Due today** on the payout date, then **Overdue** with the overdue amount.
  Day counts use local calendar dates in your time zone (default America/Toronto).

Worked example: income CAD 1,750.00 and CAD 249.99 means income 1,999.99 and tithe 200.00. Give 50.00 and 150.00 is
still to give. Set aside 100.00 and 150.00 is still owed, with 50.00 still to set aside.

The full specification is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Combined total in CAD (live exchange rate)

- **What it shows:** the Overview's top figure becomes **≈ Total still to give · in CAD** once you have USD activity.
  It is CAD still to give plus USD still to give converted at the latest official USD→CAD rate.
- **Where the rate comes from:** the server fetches the rate from the Bank of Canada (European Central Bank via
  Frankfurter as a backup) and caches it in the database. It refreshes when the cached rate is more than 6 hours old,
  so it follows each business day's published rate. No personal data is sent.
- **Shown with it:** CAD and USD always appear separately underneath, with the rate, its source and its date. Ledger
  and Given show the same total as a short line.
- **What it doesn't affect:** the conversion is for display only. Payments, allocations, credits, set aside and exports
  stay in their original currencies.
- **If the rate services can't be reached:** the last known rate is used and labelled "last available rate". With no
  rate at all, the app says so and shows the currencies separately.
- **Network:** this needs outbound HTTPS from the server, which Render allows. Tests use a pinned rate and never touch
  the network.

## Stack

- **Next.js 16** (App Router, React 19.2, TypeScript strict)
  - Server Components for reads, Server Actions for writes, Route Handlers for downloads.
- **PostgreSQL 16+** with **Drizzle ORM** and committed SQL migrations (`drizzle/`).
- **Better Auth**
  - Email and password for a single owner; public sign-up is disabled.
  - Optional TOTP two-factor authentication with backup codes.
- **Zod** schemas shared by forms and the server.
- **Tailwind CSS 4** design tokens, with the Inter variable font served from the app itself (no third-party requests).
- **Vitest** for unit and Postgres integration tests; **Playwright** for end-to-end tests and screenshots.

---

## Run it locally

Prerequisites: Node.js 22+ and PostgreSQL 16+.

1. **Create a database role without superuser or BYPASSRLS, so row-level security is enforced, plus two databases:**
   ```sql
   CREATE ROLE tenth_app LOGIN PASSWORD 'change-me' NOSUPERUSER NOBYPASSRLS;
   CREATE DATABASE tenth OWNER tenth_app;
   CREATE DATABASE tenth_test OWNER tenth_app;   -- wiped by the test suites
   ```
2. **Configure:**
   ```bash
   cp .env.example .env.local     # then fill in the values
   openssl rand -base64 48        # use the output as BETTER_AUTH_SECRET
   ```
3. **Install, migrate, create the owner, run:**
   ```bash
   npm ci
   npm run db:migrate
   npm run owner:create           # prompts for a password (12+ characters) for OWNER_EMAIL
   npm run dev                    # http://localhost:3000
   ```

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run build` / `npm start` | Develop / production build / serve the build |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint |
| `npm test` | Domain, component-helper and security unit tests |
| `npm run test:integration` | Service, RLS, idempotency, concurrency and auth tests against `DATABASE_URL_TEST` |
| `npm run test:e2e` | Playwright journey + screenshots against a production build (stop `npm run dev` first) |
| `npm run db:migrate` | Apply migrations (safe to repeat) |
| `npm run db:doctor` | Read-only check: database role, RLS on every table, migrations, TLS |
| `npm run owner:create` | Create the single owner account (CLI) |
| `npm run demo:seed` | Seed an isolated demo database (see below) |

For E2E on a machine without Playwright's browser, either run `npx playwright install chromium`, or set
`PLAYWRIGHT_CHROMIUM_PATH` to an existing Chromium.

---

## Deploy on Render

The repo includes a Render Blueprint (`render.yaml`) that creates one Node web service and one managed PostgreSQL
database in the same region.

1. In the Render Dashboard choose **New → Blueprint** and pick this repository.
2. When prompted, set **`OWNER_EMAIL`** to the email address you will sign in with.
   `BETTER_AUTH_SECRET` and `OWNER_SETUP_TOKEN` are generated for you.
3. Deploy. The start command runs migrations first (`npm run start:render`), then starts Next.js. The health check is
   `/api/health`.
4. Create your account, using either of these:
   - Copy `OWNER_SETUP_TOKEN` from the service's Environment tab, open `https://<your-service>.onrender.com/setup`, and
     enter the token, your email and a password. `/setup` disappears as soon as the owner exists. You can then delete
     `OWNER_SETUP_TOKEN`.
   - Or, in the service's **Shell**, run `npm run owner:create`.
5. Sign in. Turn on two-factor authentication in **Settings → Security** (see below).
6. Optional: run `npm run db:doctor` in the Shell. It confirms that RLS applies to the database role Render created.

Notes:
- **Custom domain:** add it in Render, then set `BETTER_AUTH_URL=https://your.domain`. If you keep using the
  onrender.com address too, add it to `BETTER_AUTH_TRUSTED_ORIGINS`. Without a custom domain, `BETTER_AUTH_URL`
  defaults to Render's `RENDER_EXTERNAL_URL`.
- **Plans:** the Blueprint uses paid plans (`starter` web service, `basic-256mb` database), because Render's free
  Postgres databases expire and have no backups. Check current plan features and prices in Render's docs before
  deploying; this repo could not reach render.com while it was being built.
- **Database connection:** `DATABASE_URL` is the database's *internal* connection string, which stays on Render's
  private network. If you connect from outside Render, use the external URL with TLS (`?sslmode=require`).
- **Required runtime variables:** `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ characters) and `OWNER_EMAIL`. Also
  `BETTER_AUTH_URL`, unless `RENDER_EXTERNAL_URL` is available. The server refuses to start if any of these is missing.
- **Never set `TENTH_TEST_MODE`** in a real deployment. It enables the test clock.

---

## Security

- **Server-side access control.**
  - Every page, Server Action and download checks the Better Auth session on the server.
  - The owner id always comes from the session, never from the browser.
  - A session whose email differs from `OWNER_EMAIL` counts as signed out.
- **Owner only.**
  - Public sign-up is disabled at the library level.
  - A database hook rejects any second account and any email other than `OWNER_EMAIL`.
  - `/setup` works only while no account exists, and only with the server-side setup token.
- **Database-level isolation.**
  - Every private table has row-level security **forced**, with an owner policy.
  - The app runs each query with the owner id set for that transaction, and every query also filters by owner
    explicitly.
  - The audit log is append-only for the app role.
  - Integration tests try to read and change another account's records and confirm that both are refused.
- **Integrity.**
  - CHECK constraints enforce currencies, amount limits and the tithe formula on every row.
  - Composite foreign keys keep linked records on the same owner.
  - A deferred trigger keeps payment allocations within the payment amount.
  - Balance changes run in one transaction under a per-owner lock, with idempotency keys and optimistic versioning.
    Double clicks and retries never double-save.
- **Sessions.**
  - HttpOnly cookies with `SameSite=Lax`, plus `Secure` and the `__Secure-` prefix over HTTPS.
  - Sessions last 7 days.
  - Better Auth checks the request origin, and Next.js rejects cross-origin Server Action posts.
- **Two-factor authentication (MFA).** Settings → Security → *Set up two-factor authentication*:
  1. Confirm your password.
  2. Scan the QR code with an authenticator app.
  3. Save the backup codes somewhere safe.
  4. Enter a 6-digit code to finish.

  From then on, signing in asks for a code (or a backup code). You can choose to trust a device for 30 days.
- **Rate limits.**
  - Sign-in and two-factor checks have per-IP limits, plus a limit shared by the whole deployment (30 attempts per
    15 minutes). The shared limit exists because forwarded IP headers can be spoofed. During an attack it can delay
    sign-ins on new devices; sessions already signed in keep working.
  - Changes and exports are rate-limited per account.
- **Headers.**
  - A per-request nonce CSP: no inline scripts, `frame-ancestors 'none'`.
  - HSTS, `nosniff`, `Referrer-Policy: no-referrer` and a restrictive Permissions-Policy.
  - Every page and download is sent with `Cache-Control: private, no-store`.
- **Privacy.**
  - No analytics, session replay or third-party scripts. Better Auth telemetry is off, and the Render Blueprint sets
    `NEXT_TELEMETRY_DISABLED=1`.
  - Logs record operation names and ids only. Database errors are redacted so amounts and notes never reach the logs.
  - Amounts and notes never appear in URLs.
  - The server makes one kind of outbound request: fetching the public USD→CAD rate, and only when you owe something in
    USD. It sends no personal or financial data.
- **Exports.** Downloads require you to be signed in and are never stored or emailed. CSV text fields are protected
  against spreadsheet formula injection.
- **Encryption.**
  - In transit: Render serves the app over HTTPS.
  - At rest: provided by Render's managed PostgreSQL, per Render's documentation; confirm it for your plan.
  - Tenth does **not** implement end-to-end encryption.

## Backups and recovery

- **Database:** paid Render Postgres plans include automated backups / point-in-time recovery; check your plan's
  retention in Render's docs. To restore, use Render's dashboard recovery flow, which creates a new database, then
  point `DATABASE_URL` at it. You can also take your own copy with `pg_dump` using the external connection string and
  restore it with `pg_restore`.
- **From the app:** Ledger and Settings offer a **CSV export** and a versioned **JSON backup** (`tenth-backup`
  version 1). Both are downloaded only when you click them.
  - The JSON includes every record (deleted and reversed ones too), the allocations, the settings, the audit history
    and per-currency totals, so you can reconcile it.
  - The CSV ends with summary rows that reconcile with the totals.
  - Tenth can't import a backup back in yet. Use the database restore to recover.

## Demo data (optional, isolated)

For visual review without touching a real account:
```bash
createdb -O tenth_app tenth_demo
DEMO_DATABASE_URL=postgres://tenth_app:...@127.0.0.1:5432/tenth_demo npm run demo:seed -- --reset
DATABASE_URL=postgres://tenth_app:...@127.0.0.1:5432/tenth_demo OWNER_EMAIL=demo@tenth.local TENTH_DEMO_MODE=1 npm run dev
```
The seeder refuses any database whose name lacks "demo" or matches `DATABASE_URL`. The app shows a permanent
**Demo data** banner when `TENTH_DEMO_MODE=1`. All sample names are labelled as samples.

## Project layout

```
src/domain/        Pure money/date logic (no framework imports), heavily unit- and property-tested
src/lib/           Shared validation schemas, view-model types, action result types
src/server/        Server-only: db (schema, RLS transactions), auth, services, read models, actions, security
src/components/    Design system (ui, shell, brand, charts, motion) and feature components
src/app/           Routes: (app) pages, (auth) pages, API routes (auth, export, health)
drizzle/           SQL migrations
tests/integration/ Postgres-backed tests     e2e/  Playwright tests
```
