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
