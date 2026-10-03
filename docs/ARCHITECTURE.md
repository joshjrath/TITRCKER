# Tenth — architecture and money policy

Tenth is a private, single-owner tithe tracker. You record the money you receive; Tenth works out
10% of each entry and keeps a running record of what you still need to give to your church. It
records payments you made elsewhere. It never moves money.

This document is the contract every module is built against. If code and this document disagree,
fix whichever is wrong and keep them in sync.

---

## 1. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Web framework | Next.js 16 (App Router, React 19.2, TypeScript strict) | Mainstream TypeScript stack with a real server: Server Components for reads, Server Actions for mutations, Route Handlers for downloads |
| Database | PostgreSQL 16+ | Persistent relational store with transactions, CHECK constraints, composite foreign keys and row-level security. Works locally and on managed services (Neon, Supabase, RDS, Fly, Render) |
| ORM / migrations | Drizzle ORM + drizzle-kit (node-postgres driver) | Parameterized queries, typed schema, plain-SQL migrations committed to `drizzle/` |
| Auth | Better Auth (email + password, owner-only, optional TOTP 2FA) | Mature library: scrypt password hashing, HttpOnly session cookies, origin checks, built-in rate limiting. No custom crypto |
| Validation | Zod 4 schemas shared by client and server, re-checked on the server | One definition of every input rule |
| Styling | Tailwind CSS 4 with CSS-variable design tokens | Single dark theme defined once in `src/app/globals.css` |
| Tests | Vitest (domain unit tests + Postgres integration tests), Playwright (E2E + screenshots) | |

Only the server talks to the database. The browser never receives database credentials, and there is no public
registration.

---

## 2. Directory layout and dependency rules

```
src/
  domain/            Pure, deterministic money/date logic. No imports from next, react, db, zod or server code.
  lib/validation/    Zod schemas + form field helpers shared by client and server. May import domain.
  server/            Server-only code ("server-only" import guard).
    db/              Drizzle schema, pool, withOwner() transaction helper, migrations runner.
    auth/            Better Auth instance, session helpers (requireOwner), owner bootstrap.
    services/        Business operations (transactions, idempotency, audit). Import domain + db.
    actions/         "use server" Server Actions: thin wrappers (auth -> rate limit -> validate -> service -> revalidate).
    security/        Rate limiter, origin checks, CSP helpers, safe logger.
    clock.ts         Single source of "now" (controllable in tests).
  components/
    ui/              Design-system primitives (Button, Field, Dialog, Sheet, Tabs, Amount, Icon...).
    <feature>/       Feature components (dashboard, ledger, income, given, set-aside, settings, charts).
  app/               Routes only: pages, layouts, route handlers. Keep them thin.
tests/
  integration/       Service-level tests against a real Postgres database (DATABASE_URL_TEST).
e2e/                 Playwright journeys and screenshot capture.
drizzle/             Generated + custom SQL migrations (committed).
scripts/             CLI scripts (owner bootstrap, db doctor, demo seed).
```

Rules: `domain` imports nothing outside `domain`. `components` never import `server/db` or `server/services`
(only types and Server Actions). No circular imports. No magic numbers outside `domain/constants.ts`
(money limits, rate, policy names) and `lib/validation/limits.ts` (text lengths).

---

## 3. Money policy (authoritative)

### 3.1 Representation
* Every stored amount is an **integer number of minor units** (cents) in a Postgres `bigint` column,
  mapped to a JS `number` and guarded with `Number.isSafeInteger`. Multiplication/division for the
  tithe uses `BigInt`. No floating-point arithmetic ever touches ledger math.
* Supported currencies: `CAD` (default) and `USD`, both with 2 minor digits. CAD and USD ledgers are
  fully independent. Nothing ever adds CAD to USD. Currency conversion is out of scope.
* **Safe limit:** a single amount (income, payment, refund, opening obligation, set-aside) must be
  between `0.01` and `999,999,999.99` inclusive (`MAX_AMOUNT_MINOR = 99_999_999_999`). Sums are checked with
  `Number.isSafeInteger`; that would only fail after ~90,000 maximum-size entries, and if it does the operation throws.

