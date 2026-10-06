// Central TypeScript types shared conceptually with frontend (see frontend/src/lib/types.ts).
export type Role = 'Owner' | 'Secretary' | 'Client' | 'Driver';
export type UserStatus = 'Active' | 'Inactive';
export type TruckType = 'Refrigerated' | 'Dry';
export type TruckStatus = 'Available' | 'In Use' | 'Maintenance';
export type OrderStatus = 'Pending' | 'Approved' | 'Rejected' | 'In Transit' | 'Completed';
export type RouteStatus = 'Pending' | 'In Progress' | 'Completed';
export type StopStatus = 'Pending' | 'Arrived' | 'Departed' | 'Delivered' | 'Failed';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export const ROLE_RANK: Record<Role, number> = { Owner: 4, Secretary: 3, Client: 2, Driver: 1 };
