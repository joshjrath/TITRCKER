-- Row-level security and cross-row integrity (custom migration; see docs/ARCHITECTURE.md §5).
--
-- Every owner table enables AND forces RLS, so even the table owner (the app role that runs migrations
-- and serves requests) only sees rows whose owner_id equals the transaction-local setting app.owner_id,
-- which withOwner() sets via set_config('app.owner_id', <session owner>, true). Without that setting no
-- owner rows are visible and no owner rows can be written. The application filters owner_id explicitly
-- as well; RLS is the database-level backstop.
--
-- audit_event is append-only for the app: SELECT and INSERT policies only, so UPDATE/DELETE match no rows.
--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "income_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "income_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "income_adjustment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "income_adjustment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "opening_obligation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "opening_obligation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "church_payment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "church_payment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_allocation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_allocation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "set_aside_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "set_aside_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "idempotency_record" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "idempotency_record" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_event" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "app_settings_owner_isolation" ON "app_settings" AS PERMISSIVE FOR ALL
  USING (owner_id = current_setting('app.owner_id', true))
  WITH CHECK (owner_id = current_setting('app.owner_id', true));
--> statement-breakpoint
CREATE POLICY "income_entry_owner_isolation" ON "income_entry" AS PERMISSIVE FOR ALL
  USING (owner_id = current_setting('app.owner_id', true))
  WITH CHECK (owner_id = current_setting('app.owner_id', true));
--> statement-breakpoint
CREATE POLICY "income_adjustment_owner_isolation" ON "income_adjustment" AS PERMISSIVE FOR ALL
  USING (owner_id = current_setting('app.owner_id', true))
  WITH CHECK (owner_id = current_setting('app.owner_id', true));
--> statement-breakpoint
CREATE POLICY "opening_obligation_owner_isolation" ON "opening_obligation" AS PERMISSIVE FOR ALL
  USING (owner_id = current_setting('app.owner_id', true))
  WITH CHECK (owner_id = current_setting('app.owner_id', true));
--> statement-breakpoint
CREATE POLICY "church_payment_owner_isolation" ON "church_payment" AS PERMISSIVE FOR ALL
  USING (owner_id = current_setting('app.owner_id', true))
  WITH CHECK (owner_id = current_setting('app.owner_id', true));
--> statement-breakpoint
CREATE POLICY "payment_allocation_owner_isolation" ON "payment_allocation" AS PERMISSIVE FOR ALL
  USING (owner_id = current_setting('app.owner_id', true))
  WITH CHECK (owner_id = current_setting('app.owner_id', true));
--> statement-breakpoint
CREATE POLICY "set_aside_entry_owner_isolation" ON "set_aside_entry" AS PERMISSIVE FOR ALL
  USING (owner_id = current_setting('app.owner_id', true))
  WITH CHECK (owner_id = current_setting('app.owner_id', true));
--> statement-breakpoint
CREATE POLICY "idempotency_record_owner_isolation" ON "idempotency_record" AS PERMISSIVE FOR ALL
  USING (owner_id = current_setting('app.owner_id', true))
  WITH CHECK (owner_id = current_setting('app.owner_id', true));
--> statement-breakpoint
CREATE POLICY "audit_event_owner_select" ON "audit_event" AS PERMISSIVE FOR SELECT
  USING (owner_id = current_setting('app.owner_id', true));
--> statement-breakpoint
CREATE POLICY "audit_event_owner_insert" ON "audit_event" AS PERMISSIVE FOR INSERT
  WITH CHECK (owner_id = current_setting('app.owner_id', true));
--> statement-breakpoint
-- Σ payment_allocation.amount_minor <= church_payment.amount_minor for every payment, checked at commit
-- (DEFERRABLE INITIALLY DEFERRED) so a payment and its allocations can be written in any order.
CREATE OR REPLACE FUNCTION "tenth_check_payment_allocations"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id uuid;
  v_owner_id text;
  v_payment_amount bigint;
  v_allocated bigint;
BEGIN
  IF TG_TABLE_NAME = 'church_payment' THEN
    v_payment_id := NEW.id;
    v_owner_id := NEW.owner_id;
  ELSE
    v_payment_id := NEW.payment_id;
    v_owner_id := NEW.owner_id;
  END IF;

  SELECT p.amount_minor INTO v_payment_amount
    FROM church_payment p
   WHERE p.id = v_payment_id AND p.owner_id = v_owner_id;
  IF NOT FOUND THEN
    -- The row was removed later in the same transaction (e.g. owner deletion cascade): nothing to check.
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(a.amount_minor), 0) INTO v_allocated
    FROM payment_allocation a
   WHERE a.payment_id = v_payment_id AND a.owner_id = v_owner_id;

  IF v_allocated > v_payment_amount THEN
    RAISE EXCEPTION 'payment allocations exceed the payment amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocation_sum_check';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "payment_allocation_sum_check"
  AFTER INSERT OR UPDATE ON "payment_allocation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "tenth_check_payment_allocations"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "church_payment_allocation_sum_check"
  AFTER UPDATE OF "amount_minor" ON "church_payment"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "tenth_check_payment_allocations"();
