'use client';
import { Icons } from '@/lib/createLucideIcon';

/**
 * Inline field hint (HCI 1D: online instructions + specific errors).
 * - tone="hint": neutral guidance shown before failure (slate).
 * - tone="error": specific problem shown live or after submit (red, with icon).
 * Always paired with aria-describedby on its input.
 */
export function FieldHint({ id, tone, children }: { id: string; tone: 'hint' | 'error'; children: React.ReactNode }) {
  if (tone === 'error') {
    return (
      <p id={id} role="alert" className="flex items-center gap-1.5 text-xs text-red-600">
        <Icons.AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{children}</span>
      </p>
    );
  }
  return (
    <p id={id} className="text-xs text-slate-400">
      {children}
    </p>
  );
}
