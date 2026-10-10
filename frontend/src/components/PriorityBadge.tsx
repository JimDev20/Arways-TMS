'use client';
import type { OrderPriority } from '@/lib/types';

const TONES: Record<OrderPriority, string> = {
  Normal: 'bg-slate-100 text-slate-600',
  Urgent: 'bg-amber-50 text-amber-700',
  Rush: 'bg-red-50 text-red-700',
};

/** PRD 5.6: order priority badge (Normal / Urgent / Rush). */
export function PriorityBadge({ priority }: { priority: OrderPriority | string | null | undefined }) {
  const p = (priority ?? 'Normal') as OrderPriority;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONES[p] ?? TONES.Normal}`}>
      {p}
    </span>
  );
}
