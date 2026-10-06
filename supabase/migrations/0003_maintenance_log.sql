-- ARWAYS TMS: fleet maintenance log per truck.
-- Run in Supabase SQL editor (same as 0001/0002).

create table if not exists maintenance_log (
  log_id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references trucks(truck_id),
  performed_at date not null,
  note text not null,
  next_due date,
  created_at timestamptz default now()
);

create index if not exists idx_maintenance_truck on maintenance_log(truck_id);

alter table maintenance_log enable row level security;
drop policy if exists "service_all" on maintenance_log;
create policy "service_all" on maintenance_log for all using (true) with check (true);
