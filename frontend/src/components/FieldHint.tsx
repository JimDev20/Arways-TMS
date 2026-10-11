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

/** One entry in a form-level error banner: links to its field, same wording inline. */
export interface FormErrorItem {
  /** DOM id of the field the error belongs to (banner link target). */
  fieldId: string;
  /** Full sentence naming the field, identical to the inline error. */
  message: string;
}

/**
 * Form-level error banner (GOV.UK error summary + DHL GlobalValidation).
 * One line per problem, each linking to its field. Mounts only when there
 * are errors and moves focus to itself so screen readers announce it.
 */
export function FormErrorBanner({ errors }: { errors: FormErrorItem[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert" tabIndex={-1} autoFocus>
      <p className="font-semibold">
        {errors.length === 1 ? 'There is a problem with this form.' : `There are ${errors.length} problems with this form.`}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a href={`#${e.fieldId}`} className="underline hover:no-underline">{e.message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
