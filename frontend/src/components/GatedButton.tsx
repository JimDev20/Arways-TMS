'use client';
import type { ButtonHTMLAttributes } from 'react';

/**
 * Prerequisite-gated button (ARWAYS-UI-IMPROVEMENTS §3.4, Cloudscape [U10]).
 * Unlike native `disabled` (removed from the tab order), a gated button stays
 * focusable: `aria-disabled` plus `aria-describedby` pointing at the visible
 * reason. Native `disabled` is still used for transient busy states.
 *
 * Contract: every gated action MUST also guard inside its onClick handler,
 * so activating while gated explains instead of acting.
 */
export function GatedButton({
  gated,
  reasonId,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** True while a prerequisite is missing (photo, pins). Not for busy states. */
  gated?: boolean;
  /** DOM id of the visible reason shown next to the button. */
  reasonId?: string;
}) {
  const { onClick, className, 'aria-describedby': describedBy, ...rest } = props;
  return (
    <button
      {...rest}
      onClick={onClick}
      aria-disabled={gated || undefined}
      aria-describedby={gated && reasonId ? reasonId : describedBy}
      className={`${className ?? ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e7a70] focus-visible:ring-offset-1`}
    >
      {children}
    </button>
  );
}
