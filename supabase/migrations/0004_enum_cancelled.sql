-- ARWAYS TMS: allow 'Cancelled' on orders + routes (cancel-order flow).
-- Enum ADD VALUE runs in its own implicit transaction per statement here
-- (DO blocks are fine on Postgres 12+ as long as the new label is not
-- used by other statements in the same block).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'Cancelled'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'Cancelled';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'route_status' AND e.enumlabel = 'Cancelled'
  ) THEN
    ALTER TYPE route_status ADD VALUE 'Cancelled';
  END IF;
END $$;
