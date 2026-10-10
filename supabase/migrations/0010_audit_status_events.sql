-- 0010: Audit trail + status history + performance indexes
-- Implements: Deployment Readiness P1 (audit_logs, retention), Improvement
-- Roadmap (status_events, audit_logs, GIST + query indexes, reasons-as-data
-- stub), Security Playbook (append-only audit, detection fields).
--
-- status_events: one row per order/route/stop change (entity, ids, old/new
-- status, actor, reason, server time). Replaces derived audit/timeline guesses.
-- audit_logs: append-only app actions (actor, action, target, before/after, IP).
-- See backend/src/db/schema.ts (auditLogs, statusEvents).

-- ---------- status_events ----------
create table if not exists status_events (
  event_id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('order','route','stop')),
  entity_id uuid not null,
  order_id uuid references orders(order_id) on delete set null,
  old_status text,
  new_status text not null,
  actor_user_id uuid references users(user_id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_status_events_entity on status_events(entity, entity_id);
create index if not exists idx_status_events_order on status_events(order_id, created_at desc);

-- ---------- audit_logs (append-only) ----------
create table if not exists audit_logs (
  log_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(user_id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  before_value jsonb,
  after_value jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_actor on audit_logs(actor_user_id, created_at desc);
create index if not exists idx_audit_logs_action on audit_logs(action, created_at desc);

-- App role may INSERT but never UPDATE/DELETE (enforced in app code review;
-- add a restricted role + revoke in production per Security Playbook).
alter table status_events enable row level security;
alter table audit_logs enable row level security;
revoke all on status_events from anon, authenticated;
revoke all on audit_logs from anon, authenticated;

-- ---------- Performance indexes (roadmap: Data model) ----------
-- Spatial (design.md proposed; none applied before this migration).
create index if not exists idx_clients_dispatch_gist
  on clients using gist (dispatch_area_coordinates);
create index if not exists idx_stops_coords_gist
  on stops using gist (location_coordinates);

-- Query indexes for dashboards + driver home as rows grow.
create index if not exists idx_orders_client_date on orders(client_id, scheduled_date);
create index if not exists idx_routes_driver_status on routes(assigned_driver_id, status);
create index if not exists idx_stops_route_status on stops(route_id, status);
-- idx_notifications_user (user_id, is_read, created_at desc) already exists in 0001.

-- ---------- Retention helpers (jobs run by scheduler/cron, not SQL) ----------
-- Intended retention (requirements): notifications 30d, auth_logs 90d,
-- receipts 2y (storage, see reports/storage). Example clean-up (run manually
-- or via pg_cron / host scheduler):
--   delete from notifications where created_at < now() - interval '30 days';
--   delete from auth_logs where created_at < now() - interval '90 days';
