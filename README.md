# ARWAYS TMS — Trucking Management System

Web-based multi-client dispatch and delivery management with real-time status updates.
4 portals: **Owner, Secretary, Client, Driver** with RBAC.

## Stack (TypeScript throughout)

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + Leaflet/OSM |
| Backend API | NestJS 12 (Fastify adapter) + Drizzle ORM |
| Database/Auth/Realtime/Storage | Supabase (PostgreSQL 15 + PostGIS + Auth + Realtime + Storage) |
| Reports | jsPDF + SheetJS (xlsx) |
| Deploy | Vercel (frontend) + Render/Railway (backend) |

## Quick start

### 1. Prereqs (already installed on this machine)
- Node.js v24.17.0, npm 11.13.0, Git, TypeScript 7, Nest CLI 12, Supabase CLI, Vercel CLI
- No local Postgres needed — Supabase cloud provides PostgreSQL + PostGIS.

### 2. Supabase setup
1. Create project at https://supabase.com → copy URL + anon key + service_role key.
2. In Supabase SQL editor, run the SQL files in `supabase/migrations/` in order.
3. Create Storage bucket `receipts` (private) for proof-of-delivery photos.
4. Enable Realtime for tables: `orders`, `routes`, `stops`, `notifications`.

### 3. Env
Create `frontend/.env.local` and `backend/.env` manually (local only, never commit),
then fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
DATABASE_URL, JWT_SECRET.

### 4. Install + run (each app installs separately — no workspaces)
```bash
cd arways-tms/frontend && npm install
cd ../backend && npm install
# backend API (http://localhost:4000) — new terminal each:
npm run start:dev
cd ../frontend
npm run dev
```

### 5. First users
Create the first Owner via the bootstrap endpoint (works only while the users table
is empty), then create the rest as Owner via `POST /api/auth/register` or the
Users page.

## Project layout

```
arways-tms/
  frontend/   Next.js App Router — login + 4 portals + maps + realtime + reports
  backend/    NestJS Fastify API — auth/JWT + RBAC + users/clients/fleet/orders/routes/reports
  supabase/   SQL migrations (PostGIS, RLS, indexes)
```

## System flow
Client creates order (map pins + truck select) → system auto-assigns truck's driver →
Secretary approves/rejects → Driver: arrived/left dispatch → arrived/delivered per stop
(+ receipt photo) → Owner/Secretary/Client see realtime updates + proof + reports.

Out of scope (per proposal): live GPS, billing, offline mode, traffic optimization.