### 3.2 Strict amount parser (`domain/money.ts: parseAmount`)
Accepted (after trimming outer whitespace): optional leading `$`, then either
* plain digits without superfluous leading zeros: `0`, `5`, `1750`, or
* comma-grouped thousands in exact groups of three: `1,750`, `12,345,678`,

followed by an optional `.` and 1–2 decimal digits; or a bare fraction `.5` / `.50`.
Rejected with a specific error code: empty input, any sign (`-`, `+`), scientific notation (`e`/`E`),
more than 2 decimals, wrong grouping (`1,75.00`, `1,7500`), European formats (`1.750,00`, `1 750`),
inner whitespace, non-ASCII digits, currency codes/letters, trailing dot (`5.`), zero (`0`, `0.00`)
and anything above the safe limit.

### 3.3 Tithe rounding
* Rate: fixed **10%**, stored as `tithe_rate_bps = 1000` (basis points) on every income entry.
* Policy: `HALF_UP_PER_ENTRY_MINOR` stored on every income entry. The tithe is rounded **per entry**
  to the nearest cent, half up: `tithe = floor((amount_minor * rate_bps + 5000) / 10000)`.
* The persisted `tithe_minor` is enforced by a database CHECK constraint using that same formula.
* Accrued tithe = the sum of the per-entry rounded amounts. It is never computed as 10% of the total.

| Received | Tithe |
| --- | --- |
| CAD 1,750.00 | CAD 175.00 |
| CAD 249.99 | CAD 25.00 (24.999 rounds half-up) |
| CAD 0.05 | CAD 0.01 (0.005 rounds half-up) |
| CAD 0.01 | CAD 0.00 (entry is still kept) |
| 1,750.00 + 249.99 | income 1,999.99, accrued 200.00 |

### 3.4 Refunds / corrections
* An adjustment is tied to one income entry, has its own effective date (>= the income's received date, <= today)
  and a required reason, and reduces the received amount by `amount_minor` (> 0).
* Total active adjustments on an entry may never exceed its received amount.
* Tithe change for adjustments, processed in canonical order (`effective_on`, `created_at`, `id`):
  `delta_k = tithe(A - R_1 - ... - R_k) - tithe(A - R_1 - ... - R_(k-1))` (always <= 0).
  The deltas telescope, so the entry's net tithe is always `tithe(A - total_refunds)` and a full refund
  reverses exactly the original tithe. Deltas are derived on read and never stored, so deleting or editing
  an adjustment cannot leave stale numbers behind.
* The tithe reduction is dated on the adjustment's effective date (it lands in that date's period).
* Prior church payments are untouched. If the obligation they covered shrinks, the excess shows as a credit (§3.7).

### 3.5 Obligations, periods and buckets
* An **obligation event** is one of: an income entry's tithe (+, dated `received_on`), an adjustment's
  tithe delta (−, dated `effective_on`), or an **opening obligation** (+, dated `effective_on`) — an existing debt from
  before your recorded history. It is labelled "Opening balance" and is never counted as income.
* Events are grouped into **buckets** keyed by `(currency, calendar year of the event date)`. Calendar
  dates are local dates (`YYYY-MM-DD`), so time zones can never move an entry into another day or year.
* A **period** is the display window of a bucket: `max(tracking_start, Jan 1)` to `Dec 31` of that year.
  The default tracking start is **2026-10-03**, so the first period is **Oct 3 – Dec 31, 2026**. You can backdate the
  tracking start (e.g. to Jan 1) to include earlier income. Income cannot be dated before the tracking
  start, and the tracking start cannot be moved past the earliest recorded income. Opening obligations may be dated earlier.
* Later calendar years become new periods automatically. Unpaid balances from earlier buckets stay
  visible and stay included in the amount due. A year changing never resets, erases or settles anything.

### 3.6 Church payments and allocations
* A payment records money you gave elsewhere: date (<= today), amount, currency, church name, optional
  reference and note.
