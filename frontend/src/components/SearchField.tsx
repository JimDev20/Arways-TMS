'use client';
import { useRef } from 'react';
import { Icons } from '@/lib/createLucideIcon';

/**
 * Accessible search field (ARWAYS-UI-IMPROVEMENTS §3.8, Carbon Search [U4]).
 * - Wrapper `role="search"`; input is `type="search"` (searchbox role).
 * - Label names what is searched (passed as `label`).
 * - Clear button labelled `Clear search` appears once typing starts and is
 *   the next tab stop after the input; `Esc` also clears.
 * - Callers announce outcomes (`12 of 30`, zero-result text) with
 *   `role="status"` next to the field.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  withIcon = true,
  inputClassName = '',
  className = '',
  id,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Names what is searched, e.g. "Search orders". */
  label: string;
  withIcon?: boolean;
  inputClassName?: string;
  className?: string;
  id?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function clear() {
    onChange('');
    inputRef.current?.focus();
  }
  return (
    <div role="search" className={className}>
      <div className="relative">
        {withIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3" aria-hidden>
            <Icons.Search className="h-4 w-4 text-slate-400" />
          </div>
        )}
        <input
          ref={inputRef}
          id={id}
          type="search"
          role="searchbox"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && value) {
              e.stopPropagation();
              clear();
            }
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          aria-label={label}
          className={inputClassName}
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0e7a70] rounded"
          >
            <Icons.X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
