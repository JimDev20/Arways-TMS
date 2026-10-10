/**
 * Turns API / validation failures into specific, plain-language messages.
 * Every message names the exact field and the exact problem, plus the fix:
 * never a vague "something went wrong".
 *
 * Backend sources covered (verified against current backend/src):
 * - NestJS ValidationPipe: `message` is an ARRAY like
 *   ["email must be an email", "password must be longer than or equal to 8 characters"]
 * - auth.service.ts / guards: exact strings ('Invalid credentials', …)
 * - orders.controller.ts: 'Missing required fields', 'Truck not available',
 *   'Truck has no assigned driver', 'Rejection reason required'
 * - trucks.controller.ts / routes.controller.ts: 'Driver already linked to
 *   another truck', 'Route not found', 'Invalid status',
 *   'Proof-of-delivery photo required', 'Failure reason required'
 *
 * HCI feedback-form contract (Nielsen: error prevention first, then help
 * users recognize, diagnose, and recover). Every message below follows it:
 * WHAT happened (plain words, no codes or jargon) + WHY (which field,
 * which rule, in user terms) + HOW to fix (exactly one concrete action).
 * Polite, no blame ("re-type" never "you failed"). The caller must preserve
 * the user's input on failure (never clear the form).
 * Security boundary: server-side credential failures stay DELIBERATELY
 * generic (one message for unknown email, wrong password, inactive
 * account) so attackers cannot probe which emails exist. All specificity
 * about credentials lives in client-side validation and system-status
 * messages, which reveal nothing about any account.
 */

/** Field names as users see them in the forms. */
const FIELD_LABELS: Record<string, string> = {
  email: 'Email address',
  password: 'Password',
  fullName: 'Full name',
  role: 'Role',
  plateNumber: 'Plate number',
  truckType: 'Truck type',
  capacityKg: 'Capacity',
  assignedDriverId: 'Assigned driver',
  orderReference: 'Order reference',
  clientId: 'Client',
  truckId: 'Truck',
  scheduledDate: 'Scheduled date',
  scheduledTime: 'Scheduled time',
  specialInstructions: 'Special instructions',
  pickup: 'Pickup location',
  dropoffs: 'Drop-off locations',
  address: 'Address',
  reason: 'Rejection reason',
  status: 'Status',
};