* Every payment stores **explicit allocations** `(bucket_year, amount)` in its own currency. The default proposal is
  **oldest outstanding bucket first** (outstanding is measured after credits). You can review and edit the split before
  saving. Each allocation must be <= that bucket's outstanding amount at save time, and allocations sum to <= the payment.
* Payment amount minus its allocations is **unallocated credit**. A payment that creates credit requires an
  explicit confirmation.
* Payments are never edited in amount, currency or allocations. To correct one, **reverse** it (soft, with reason
  and audit) and record a new one. Church name, reference and note can be edited.
* Viewing an old period later still shows the payments allocated to it.

### 3.7 Balances and credit (per currency)
Let `accrued` = the sum of all obligation events and `paid` = the sum of all active payments.
* **Still to give** = `max(0, accrued − paid)`.
* **Credit** = `max(0, paid − accrued)`, shown explicitly and never hidden by clamping.
* Per bucket: `position = accrued_b − allocated_b`. The **credit pool** = unallocated payment remainders +
  Σ over-covered buckets (`allocated_b − accrued_b` when positive). The pool is applied, derived on read and
  deterministically, to buckets with positive position, **oldest first**. Each bucket gets `credit_applied_b`, and
  `outstanding_b = max(0, position_b − credit_applied_b)`.
* Invariants (tested): `Σ outstanding_b = still to give` and `remaining credit pool = credit`.

### 3.8 Payout schedule
* Setting `next_payout_date` defaults to **2026-12-31**. Day counts use local calendar dates in the configured time zone.
* Before the payout date it shows "N days until payout", and the amount due is all-time still to give. On the payout date
  it shows **Due today**.
* After the payout date it shows **Overdue** with the overdue balance per currency:
  `overdue = Σ_b max(0, min(accrued_b through payout date, accrued_b) − allocated_b − credit_applied_b)`.
  Only obligations dated on or before the payout date count as overdue.
* If the payout date has passed and nothing is overdue, the next payout rolls to Dec 31 of the current year. It is
  labelled as the default until you set a date.
* "Review payout" opens a payment review with the amount still to give prefilled. The payment is recorded only after you
  tick "I made this payment".

### 3.9 Set aside (optional, secondary)
* A manual record of money you reserved for your tithe: `reserve` or `release` entries per currency with dates.
  Balance = reserves − releases. The running balance in date order may never go negative.
* Reserving money never changes what you owe. **Still to set aside** = `max(0, still to give − set-aside balance)`.
* When you record a church payment you can optionally tick "Also take this out of Set aside". That creates a linked
  release in the same transaction, and reversing the payment reverses the linked release. It is unchecked by default.

Worked example (CAD): income 1,750.00 + 249.99 gives accrued 200.00. Give 50.00 and 150.00 is still to give. Set aside
100.00 and still to set aside is 50.00. Still to give stays 150.00.

### 3.10 Combined total in CAD (display-only; added at the owner's request)
* The original brief kept currency conversion out of scope. The owner later asked for the total at the top in CAD,
  "live and accurate, updated every day". The two ledgers stay independent. Payments, allocations, credits, set-aside,
  CSV/JSON exports and every stored value remain in their original currency.
* **Combined total** = CAD still to give + USD still to give × the day's USD→CAD rate. The USD part is rounded half-up
  to the cent with exact BigInt math (`domain/fx.ts`). Credits are never netted across currencies.
* The UI always labels it as converted ("Total still to give · in CAD", "≈"). CAD and USD stay visible separately
  underneath, together with the rate, its source and its observation date.
* **Rate source:** the Bank of Canada Valet API (official daily USD→CAD rate, published each business day), with ECB
  reference rates via Frankfurter as a fallback. Both are free public endpoints. The server fetches them with no
  credentials and no personal data, using a 3 s timeout and a 64 KB cap, and validates payloads strictly (bounds
  0.5–3.0).
* **Caching:** rates are stored in `exchange_rate`, which is public reference data with no RLS. A cached rate younger
  than 6 hours is reused. Otherwise the providers are asked again, and only one request runs per process at a time.
  If every provider fails, the last stored rate is used and labelled "last available rate" once it is more than
  4 days old. With no rate at all, the UI shows the currencies separately and says the combined total is unavailable.
  It never shows a guessed number.
