import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Inject, BadRequestException, ForbiddenException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { DB, SUPABASE } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { RolesGuard } from '../common/roles.guard.js';
import { Roles } from '../common/roles.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { JwtPayload } from '../common/roles.js';
import { findUnpinnedStops } from '../common/route-pins.js';
import { assertCoords, assertNonEmpty, ORDER_PRIORITIES, assertIn, assertPhotoUrl, assertText, TEXT_LIMITS } from '../common/validate.js';

function point(lon: number, lat: number) {
  return sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)` as any;
}

/** Waybill photos are visible to Owner/Secretary (and the assigned Driver via /routes/mine). Clients only get tracking timestamps. */
function sanitizeRouteForRole(route: any, role?: string) {
  if (!route) return route;
  if (role === 'Client') {
    const { dispatchLeftPhotoUrl: _dropped, ...rest } = route;
    return rest;
  }
  return route;
}

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
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
    // Realtime: frontend subscribes to notifications table; also broadcast lightweight event.
    try {
      await this.sb.from('notifications').insert(
        userIds.map((u) => ({ user_id: u, notification_type: type, message, related_order_id: orderId ?? null })),
      );
    } catch { /* table insert via service role may duplicate; ignore */ }
  }

  private async writeStatusEvent(
    tx: any,
    entity: 'order' | 'route' | 'stop',
    entityId: string,
    oldStatus: string | null,
    newStatus: string,
    actorUserId: string | null,
    orderId?: string | null,
    reason?: string | null,
  ) {
    try {
      await tx.insert(schema.statusEvents).values({
        entity,
        entityId,
        orderId: orderId ?? null,
        oldStatus,
        newStatus,
        actorUserId,
        reason: reason ?? null,
      });
    } catch {
      /* status_events missing on old DBs; never blocks the write */
    }
  }

  private async writeAudit(
    tx: any,
    actorUserId: string | null,
    action: string,
    targetType: string | null,
    targetId: string | null,
    beforeValue: unknown,
    afterValue: unknown,
  ) {
    try {
      await tx.insert(schema.auditLogs).values({
        actorUserId,
        action,
        targetType,
        targetId,
        beforeValue: beforeValue ? JSON.stringify(beforeValue).slice(0, 4000) : null,
        afterValue: afterValue ? JSON.stringify(afterValue).slice(0, 4000) : null,
      });
    } catch {
      /* audit_logs missing on old DBs; never blocks the write */
    }
  }

  @Get()
  @Roles('Owner', 'Secretary', 'Client')
  async list(@Query('status') status?: string, @CurrentUser() user?: JwtPayload) {
    // P0 #12: scope by clientId (company), not just creator — colleagues at the
    // same company see each other's orders. Links via client_users + email match.
    let rows = await this.db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)).limit(200);
    if (user?.role === 'Client') {
      const links: any[] = await this.db
        .select()
        .from(schema.clientUsers)
        .where(eq(schema.clientUsers.userId, user.sub));
      const companyIds = new Set(links.map((l: any) => l.clientId));
      const byEmail: any[] = await this.db
        .select()
        .from(schema.clients)
        .where(eq(schema.clients.email, user.email))
        .limit(5);
      for (const c of byEmail) companyIds.add((c as any).clientId);
      rows = rows.filter(
        (o: any) => o.createdByUserId === user.sub || companyIds.has(o.clientId),
      );
    }
    if (status) rows = rows.filter((o: any) => o.status === status);
    return rows;
  }

  @Get(':id')
  @Roles('Owner', 'Secretary', 'Client', 'Driver')
  async get(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    const o = await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, id)).limit(1);
    const r = await this.db.select().from(schema.routes).where(eq(schema.routes.orderId, id)).limit(1);
    const stops = r[0]
      ? await this.db.select().from(schema.stops).where(eq(schema.stops.routeId, (r[0] as any).routeId))
      : [];
    const order: any = o[0] ?? null;
    if (!order) throw new BadRequestException('Order not found. Refresh the list.');
    // Clients may only open their own orders (same rule as addStores and
    // the order list): creator match, or a client_users link to the company.
    if (user?.role === 'Client' && order.createdByUserId !== user.sub) {
      const links: any[] = await this.db.select().from(schema.clientUsers).where(eq(schema.clientUsers.userId, user.sub));
      if (!links.some((l: any) => l.clientId === order.clientId)) {
        throw new ForbiddenException('You can only view your own orders.');
      }
    }
    let client: any = null;
    let truck: any = null;
    let driver: any = null;
    if (order) {
      [client] = (await this.db.select().from(schema.clients).where(eq(schema.clients.clientId, order.clientId)).limit(1)) as any[];
      [truck] = (await this.db.select().from(schema.trucks).where(eq(schema.trucks.truckId, order.truckId)).limit(1)) as any[];
      if (r[0]) {
        [driver] = (await this.db.select().from(schema.users).where(eq(schema.users.userId, (r[0] as any).assignedDriverId)).limit(1)) as any[];
      }
    }
    return {
      order, route: r[0] ? sanitizeRouteForRole(r[0], user?.role) : null, stops: stops.sort((a: any, b: any) => a.stopSequence - b.stopSequence),
      client: client ? { companyName: client.companyName, contactPerson: client.contactPerson, phone: client.phone, email: client.email, dispatchAreaAddress: client.dispatchAreaAddress, entranceInstructions: client.entranceInstructions, dispatcherContact: client.dispatcherContact } : null,
      truck: truck ? { plateNumber: truck.plateNumber, truckType: truck.truckType, truckSize: truck.truckSize ?? '6W', capacityKg: truck.capacityKg, status: truck.status } : null,
      driver: driver ? { fullName: driver.fullName, email: driver.email } : null,
    };
  }

  /** Owner/Secretary: adjust schedule or instructions on a Pending order. */
  @Patch(':id')
  @Roles('Owner', 'Secretary')
  async modify(@Param('id') id: string, @Body() body: any) {
    const patch: any = {};
    if (body.scheduledDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.scheduledDate))) {
        throw new BadRequestException('Delivery date is invalid. Pick the scheduled date first.');
      }
      if (String(body.scheduledDate) < new Date().toISOString().slice(0, 10)) {
        throw new BadRequestException('Delivery date is in the past. Pick today or a future date.');
      }
      patch.scheduledDate = body.scheduledDate;
    }
    if (body.scheduledTime !== undefined) {
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(body.scheduledTime))) {
        throw new BadRequestException('Delivery time is invalid. Pick the scheduled time first.');
      }
      patch.scheduledTime = body.scheduledTime;
    }
    if (body.specialInstructions !== undefined) patch.specialInstructions = body.specialInstructions || null;
    if (body.priority !== undefined) patch.priority = assertIn(body.priority, ORDER_PRIORITIES, 'Priority');
    if (Object.keys(patch).length === 0) throw new BadRequestException('Nothing to update. Change the schedule or instructions first.');
    const existing: any[] = await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, id)).limit(1);
    if (!existing[0]) throw new BadRequestException('Order not found. Refresh the list.');
    if (existing[0].status !== 'Pending') {
      throw new BadRequestException(`Only Pending orders can be modified (this one is ${existing[0].status}).`);
    }
    await this.db.update(schema.orders).set(patch).where(eq(schema.orders.orderId, id));
    return { ok: true };
  }

  /** Client creates order: map pins + truck select. Auto-assigns truck's driver. Dropoffs may be empty (pickup-only dispatch; stores added later). */
  @Post()
  @Roles('Owner', 'Secretary', 'Client')
  async create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    const { orderReference, clientId, truckId, scheduledDate, scheduledTime, specialInstructions, pickup, dropoffs } = body;
    if (!orderReference || !truckId || !scheduledDate || !pickup) {
      throw new BadRequestException('Missing required fields');
    }
    assertText(orderReference, 'Order reference', TEXT_LIMITS.reference);
    if (specialInstructions) assertText(specialInstructions, 'Special instructions', TEXT_LIMITS.instructions);
    const priority = body.priority === undefined ? 'Normal' : assertIn(body.priority, ORDER_PRIORITIES, 'Priority');
    if (!scheduledTime || !/^\d{2}:\d{2}(:\d{2})?$/.test(String(scheduledTime))) {
      throw new BadRequestException('Delivery time is missing. Pick the scheduled time first.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(scheduledDate))) {
      throw new BadRequestException('Delivery date is invalid. Pick the scheduled date first.');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (String(scheduledDate) < today) {
      throw new BadRequestException('Delivery date is in the past. Pick today or a future date.');
    }
    // Validate every map pin up front (bad GPS/autofill becomes a 400, never a 500).
    const pickupAddr = assertNonEmpty(pickup?.address, 'Pickup address');
    const pickupPin = assertCoords(pickup?.lat, pickup?.lon ?? pickup?.lng, 'Pickup location');
    const dropoffList: any[] = Array.isArray(dropoffs) ? dropoffs : [];
    const validDrops = dropoffList.map((d: any, i: number) => {
      const label = `Drop-off #${i + 1}`;
      return {
        address: assertNonEmpty(d?.address, `${label} address`),
        pin: assertCoords(d?.lat, d?.lon ?? d?.lng, label),
        windowStart: d?.windowStart ?? null,
        windowEnd: d?.windowEnd ?? null,
      };
    });
    // Resolve the client profile: callers send either a clients.client_id or
    // (for Client-role users) their own user id / email. Link via
    // client_users, falling back to matching clients.email, and remember
    // the link for next time.
    let resolvedClientId: string | null = null;
    if (clientId) {
      const direct: any[] = await this.db.select().from(schema.clients).where(eq(schema.clients.clientId, clientId)).limit(1);
      if (direct.length > 0) resolvedClientId = (direct[0] as any).clientId;
    }
    if (!resolvedClientId) {
      const links: any[] = await this.db.select().from(schema.clientUsers).where(eq(schema.clientUsers.userId, user.sub)).limit(1);
      if (links.length > 0) resolvedClientId = (links[0] as any).clientId;
    }
    if (!resolvedClientId) {
      const byEmail: any[] = await this.db.select().from(schema.clients).where(eq(schema.clients.email, user.email)).limit(1);
      if (byEmail.length > 0) resolvedClientId = (byEmail[0] as any).clientId;
    }
    if (!resolvedClientId) {
      throw new BadRequestException('Client profile not found for this account. Ask an Owner to link your login to a client company first.');
    }
    const orderClientId: string = resolvedClientId;
    // P0 #6: multi-table write wrapped in a transaction (order + route + stops
    // + link stay consistent; mid-way failure rolls back instead of stranding).
    const created = await this.db.transaction(async (tx) => {
      await tx.insert(schema.clientUsers).values({ clientId: orderClientId, userId: user.sub }).onConflictDoNothing();
      const trucks = await tx.select().from(schema.trucks).where(eq(schema.trucks.truckId, truckId)).limit(1);
      const truck: any = trucks[0];
      if (!truck) throw new BadRequestException('Truck not found. Pick a different truck from the list.');
      if (truck.status === 'Maintenance') {
        throw new BadRequestException(`Truck ${truck.plateNumber} is in Maintenance, so it cannot take orders. Pick an Available truck.`);
      }
      if (truck.status !== 'Available') {
        throw new BadRequestException(`Truck ${truck.plateNumber} is currently ${truck.status}. Pick an Available truck.`);
      }
      if (!truck.assignedDriverId) throw new BadRequestException(`Truck ${truck.plateNumber} has no assigned driver. Ask an Owner to assign a driver to that truck first.`);
      const busyRoutes: any[] = await tx
        .select()
        .from(schema.routes)
        .where(and(eq(schema.routes.assignedDriverId, truck.assignedDriverId), eq(schema.routes.status, 'In Progress')))
        .limit(1);
      if (busyRoutes.length > 0) {
        const drivers: any[] = await tx.select().from(schema.users).where(eq(schema.users.userId, truck.assignedDriverId)).limit(1);
        const name = drivers[0]?.fullName ?? 'The assigned driver';
        throw new BadRequestException(`${name} is already on trip ${(busyRoutes[0] as any).routeNumber}. Pick another truck.`);
      }

      const inserted = await tx
        .insert(schema.orders)
        .values({
          orderReference, clientId: orderClientId, createdByUserId: user.sub, truckId,
          scheduledDate, scheduledTime, specialInstructions: specialInstructions ?? null, priority, status: 'Pending',
        })
        .returning();
      const order: any = inserted[0];

      // Create route + stops (pickup seq 0, dropoffs 1..n)
      const routeNumber = `R-${Date.now().toString().slice(-6)}`;
      const routeRows: any = await tx
        .insert(schema.routes)
        .values({ orderId: order.orderId, assignedDriverId: truck.assignedDriverId, routeNumber, status: 'Pending' })
        .returning();
      const route = routeRows[0];

      const stopRows = [
        {
          routeId: route.routeId, stopSequence: 0, stopType: 'Pickup',
          locationAddress: pickupAddr, locationCoordinates: point(pickupPin.lon, pickupPin.lat),
          timeWindowStart: null, timeWindowEnd: null,
          productDescription: body.productDescription ?? null, productQuantity: body.productQuantity ?? null, status: 'Pending',
        },
        ...validDrops.map((d, i: number) => ({
          routeId: route.routeId, stopSequence: i + 1, stopType: 'Dropoff',
          locationAddress: d.address, locationCoordinates: point(d.pin.lon, d.pin.lat),
          timeWindowStart: d.windowStart ?? null, timeWindowEnd: d.windowEnd ?? null,
          productDescription: body.productDescription ?? null, productQuantity: body.productQuantity ?? null, status: 'Pending',
        })),
      ];
      for (const s of stopRows) {
        await tx.execute(sql`insert into stops (route_id, stop_sequence, stop_type, location_address, location_coordinates, time_window_start, time_window_end, product_description, product_quantity, status)
          values (${s.routeId}, ${s.stopSequence}, ${s.stopType}, ${s.locationAddress}, ${s.locationCoordinates}, ${s.timeWindowStart}, ${s.timeWindowEnd}, ${s.productDescription}, ${s.productQuantity}, 'Pending')`);
      }
      await this.writeStatusEvent(tx, 'order', order.orderId, null, 'Pending', user.sub, order.orderId, null);
      await this.writeAudit(tx, user.sub, 'order.create', 'order', order.orderId, null, { orderReference, truckId });
      return { order, route, driverId: truck.assignedDriverId };
    });

    // Notify secretaries (outside tx; best-effort)
    const secs = await this.db.select().from(schema.users).where(eq(schema.users.role, 'Secretary'));
    await this.notify(secs.map((u: any) => u.userId), 'order_pending', `New order ${orderReference} awaiting approval`, created.order.orderId);
    return created;
  }

  @Patch(':id/approve')
  @Roles('Owner', 'Secretary')
  async approve(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    const existing: any[] = await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, id)).limit(1);
    const order: any = existing[0];
    if (!order) throw new BadRequestException('Order not found. Refresh the list.');
    if (order.status !== 'Pending') {
      throw new BadRequestException(`Only Pending orders can be approved (this one is ${order.status}).`);
    }
    const r: any = (await this.db.select().from(schema.routes).where(eq(schema.routes.orderId, id)).limit(1))[0];
    if (r) {
      // Sure-route gate: the pickup (dispatch) must have navigation and
      // every store must already be pinned before approval completes it.
      const bad = await findUnpinnedStops(this.db, r.routeId);
      if (bad.some((s) => s.stopType === 'Pickup')) {
        throw new BadRequestException('Pickup location has no map pin, so dispatch has no navigation. Pin the pickup location before approving.');
      }
      const badDrops = bad.filter((s) => s.stopType === 'Dropoff');
      if (badDrops.length > 0) {
        const names = badDrops.map((s) => s.locationAddress).join(', ');
        throw new BadRequestException(`Cannot approve: ${badDrops.length} store${badDrops.length === 1 ? '' : 's'} ha${badDrops.length === 1 ? 's' : 've'} no map pin${badDrops.length === 1 ? '' : 's'}: ${names}. Pin all store locations before approving.`);
      }
    }
    // P0 #7: re-validate truck + driver at approve time (truck stays Available
    // until approval, so two clients can submit on the same truck; same-day
    // double-booking is also blocked).
    const truck: any = order.truckId
      ? (await this.db.select().from(schema.trucks).where(eq(schema.trucks.truckId, order.truckId)).limit(1))[0]
      : null;
    if (truck) {
      if (truck.status === 'Maintenance') {
        throw new BadRequestException(`Truck ${truck.plateNumber} is in Maintenance and cannot be approved. Pick an Available truck (reject + recreate).`);
      }
      if (truck.status !== 'Available') {
        throw new BadRequestException(`Truck ${truck.plateNumber} is currently ${truck.status}. It was booked by another order — reject this one and recreate with a free truck.`);
      }
      if (!truck.assignedDriverId) {
        throw new BadRequestException(`Truck ${truck.plateNumber} has no assigned driver. Assign a driver first.`);
      }
      const busy: any[] = await this.db
        .select()
        .from(schema.routes)
        .where(and(eq(schema.routes.assignedDriverId, truck.assignedDriverId), eq(schema.routes.status, 'In Progress')))
        .limit(1);
      if (busy.length > 0) {
        throw new BadRequestException(`Driver is already on trip ${(busy[0] as any).routeNumber}. Reject and recreate with a free truck.`);
      }
      const sameDay: any[] = await this.db.select().from(schema.orders);
      const clash = (sameDay as any[]).find(
        (o) =>
          o.orderId !== id &&
          o.truckId === order.truckId &&
          String(o.scheduledDate).slice(0, 10) === String(order.scheduledDate).slice(0, 10) &&
          (o.status === 'Approved' || o.status === 'In Transit'),
      );
      if (clash) {
        throw new BadRequestException(`Truck ${truck.plateNumber} already has order ${clash.orderReference} on ${String(order.scheduledDate).slice(0, 10)}. One active order per truck per day.`);
      }
    }
    await this.db.transaction(async (tx) => {
      await tx.update(schema.orders).set({ status: 'Approved' }).where(eq(schema.orders.orderId, id));
      await this.writeStatusEvent(tx, 'order', id, 'Pending', 'Approved', user?.sub ?? null, id, null);
      if (r) {
        await tx.update(schema.routes).set({ status: 'In Progress' }).where(eq(schema.routes.routeId, r.routeId));
        await this.writeStatusEvent(tx, 'route', r.routeId, r.status, 'In Progress', user?.sub ?? null, id, null);
        await tx.update(schema.orders).set({ status: 'In Transit' }).where(eq(schema.orders.orderId, id));
        await this.writeStatusEvent(tx, 'order', id, 'Approved', 'In Transit', user?.sub ?? null, id, null);
        if (truck) await tx.update(schema.trucks).set({ status: 'In Use' }).where(eq(schema.trucks.truckId, truck.truckId));
        await this.writeAudit(tx, user?.sub ?? null, 'order.approve', 'order', id, { status: 'Pending' }, { status: 'In Transit' });
      }
    });
    if (r) {
      await this.notify([r.assignedDriverId], 'route_assigned', `Route ${r.routeNumber} approved — start delivery`, id);
    }
    return { ok: true };
  }

  @Patch(':id/reject')
  @Roles('Owner', 'Secretary')
  async reject(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() user?: JwtPayload) {
    const reason = assertText(body?.reason, 'Rejection reason', TEXT_LIMITS.reason);
    const before: any = (await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, id)).limit(1))[0];
    await this.db.transaction(async (tx) => {
      await tx.update(schema.orders).set({ status: 'Rejected', rejectionReason: reason }).where(eq(schema.orders.orderId, id));
      await this.writeStatusEvent(tx, 'order', id, before?.status ?? null, 'Rejected', user?.sub ?? null, id, reason);
      await this.writeAudit(tx, user?.sub ?? null, 'order.reject', 'order', id, { status: before?.status }, { status: 'Rejected', reason });
    });
    const o: any = (await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, id)).limit(1))[0];
    if (o) await this.notify([o.createdByUserId], 'order_rejected', `Order ${o.orderReference} rejected: ${reason}`, id);
    return { ok: true };
  }

  /**
   * Cancel a live order (Pending/Approved/In Transit). Closes the order and
   * its route, frees the truck, and notifies driver + client, so a cancelled
   * route disappears from the driver portal instead of lingering there.
   */
  @Patch(':id/cancel')
  @Roles('Owner', 'Secretary')
  async cancel(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() user?: JwtPayload) {
    const reason = assertText(body?.reason, 'Cancellation reason', TEXT_LIMITS.reason);
    const existing: any[] = await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, id)).limit(1);
    const o = existing[0];
    if (!o) throw new BadRequestException('Order not found. Refresh the list.');
    if (o.status === 'Completed') throw new BadRequestException('Order is already completed and cannot be cancelled.');
    if (o.status === 'Cancelled') throw new BadRequestException('Order is already cancelled.');
    if ((o.status as string) === 'Rejected') throw new BadRequestException('Order is already rejected and cannot be cancelled.');
    const oldStatus = o.status;
    const routes: any[] = await this.db.select().from(schema.routes).where(eq(schema.routes.orderId, id));
    const driverIds = new Set<string>();
    for (const r of routes) if (r.assignedDriverId) driverIds.add(r.assignedDriverId);
    await this.db.transaction(async (tx) => {
      await tx.update(schema.orders).set({ status: 'Cancelled', rejectionReason: reason }).where(eq(schema.orders.orderId, id));
      await this.writeStatusEvent(tx, 'order', id, oldStatus, 'Cancelled', user?.sub ?? null, id, reason);
      for (const r of routes) {
        await tx.update(schema.routes).set({ status: 'Cancelled' }).where(eq(schema.routes.routeId, r.routeId));
        await this.writeStatusEvent(tx, 'route', r.routeId, r.status, 'Cancelled', user?.sub ?? null, id, reason);
      }
      if (o.truckId) await tx.update(schema.trucks).set({ status: 'Available' }).where(eq(schema.trucks.truckId, o.truckId));
      await this.writeAudit(tx, user?.sub ?? null, 'order.cancel', 'order', id, { status: oldStatus }, { status: 'Cancelled', reason });
    });
    await this.notify([...driverIds], 'order_cancelled', `Order ${o.orderReference} was cancelled: ${reason}`, id);
    if (o.createdByUserId) await this.notify([o.createdByUserId], 'order_cancelled', `Order ${o.orderReference} was cancelled: ${reason}`, id);
    return { ok: true };
  }

  /**
   * P0 #4 (part 2): force-close a stuck route (Owner/Secretary). Frees the
   * truck even when stops are terminal-mixed (Delivered + Failed). Requires
   * a reason; recorded in status_events + audit_logs.
   */
  @Patch(':id/force-close')
  @Roles('Owner', 'Secretary')
  async forceClose(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() user?: JwtPayload) {
    const reason = assertText(body?.reason, 'Force-close reason', TEXT_LIMITS.reason);
    const o: any = (await this.db.select().from(schema.orders).where(eq(schema.orders.orderId, id)).limit(1))[0];
    if (!o) throw new BadRequestException('Order not found. Refresh the list.');
    if (o.status === 'Completed' || o.status === 'Cancelled') {
      throw new BadRequestException(`Order is already ${o.status} and cannot be force-closed.`);
    }
    const routes: any[] = await this.db.select().from(schema.routes).where(eq(schema.routes.orderId, id));
    await this.db.transaction(async (tx) => {
      await tx.update(schema.orders).set({ status: 'Completed', rejectionReason: `Force-closed: ${reason}` }).where(eq(schema.orders.orderId, id));
      await this.writeStatusEvent(tx, 'order', id, o.status, 'Completed', user?.sub ?? null, id, `Force-closed: ${reason}`);
      for (const r of routes) {
        await tx.update(schema.routes).set({ status: 'Completed' }).where(eq(schema.routes.routeId, r.routeId));
        await this.writeStatusEvent(tx, 'route', r.routeId, r.status, 'Completed', user?.sub ?? null, id, `Force-closed: ${reason}`);
      }
      if (o.truckId) await tx.update(schema.trucks).set({ status: 'Available' }).where(eq(schema.trucks.truckId, o.truckId));
      await this.writeAudit(tx, user?.sub ?? null, 'order.force-close', 'order', id, { status: o.status }, { status: 'Completed', reason });
    });
    return { ok: true };
  }
}
