-- ARWAYS TMS initial schema
-- Run in Supabase SQL editor (Postgres 15 + PostGIS).
-- Enables: pgcrypto (UUIDs), PostGIS (coordinates SRID 4326).

create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- ---------- Enums ----------
do $$ begin create type user_role as enum ('Owner','Secretary','Client','Driver'); exception when duplicate_object then null; end $$;
do $$ begin create type user_status as enum ('Active','Inactive'); exception when duplicate_object then null; end $$;
do $$ begin create type truck_type as enum ('Refrigerated','Dry'); exception when duplicate_object then null; end $$;
do $$ begin create type truck_status as enum ('Available','In Use','Maintenance'); exception when duplicate_object then null; end $$;
do $$ begin create type order_status as enum ('Pending','Approved','Rejected','In Transit','Completed'); exception when duplicate_object then null; end $$;
do $$ begin create type route_status as enum ('Pending','In Progress','Completed'); exception when duplicate_object then null; end $$;
do $$ begin create type stop_type as enum ('Pickup','Dropoff'); exception when duplicate_object then null; end $$;
do $$ begin create type stop_status as enum ('Pending','Arrived','Departed','Delivered','Failed'); exception when duplicate_object then null; end $$;

-- ---------- Users ----------
create table if not exists users (
  user_id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  full_name text not null,
  role user_role not null,
  status user_status not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_users_role on users(role);
create index if not exists idx_users_status on users(status);

-- ---------- Clients ----------
create table if not exists clients (
  client_id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text not null,
  phone text not null,
  email text not null,
  dispatch_area_address text not null,
  dispatch_area_coordinates geometry(Point, 4326) not null,
  entrance_instructions text,
  dispatcher_contact text,
  owner_user_id uuid references users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_clients_company on clients(company_name);

-- Link table: client portal users
create table if not exists client_users (
  client_id uuid not null references clients(client_id) on delete cascade,
  user_id uuid not null references users(user_id) on delete cascade,
  primary key (client_id, user_id)
);

-- ---------- Trucks (one truck = one driver) ----------
create table if not exists trucks (
  truck_id uuid primary key default gen_random_uuid(),
  plate_number text unique not null,
  truck_type truck_type not null,
  capacity_kg integer not null check (capacity_kg > 0),
  assigned_driver_id uuid unique references users(user_id),
  status truck_status not null default 'Available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_trucks_status on trucks(status);
create index if not exists idx_trucks_type on trucks(truck_type);

-- ---------- Orders ----------
create table if not exists orders (
  order_id uuid primary key default gen_random_uuid(),
  order_reference text unique not null,
  client_id uuid not null references clients(client_id),
  created_by_user_id uuid not null references users(user_id),
  truck_id uuid not null references trucks(truck_id),
  scheduled_date date not null,
  scheduled_time time not null,
  special_instructions text,
  status order_status not null default 'Pending',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_scheduled_future check (scheduled_date >= current_date - interval '1 day')
);
create index if not exists idx_orders_client on orders(client_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created on orders(created_at);

-- ---------- Routes ----------
create table if not exists routes (
  route_id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(order_id) on delete cascade,
  assigned_driver_id uuid not null references users(user_id),
  route_number text unique not null,
  status route_status not null default 'Pending',
  dispatched_arrived_at timestamptz,
  dispatched_left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_routes_driver on routes(assigned_driver_id);
create index if not exists idx_routes_order on routes(order_id);

-- ---------- Stops ----------
create table if not exists stops (
  stop_id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(route_id) on delete cascade,
  stop_sequence integer not null,
  stop_type stop_type not null,
  location_address text not null,
  location_coordinates geometry(Point, 4326) not null,
  time_window_start time,
  time_window_end time,
  product_description text,
  product_quantity text,
  status stop_status not null default 'Pending',
  arrived_at timestamptz,
  departed_at timestamptz,
  delivered_at timestamptz,
  failed_reason text,
  receipt_photo_url text,
  driver_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, stop_sequence)
);
create index if not exists idx_stops_route on stops(route_id);
create index if not exists idx_stops_status on stops(status);

-- ---------- Notifications (30-day retention) ----------
create table if not exists notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(user_id) on delete cascade,
  notification_type text not null,
  message text not null,
  related_order_id uuid references orders(order_id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications(user_id, is_read, created_at desc);

-- ---------- Auth logs (90-day retention) ----------
create table if not exists auth_logs (
  log_id uuid primary key default gen_random_uuid(),
  email text not null,
  success boolean not null,
  ip_address text,
  created_at timestamptz not null default now()
);

-- ---------- updated_at trigger ----------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_users_updated on users;
create trigger trg_users_updated before update on users for each row execute function set_updated_at();
drop trigger if exists trg_clients_updated on clients;
create trigger trg_clients_updated before update on clients for each row execute function set_updated_at();
drop trigger if exists trg_trucks_updated on trucks;
create trigger trg_trucks_updated before update on trucks for each row execute function set_updated_at();
drop trigger if exists trg_orders_updated on orders;
create trigger trg_orders_updated before update on orders for each row execute function set_updated_at();
drop trigger if exists trg_routes_updated on routes;
create trigger trg_routes_updated before update on routes for each row execute function set_updated_at();
drop trigger if exists trg_stops_updated on stops;
create trigger trg_stops_updated before update on stops for each row execute function set_updated_at();

-- ---------- Row Level Security ----------
alter table users enable row level security;
alter table clients enable row level security;
alter table trucks enable row level security;
alter table orders enable row level security;
alter table routes enable row level security;
alter table stops enable row level security;
alter table notifications enable row level security;

-- Service role bypasses RLS; authenticated policies kept permissive here because
-- authorization is enforced in the NestJS API + Supabase Auth JWT claims.
-- Tighten per-project after wiring Auth user ids to users.user_id.
drop policy if exists "service_all" on users;
create policy "service_all" on users for all using (true) with check (true);
drop policy if exists "service_all" on clients;
create policy "service_all" on clients for all using (true) with check (true);
drop policy if exists "service_all" on trucks;
create policy "service_all" on trucks for all using (true) with check (true);
drop policy if exists "service_all" on orders;
create policy "service_all" on orders for all using (true) with check (true);
drop policy if exists "service_all" on routes;
create policy "service_all" on routes for all using (true) with check (true);
drop policy if exists "service_all" on stops;
create policy "service_all" on stops for all using (true) with check (true);
drop policy if exists "service_all" on notifications;
create policy "service_all" on notifications for all using (true) with check (true);

-- ---------- Storage bucket for receipts (create via Dashboard > Storage if needed) ----------
-- insert into storage.buckets (id, name, public) values ('receipts','receipts', false)
-- on conflict (id) do nothing;
