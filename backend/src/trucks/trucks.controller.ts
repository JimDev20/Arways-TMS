import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Inject, BadRequestException } from '@nestjs/common';
import { SQL, and, count, desc, eq, ilike, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { RolesGuard } from '../common/roles.guard.js';
import { Roles } from '../common/roles.decorator.js';
import { TRUCK_STATUSES, TRUCK_TYPES, assertIn, assertNonEmpty, assertPositiveInt } from '../common/validate.js';
import { encodeCursor, escapeLike, keysetBefore, parseCursor, parseLimit, type Page } from '../common/pagination.js';

export type DriverAvailability = 'Available' | 'On Trip' | 'Standby' | 'Unassigned';

/**
 * Driver availability always mirrors the truck (1 truck = 1 driver):
 * Available truck + no active route => Available; In Use truck or active
 * route => On Trip; Maintenance truck => Standby; no assigned driver =>
 * Unassigned.
 */
async function driverAvailability(
  db: PostgresJsDatabase<typeof schema>,
  driverId: string | null,
  truckStatus: string,
): Promise<{ availability: DriverAvailability; driverName: string | null }> {
  if (!driverId) return { availability: 'Unassigned', driverName: null };
  const drivers: any[] = await db.select().from(schema.users).where(eq(schema.users.userId, driverId)).limit(1);
  const driverName = drivers[0]?.fullName ?? null;
  if (truckStatus === 'Maintenance') return { availability: 'Standby', driverName };
  if (truckStatus === 'In Use') return { availability: 'On Trip', driverName };
  const active: any[] = await db
    .select()
    .from(schema.routes)
    .where(and(eq(schema.routes.assignedDriverId, driverId), eq(schema.routes.status, 'In Progress')))
    .limit(1);
  if (active.length > 0) return { availability: 'On Trip', driverName };
  return { availability: 'Available', driverName };
}

async function withDriverInfo(db: PostgresJsDatabase<typeof schema>, trucks: any[]) {
  return Promise.all(
    trucks.map(async (t: any) => {
      const { availability, driverName } = await driverAvailability(db, t.assignedDriverId ?? null, t.status);
      return { ...t, assignedDriverName: driverName, driverAvailability: availability as DriverAvailability };
    }),
  );
}

@Controller('trucks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrucksController {
  constructor(@Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>) {}

  @Get()
  @Roles('Owner', 'Secretary', 'Client')
  async list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string,
  ): Promise<any[] | Page<any>> {
    // Text filter covers plate, type and size (exact values the user knows);
    // status is the one collection select filter. Full collection, server-side.
    const conds: (SQL<unknown> | undefined)[] = [];
    if (status && status !== 'All') conds.push(eq(schema.trucks.status, assertIn(status, TRUCK_STATUSES, 'Status')));
    const needle = (q ?? '').trim();
    if (needle) {
      const like = `%${escapeLike(needle)}%`;
      conds.push(or(ilike(schema.trucks.plateNumber, like), ilike(schema.trucks.truckType, like), ilike(schema.trucks.truckSize, like)));
    }
    if (limitRaw === undefined) {
      // Legacy shape (pickers, header search, dashboards): full array.
      const rows = await this.db.select().from(schema.trucks);
      return withDriverInfo(this.db, rows as any[]);
    }
    // Paginated shape for tables: keyset over (created_at DESC, truck_id DESC).
    const limit = parseLimit(limitRaw);
    const where = and(...conds);
    const pageWhere = and(...conds, keysetBefore(schema.trucks.createdAt, schema.trucks.truckId, parseCursor(cursorRaw)));
    const rows: any[] = await this.db
      .select()
      .from(schema.trucks)
      .where(pageWhere)
      .orderBy(desc(schema.trucks.createdAt), desc(schema.trucks.truckId))
      .limit(limit + 1);
    const [{ n }] = await this.db.select({ n: count() }).from(schema.trucks).where(where);
    const items = await withDriverInfo(this.db, rows.slice(0, limit) as any[]);
    const last: any = rows[Math.min(rows.length, limit) - 1];
    return {
      items,
      nextCursor: rows.length > limit && last && last.createdAt != null ? encodeCursor(last.createdAt, last.truckId) : null,
      total: Number(n),
    };
  }

  @Get('available')
  @Roles('Owner', 'Secretary', 'Client')
  async available() {
    const rows = await this.db.select().from(schema.trucks).where(eq(schema.trucks.status, 'Available'));
    return withDriverInfo(this.db, rows as any[]);
  }

  private static readonly SIZES = ['4W', '6W', '10W'];

  static assertSize(value: unknown): string {
    if (typeof value !== 'string' || !TrucksController.SIZES.includes(value)) {
      throw new BadRequestException('Truck size must be 4W, 6W, or 10W.');
    }
    return value;
  }

  /** Assigned driver must be an active Driver-role user (catches wrong picks). */
  private async assertDriver(driverId: string) {
    const found: any[] = await this.db.select().from(schema.users).where(eq(schema.users.userId, driverId)).limit(1);
    if (!found[0]) throw new BadRequestException('Assigned driver not found. Pick a driver from the list.');
    if (found[0].role !== 'Driver') {
      throw new BadRequestException(`${found[0].fullName ?? 'That user'} is a ${found[0].role}, not a Driver. Only Drivers can be linked to a truck.`);
    }
    if (found[0].status !== 'Active') {
      throw new BadRequestException(`${found[0].fullName ?? 'That driver'} is Inactive. Reactivate the driver first.`);
    }
  }

  @Post()
  @Roles('Owner', 'Secretary')
  async create(@Body() body: any) {
    const truckSize = body.truckSize === undefined ? '6W' : TrucksController.assertSize(body.truckSize);
    const plateNumber = assertNonEmpty(body.plateNumber, 'Plate number');
    const truckType = assertIn(body.truckType, TRUCK_TYPES, 'Truck type');
    const capacityKg = assertPositiveInt(body.capacityKg, 'Capacity (kg)');
    const status = body.status === undefined ? 'Available' : assertIn(body.status, TRUCK_STATUSES, 'Truck status');
    // Enforce: one truck = one driver (unique). Reject if driver already linked elsewhere.
    if (body.assignedDriverId) {
      await this.assertDriver(body.assignedDriverId);
      const dup = await this.db
        .select()
        .from(schema.trucks)
        .where(eq(schema.trucks.assignedDriverId, body.assignedDriverId));
      if (dup.length > 0) throw new BadRequestException('Driver already linked to another truck');
    }
    const rows = await this.db
      .insert(schema.trucks)
      .values({
        plateNumber,
        truckType,
        truckSize,
        capacityKg,
        assignedDriverId: body.assignedDriverId ?? null,
        status,
      })
      .returning();
    return rows[0];
  }

  @Get(':id/maintenance')
  @Roles('Owner', 'Secretary')
  async maintenance(@Param('id') id: string) {
    return this.db
      .select()
      .from(schema.maintenanceLog)
      .where(eq(schema.maintenanceLog.truckId, id))
      .orderBy(desc(schema.maintenanceLog.performedAt));
  }

  @Post(':id/maintenance')
  @Roles('Owner', 'Secretary')
  async addMaintenance(@Param('id') id: string, @Body() body: any) {
    if (!body?.performedAt) throw new BadRequestException('Service date is empty. Pick the date the work was done.');
    if (!body?.note?.trim()) throw new BadRequestException('Note is empty. Describe what was serviced.');
    if (body?.nextDue && body.nextDue < body.performedAt) {
      throw new BadRequestException('Next due is before the service date. Pick a due date after the work was done.');
    }
    const trucks = await this.db.select().from(schema.trucks).where(eq(schema.trucks.truckId, id)).limit(1);
    if (!trucks[0]) throw new BadRequestException('Truck not found. Refresh the fleet list.');
    const rows = await this.db
      .insert(schema.maintenanceLog)
      .values({ truckId: id, performedAt: body.performedAt, note: body.note.trim(), nextDue: body.nextDue ?? null })
      .returning();
    return rows[0];
  }

  @Patch(':id')
  @Roles('Owner', 'Secretary')
  async update(@Param('id') id: string, @Body() body: any) {
    const existing: any[] = await this.db.select().from(schema.trucks).where(eq(schema.trucks.truckId, id)).limit(1);
    if (!existing[0]) throw new BadRequestException('Truck not found. Refresh the fleet list.');
    // Allowlist: never let callers overwrite ids or timestamps.
    const patch: any = {};
    if (body.plateNumber !== undefined) patch.plateNumber = assertNonEmpty(body.plateNumber, 'Plate number');
    if (body.truckType !== undefined) patch.truckType = assertIn(body.truckType, TRUCK_TYPES, 'Truck type');
    if (body.truckSize !== undefined) patch.truckSize = TrucksController.assertSize(body.truckSize);
    if (body.capacityKg !== undefined) patch.capacityKg = assertPositiveInt(body.capacityKg, 'Capacity (kg)');
    if (body.status !== undefined) patch.status = assertIn(body.status, TRUCK_STATUSES, 'Truck status');
    if (body.assignedDriverId !== undefined) {
      if (body.assignedDriverId) {
        await this.assertDriver(body.assignedDriverId);
        const dup = await this.db
          .select()
          .from(schema.trucks)
          .where(eq(schema.trucks.assignedDriverId, body.assignedDriverId));
        if (dup.some((t: any) => t.truckId !== id)) {
          throw new BadRequestException('Driver already linked to another truck');
        }
      }
      patch.assignedDriverId = body.assignedDriverId ?? null;
    }
    if (Object.keys(patch).length === 0) throw new BadRequestException('Nothing to update. Change a truck detail first.');
    await this.db.update(schema.trucks).set(patch).where(eq(schema.trucks.truckId, id));
    return { ok: true };
  }
}
