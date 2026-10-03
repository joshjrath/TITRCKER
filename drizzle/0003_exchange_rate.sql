CREATE TABLE "exchange_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate" text NOT NULL,
	"observed_on" date NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exchange_rate_pair_day_source" UNIQUE("base","quote","observed_on","source"),
	CONSTRAINT "exchange_rate_pair_check" CHECK ("exchange_rate"."base" = 'USD' AND "exchange_rate"."quote" = 'CAD'),
	CONSTRAINT "exchange_rate_rate_format" CHECK ("exchange_rate"."rate" ~ '^[0-9]{1,2}\.[0-9]{1,8}$'),
	CONSTRAINT "exchange_rate_source_check" CHECK ("exchange_rate"."source" IN ('bank_of_canada', 'ecb_frankfurter'))
);
--> statement-breakpoint
CREATE INDEX "exchange_rate_latest_idx" ON "exchange_rate" USING btree ("base","quote","observed_on","fetched_at");