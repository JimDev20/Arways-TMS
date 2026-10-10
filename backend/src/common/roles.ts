// Central TypeScript types shared conceptually with frontend (see frontend/src/lib/types.ts).
export type Role = 'Owner' | 'Secretary' | 'Client' | 'Driver';
export type UserStatus = 'Active' | 'Inactive';
export type TruckType = 'Refrigerated' | 'Dry';
export type TruckStatus = 'Available' | 'In Use' | 'Maintenance';
export type OrderStatus = 'Pending' | 'Approved' | 'Rejected' | 'In Transit' | 'Completed' | 'Cancelled';
export type RouteStatus = 'Pending' | 'In Progress' | 'Completed' | 'Cancelled';
export type StopStatus = 'Pending' | 'Arrived' | 'Departed' | 'Delivered' | 'Failed';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

// NOTE (roadmap #9): ROLE_RANK deleted. Guard uses exact @Roles() matching —
// no hierarchy. Owner does not imply Secretary; each endpoint lists its roles.
