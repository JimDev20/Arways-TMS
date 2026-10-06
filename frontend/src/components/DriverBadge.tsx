'use client';

/** Driver availability badge. Mirrors the truck: Available / On Trip / Standby (maintenance) / Unassigned. */
export function DriverBadge({ availability }: { availability?: string }) {
  const style =
    availability === 'Available' ? 'bg-green-50 text-green-700' :
    availability === 'On Trip' ? 'bg-blue-50 text-blue-700' :
    availability === 'Standby' ? 'bg-amber-50 text-amber-700' :
    'bg-slate-100 text-slate-600';
  const label =
    availability === 'Standby' ? 'Standby (truck in maintenance)' :
    (availability ?? 'Unassigned');
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
