import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Inject, BadRequestException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { RolesGuard } from '../common/roles.guard.js';
import { Roles } from '../common/roles.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { JwtPayload } from '../common/roles.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class MiscController {
  constructor(@Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>) {}

  // ---- Clients ----
  // Secretaries read the list to create orders for clients who do not use
  // the system. Creating/editing companies stays Owner-only.
  @Get('clients')
  @Roles('Owner', 'Secretary')
  clients() { return this.db.select().from(schema.clients); }

  // A client sees only their own company profile (dispatch area included),
  // resolved the same way as order creation: client_users link first,
  // then matching clients.email. Used as the order pickup: dispatch area
  // and pickup area are the same place, so no separate pickup pin exists.
  @Get('clients/mine')
  @Roles('Client')
  async myClient(@CurrentUser() user: JwtPayload) {
    const links: any[] = await this.db.select().from(schema.clientUsers).where(eq(schema.clientUsers.userId, user.sub)).limit(1);
    if (links.length > 0) {
      const [row] = (await this.db.select().from(schema.clients).where(eq(schema.clients.clientId, (links[0] as any).clientId)).limit(1)) as any[];
      if (row) return row;
    }
    const [byEmail] = (await this.db.select().from(schema.clients).where(eq(schema.clients.email, user.email)).limit(1)) as any[];
    if (byEmail) return byEmail;
    throw new BadRequestException('Client profile not found for this account. Ask an Owner to link your login to a client company first.');
  }

  @Post('clients')
  @Roles('Owner')
  async createClient(@Body() b: any) {
    const { lon, lat, ...rest } = b;
    const { sql } = await import('drizzle-orm');
    await this.db.execute(sql`insert into clients (company_name, contact_person, phone, email, dispatch_area_address, dispatch_area_coordinates, entrance_instructions, dispatcher_contact)
      values (${rest.companyName}, ${rest.contactPerson}, ${rest.phone}, ${rest.email}, ${rest.dispatchAreaAddress}, ST_SetSRID(ST_MakePoint(${Number(lon)}, ${Number(lat)}), 4326), ${rest.entranceInstructions ?? null}, ${rest.dispatcherContact ?? null})`);
    return { ok: true };
  }

  // ---- Notifications ----
  @Get('notifications')
  @Roles('Owner', 'Secretary', 'Client', 'Driver')
  notifs(@CurrentUser() u: JwtPayload) {
    return this.db.select().from(schema.notifications).where(eq(schema.notifications.userId, u.sub)).orderBy(desc(schema.notifications.createdAt)).limit(50);
  }

  @Patch('notifications/:id/read')
  @Roles('Owner', 'Secretary', 'Client', 'Driver')
  read(@Param('id') id: string) {
    return this.db.update(schema.notifications).set({ isRead: true }).where(eq(schema.notifications.notificationId, id)).then(() => ({ ok: true }));
  }

  // ---- Reports ----
  @Get('reports/storage')
  @Roles('Owner')
  async storage() {
    // Receipt-photo usage vs the 1 GB free quota: file count, total bytes,
    // and oldest object (retention visibility for the 30-day cleanup).
    const { sql } = await import('drizzle-orm');
    const rows = (await this.db.execute(sql`
      select count(*)::int as files,
        coalesce(sum((metadata->>'size')::bigint), 0)::bigint as bytes,
        min(created_at) as oldest
      from storage.objects where bucket_id = 'receipts'`)) as unknown as Array<{
      files: number;
      bytes: string;
      oldest: string | null;
    }>;
    const r = rows[0] ?? { files: 0, bytes: '0', oldest: null };
    return { files: Number(r.files ?? 0), bytes: Number(r.bytes ?? 0), oldest: r.oldest, quotaBytes: 1024 ** 3 };
  }

  @Get('reports/summary')
  @Roles('Owner', 'Secretary')
  async summary(@Query('from') from?: string, @Query('to') to?: string) {
    const ord: any[] = await this.db.select().from(schema.orders);
    const inRange = ord.filter((o) => {
      const day = (o.createdAt ? new Date(o.createdAt).toISOString() : '').slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
    const ids = new Set(inRange.map((o) => o.orderId));
    const allStops: any[] = await this.db.select().from(schema.stops);
    // Attribute failed stops via their route's order so the date filter applies.
    const routes: any[] = await this.db.select().from(schema.routes);
    const routeOrder = new Map(routes.map((r: any) => [r.routeId, r.orderId]));
    const failed = allStops.filter((s) => s.status === 'Failed' && ids.has(routeOrder.get(s.routeId)));
    const total = inRange.length;
    const delivered = inRange.filter((o) => o.status === 'Completed').length;
    const byReason = failed.reduce((m: any, s: any) => {
      m[s.failedReason ?? 'Unknown'] = (m[s.failedReason ?? 'Unknown'] ?? 0) + 1;
      return m;
    }, {});
    return { total, delivered, failed: failed.length, onTimePct: total ? Math.round((delivered / total) * 100) : 0, byReason };
  }

  /** Proof of delivery: delivered stops with order, driver and receipt info. */
  @Get('proof')
  @Roles('Owner', 'Secretary', 'Client', 'Driver')
  async proof(@CurrentUser() user: JwtPayload) {
    const allStops: any[] = await this.db.select().from(schema.stops).where(eq(schema.stops.status, 'Delivered'));
    const out = [];
    for (const s of allStops) {
      const [route] = (await this.db.select().from(schema.routes).where(eq(schema.routes.routeId, s.routeId)).limit(1)) as any[];
      if (!route) continue;
      const [order] = (await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, route.orderId)).limit(1)) as any[];
      if (!order) continue;
      if (user.role === 'Client' && order.createdByUserId !== user.sub) continue;
      if (user.role === 'Driver' && route.assignedDriverId !== user.sub) continue;
      const [driver] = ((await this.db.select().from(schema.users).where(eq(schema.users.userId, route.assignedDriverId)).limit(1)) as any[]);
      out.push({
        stop: s,
        orderReference: order.orderReference,
        orderStatus: order.status,
        routeNumber: route.routeNumber,
        driverName: driver?.fullName ?? '—',
      });
    }
    return out.sort((a: any, b: any) => String(b.stop.deliveredAt ?? '').localeCompare(String(a.stop.deliveredAt ?? '')));
  }

  @Get('reports/by-driver')
  @Roles('Owner', 'Secretary')
  async byDriver() {
    const r: any[] = await this.db.select().from(schema.routes);
    const m: Record<string, number> = {};
    for (const x of r) m[x.assignedDriverId] = (m[x.assignedDriverId] ?? 0) + 1;
    return m;
  }

  @Get('health')
  health() { return { ok: true, service: 'arways-tms-backend', time: new Date().toISOString() }; }

  // ---- Broadcasts (Owner composes announcements for roles) ----
  @Post('broadcasts')
  @Roles('Owner')
  async broadcast(@Body() body: any) {
    const audience = body?.audience;
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!['all', 'drivers', 'clients', 'secretaries'].includes(audience)) {
      throw new BadRequestException('Audience is empty or invalid. Pick who should receive this.');
    }
    if (!message) throw new BadRequestException('Message is empty. Type the announcement first.');
    if (message.length > 500) {
      throw new BadRequestException(`Message is ${message.length}/500 characters. Shorten it to 500 or fewer.`);
    }
    const users: any[] = await this.db.select().from(schema.users);
    const targets = users.filter(
      (u) =>
        u.status === 'Active' &&
        (audience === 'all' ||
          (audience === 'drivers' && u.role === 'Driver') ||
          (audience === 'clients' && u.role === 'Client') ||
          (audience === 'secretaries' && u.role === 'Secretary')),
    );
    if (targets.length === 0) throw new BadRequestException('Nobody to send to. No active members match that audience.');
    await this.db.insert(schema.notifications).values(
      targets.map((u) => ({ userId: u.userId, notificationType: 'broadcast', message, relatedOrderId: null })),
    );
    return { ok: true, sent: targets.length };
  }

  // ---- Place search (free providers only: Photon primary, Nominatim fallback) ----
  @Get('geocode/search')
  @Roles('Owner', 'Secretary', 'Client')
  async geocode(@Query('q') q: string) {
    const query = (q ?? '').trim();
    if (query.length < 3) return { results: [] };
    const fromPhoton = await searchPhoton(query).catch(() => []);
    if (fromPhoton.length > 0) return { results: fromPhoton };
    return { results: await searchNominatim(query).catch(() => []) };
  }
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
  source: 'photon' | 'nominatim';
}

/** Photon (Komoot) — tuned for search-as-you-type, biased to Metro Manila. */
async function searchPhoton(query: string): Promise<GeocodeResult[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en&lat=14.5995&lon=120.9842`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const body: any = await res.json();
  const out: GeocodeResult[] = [];
  for (const f of body?.features ?? []) {
    const [lon, lat] = f?.geometry?.coordinates ?? [];
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const p = f.properties ?? {};
    const label = [p.name, p.street, p.city ?? p.county, p.country].filter(Boolean).join(', ');
    out.push({ lat, lon, label: label || query, source: 'photon' });
  }
  return out;
}

let lastNominatimAt = 0;

/** Nominatim (OSM) — PH-filtered fallback, throttled to 1 req/s per usage policy. */
async function searchNominatim(query: string): Promise<GeocodeResult[]> {
  const wait = 1100 - (Date.now() - lastNominatimAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=ph&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ARWAYS-TMS/0.1 (delivery dispatch)', Referer: 'http://localhost:3000/' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const body: any[] = await res.json();
  return (Array.isArray(body) ? body : [])
    .filter((r) => r?.lat && r?.lon)
    .map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), label: r.display_name as string, source: 'nominatim' as const }));
}
