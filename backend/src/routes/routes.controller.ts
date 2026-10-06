import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Inject, BadRequestException, ForbiddenException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB, SUPABASE } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { RolesGuard } from '../common/roles.guard.js';
import { Roles } from '../common/roles.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { JwtPayload } from '../common/roles.js';
import { findUnpinnedStops } from '../common/route-pins.js';

function point(lon: number, lat: number) {
  return sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)` as any;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoutesController {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    @Inject(SUPABASE) private readonly sb: SupabaseClient,
  ) {}

  private async notify(userIds: string[], type: string, message: string, orderId?: string) {
    if (!userIds.length) return;
    await this.db.insert(schema.notifications).values(
      userIds.map((u) => ({
        userId: u, notificationType: type, message, relatedOrderId: orderId ?? null,
      })),
    );
    try {
      await this.sb.from('notifications').insert(
        userIds.map((u) => ({ user_id: u, notification_type: type, message, related_order_id: orderId ?? null })),
      );
    } catch { /* realtime mirror is best-effort */ }
  }

  /** Driver's assigned routes with client/truck/schedule context (pickup-always). */
  @Get('routes/mine')
  @Roles('Driver')
  async mine(@CurrentUser() user: JwtPayload) {
    const all: any[] = await this.db.select().from(schema.routes).where(eq(schema.routes.assignedDriverId, user.sub));
    // Cancelled routes never reach the driver portal; completed ones stay
    // visible so today's finished work is still shown.
    const r = all.filter((x: any) => x.status !== 'Cancelled');
    const out = [];
    for (const route of r as any[]) {
      const stops = await this.db.select().from(schema.stops).where(eq(schema.stops.routeId, route.routeId));
      const sorted = (stops as any[]).sort((a, b) => a.stopSequence - b.stopSequence);
      const [order] = (await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, route.orderId)).limit(1)) as any[];
      let client: any = null;
      let truck: any = null;
      if (order) {
        [client] = (await this.db.select().from(schema.clients).where(eq(schema.clients.clientId, order.clientId)).limit(1)) as any[];
        [truck] = (await this.db.select().from(schema.trucks).where(eq(schema.trucks.truckId, order.truckId)).limit(1)) as any[];
      }
      out.push({
        route,
        stops: sorted,
        orderReference: order?.orderReference ?? '—',
        scheduledDate: order?.scheduledDate ?? null,
        scheduledTime: order?.scheduledTime ?? null,
        client: client
          ? {
              companyName: client.companyName, contactPerson: client.contactPerson, phone: client.phone,
              email: client.email, dispatchAreaAddress: client.dispatchAreaAddress,
              entranceInstructions: client.entranceInstructions, dispatcherContact: client.dispatcherContact,
            }
          : null,
        truck: truck ? { plateNumber: truck.plateNumber, truckType: truck.truckType, truckSize: truck.truckSize ?? '6W' } : null,
      });
    }
    return out;
  }

  /** Owner/Secretary: all routes with order, truck and driver context. */
  @Get('routes')
  @Roles('Owner', 'Secretary')
  async all() {
    const routes: any[] = await this.db.select().from(schema.routes);
    return Promise.all(
      routes.map(async (route: any) => {
        const [order] = (await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, route.orderId)).limit(1)) as any[];
        const [truck] = order
          ? ((await this.db.select().from(schema.trucks).where(eq(schema.trucks.truckId, order.truckId)).limit(1)) as any[])
          : [];
        const [driver] = ((await this.db.select().from(schema.users).where(eq(schema.users.userId, route.assignedDriverId)).limit(1)) as any[]);
        const stops: any[] = await this.db.select().from(schema.stops).where(eq(schema.stops.routeId, route.routeId));
        return {
          route,
          orderReference: order?.orderReference ?? '—',
          orderStatus: order?.status ?? '—',
          truckPlate: truck?.plateNumber ?? '—',
          driverName: driver?.fullName ?? '—',
          stops: stops.sort((a: any, b: any) => a.stopSequence - b.stopSequence),
        };
      }),
    );
  }

  @Get('routes/:id')
  @Roles('Owner', 'Secretary', 'Driver', 'Client')
  async one(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const r: any = (await this.db.select().from(schema.routes).where(eq(schema.routes.routeId, id)).limit(1))[0];
    if (!r) throw new BadRequestException('Route not found');
    const stops: any[] = await this.db.select().from(schema.stops).where(eq(schema.stops.routeId, id));
    const route = user.role === 'Client' ? (({ dispatchLeftPhotoUrl: _dropped, ...rest }: any) => rest)(r) : r;
    return { route, stops: stops.sort((a, b) => a.stopSequence - b.stopSequence) };
  }

  /**
   * Late-add drop-off stores to a pickup-only route.
   * Client (own orders only), Owner, Secretary.
   * Notifies the assigned driver so the driver portal updates.
   */
  @Post('routes/:id/stops')
  @Roles('Client', 'Owner', 'Secretary')
  async addStores(@Param('id') id: string, @Body() body: any, @CurrentUser() user: JwtPayload) {
    const stores: any[] = Array.isArray(body?.stores) ? body.stores : Array.isArray(body?.dropoffs) ? body.dropoffs : [];
    if (!stores.length) throw new BadRequestException('No stores to add. Add at least one store with address and map pin.');
    const r: any = (await this.db.select().from(schema.routes).where(eq(schema.routes.routeId, id)).limit(1))[0];
    if (!r) throw new BadRequestException('Route not found');
    const [order] = (await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, r.orderId)).limit(1)) as any[];
    if (!order) throw new BadRequestException('Order not found');
    if (user.role === 'Client' && (order as any).createdByUserId !== user.sub) {
      // Also allow linked client company members.
      const links: any[] = await this.db.select().from(schema.clientUsers).where(eq(schema.clientUsers.userId, user.sub));
      const mine = links.some((l: any) => l.clientId === (order as any).clientId);
      if (!mine) throw new ForbiddenException('You can only add stores to your own orders.');
    }
    const existing: any[] = await this.db.select().from(schema.stops).where(eq(schema.stops.routeId, id));
    let nextSeq = existing.reduce((m: number, s: any) => Math.max(m, s.stopSequence), -1) + 1;
    if (nextSeq < 1) nextSeq = 1; // keep seq 0 for pickup
    let clientName = 'Client';
    try {
      const [c] = (await this.db.select().from(schema.clients).where(eq(schema.clients.clientId, (order as any).clientId)).limit(1)) as any[];
      if (c?.companyName) clientName = c.companyName;
    } catch { /* name is best-effort */ }
    const added: string[] = [];
    for (const s of stores) {
      const address = String(s.address ?? '').trim();
      const lon = Number(s.lon ?? s.lng);
      const lat = Number(s.lat);
      if (!address || !Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new BadRequestException('Each store needs an address and a map pin (lon/lat).');
      }
      await this.db.execute(sql`insert into stops (route_id, stop_sequence, stop_type, location_address, location_coordinates, time_window_start, time_window_end, product_description, product_quantity, status)
        values (${id}, ${nextSeq}, 'Dropoff', ${address}, ${point(lon, lat)}, ${s.windowStart ?? s.timeWindowStart ?? null}, ${s.windowEnd ?? s.timeWindowEnd ?? null}, ${s.productDescription ?? null}, ${s.productQuantity ?? null}, 'Pending')`);
      added.push(address);
      nextSeq += 1;
    }
    const label = added.slice(0, 3).join(', ') + (added.length > 3 ? ` +${added.length - 3} more` : '');
    await this.notify([r.assignedDriverId], 'stores_assigned', `${clientName} assigned ${added.length} store${added.length === 1 ? '' : 's'} for your route: ${label}`, r.orderId);
    return { ok: true, added: added.length };
  }

  @Patch('routes/:id/dispatch-arrived')
  @Roles('Driver', 'Owner', 'Secretary')
  async arrivedDispatch(@Param('id') id: string) {
    await this.db.update(schema.routes).set({ dispatchedArrivedAt: new Date() as any }).where(eq(schema.routes.routeId, id));
    return { ok: true, at: new Date().toISOString() };
  }

  /**
   * Left-dispatch gate: waybill/docs photo URL required.
   * Frontend uploads to `receipts` bucket (dispatch/ prefix) then PATCHes with the URL.
   */
  @Patch('routes/:id/dispatch-left')
  @Roles('Driver', 'Owner', 'Secretary')
  async leftDispatch(@Param('id') id: string, @Body() body: any) {
    const photoUrl = String(body?.waybillPhotoUrl ?? body?.photoUrl ?? '').trim();
    if (!photoUrl) {
      throw new BadRequestException('Waybill photo required');
    }
    // Sure-route gate: every store must already be pinned before departing.
    // Routes with no stores yet stay dispatchable (waiting flow preserved).
    const badDrops = (await findUnpinnedStops(this.db, id)).filter((s) => s.stopType === 'Dropoff');
    if (badDrops.length > 0) {
      const names = badDrops.map((s) => s.locationAddress).join(', ');
      throw new BadRequestException(`Cannot leave dispatch: ${badDrops.length} store${badDrops.length === 1 ? '' : 's'} ha${badDrops.length === 1 ? 's' : 've'} no map pin${badDrops.length === 1 ? '' : 's'}: ${names}. Pin all store locations first.`);
    }
    await this.db
      .update(schema.routes)
      .set({ dispatchedLeftAt: new Date() as any, status: 'In Progress', dispatchLeftPhotoUrl: photoUrl } as any)
      .where(eq(schema.routes.routeId, id));
    return { ok: true, at: new Date().toISOString() };
  }

  @Patch('stops/:id/status')
  @Roles('Driver', 'Owner', 'Secretary')
  async stopStatus(@Param('id') id: string, @Body() body: any) {
    const { status, failedReason, receiptPhotoUrl, driverNotes } = body ?? {};
    if (!['Arrived', 'Departed', 'Delivered', 'Failed', 'Pending'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    if (status === 'Delivered' && !receiptPhotoUrl) {
      throw new BadRequestException('Proof-of-delivery photo required');
    }
    if (status === 'Failed' && !failedReason) {
      throw new BadRequestException('Failure reason required');
    }
    const patch: any = { status, driverNotes: driverNotes ?? null };
    const now = new Date() as any;
    if (status === 'Arrived') patch.arrivedAt = now;
    if (status === 'Departed') patch.departedAt = now;
    if (status === 'Delivered') { patch.deliveredAt = now; patch.receiptPhotoUrl = receiptPhotoUrl; }
    if (status === 'Failed') patch.failedReason = failedReason;
    await this.db.update(schema.stops).set(patch).where(eq(schema.stops.stopId, id));

    // If all dropoffs delivered → complete route + order, free truck.
    // Pickup-only routes (0 dropoffs) intentionally stay In Progress until stores are added.
    const s: any = (await this.db.select().from(schema.stops).where(eq(schema.stops.stopId, id)).limit(1))[0];
    if (s) {
      const siblings: any[] = await this.db.select().from(schema.stops).where(eq(schema.stops.routeId, s.routeId));
      const dropoffs = siblings.filter((x) => x.stopType === 'Dropoff');
      if (dropoffs.length && dropoffs.every((x) => x.status === 'Delivered')) {
        await this.db.update(schema.routes).set({ status: 'Completed' }).where(eq(schema.routes.routeId, s.routeId));
        const r: any = (await this.db.select().from(schema.routes).where(eq(schema.routes.routeId, s.routeId)).limit(1))[0];
        if (r) {
          await this.db.update(schema.orders).set({ status: 'Completed' }).where(eq(schema.orders.orderId, r.orderId));
          const o: any = (await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, r.orderId)).limit(1))[0];
          if (o?.truckId) await this.db.update(schema.trucks).set({ status: 'Available' }).where(eq(schema.trucks.truckId, o.truckId));
        }
      }
    }
    return { ok: true };
  }
}
