'use client';

import { StatusPill, statusToneFor } from '@/components/StatusPill';

/**
 * Driver availability badge. Mirrors the truck: Available / On Trip / Standby (maintenance) / Unassigned.
 * Uses the shared tone map (Standby is neutral: the truck is out of service).
 * The parenthetical stays: it explains why, and the pill never truncates.
 */
export function DriverBadge({ availability }: { availability?: string }) {
  const label =
    availability === 'Standby' ? 'Standby (truck in maintenance)' :
    (availability ?? 'Unassigned');
  return (
    <StatusPill tone={statusToneFor(availability ?? 'Unassigned')} className="w-fit">
      {label}
    </StatusPill>
  );
}
