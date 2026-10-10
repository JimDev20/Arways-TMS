-- 0008: Lock down RLS (deny by default) + Realtime publication
-- Implements: Deployment Readiness P0 #1, #2 + Improvement Roadmap #13 + Security Playbook.
--
-- Problem: 0001 created permissive `service_all ... USING (true)` policies with no
-- TO clause, so they apply to PUBLIC. The anon key ships in the browser
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY), so anyone could read/write users
-- (including password_hash), orders and stops via Supabase REST.
-- client_users and auth_logs had no RLS at all.
--
-- Fix: deny anon/authenticated by default. Backend connects as postgres /
-- service_role and bypasses RLS, so the API keeps working. Frontend must go
-- through the API (api()) — never Supabase REST directly (except Storage
-- uploads, which move to signed URLs per P0 #3).
--
-- Realtime note: once locked, `useRealtime` with the anon key stops receiving
-- postgres_changes. Tables are added to the supabase_realtime publication
-- below so a future scoped policy or backend Broadcast can re-enable live
-- updates. Until the backend publishes Broadcast/SSE events, realtime over
-- anon stays off by design (secure > live).

-- ---------- 1. Drop permissive policies ----------
drop policy if exists "service_all" on users;
drop policy if exists "service_all" on clients;
drop policy if exists "service_all" on trucks;
drop policy if exists "service_all" on orders;
drop policy if exists "service_all" on routes;
drop policy if exists "service_all" on stops;
drop policy if exists "service_all" on notifications;
drop policy if exists "service_all" on maintenance_log;

-- ---------- 2. Enable RLS everywhere (including link + log tables) ----------
alter table users enable row level security;
alter table clients enable row level security;
alter table client_users enable row level security;
alter table trucks enable row level security;
alter table maintenance_log enable row level security;
alter table orders enable row level security;
alter table routes enable row level security;
alter table stops enable row level security;
alter table notifications enable row level security;
alter table auth_logs enable row level security;

-- ---------- 3. Deny by default ----------
-- No policies for `anon` or `authenticated`: both get zero rows. Service_role
-- and the direct postgres connection bypass RLS entirely.
-- Revoke direct grants so anon cannot bypass via REST even before policies.
revoke all on users from anon, authenticated;
revoke all on clients from anon, authenticated;
revoke all on client_users from anon, authenticated;
revoke all on trucks from anon, authenticated;
revoke all on maintenance_log from anon, authenticated;
revoke all on orders from anon, authenticated;
revoke all on routes from anon, authenticated;
revoke all on stops from anon, authenticated;
revoke all on notifications from anon, authenticated;
revoke all on auth_logs from anon, authenticated;

-- ---------- 4. Realtime publication (for future scoped policies / broadcast) ----------
-- Safe to re-run: publication membership is idempotent via DO guard.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table users;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table routes;
alter publication supabase_realtime add table stops;
alter publication supabase_realtime add table notifications;
