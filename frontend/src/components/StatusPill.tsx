'use client';

/**
 * One shared status pill (ARWAYS-UI-IMPROVEMENTS §3.1, Atlassian Lozenge [U1]).
 * Screens pass a meaning (status string or explicit tone), never a colour,
 * so every state renders the same tone everywhere. Colour is always paired
 * with text plus a dot indicator, never colour alone [U15]. Status tones
 * never use the brand teal, so a pill is never read as a primary action.
 */
export type StatusTone = 'success' | 'warning' | 'information' | 'danger' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  information: 'bg-blue-50 text-blue-700',
  danger: 'bg-red-50 text-red-700',
  neutral: 'bg-slate-100 text-slate-600',
};

/** ARWAYS state string → tone (§3.1 tone map). Unknown strings render neutral. */
export function statusToneFor(value: string | null | undefined): StatusTone {
  switch (value) {
    case 'Delivered':
    case 'Completed':
    case 'Available':
    case 'Approved':
    case 'Active':
      return 'success';
    case 'Pending':
      return 'warning';
    case 'Assigned':
    case 'In Transit':
    case 'In Progress':
    case 'Arrived':
    case 'Departed':
    case 'On Trip':
      return 'information';
    case 'Failed':
    case 'Rejected':
      return 'danger';
    case 'Cancelled':
    case 'Inactive':
    case 'Maintenance':
    case 'Standby':
    case 'Unassigned':
    default:
      return 'neutral';
  }
}

export function StatusPill({
  status,
  tone,
  children,
  className = '',
}: {
  status?: string | null;
  tone?: StatusTone;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = tone ?? statusToneFor(status ?? undefined);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[t]} ${className}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden />
      {children ?? status}
    </span>
  );
}
