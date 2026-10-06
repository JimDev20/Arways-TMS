import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Inject, BadRequestException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { RolesGuard } from '../common/roles.guard.js';
import { Roles } from '../common/roles.decorator.js';

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
  async list() {
    const rows = await this.db.select().from(schema.trucks);
    return withDriverInfo(this.db, rows as any[]);
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

  @Post()
  @Roles('Owner', 'Secretary')
  async create(@Body() body: any) {
    const truckSize = body.truckSize === undefined ? '6W' : TrucksController.assertSize(body.truckSize);
    // Enforce: one truck = one driver (unique). Reject if driver already linked elsewhere.
    if (body.assignedDriverId) {
      const dup = await this.db
        .select()
        .from(schema.trucks)
        .where(eq(schema.trucks.assignedDriverId, body.assignedDriverId));
      if (dup.length > 0) throw new BadRequestException('Driver already linked to another truck');
    }
    const rows = await this.db
      .insert(schema.trucks)
      .values({
        plateNumber: body.plateNumber,
        truckType: body.truckType,
        truckSize,
        capacityKg: Number(body.capacityKg),
        assignedDriverId: body.assignedDriverId ?? null,
        status: body.status ?? 'Available',
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
    if (body.truckSize !== undefined) TrucksController.assertSize(body.truckSize);
    if (body.assignedDriverId) {
      const dup = await this.db
        .select()
        .from(schema.trucks)
        .where(eq(schema.trucks.assignedDriverId, body.assignedDriverId));
      if (dup.some((t: any) => t.truckId !== id)) {
        throw new BadRequestException('Driver already linked to another truck');
      }
    }
    await this.db.update(schema.trucks).set(body).where(eq(schema.trucks.truckId, id));
    return { ok: true };
  }
}
