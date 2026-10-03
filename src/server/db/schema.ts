/**
 * Drizzle schema entry point (drizzle.config.ts points here; the db client is typed with it).
 * Migrations are generated from this file into ./drizzle with `npm run db:generate`.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Relative imports (not "@/..."): drizzle-kit loads this file outside the Next/Vitest alias setup.
import {
  BPS_DENOMINATOR,
  CURRENCIES,
  HALF_UP_OFFSET_BPS,
  MAX_AMOUNT_MINOR,
  MAX_SUPPORTED_YEAR,
  MIN_AMOUNT_MINOR,
  MIN_SUPPORTED_YEAR,
  ROUNDING_POLICY,
} from "../../domain/constants";
import { TEXT_LIMITS } from "../../lib/validation/limits";
import { user } from "./auth-schema";

export * from "./auth-schema";

// ---------------------------------------------------------------------------------------------
// Infrastructure tables (not owner data; no RLS)
// ---------------------------------------------------------------------------------------------

/** Fixed-window rate limiter for app mutations/exports (see src/server/security/rate-limit.ts). */
export const appRateLimit = pgTable("app_rate_limit", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

// ---------------------------------------------------------------------------------------------
// APPLICATION TABLES (owner data, RLS forced) — added by the data workstream below this line.
// See docs/ARCHITECTURE.md §5.
// ---------------------------------------------------------------------------------------------

const tz = { withTimezone: true } as const;

/** Literal SQL for a trusted compile-time constant (numbers and fixed identifiers only — never user input). */
const lit = (value: string | number): SQL => sql.raw(typeof value === "number" ? String(value) : `'${value}'`);
const inList = (values: readonly string[]): SQL => sql.raw(values.map((v) => `'${v}'`).join(", "));

export const ADJUSTMENT_KINDS = ["refund", "correction"] as const;
export const SET_ASIDE_KINDS = ["reserve", "release"] as const;
export const AUDIT_ACTIONS = ["create", "update", "delete", "restore", "reverse"] as const;
export const AUDIT_ENTITY_TYPES = ["income", "adjustment", "opening", "payment", "set_aside", "settings"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

const ownerId = () =>
  text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const amountMinor = () => bigint("amount_minor", { mode: "number" }).notNull();
const currency = () => text("currency").notNull();
const localDate = (name: string) => date(name, { mode: "string" });
const createdAt = () => timestamp("created_at", tz).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", tz).defaultNow().notNull();
const version = () => integer("version").default(1).notNull();

const currencyCheck = (name: string, column: AnyPgColumn): ReturnType<typeof check> =>
  check(name, sql`${column} IN (${inList(CURRENCIES)})`);
const amountCheck = (name: string, column: AnyPgColumn): ReturnType<typeof check> =>
  check(name, sql`${column} BETWEEN ${lit(MIN_AMOUNT_MINOR)} AND ${lit(MAX_AMOUNT_MINOR)}`);
/** Max length (nullable columns pass when NULL). */
const maxLength = (name: string, column: AnyPgColumn, max: number): ReturnType<typeof check> =>
  check(name, sql`char_length(${column}) <= ${lit(max)}`);
/** Required, non-blank text with a max length. */
const requiredText = (name: string, column: AnyPgColumn, max: number): ReturnType<typeof check> =>
  check(name, sql`char_length(btrim(${column})) >= 1 AND char_length(${column}) <= ${lit(max)}`);
const versionCheck = (name: string, column: AnyPgColumn): ReturnType<typeof check> => check(name, sql`${column} >= 1`);

/** One row per owner. Locked FOR UPDATE by every balance-affecting mutation (serializes the owner's writes). */
export const appSettings = pgTable(
  "app_settings",
  {
    ownerId: ownerId().primaryKey(),
    trackingStart: localDate("tracking_start").notNull(),
    timeZone: text("time_zone").notNull(),
    displayCurrency: text("display_currency").notNull(),
    lastEntryCurrency: text("last_entry_currency").notNull(),
    churchName: text("church_name"),
    nextPayoutDate: localDate("next_payout_date").notNull(),
    nextPayoutIsDefault: boolean("next_payout_is_default").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    requiredText("app_settings_time_zone_check", t.timeZone, TEXT_LIMITS.timeZone),
    currencyCheck("app_settings_display_currency_check", t.displayCurrency),
    currencyCheck("app_settings_last_entry_currency_check", t.lastEntryCurrency),
    maxLength("app_settings_church_name_check", t.churchName, TEXT_LIMITS.churchName),
    versionCheck("app_settings_version_check", t.version),
  ],
);

export const incomeEntry = pgTable(
  "income_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: ownerId(),
    currency: currency(),
    amountMinor: amountMinor(),
    receivedOn: localDate("received_on").notNull(),
    source: text("source"),
    category: text("category"),
    note: text("note"),
    titheRateBps: integer("tithe_rate_bps").notNull(),
    roundingPolicy: text("rounding_policy").notNull(),
    titheMinor: bigint("tithe_minor", { mode: "number" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", tz),
    deletedReason: text("deleted_reason"),
    version: version(),
  },
  (t) => [
    unique("income_entry_id_owner_unique").on(t.id, t.ownerId),
    index("income_entry_owner_currency_received_idx")
      .on(t.ownerId, t.currency, t.receivedOn)
      .where(sql`${t.deletedAt} IS NULL`),
    currencyCheck("income_entry_currency_check", t.currency),
    amountCheck("income_entry_amount_check", t.amountMinor),
    check("income_entry_rate_check", sql`${t.titheRateBps} BETWEEN 0 AND ${lit(BPS_DENOMINATOR)}`),
    check("income_entry_policy_check", sql`${t.roundingPolicy} IN (${lit(ROUNDING_POLICY)})`),
    check(
      "income_entry_tithe_check",
      sql`${t.roundingPolicy} <> ${lit(ROUNDING_POLICY)} OR ${t.titheMinor} = (${t.amountMinor} * ${t.titheRateBps} + ${lit(HALF_UP_OFFSET_BPS)}) / ${lit(BPS_DENOMINATOR)}`,
    ),
    maxLength("income_entry_source_check", t.source, TEXT_LIMITS.source),
    maxLength("income_entry_category_check", t.category, TEXT_LIMITS.category),
    maxLength("income_entry_note_check", t.note, TEXT_LIMITS.note),
    maxLength("income_entry_deleted_reason_check", t.deletedReason, TEXT_LIMITS.reason),
    versionCheck("income_entry_version_check", t.version),
  ],
);

export const incomeAdjustment = pgTable(
  "income_adjustment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: ownerId(),
    incomeId: uuid("income_id").notNull(),
    kind: text("kind").notNull(),
    amountMinor: amountMinor(),
    effectiveOn: localDate("effective_on").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", tz),
    deletedReason: text("deleted_reason"),
  },
  (t) => [
    foreignKey({
      name: "income_adjustment_income_owner_fk",
      columns: [t.incomeId, t.ownerId],
      foreignColumns: [incomeEntry.id, incomeEntry.ownerId],
    }).onDelete("cascade"),
    index("income_adjustment_owner_income_idx").on(t.ownerId, t.incomeId),
    check("income_adjustment_kind_check", sql`${t.kind} IN (${inList(ADJUSTMENT_KINDS)})`),
    amountCheck("income_adjustment_amount_check", t.amountMinor),
    requiredText("income_adjustment_reason_check", t.reason, TEXT_LIMITS.reason),
    maxLength("income_adjustment_deleted_reason_check", t.deletedReason, TEXT_LIMITS.reason),
  ],
);

export const openingObligation = pgTable(
  "opening_obligation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: ownerId(),
    currency: currency(),
    amountMinor: amountMinor(),
    effectiveOn: localDate("effective_on").notNull(),
    label: text("label").notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", tz),
    deletedReason: text("deleted_reason"),
    version: version(),
  },
  (t) => [
    index("opening_obligation_owner_currency_idx")
      .on(t.ownerId, t.currency, t.effectiveOn)
      .where(sql`${t.deletedAt} IS NULL`),
    currencyCheck("opening_obligation_currency_check", t.currency),
    amountCheck("opening_obligation_amount_check", t.amountMinor),
    requiredText("opening_obligation_label_check", t.label, TEXT_LIMITS.label),
    maxLength("opening_obligation_note_check", t.note, TEXT_LIMITS.note),
    maxLength("opening_obligation_deleted_reason_check", t.deletedReason, TEXT_LIMITS.reason),
    versionCheck("opening_obligation_version_check", t.version),
  ],
);

export const churchPayment = pgTable(
  "church_payment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: ownerId(),
    currency: currency(),
    amountMinor: amountMinor(),
    paidOn: localDate("paid_on").notNull(),
    churchName: text("church_name").notNull(),
    reference: text("reference"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    reversedAt: timestamp("reversed_at", tz),
    reversalReason: text("reversal_reason"),
    version: version(),
  },
  (t) => [
    unique("church_payment_id_owner_currency_unique").on(t.id, t.ownerId, t.currency),
    index("church_payment_owner_currency_paid_idx")
      .on(t.ownerId, t.currency, t.paidOn)
      .where(sql`${t.reversedAt} IS NULL`),
    currencyCheck("church_payment_currency_check", t.currency),
    amountCheck("church_payment_amount_check", t.amountMinor),
    requiredText("church_payment_church_name_check", t.churchName, TEXT_LIMITS.churchName),
    maxLength("church_payment_reference_check", t.reference, TEXT_LIMITS.reference),
    maxLength("church_payment_note_check", t.note, TEXT_LIMITS.note),
    maxLength("church_payment_reversal_reason_check", t.reversalReason, TEXT_LIMITS.reason),
    versionCheck("church_payment_version_check", t.version),
  ],
);

export const paymentAllocation = pgTable(
  "payment_allocation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: ownerId(),
    paymentId: uuid("payment_id").notNull(),
    currency: currency(),
    bucketYear: integer("bucket_year").notNull(),
    amountMinor: amountMinor(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "payment_allocation_payment_owner_currency_fk",
      columns: [t.paymentId, t.ownerId, t.currency],
      foreignColumns: [churchPayment.id, churchPayment.ownerId, churchPayment.currency],
    }).onDelete("cascade"),
    unique("payment_allocation_payment_year_unique").on(t.paymentId, t.bucketYear),
    index("payment_allocation_owner_idx").on(t.ownerId, t.currency),
    currencyCheck("payment_allocation_currency_check", t.currency),
    amountCheck("payment_allocation_amount_check", t.amountMinor),
    check(
      "payment_allocation_year_check",
      sql`${t.bucketYear} BETWEEN ${lit(MIN_SUPPORTED_YEAR)} AND ${lit(MAX_SUPPORTED_YEAR)}`,
    ),
  ],
);

