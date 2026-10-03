CREATE TABLE "app_settings" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"tracking_start" date NOT NULL,
	"time_zone" text NOT NULL,
	"display_currency" text NOT NULL,
	"last_entry_currency" text NOT NULL,
	"church_name" text,
	"next_payout_date" date NOT NULL,
	"next_payout_is_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "app_settings_time_zone_check" CHECK (char_length(btrim("app_settings"."time_zone")) >= 1 AND char_length("app_settings"."time_zone") <= 64),
	CONSTRAINT "app_settings_display_currency_check" CHECK ("app_settings"."display_currency" IN ('CAD', 'USD')),
	CONSTRAINT "app_settings_last_entry_currency_check" CHECK ("app_settings"."last_entry_currency" IN ('CAD', 'USD')),
	CONSTRAINT "app_settings_church_name_check" CHECK (char_length("app_settings"."church_name") <= 120),
	CONSTRAINT "app_settings_version_check" CHECK ("app_settings"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_event_entity_type_check" CHECK ("audit_event"."entity_type" IN ('income', 'adjustment', 'opening', 'payment', 'set_aside', 'settings')),
	CONSTRAINT "audit_event_action_check" CHECK ("audit_event"."action" IN ('create', 'update', 'delete', 'restore', 'reverse')),
	CONSTRAINT "audit_event_reason_check" CHECK (char_length("audit_event"."reason") <= 200)
);
--> statement-breakpoint
CREATE TABLE "church_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"church_name" text NOT NULL,
	"reference" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "church_payment_id_owner_currency_unique" UNIQUE("id","owner_id","currency"),
	CONSTRAINT "church_payment_currency_check" CHECK ("church_payment"."currency" IN ('CAD', 'USD')),
	CONSTRAINT "church_payment_amount_check" CHECK ("church_payment"."amount_minor" BETWEEN 1 AND 99999999999),
	CONSTRAINT "church_payment_church_name_check" CHECK (char_length(btrim("church_payment"."church_name")) >= 1 AND char_length("church_payment"."church_name") <= 120),
	CONSTRAINT "church_payment_reference_check" CHECK (char_length("church_payment"."reference") <= 80),
	CONSTRAINT "church_payment_note_check" CHECK (char_length("church_payment"."note") <= 500),
	CONSTRAINT "church_payment_reversal_reason_check" CHECK (char_length("church_payment"."reversal_reason") <= 200),
	CONSTRAINT "church_payment_version_check" CHECK ("church_payment"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "idempotency_record" (
	"owner_id" text NOT NULL,
	"key" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_record_pk" PRIMARY KEY("owner_id","key"),
	CONSTRAINT "idempotency_record_hash_check" CHECK ("idempotency_record"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "idempotency_record_operation_check" CHECK (char_length("idempotency_record"."operation") BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE TABLE "income_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"income_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"effective_on" date NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_reason" text,
	CONSTRAINT "income_adjustment_kind_check" CHECK ("income_adjustment"."kind" IN ('refund', 'correction')),
	CONSTRAINT "income_adjustment_amount_check" CHECK ("income_adjustment"."amount_minor" BETWEEN 1 AND 99999999999),
	CONSTRAINT "income_adjustment_reason_check" CHECK (char_length(btrim("income_adjustment"."reason")) >= 1 AND char_length("income_adjustment"."reason") <= 200),
	CONSTRAINT "income_adjustment_deleted_reason_check" CHECK (char_length("income_adjustment"."deleted_reason") <= 200)
);
--> statement-breakpoint
CREATE TABLE "income_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"received_on" date NOT NULL,
	"source" text,
	"category" text,
	"note" text,
	"tithe_rate_bps" integer NOT NULL,
	"rounding_policy" text NOT NULL,
	"tithe_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "income_entry_id_owner_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "income_entry_currency_check" CHECK ("income_entry"."currency" IN ('CAD', 'USD')),
	CONSTRAINT "income_entry_amount_check" CHECK ("income_entry"."amount_minor" BETWEEN 1 AND 99999999999),
	CONSTRAINT "income_entry_rate_check" CHECK ("income_entry"."tithe_rate_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "income_entry_policy_check" CHECK ("income_entry"."rounding_policy" IN ('HALF_UP_PER_ENTRY_MINOR')),
	CONSTRAINT "income_entry_tithe_check" CHECK ("income_entry"."rounding_policy" <> 'HALF_UP_PER_ENTRY_MINOR' OR "income_entry"."tithe_minor" = ("income_entry"."amount_minor" * "income_entry"."tithe_rate_bps" + 5000) / 10000),
	CONSTRAINT "income_entry_source_check" CHECK (char_length("income_entry"."source") <= 120),
	CONSTRAINT "income_entry_category_check" CHECK (char_length("income_entry"."category") <= 40),
	CONSTRAINT "income_entry_note_check" CHECK (char_length("income_entry"."note") <= 500),
	CONSTRAINT "income_entry_deleted_reason_check" CHECK (char_length("income_entry"."deleted_reason") <= 200),
	CONSTRAINT "income_entry_version_check" CHECK ("income_entry"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "opening_obligation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"effective_on" date NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "opening_obligation_currency_check" CHECK ("opening_obligation"."currency" IN ('CAD', 'USD')),
	CONSTRAINT "opening_obligation_amount_check" CHECK ("opening_obligation"."amount_minor" BETWEEN 1 AND 99999999999),
	CONSTRAINT "opening_obligation_label_check" CHECK (char_length(btrim("opening_obligation"."label")) >= 1 AND char_length("opening_obligation"."label") <= 80),
	CONSTRAINT "opening_obligation_note_check" CHECK (char_length("opening_obligation"."note") <= 500),
	CONSTRAINT "opening_obligation_deleted_reason_check" CHECK (char_length("opening_obligation"."deleted_reason") <= 200),
	CONSTRAINT "opening_obligation_version_check" CHECK ("opening_obligation"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "payment_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"payment_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"bucket_year" integer NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocation_payment_year_unique" UNIQUE("payment_id","bucket_year"),
	CONSTRAINT "payment_allocation_currency_check" CHECK ("payment_allocation"."currency" IN ('CAD', 'USD')),
	CONSTRAINT "payment_allocation_amount_check" CHECK ("payment_allocation"."amount_minor" BETWEEN 1 AND 99999999999),
	CONSTRAINT "payment_allocation_year_check" CHECK ("payment_allocation"."bucket_year" BETWEEN 2000 AND 2200)
);
--> statement-breakpoint
CREATE TABLE "set_aside_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"currency" text NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"effective_on" date NOT NULL,
	"note" text,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_reason" text,
	CONSTRAINT "set_aside_entry_currency_check" CHECK ("set_aside_entry"."currency" IN ('CAD', 'USD')),
	CONSTRAINT "set_aside_entry_kind_check" CHECK ("set_aside_entry"."kind" IN ('reserve', 'release')),
	CONSTRAINT "set_aside_entry_payment_kind_check" CHECK ("set_aside_entry"."payment_id" IS NULL OR "set_aside_entry"."kind" = 'release'),
	CONSTRAINT "set_aside_entry_amount_check" CHECK ("set_aside_entry"."amount_minor" BETWEEN 1 AND 99999999999),
	CONSTRAINT "set_aside_entry_note_check" CHECK (char_length("set_aside_entry"."note") <= 500),
	CONSTRAINT "set_aside_entry_deleted_reason_check" CHECK (char_length("set_aside_entry"."deleted_reason") <= 200)
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_payment" ADD CONSTRAINT "church_payment_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_adjustment" ADD CONSTRAINT "income_adjustment_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_adjustment" ADD CONSTRAINT "income_adjustment_income_owner_fk" FOREIGN KEY ("income_id","owner_id") REFERENCES "public"."income_entry"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_entry" ADD CONSTRAINT "income_entry_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_obligation" ADD CONSTRAINT "opening_obligation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_payment_owner_currency_fk" FOREIGN KEY ("payment_id","owner_id","currency") REFERENCES "public"."church_payment"("id","owner_id","currency") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_aside_entry" ADD CONSTRAINT "set_aside_entry_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_aside_entry" ADD CONSTRAINT "set_aside_entry_payment_owner_currency_fk" FOREIGN KEY ("payment_id","owner_id","currency") REFERENCES "public"."church_payment"("id","owner_id","currency") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_owner_created_idx" ON "audit_event" USING btree ("owner_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_event_owner_entity_idx" ON "audit_event" USING btree ("owner_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "church_payment_owner_currency_paid_idx" ON "church_payment" USING btree ("owner_id","currency","paid_on") WHERE "church_payment"."reversed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "income_adjustment_owner_income_idx" ON "income_adjustment" USING btree ("owner_id","income_id");--> statement-breakpoint
CREATE INDEX "income_entry_owner_currency_received_idx" ON "income_entry" USING btree ("owner_id","currency","received_on") WHERE "income_entry"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "opening_obligation_owner_currency_idx" ON "opening_obligation" USING btree ("owner_id","currency","effective_on") WHERE "opening_obligation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "payment_allocation_owner_idx" ON "payment_allocation" USING btree ("owner_id","currency");--> statement-breakpoint
CREATE INDEX "set_aside_entry_owner_currency_idx" ON "set_aside_entry" USING btree ("owner_id","currency","effective_on") WHERE "set_aside_entry"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "set_aside_entry_active_payment_unique" ON "set_aside_entry" USING btree ("payment_id") WHERE "set_aside_entry"."payment_id" IS NOT NULL AND "set_aside_entry"."deleted_at" IS NULL;