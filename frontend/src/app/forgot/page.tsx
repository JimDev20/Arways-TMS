'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Icons } from '@/lib/createLucideIcon';
import { emailHint, isEmailLike } from '@/lib/errors';
import { FieldHint } from '@/components/FieldHint';

/**
 * Wireframe 1.2: Forgot password.
 * Backend email reset is a FUTURE_PLAN item (no endpoint yet), so this page
 * collects the email, explains the Owner-assisted flow, and never reveals
 * whether the email exists.
 */
export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Shape check only: never reveal whether the address exists.
    if (!isEmailLike(email)) {
      setError('That email does not look complete. It must look like name@example.com.');
      return;
    }
    setError('');
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Reset password</h1>
          <p className="mt-2 text-sm text-slate-500">Email reset is not live yet (F1). Enter your email to check the format, then ask your Owner for a reset link.</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-slate-800 dark:bg-slate-900">
          {sent ? (
            <div role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
              Email reset is not live yet, so no link was sent. Ask your Owner to reset it from Users &gt; Reset password (they will send you a one-time link).
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email address</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  aria-describedby="forgot-email-hint"
                  className="field"
                  placeholder="you@company.com"
                />
                {emailHint(email) && <div className="mt-1"><FieldHint id="forgot-email-hint" tone="error">{emailHint(email)}</FieldHint></div>}
              </div>
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button className="btn-primary w-full" type="submit">Send reset link</button>
            </form>
          )}
          <Link href="/login" className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">
            Back to login
          </Link>
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Icons.Lock className="h-3.5 w-3.5" /> Contact your Owner for urgent account recovery.
        </p>
      </div>
    </main>
  );
}
