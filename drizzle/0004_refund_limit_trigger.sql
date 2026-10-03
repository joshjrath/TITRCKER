-- Refund limit as a database invariant (custom migration; see docs/ARCHITECTURE.md §3.4 and §5).
--
-- Σ active (deleted_at IS NULL) income_adjustment.amount_minor <= income_entry.amount_minor for every income entry,
-- checked at commit (DEFERRABLE INITIALLY DEFERRED), mirroring payment_allocation_sum_check in 0002. The services
-- already enforce this under the owner's settings lock; the trigger is the backstop for any other write path.
-- It fires when an adjustment is added, changed or restored, and when an income's amount changes.
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "tenth_check_income_adjustments"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_income_id uuid;
  v_owner_id text;
  v_income_amount bigint;
  v_adjusted bigint;
BEGIN
  IF TG_TABLE_NAME = 'income_entry' THEN
    v_income_id := NEW.id;
    v_owner_id := NEW.owner_id;
  ELSE
    v_income_id := NEW.income_id;
    v_owner_id := NEW.owner_id;
  END IF;

  SELECT i.amount_minor INTO v_income_amount
    FROM income_entry i
   WHERE i.id = v_income_id AND i.owner_id = v_owner_id;
  IF NOT FOUND THEN
    -- The row was removed later in the same transaction (e.g. owner deletion cascade): nothing to check.
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(a.amount_minor), 0) INTO v_adjusted
    FROM income_adjustment a
   WHERE a.income_id = v_income_id AND a.owner_id = v_owner_id AND a.deleted_at IS NULL;

  IF v_adjusted > v_income_amount THEN
    RAISE EXCEPTION 'income adjustments exceed the received amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'income_adjustment_sum_check';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "income_adjustment_sum_check"
  AFTER INSERT OR UPDATE ON "income_adjustment"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "tenth_check_income_adjustments"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "income_entry_adjustment_sum_check"
  AFTER UPDATE OF "amount_minor" ON "income_entry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "tenth_check_income_adjustments"();
