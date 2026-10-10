-- 0009: Drop scheduled_date CHECK (validate in API only)
-- Implements: Deployment Readiness P0 #5.
--
-- Problem: CHECK (scheduled_date >= current_date - 1 day) is re-evaluated on
-- EVERY update (Postgres checks the whole row). Once an order is 2+ days old,
-- approve / complete / cancel updates fail even though the date was valid
-- at creation.
--
-- Fix: drop the constraint. Date rules live in the API (orders.controller
-- create + modify validate YYYY-MM-DD, not-past on create/edit only).

alter table orders drop constraint if exists chk_scheduled_future;
