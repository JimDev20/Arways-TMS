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
import { assertCoords, assertEmail, assertNonEmpty, assertText, TEXT_LIMITS } from '../common/validate.js';

// P1 abuse limits: broadcasts 5/day per Owner; geocode 1/s per user (in-memory;
// single-instance; move to DB/Redis with multiple instances per Playbook).
const broadcastDay = new Map<string, { count: number; resetAt: number }>();
const geocodeLast = new Map<string, number>();

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
    const companyName = assertText(b?.companyName, 'Company name', TEXT_LIMITS.name);
    const contactPerson = assertText(b?.contactPerson, 'Contact person', TEXT_LIMITS.name);
    const phone = assertNonEmpty(b?.phone, 'Phone');
    const email = assertEmail(b?.email, 'Email');
    const dispatchAreaAddress = assertText(b?.dispatchAreaAddress, 'Dispatch area address', TEXT_LIMITS.address);
    const pin = assertCoords(b?.lat, b?.lon ?? b?.lng, 'Dispatch area');
    const { sql } = await import('drizzle-orm');
    await this.db.execute(sql`insert into clients (company_name, contact_person, phone, email, dispatch_area_address, dispatch_area_coordinates, entrance_instructions, dispatcher_contact)
      values (${companyName}, ${contactPerson}, ${phone}, ${email}, ${dispatchAreaAddress}, ST_SetSRID(ST_MakePoint(${pin.lon}, ${pin.lat}), 4326), ${b.entranceInstructions ?? null}, ${b.dispatcherContact ?? null})`);
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
    // Receipt-photo usage vs quota (Improvement Roadmap #5: one setting read
    // from config; STORAGE_QUOTA_BYTES else 1 GB default). Retention: 2 years
    // (requirements + context); dashboard text fixed to match (was 30 days).
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
    const quotaBytes = Number(process.env.STORAGE_QUOTA_BYTES ?? 1024 ** 3);
    return { files: Number(r.files ?? 0), bytes: Number(r.bytes ?? 0), oldest: r.oldest, quotaBytes };
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
    const completed = inRange.filter((o) => o.status === 'Completed');
    const delivered = completed.length;
    const deliveryRatePct = total ? Math.round((delivered / total) * 100) : 0;
    // Real on-time: a Completed order counts as on-time when every dropoff
    // that HAS a time window was delivered on the scheduled date at/before
    // its window end (compared in Asia/Manila wall time, where the windows
    // are defined). Orders with no windowed dropoffs are excluded — there is
    // nothing to judge them against.
    const manila = (d: Date) => ({
      day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
      hm: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(d),
    });
    let judged = 0;
    let onTime = 0;
    for (const o of completed) {
      const stops = allStops.filter(
        (s) => routeOrder.get(s.routeId) === o.orderId && s.stopType === 'Dropoff' && s.timeWindowEnd && s.deliveredAt,
      );
      if (!stops.length) continue;
      judged += 1;
      const late = stops.some((s) => {
        const at = manila(new Date(s.deliveredAt));
        const schedDay = String(o.scheduledDate).slice(0, 10);
        // Early (delivered before the scheduled date) still meets the
        // commitment. Late = after the scheduled date, or same day but
        // past the store's window end.
        return at.day > schedDay || (at.day === schedDay && at.hm > String(s.timeWindowEnd).slice(0, 5));
      });
      if (!late) onTime += 1;
    }
    const byReason = failed.reduce((m: any, s: any) => {
      m[s.failedReason ?? 'Unknown'] = (m[s.failedReason ?? 'Unknown'] ?? 0) + 1;
      return m;
    }, {});
    return {
      total,
      delivered,
      failed: failed.length,
      deliveryRatePct,
      onTimePct: judged ? Math.round((onTime / judged) * 100) : 0,
      onTimeJudged: judged,
      byReason,
    };
  }

  /** Proof of delivery: delivered stops with order, driver and receipt info. */
  @Get('proof')
  @Roles('Owner', 'Secretary', 'Client', 'Driver')
  async proof(@CurrentUser() user: JwtPayload) {
    const allStops: any[] = await this.db.select().from(schema.stops).where(eq(schema.stops.status, 'Delivered'));
    // P0 #12: Client scoping by company (clientId links + email), not creator only.
    let companyIds: Set<string> | null = null;
    if (user.role === 'Client') {
      companyIds = new Set();
      const links: any[] = await this.db.select().from(schema.clientUsers).where(eq(schema.clientUsers.userId, user.sub));
      for (const l of links) companyIds.add((l as any).clientId);
      const byEmail: any[] = await this.db.select().from(schema.clients).where(eq(schema.clients.email, user.email)).limit(5);
      for (const c of byEmail) companyIds.add((c as any).clientId);
    }
    const out = [];
    for (const s of allStops) {
      const [route] = (await this.db.select().from(schema.routes).where(eq(schema.routes.routeId, s.routeId)).limit(1)) as any[];
      if (!route) continue;
      const [order] = (await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, route.orderId)).limit(1)) as any[];
      if (!order) continue;
      if (user.role === 'Client' && companyIds && !companyIds.has(order.clientId) && order.createdByUserId !== user.sub) continue;
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

  /**
   * Improvement Roadmap: real audit trail (audit_logs + status_events).
   * Frontend Audit page keeps its derived view until it migrates to this.
   */
  @Get('audit')
  @Roles('Owner')
  async audit(@Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 100, 1), 500);
    let audits: any[] = [];
    let events: any[] = [];
    try {
      audits = await this.db.select().from((schema as any).auditLogs).orderBy(desc((schema as any).auditLogs.createdAt)).limit(n);
    } catch {
      audits = [];
    }
    try {
      events = await this.db.select().from((schema as any).statusEvents).orderBy(desc((schema as any).statusEvents.createdAt)).limit(n);
    } catch {
      events = [];
    }
    return { audits, events };
  }

  // ---- Broadcasts (Owner composes announcements for roles) ----
  @Post('broadcasts')
  @Roles('Owner')
  async broadcast(@Body() body: any, @CurrentUser() user: JwtPayload) {
    const audience = body?.audience;
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!['all', 'drivers', 'clients', 'secretaries'].includes(audience)) {
      throw new BadRequestException('Audience is empty or invalid. Pick who should receive this.');
    }
    if (!message) throw new BadRequestException('Message is empty. Type the announcement first.');
    if (message.length > 500) {
      throw new BadRequestException(`Message is ${message.length}/500 characters. Shorten it to 500 or fewer.`);
    }
    // Abuse limit: 5 broadcasts/day per Owner (Security Playbook).
    const now = Date.now();
    const cur = broadcastDay.get(user.sub);
    if (!cur || now > cur.resetAt) {
      broadcastDay.set(user.sub, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    } else {
      cur.count += 1;
      if (cur.count > 5) {
        throw new BadRequestException('Broadcast limit reached (5 per day). Try again tomorrow.');
      }
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

  // ---- Place search (PHILIPPINES ONLY: Photon + Nominatim, merged + ranked) ----
  @Get('geocode/search')
  @Roles('Owner', 'Secretary', 'Client')
  async geocode(@Query('q') q: string, @CurrentUser() user: JwtPayload) {
    const query = normalizePhQuery(q ?? '');
    if (query.length < 3) return { results: [] };
    // Cached PH results bypass the throttle so the same query returns the
    // same pins every time (consistent + instant, no provider flakiness).
    const cached = getPhCache(query);
    if (cached) return { results: cached, cached: true };
    // Abuse limit: 1 req/s per user (defense-in-depth with the Nominatim throttle below).
    const now = Date.now();
    const last = geocodeLast.get(user.sub) ?? 0;
    if (now - last < 1000) {
      // Even when throttled, never return foreign pins: serve local PH
      // fallback (possibly empty) instead of stale/foreign data.
      return { results: localPhFallback(query), throttled: true };
    }
    geocodeLast.set(user.sub, now);
    // Both providers in parallel: one outage still yields PH pins.
    const [photon, nominatim] = await Promise.all([
      searchPhoton(query).catch(() => [] as GeocodeResult[]),
      searchNominatim(query).catch(() => [] as GeocodeResult[]),
    ]);
    let merged = rankPhResults(query, [...photon, ...nominatim]);
    if (merged.length === 0) merged = localPhFallback(query);
    setPhCache(query, merged);
    return { results: merged };
  }
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
  source: 'photon' | 'nominatim' | 'local';
}

// ---- Philippines-only geocode helpers (exported for unit tests) ----
// Single source of truth for "inside the Philippines": same lat 4–21 /
// lng 116–127 box the order/stop validators enforce.
export const PH_LAT_MIN = 4;
export const PH_LAT_MAX = 21;
export const PH_LON_MIN = 116;
export const PH_LON_MAX = 127;

export function isInPH(lat: unknown, lon: unknown): boolean {
  const la = Number(lat);
  const lo = Number(lon);
  return (
    Number.isFinite(la) &&
    Number.isFinite(lo) &&
    la >= PH_LAT_MIN &&
    la <= PH_LAT_MAX &&
    lo >= PH_LON_MIN &&
    lo <= PH_LON_MAX
  );
}

export function normalizePhQuery(q: unknown): string {
  return String(q ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

// Token-overlap score so the same query ranks the same PH pin first every
// time (deterministic): exact name match beats partial, PH country beats
// anything else (already filtered, but kept for scoring stability).
export function scorePhResult(query: string, label: string): number {
  const qTokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const l = label.toLowerCase();
  let score = 0;
  for (const t of qTokens) {
    if (!t) continue;
    if (l.startsWith(t)) score += 3;
    else if (l.includes(t)) score += 1;
    else score -= 1;
  }
  if (l.includes('philippines')) score += 1;
  return score;
}

export function rankPhResults(query: string, results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  const deduped: GeocodeResult[] = [];
  for (const r of results) {
    if (!isInPH(r.lat, r.lon)) continue;
    if (!r.label) continue;
    const key = `${r.lat.toFixed(5)}|${r.lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped
    .map((r) => ({ r, s: scorePhResult(query, r.label) }))
    .sort((a, b) => b.s - a.s || a.r.label.localeCompare(b.r.label))
    .slice(0, 5)
    .map((x) => x.r);
}

// Local PH gazetteer fallback: guarantees a correct PH pin even when both
// providers are down/empty. Covers the reported case (Maanahao, Masbate)
// plus dispatch-area defaults. NEVER contains foreign coords.
const LOCAL_PH_PLACES: GeocodeResult[] = [
  { lat: 12.05509, lon: 123.90058, label: 'Maanahao, Palanas, Masbate, Philippines', source: 'local' },
  { lat: 14.676, lon: 121.0437, label: 'Jollibee Commissary, Quirino Highway, Quezon City, Philippines', source: 'local' },
  { lat: 14.6507, lon: 121.0331, label: 'SM City North EDSA, Quezon City, Philippines', source: 'local' },
];

export function localPhFallback(query: string): GeocodeResult[] {
  const q = query.toLowerCase();
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (!tokens.length) return [];
  const hits = LOCAL_PH_PLACES.filter((p) => {
    const l = p.label.toLowerCase();
    return tokens.every((t) => l.includes(t));
  });
  return rankPhResults(query, hits);
}

// 1-hour in-memory PH cache: same query → same pins, no flakiness.
const phCache = new Map<string, { results: GeocodeResult[]; expiresAt: number }>();
const PH_CACHE_TTL_MS = 60 * 60 * 1000;

export function getPhCache(query: string): GeocodeResult[] | null {
  const hit = phCache.get(query.toLowerCase());
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    phCache.delete(query.toLowerCase());
    return null;
  }
  return hit.results;
}

export function setPhCache(query: string, results: GeocodeResult[]): void {
  // Only cache non-empty PH-only results; empty means "try providers again".
  if (!results.length) return;
  if (phCache.size > 500) phCache.clear();
  phCache.set(query.toLowerCase(), { results: results.slice(0, 5), expiresAt: Date.now() + PH_CACHE_TTL_MS });
}

/** Photon (Komoot) — PHILIPPINES ONLY, biased to Metro Manila. */
async function searchPhoton(query: string): Promise<GeocodeResult[]> {
  // bbox = Philippines (minLon,minLat,maxLon,maxLat) so a query like
  // "maanahao" prefers Maanahao, Masbate, PH — not Maranhão, Brazil
  // or Ma'anshan, China. Server-side countrycode + bounds filter below is
  // the real gate (Photon may still return out-of-bbox matches).
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=en&lat=14.5995&lon=120.9842&bbox=116,4,127,21`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const body: any = await res.json();
  const out: GeocodeResult[] = [];
  for (const f of body?.features ?? []) {
    const [lon, lat] = f?.geometry?.coordinates ?? [];
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    if (!isInPH(lat, lon)) continue;
    const p = f.properties ?? {};
    // Strict PH-only: drop any feature that names a foreign country.
    const cc = String(p.countrycode ?? '').toUpperCase();
    if (cc && cc !== 'PH') continue;
    if (p.country && !/philippines/i.test(String(p.country)) && cc) continue;
    const label = [p.name, p.street, p.city ?? p.county, p.state, p.country].filter(Boolean).join(', ');
    out.push({ lat, lon, label: label || query, source: 'photon' });
  }
  return out;
}

let lastNominatimAt = 0;

/** Nominatim (OSM) — PHILIPPINES ONLY, throttled to 1 req/s per usage policy. */
async function searchNominatim(query: string): Promise<GeocodeResult[]> {
  const wait = 1100 - (Date.now() - lastNominatimAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();
  // countrycodes=ph + viewbox (left,top,right,bottom) + bounded=1 keeps
  // results inside the same PH box the validators enforce.
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=ph&viewbox=116,21,127,4&bounded=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ARWAYS-TMS/0.1 (delivery dispatch)', Referer: 'http://localhost:3000/' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const body: any[] = await res.json();
  const out: GeocodeResult[] = [];
  for (const r of Array.isArray(body) ? body : []) {
    const lat = Number(r?.lat);
    const lon = Number(r?.lon);
    if (!isInPH(lat, lon)) continue;
    // Strict PH-only: address must be PH when the provider says so.
    const cc = String(r?.address?.country_code ?? '').toLowerCase();
    if (cc && cc !== 'ph') continue;
    if (typeof r?.display_name !== 'string' || !r.display_name) continue;
    out.push({ lat, lon, label: r.display_name, source: 'nominatim' });
  }
  return out;
}
