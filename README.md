# ARWAYS TMS — Trucking Management System

Web-based multi-client dispatch and delivery management with real-time status updates.
4 portals: **Owner, Secretary, Client, Driver** with RBAC.

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

---

## System flow (detailed)

```
1. CREATE (Client — or Secretary/Owner on their behalf)
   Pickup pin (from company dispatch area) + 1..N drop-off pins,
   truck, date/time, ref#, priority, instructions
   → orders.status = Pending. Secretary is notified.

2. AUTO-ASSIGN (system, no human decision)
   truck_id → trucks.assigned_driver_id → routes.assigned_driver_id.
   One truck = one driver, always. Route + sequenced stops created
   (pickup seq 1, drop-offs 2..N).

3. APPROVE (Secretary gate)
   Approve / Reject-with-reason / edit schedule + notes + priority (Pending only).
   Blocked when any stop lacks a map pin — the error names them.
   → Approved: route dispatchable, truck In Use, driver notified.
   → Rejected: client notified with reason.

4. EXECUTE (Driver, mobile browser, one-tap)
   Arrived-at / left-dispatch (waybill photo required to leave).
   Per stop: Arrived → Departed → Delivered (+ receipt photo) or Failed (+ reason).
   Pickup-only routes work — stores can be added later, map refreshes live.

5. PROVE & MONITOR (everyone)
   All drop-offs Delivered → route Completed → order Completed → truck Available again.
   Receipt gallery + live map/feed for Owner/Secretary; clients see own orders/proof only.
```

State machines (enforced server-side):

```
orders: Pending → Approved → In Transit → Completed (↘ Rejected, terminal)
routes: Pending → In Progress → Completed
stops:  Pending → Arrived → Departed / Delivered / Failed
```

Rules worth knowing:
- Map pin required for pickup + every drop-off; approval is blocked until pins exist.
- Truck must be Available and its linked driver active, or the order is blocked with the reason named.
- Only schedule/instructions/priority are editable while Pending — truck change = reject + recreate.
- Delivered requires receipt photo + timestamp (100% proof-of-delivery target).

## Portals

- **Owner:** full access — dashboard, users, fleet, clients, all orders, kanban, calendar, tracking map, proof gallery, reports (PDF/Excel), audit log, broadcast.
- **Secretary:** operations — approvals, driver confirmation, delivery monitoring, kanban, calendar, proof, reports. No user management. Can create orders on behalf of clients.
- **Client:** own data only — map-based order wizard (pins + truck select), live tracking, own proof photos, own reports.
- **Driver:** assigned routes only, mobile-first — dispatch arrived/left, per-stop arrived/delivered/failed, receipt upload, Maps link per stop.

## Tech stack

Next.js 16 + React 19 + Tailwind v4 · NestJS + Fastify · Drizzle ORM · PostgreSQL + PostGIS (Supabase) ·
Supabase Realtime + Storage · Leaflet + OpenStreetMap · jsPDF + SheetJS · Vercel + Supabase (free tiers).
