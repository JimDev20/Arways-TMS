import { pgTable, uuid, text, integer, date, time, boolean, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { geometry } from './pgis.js';

// NOTE: geometry() helper maps to PostGIS geometry(Point,4326) via raw SQL in migrations.
// Drizzle stores lon/lat as GeoJSON-like {x: lon, y: lat} through custom type.

export const users = pgTable('users', {
  userId: uuid('user_id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('Active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const clients = pgTable('clients', {
  clientId: uuid('client_id').primaryKey().defaultRandom(),
  companyName: text('company_name').notNull(),
  contactPerson: text('contact_person').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  dispatchAreaAddress: text('dispatch_area_address').notNull(),
  dispatchAreaCoordinates: geometry('dispatch_area_coordinates').notNull(),
  entranceInstructions: text('entrance_instructions'),
  dispatcherContact: text('dispatcher_contact'),
  ownerUserId: uuid('owner_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const clientUsers = pgTable('client_users', {
  clientId: uuid('client_id').notNull(),
  userId: uuid('user_id').notNull(),
}, (t) => [primaryKey({ columns: [t.clientId, t.userId] })]);

export const trucks = pgTable('trucks', {  truckId: uuid('truck_id').primaryKey().defaultRandom(),
  plateNumber: text('plate_number').notNull().unique(),
  truckType: text('truck_type').notNull(),
  truckSize: text('truck_size').notNull().default('6W'),
  capacityKg: integer('capacity_kg').notNull(),
  assignedDriverId: uuid('assigned_driver_id').unique(),
  status: text('status').notNull().default('Available'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const maintenanceLog = pgTable('maintenance_log', {
  logId: uuid('log_id').primaryKey().defaultRandom(),
  truckId: uuid('truck_id').notNull(),
  performedAt: date('performed_at').notNull(),
  note: text('note').notNull(),
  nextDue: date('next_due'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const orders = pgTable('orders', {
  orderId: uuid('order_id').primaryKey().defaultRandom(),
  orderReference: text('order_reference').notNull().unique(),
  clientId: uuid('client_id').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull(),
  truckId: uuid('truck_id').notNull(),
  scheduledDate: date('scheduled_date').notNull(),
  scheduledTime: time('scheduled_time').notNull(),
  specialInstructions: text('special_instructions'),
  status: text('status').notNull().default('Pending'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const routes = pgTable('routes', {
  routeId: uuid('route_id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  assignedDriverId: uuid('assigned_driver_id').notNull(),
  routeNumber: text('route_number').notNull().unique(),
  status: text('status').notNull().default('Pending'),
  dispatchedArrivedAt: timestamp('dispatched_arrived_at', { withTimezone: true }),
  dispatchedLeftAt: timestamp('dispatched_left_at', { withTimezone: true }),
  dispatchLeftPhotoUrl: text('dispatch_left_photo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const stops = pgTable('stops', {
  stopId: uuid('stop_id').primaryKey().defaultRandom(),
  routeId: uuid('route_id').notNull(),
  stopSequence: integer('stop_sequence').notNull(),
  stopType: text('stop_type').notNull(),
  locationAddress: text('location_address').notNull(),
  locationCoordinates: geometry('location_coordinates').notNull(),
  timeWindowStart: time('time_window_start'),
  timeWindowEnd: time('time_window_end'),
  productDescription: text('product_description'),
  productQuantity: text('product_quantity'),
  status: text('status').notNull().default('Pending'),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }),
  departedAt: timestamp('departed_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  failedReason: text('failed_reason'),
  receiptPhotoUrl: text('receipt_photo_url'),
  driverNotes: text('driver_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const notifications = pgTable('notifications', {
  notificationId: uuid('notification_id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  notificationType: text('notification_type').notNull(),
  message: text('message').notNull(),
  relatedOrderId: uuid('related_order_id'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