export const setAsideEntry = pgTable(
  "set_aside_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: ownerId(),
    currency: currency(),
    kind: text("kind").notNull(),
    amountMinor: amountMinor(),
    effectiveOn: localDate("effective_on").notNull(),
    note: text("note"),
    paymentId: uuid("payment_id"),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", tz),
    deletedReason: text("deleted_reason"),
  },
  (t) => [
    foreignKey({
      name: "set_aside_entry_payment_owner_currency_fk",
      columns: [t.paymentId, t.ownerId, t.currency],
      foreignColumns: [churchPayment.id, churchPayment.ownerId, churchPayment.currency],
    }).onDelete("cascade"),
    index("set_aside_entry_owner_currency_idx")
      .on(t.ownerId, t.currency, t.effectiveOn)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("set_aside_entry_active_payment_unique")
      .on(t.paymentId)
      .where(sql`${t.paymentId} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    currencyCheck("set_aside_entry_currency_check", t.currency),
    check("set_aside_entry_kind_check", sql`${t.kind} IN (${inList(SET_ASIDE_KINDS)})`),
    check("set_aside_entry_payment_kind_check", sql`${t.paymentId} IS NULL OR ${t.kind} = 'release'`),
    amountCheck("set_aside_entry_amount_check", t.amountMinor),
    maxLength("set_aside_entry_note_check", t.note, TEXT_LIMITS.note),
    maxLength("set_aside_entry_deleted_reason_check", t.deletedReason, TEXT_LIMITS.reason),
  ],
);

/** Append-only history. The app role may only SELECT and INSERT (RLS policies; see the rls migration). */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: ownerId(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_event_owner_created_idx").on(t.ownerId, t.createdAt.desc()),
    index("audit_event_owner_entity_idx").on(t.ownerId, t.entityType, t.entityId),
    check("audit_event_entity_type_check", sql`${t.entityType} IN (${inList(AUDIT_ENTITY_TYPES)})`),
    check("audit_event_action_check", sql`${t.action} IN (${inList(AUDIT_ACTIONS)})`),
    maxLength("audit_event_reason_check", t.reason, TEXT_LIMITS.reason),
  ],
);

/** Idempotency keys for mutations (ARCHITECTURE §6). The response is stored in the same transaction. */
export const idempotencyRecord = pgTable(
  "idempotency_record",
  {
    ownerId: ownerId(),
    key: uuid("key").notNull(),
    operation: text("operation").notNull(),
    requestHash: text("request_hash").notNull(),
    response: jsonb("response"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "idempotency_record_pk", columns: [t.ownerId, t.key] }),
    check("idempotency_record_hash_check", sql`${t.requestHash} ~ '^[0-9a-f]{64}$'`),
    check("idempotency_record_operation_check", sql`char_length(${t.operation}) BETWEEN 1 AND 64`),
  ],
);

/** Tables holding owner data: every one has RLS enabled + forced (see drizzle/*_rls_and_integrity.sql). */
export const OWNER_TABLE_NAMES = [
  "app_settings",
  "income_entry",
  "income_adjustment",
  "opening_obligation",
  "church_payment",
  "payment_allocation",
  "set_aside_entry",
  "audit_event",
  "idempotency_record",
] as const;
