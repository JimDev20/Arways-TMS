-- ARWAYS TMS: dispatch waybill photo (Left-dispatch gate) + pickup-only support
-- No structural change needed for pickup-only (stops already allows single pickup row).
-- Adds nullable waybill photo URL to routes.
alter table routes add column if not exists dispatch_left_photo_url text;
