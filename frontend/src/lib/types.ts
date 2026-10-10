export type Role = 'Owner' | 'Secretary' | 'Client' | 'Driver';

export interface SessionUser {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
}

export type TruckSize = '4W' | '6W' | '10W';

export const TRUCK_SIZES: TruckSize[] = ['4W', '6W', '10W'];

export interface Truck {
  truckId: string;
  plateNumber: string;
  truckType: 'Refrigerated' | 'Dry';
  truckSize: TruckSize;
  capacityKg: number;
  assignedDriverId: string | null;
  status: 'Available' | 'In Use' | 'Maintenance';
}

export type OrderStatus = 'Pending' | 'Approved' | 'Rejected' | 'In Transit' | 'Completed' | 'Cancelled';
export type StopStatus = 'Pending' | 'Arrived' | 'Departed' | 'Delivered' | 'Failed';
export type OrderPriority = 'Normal' | 'Urgent' | 'Rush';

export interface Order {
  orderId: string;
  orderReference: string;
  clientId: string;
  truckId: string;
  createdByUserId?: string;
  scheduledDate: string;
  scheduledTime: string;
  specialInstructions: string | null;
  priority: OrderPriority;
  status: OrderStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface RouteRow {
  routeId: string;
  orderId: string;
  assignedDriverId: string;
  routeNumber: string;
  status: string;
  dispatchedArrivedAt: string | null;
  dispatchedLeftAt: string | null;
  dispatchLeftPhotoUrl?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface StopRow {
  stopId: string;
  routeId: string;
  stopSequence: number;
  stopType: 'Pickup' | 'Dropoff';
  locationAddress: string;
  locationCoordinates: unknown;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  productDescription: string | null;
  productQuantity: string | null;
  status: StopStatus;
  arrivedAt: string | null;
  departedAt: string | null;
  deliveredAt: string | null;
  failedReason: string | null;
  receiptPhotoUrl: string | null;
  driverNotes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** GET /routes item: route with order, truck and driver context. */
export interface RouteFull {
  route: RouteRow;
  orderReference: string;
  orderStatus: string;
  truckPlate: string;
  driverName: string;
  stops: StopRow[];
}

/** GET /routes/mine item (Driver) — enriched with client/truck/schedule (pickup-always). */
export interface DriverRoute {
  route: RouteRow;
  stops: StopRow[];
  orderReference?: string;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  client?: OrderDetailClient | null;
  truck?: { plateNumber: string; truckType: string; truckSize?: TruckSize | string } | null;
}

export interface OrderDetailClient {
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  dispatchAreaAddress: string;
  entranceInstructions: string | null;
  dispatcherContact: string | null;
}

export interface OrderDetailTruck {
  plateNumber: string;
  truckType: string;
  truckSize: TruckSize | string;
  capacityKg: number;
  status: string;
}

export interface OrderDetailDriver {
  fullName: string;
  email: string;
}

/** GET /orders/:id response. */
export interface OrderDetail {
  order: Order | null;
  route: RouteRow | null;
  stops: StopRow[];
  client: OrderDetailClient | null;
  truck: OrderDetailTruck | null;
  driver: OrderDetailDriver | null;
}

export interface UserRow {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  phone: string | null;
  licenseNo: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ClientRow {
  clientId: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  dispatchAreaAddress: string;
  dispatchAreaCoordinates: unknown;
  entranceInstructions: string | null;
  dispatcherContact: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NotificationItem {
  notificationId: string;
  userId: string;
  notificationType: string;
  message: string;
  relatedOrderId: string | null;
  isRead: boolean;
  createdAt: string | null;
}

/** GET /proof item. */
export interface ProofItem {
  stop: StopRow;
  orderReference: string;
  orderStatus: string;
  routeNumber: string;
  driverName: string;
}

/** GET /reports/summary response. */
export interface ReportSummary {
  total: number;
  delivered: number;
  failed: number;
  deliveryRatePct: number;
  onTimePct: number;
  onTimeJudged: number;
  byReason: Record<string, number>;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
  source: 'photon' | 'nominatim';
}

/** GET /reports/storage response: receipt-photo usage vs quota. */
export interface StorageSummary {
  files: number;
  bytes: number;
  oldest: string | null;
  quotaBytes: number;
}

/** Maintenance log entry for a truck. */
export interface MaintenanceLog {
  logId: string;
  truckId: string;
  performedAt: string;
  note: string;
  nextDue: string | null;
  createdAt: string | null;
}

export type DriverAvailability = 'Available' | 'On Trip' | 'Standby' | 'Unassigned';

/** GET /trucks and /trucks/available items (driver info joined). */
export interface TruckWithDriver extends Truck {
  assignedDriverName: string | null;
  driverAvailability: DriverAvailability;
}

/** POST /auth/login response. */
export interface LoginResponse {
  access_token: string;
  user: SessionUser;
}

/** Extracts a readable message from an unknown caught value. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

export interface Route {
  routeId: string;
  orderId: string;
  assignedDriverId: string;
  routeNumber: string;
  status: string;
}

export interface Stop {
  stopId: string;
  routeId: string;
  stopSequence: number;
  stopType: 'Pickup' | 'Dropoff';
  locationAddress: string;
  status: 'Pending' | 'Arrived' | 'Departed' | 'Delivered' | 'Failed';
  arrivedAt: string | null;
  deliveredAt: string | null;
  receiptPhotoUrl: string | null;
  driverNotes: string | null;
}

export interface NavLink {
  href: string;
  label: string;
}

export interface NavSection {
  /** Empty label renders as an unlabeled group (used when one group is enough). */
  section: string;
  links: NavLink[];
}

export const NAV: Record<Role, NavSection[]> = {
  Owner: [
    { section: '', links: [{ href: '/owner', label: 'Dashboard' }] },
    {
      section: 'Operations',
      links: [
        { href: '/owner/orders', label: 'Orders' },
        { href: '/owner/approvals', label: 'Approvals' },
        { href: '/owner/new', label: 'New Order' },
        { href: '/owner/routes', label: 'Routes' },
        { href: '/owner/calendar', label: 'Calendar' },
        { href: '/owner/kanban', label: 'Status Board' },
      ],
    },
    {
      section: 'Manage',
      links: [
        { href: '/owner/fleet', label: 'Fleet' },
        { href: '/owner/users', label: 'Users' },
        { href: '/owner/clients', label: 'Clients' },
      ],
    },
    {
      section: 'Insights',
      links: [
        { href: '/owner/proof', label: 'Proof' },
        { href: '/owner/reports', label: 'Reports' },
        { href: '/owner/audit', label: 'Audit Logs' },
      ],
    },
    {
      section: 'System',
      links: [
        { href: '/owner/notifications', label: 'Notifications' },
        { href: '/owner/broadcast', label: 'Broadcast' },
        { href: '/owner/settings', label: 'Settings' },
        { href: '/owner/help', label: 'Help' },
      ],
    },
  ],
  Secretary: [
    { section: '', links: [{ href: '/secretary', label: 'Dashboard' }] },
    {
      section: 'Operations',
      links: [
        { href: '/secretary/approvals', label: 'Approvals' },
        { href: '/secretary/new', label: 'New Order' },
        { href: '/secretary/monitoring', label: 'Monitoring' },
        { href: '/secretary/track', label: 'Track' },
        { href: '/secretary/fleet', label: 'Fleet' },
        { href: '/secretary/calendar', label: 'Calendar' },
        { href: '/secretary/kanban', label: 'Status Board' },
      ],
    },
    {
      section: 'Insights',
      links: [{ href: '/secretary/reports', label: 'Reports' }],
    },
    {
      section: 'System',
      links: [
        { href: '/secretary/notifications', label: 'Notifications' },
        { href: '/secretary/help', label: 'Help' },
      ],
    },
  ],
  Client: [
    { section: '', links: [{ href: '/client', label: 'Dashboard' }] },
    {
      section: 'Orders',
      links: [
        { href: '/client/orders', label: 'My Orders' },
        { href: '/client/new', label: 'New Order' },
        { href: '/client/track', label: 'Track' },
        { href: '/client/proof', label: 'Proof' },
      ],
    },
    {
      section: 'Insights',
      links: [{ href: '/client/reports', label: 'Reports' }],
    },
    {
      section: 'System',
      links: [
        { href: '/client/notifications', label: 'Notifications' },
        { href: '/client/help', label: 'Help' },
      ],
    },
  ],
  Driver: [
    {
      section: '',
      links: [
        { href: '/driver', label: "Today's Route" },
        { href: '/driver/stops', label: 'Stops' },
        { href: '/driver/proof', label: 'Proof' },
        { href: '/driver/profile', label: 'Profile' },
        { href: '/driver/notifications', label: 'Notifications' },
        { href: '/driver/help', label: 'Help' },
      ],
    },
  ],
};

export function homeFor(role: Role): string {
  return role === 'Owner' ? '/owner' : role === 'Secretary' ? '/secretary' : role === 'Client' ? '/client' : '/driver';
}

export function gmapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}