function fieldLabel(property: string): string {
  if (FIELD_LABELS[property]) return FIELD_LABELS[property];
  const words = property.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Translates one class-validator constraint into a specific sentence. */
function explainConstraint(property: string, constraint: string): string {
  const field = fieldLabel(property);
  const c = constraint.toLowerCase();
  if (c.includes('must be an email')) {
    return `${field} is invalid. It must look like name@example.com. Check the spelling.`;
  }
  const minMatch = c.match(/longer than or equal to (\d+)/);
  if (minMatch) {
    return `${field} is too short. It needs at least ${minMatch[1]} characters.`;
  }
  if (c.includes('should not be empty') || c.includes('must not be empty')) {
    return `${field} is required. It is currently empty.`;
  }
  if (c.includes('must be one of the following values')) {
    const values = constraint.slice(constraint.indexOf(':') + 1).trim();
    return `${field} has an invalid value. Allowed values: ${values}.`;
  }
  if (c.includes('must be a number') || c.includes('must be a number conforming')) {
    return `${field} must be a number. Check for letters or symbols.`;
  }
  if (c.includes('must be a string')) {
    return `${field} must be text.`;
  }
  // Unknown constraint: still name the field, keep the raw detail.
  return `${field}: ${constraint.trim()}`;
}

/**
 * Splits one "property constraint…" string into [property, constraint].
 * class-validator format is always "<property> <constraint text>".
 */
function splitConstraint(item: string): [string, string] {
  const space = item.indexOf(' ');
  if (space === -1) return [item, 'is invalid'];
  return [item.slice(0, space), item.slice(space + 1)];
}

/** Exact backend strings → specific message naming the problem + fix. */
const EXACT: Record<string, string> = {
  'Invalid credentials':
    // Deliberately generic per the contract above: never split into
    // "email not found" vs "wrong password" (account enumeration). Instead
    // this names every check the user can run themselves.
    'Those details did not match an account together. Check three things: the email spelling (name@example.com, no extra spaces), Caps Lock (passwords are case-sensitive), and that you are using the newest password. Then try again.',
  'Missing token': 'You are not logged in. Please log in first.',
  'Invalid or expired token':
    'Your login expired. Please log out and log in again.',
  'Session expired. Please log in again.':
    'Your session expired. Please log in again.',
  'Too many attempts. Try again later.':
    'Too many login attempts (10 in 10 minutes). Wait 10 minutes, then try again.',
  'Email already in use':
    'Email address is already registered to another account. Use a different email, or find the existing account in the user list.',
  'Only Owner can create users':
    'Only an Owner account can create users. Ask an Owner to create this account.',
  'Insufficient role permission':
    'Your account role is not allowed to do this. Ask an Owner to change your role or do it for you.',
  'Supabase env not configured':
    'The server is missing its database setup. Contact the administrator.',
  'Missing required fields':
    'The order is missing required fields: order reference, truck, scheduled date, and pickup pin. Drop-off stores are optional and can be added later.',
  'Truck not available':
    'The selected truck is no longer Available (it may be In Use or in Maintenance). Pick a different truck from the list.',
  'Truck has no assigned driver':
    'The selected truck has no driver assigned, so no driver can be auto-assigned. Ask an Owner to assign a driver to that truck first.',
  'Driver already linked to another truck':
    'That driver is already assigned to a different truck (one truck = one driver). Pick another driver or unassign them first.',
  'Route not found':
    'That route does not exist (it may have been deleted). Refresh the page.',
  'Invalid status':
    'That status change is not allowed from the current status. Refresh to see the latest status.',
  'Proof-of-delivery photo required':
    'A proof-of-delivery photo is required to mark this stop Delivered. Attach the photo first.',
  'Waybill photo required':
    'A waybill/docs photo is required before leaving dispatch. Take a photo of the waybill first.',
  'No stores to add. Add at least one store with address and map pin.':
    'No stores to add. Add at least one store with an address and map pin first.',
  'Each store needs an address and a map pin (lon/lat).':
    'Each store needs an address and a map pin. Type the address and tap the map first.',
  'Failure reason required':
    'A reason is required when marking a stop Failed. Type the reason first.',
  'Rejection reason required':
    'A rejection reason is required. Type why the order is rejected first.',
  'New password must be 10–64 characters long.':
    'The new password must be 10–64 characters long. Type a longer passphrase and try again.',
};

/**
 * Live field checks for real-time validation as the user types (HCI: show
 * the rule before failure, not only after submit). These never reveal
 * whether an account exists; they only judge the shape of the input.
 */

/** True when the value looks like a complete email address. */
export function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Inline hint for an email field. Empty string means the current value is
 * fine (or the field is still empty, so there is nothing to judge yet).
 */
export function emailHint(value: string): string {
  if (!value) return '';
  if (!value.includes('@')) return 'Email must include @, like name@example.com.';
  if (!isEmailLike(value)) return 'Email looks incomplete. It must look like name@example.com.';
  return '';
}

/**
 * Inline hint for a password field with a minimum length.
 * Empty string means the current value already satisfies the rule.
 */
export function passwordHint(value: string, min = 10): string {
  if (!value) return `Use at least ${min} characters.`;
  if (value.length < min) return `${value.length}/${min} characters. Keep typing.`;
  return '';
}

/**
 * Login submit: the email shape is wrong. Fully client-side (no request is
 * sent), so it reveals nothing about any account. Names the exact problem
 * and the exact fix before the server is ever involved (error prevention).
 */
export function loginEmailShapeError(): string {
  return 'That email address looks incomplete. It must look like name@example.com. Fix the spelling, then try again.';
}

/**
 * Login password shorter than current policy. Guidance only, NEVER a
 * submit blocker: accounts created before the 10-character rule may have
 * shorter passwords, and blocking them would lock out real users. Names
 * the rule and the fix (slow, careful re-type).
 */
export function shortPasswordGuidance(length: number): string {
  return `Passwords are usually 10 or more characters (this entry has ${length}). Re-type it slowly to catch typos; passwords are case-sensitive.`;
}

/**
 * Caps Lock is on while typing a password. Event-driven and fully
 * client-side, so it reveals nothing about any account. This is the most
 * common invisible cause of "correct password rejected".
 */
export function capsLockWarning(): string {
  return 'Caps Lock is on. Passwords are case-sensitive, so turn Caps Lock off and re-type your password.';
}

export function friendlyErrorMessage(err: unknown): string {
  const raw = extractMessage(err);
  // Network failure (backend down, wrong API URL, CORS block): the browser
  // throws TypeError "Failed to fetch" with no status. Name the exact fix
  // instead of showing the raw browser text.
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return 'Cannot reach the server. Start the backend (`npm run start:dev` in `backend/`) and make sure it listens on http://localhost:4000/api, then try again.';
  }
  if (EXACT[raw]) return EXACT[raw];

  // Server-side schema drift (missing migration column): tell the user it is
  // a server setup issue, not their input.
  if (raw.startsWith('Database is missing column')) {
    return 'The server database is missing an update, so this action cannot complete right now. Contact the administrator (missing database migration). Your data is safe. Try again after the server is updated.';
  }

  // HTTP-status-only fallback: name what it means.
  const statusMatch = raw.match(/^Request failed \((\d+)\)\.?$/);
  if (statusMatch) {
    const code = statusMatch[1];
    if (code === '400') return 'The server rejected the data: a field is missing or invalid. Check each highlighted field and try again.';
    if (code === '401') return 'You are not logged in (or the session expired). Please log in again.';
    if (code === '403') return 'Your account role is not allowed to do this. Ask an Owner for help.';
    if (code === '404') return 'That record was not found. It may have been deleted. Refresh the page.';
    return `Request failed (${code}). If this keeps happening, contact the administrator.`;
  }
  if (/^Request failed \(\d+\)/.test(raw)) {
    return `${raw} If this keeps happening, contact the administrator.`;
  }
  return raw || 'Something went wrong. Please try again.';
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Something went wrong. Please try again.';
}

/**
 * Normalizes a NestJS error payload. Arrays (ValidationPipe) become one
 * specific sentence per failed field, joined so each problem is named.
 */
export function messageFromBody(body: unknown, status: number): string {
  const m = typeof body === 'object' && body !== null ? (body as { message?: unknown }).message : undefined;
  if (Array.isArray(m)) {
    const parts = m.map((item: string) => {
      const [property, constraint] = splitConstraint(String(item));
      return explainConstraint(property, constraint);
    });
    return parts.join(' ');
  }
  const text = m ?? `Request failed (${status})`;
  return friendlyErrorMessage(text);
}