* A rate is looked up only when something is owed in USD, so a CAD-only account makes no outbound requests.

---

## 4. Dates and time
* Financial effective dates (`received_on`, `effective_on`, `paid_on`, `tracking_start`, `next_payout_date`) are
  Postgres `date` columns mapped as strings `YYYY-MM-DD` (never JS `Date`).
* Creation/edit timestamps are `timestamptz`, stored in UTC.
* "Today" = `todayInZone(clock.now(), settings.time_zone)` (default `America/Toronto`). The same zone drives year
  boundaries, the date input default and countdowns.
* `server/clock.ts` exposes `now()`. Tests inject a clock. E2E can set `TENTH_TEST_NOW` (ISO), which is honored only when
  `TENTH_TEST_MODE=1` and never when `NODE_ENV=production` unless `TENTH_TEST_MODE=1` is set explicitly. Production
  deployments must not set it.

---

## 5. Data model (PostgreSQL)

All private tables carry `owner_id text not null references "user"(id) on delete cascade`, enable **and force**
row-level security with policy `owner_id = current_setting('app.owner_id', true)`, and are only accessed through
`withOwner(ownerId, fn)`. That helper opens a transaction and runs `set_config('app.owner_id', ownerId, true)`. Every
query still filters by `owner_id` explicitly, so ownership is checked in the application and again in the database.
Read models and exports use `withOwnerSnapshot(ownerId, fn)`, the same helper at `REPEATABLE READ`, so every page and
export is computed from one consistent snapshot (totals always match the records shown beside them).
`audit_event` allows only SELECT and INSERT for the app role (append-only).

| Table | Key columns / constraints |
| --- | --- |
| Better Auth: `user`, `session`, `account`, `verification`, `two_factor`, `rate_limit` | Managed by Better Auth. Sign-up disabled. |
| `app_settings` | PK `owner_id`; `tracking_start date`, `time_zone text`, `display_currency`, `last_entry_currency`, `church_name`, `next_payout_date date`, `next_payout_is_default bool`, timestamps, `version int` |
| `income_entry` | `id uuid`, `owner_id`, `currency` CHECK in (CAD,USD), `amount_minor bigint` CHECK 1..MAX, `received_on date`, `source`, `category`, `note`, `tithe_rate_bps int`, `rounding_policy text`, `tithe_minor bigint` CHECK = formula, `created_at`, `updated_at`, `deleted_at`, `deleted_reason`, `version`. UNIQUE (`id`,`owner_id`). Index (`owner_id`,`currency`,`received_on`) WHERE `deleted_at` IS NULL |
| `income_adjustment` | `id`, `owner_id`, `income_id` + composite FK (`income_id`,`owner_id`) → income_entry, `kind` (refund\|correction), `amount_minor` > 0, `effective_on`, `reason` (required), `created_at`, `deleted_at`, `deleted_reason` |
| `opening_obligation` | `id`, `owner_id`, `currency`, `amount_minor` > 0, `effective_on`, `label`, `note`, timestamps, `deleted_at`, `deleted_reason`, `version` |
| `church_payment` | `id`, `owner_id`, `currency`, `amount_minor` > 0, `paid_on`, `church_name`, `reference`, `note`, timestamps, `reversed_at`, `reversal_reason`, `version`. UNIQUE (`id`,`owner_id`,`currency`) |
| `payment_allocation` | `id`, `owner_id`, `payment_id`, `currency`, composite FK (`payment_id`,`owner_id`,`currency`) → church_payment, `bucket_year int`, `amount_minor` > 0, UNIQUE (`payment_id`,`bucket_year`). Deferred constraint trigger: Σ allocations ≤ payment amount |
| `set_aside_entry` | `id`, `owner_id`, `currency`, `kind` (reserve\|release), `amount_minor` > 0, `effective_on`, `note`, `payment_id` nullable composite FK → church_payment, `created_at`, `deleted_at`, `deleted_reason` |
| `audit_event` | `id`, `owner_id`, `entity_type`, `entity_id`, `action` (create\|update\|delete\|restore\|reverse), `before jsonb`, `after jsonb`, `reason`, `created_at`. Index (`owner_id`,`created_at` desc) |
| `idempotency_record` | PK (`owner_id`,`key uuid`), `operation`, `request_hash`, `response jsonb`, `created_at` |
| `app_rate_limit` | PK `key text`, `window_start timestamptz`, `count int` (not owner data; no RLS) |

Soft-deleted rows (`deleted_at` / `reversed_at` not null) are excluded from every active total, but they stay in the
database and in the audit history.

---

## 6. Mutations: transactions, idempotency, audit
Every balance-affecting mutation runs in a single `withOwner` transaction:
1. Lock the owner's `app_settings` row (`SELECT … FOR UPDATE`). This serializes the owner's financial writes, so refund
   limits, allocation limits and set-aside balances are race-free.
2. Idempotency: `INSERT INTO idempotency_record … ON CONFLICT DO NOTHING`. If the key exists with the same
   `request_hash`, return the stored response (a retry or double-submit). If the hash differs, reject with
   `idempotency_conflict`. Concurrent duplicates block on the unique index and then return the stored response.
3. Load current state and validate with domain functions.
4. Write rows and an `audit_event` (before/after snapshots).
5. Store the response in the idempotency record. Commit.

The client generates one UUID idempotency key per form instance and regenerates it only after a confirmed success.
Submit buttons are disabled while pending. Confirmation UI appears only after the server action returns `ok: true`.
Updates also carry `expectedVersion` (optimistic concurrency). Deletes and reversals are idempotent.

Server Actions return `ActionResult<T>`:
`{ ok: true; data: T; message: string } | { ok: false; code: string; message: string; fieldErrors?: Record<string, string> }`.

---

## 7. Security model
* Authentication is required before any financial record is read or written. Every page under the app layout,
  every Server Action and every Route Handler calls `requireOwner()`. That function reads the Better Auth session from
  the request cookies on the server, and the owner id always comes from that session, never from client input.
* Owner-only: Better Auth `emailAndPassword.disableSignUp = true`. The single owner is created by
  `npm run owner:create` (CLI) or by the one-time `/setup` page. That page works only while no user exists and requires
  `OWNER_EMAIL` plus the server-side secret `OWNER_SETUP_TOKEN`.
* Optional TOTP two-factor authentication with backup codes (Better Auth `twoFactor` plugin), managed in Settings.
* Cookies: HttpOnly, `Secure` in production (HTTPS), `SameSite=Lax`. Better Auth enforces trusted origins on its
  endpoints, and Next.js Server Actions reject cross-origin POSTs (Origin vs Host). Export routes are GET-only and
  side-effect free.
* Rate limits: Better Auth's database-backed limiter on auth endpoints, plus `app_rate_limit` for mutations (per
  owner) and exports.
* Headers: per-request nonce CSP from `src/proxy.ts`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, HSTS in production, no `X-Powered-By`.
  Financial responses send `Cache-Control: private, no-store`.
* There are no analytics, no session replay and no third-party scripts. Fonts are self-hosted. Logs carry operation names,
  ids, durations and error codes, but never amounts, notes, sources or emails.
* User text is rendered as escaped React text only (no `dangerouslySetInnerHTML`). CSV exports neutralize formula
  injection in user-supplied text fields.

---

## 8. UI map
* `/` Overview: hero "Still to give" with a 10% marker and currency switch, period stats (income received, tithe accrued,
  given), year-end timeline with countdown and the orbital arc, quick income entry, cumulative accrued-tithe chart,
  monthly breakdown, recent ledger rows.
* `/ledger`: full income ledger with search, date/currency filters, sorting, filtered totals (kept distinct from the
  all-time balance), edit, refund, delete, CSV export and JSON backup.
* `/given`: church payments, the payout review, all outstanding obligations by currency and period, and credits.
* `/set-aside`: set-aside balance and history.
* `/settings`: tracking start, time zone, display currency, church name, next payout date, fixed 10% rate,
  opening balances, security (password, 2FA), data export, sign out.
* `/sign-in`, `/sign-in/two-factor`, `/setup`: dark-themed auth screens.
