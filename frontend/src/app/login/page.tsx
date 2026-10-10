'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/supabase';
import { capsLockWarning, emailHint, friendlyErrorMessage, isEmailLike, loginEmailShapeError, shortPasswordGuidance } from '@/lib/errors';
import { FieldHint } from '@/components/FieldHint';
import { errorMessage, homeFor, type LoginResponse, type Role } from '@/lib/types';
import { Icons } from '@/lib/createLucideIcon';
import { useStoredString, writeStoredString } from '@/lib/storage';

export default function LoginPage() {
  const router = useRouter();
  const remembered = useStoredString('arways_remember_email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  // Caps Lock state for the password field. Event-driven only: typing the
  // password never leaves the browser here, so this reveals nothing about
  // any account — it just names the most common invisible cause of a
  // rejected-but-correct password.
  const [capsOn, setCapsOn] = useState(false);

  // One-shot prefill from the remembered email (render-phase adjustment:
  // runs once when the stored value first arrives, no sync effect needed).
  if (!prefilled && remembered !== undefined) {
    setPrefilled(true);
    if (remembered) {
      setEmail(remembered);
      setRemember(true);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    if (!email.trim() || !password) {
      setBusy(false);
      setError('Enter your email and password to log in.');
      return;
    }
    // Client-side shape check first (HCI error prevention): a malformed
    // email can never match an account, so say so exactly — without sending
    // a request. Short passwords still submit (legacy accounts may predate
    // the 10-character rule); they get guidance under the field instead.
    if (!isEmailLike(email.trim())) {
      setBusy(false);
      setError(loginEmailShapeError());
      return;
    }
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<LoginResponse> & { message?: unknown };
      if (!res.ok) {
        const m = body.message;
        throw new Error(friendlyErrorMessage(Array.isArray(m) ? m.join(' ') : (m ?? 'Login failed.')));
      }
      if (!body.access_token || !body.user) {
        throw new Error('Login failed. Check your connection and try again.');
      }
      localStorage.setItem('arways_token', body.access_token);
      localStorage.setItem('arways_user', JSON.stringify(body.user));
      writeStoredString('arways_remember_email', remember ? email.trim() : null);
      router.replace(homeFor(body.user.role as Role));
    } catch (err: unknown) {
      // friendlyErrorMessage maps network failure ("Failed to fetch") to the
      // server-unreachable text, so a down backend never shows browser jargon.
      setError(friendlyErrorMessage(err) || errorMessage(err, 'Login failed. Check your connection and try again.'));
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[#0e7a70] shadow-lg shadow-[#0e7a70]/20">
            <Icons.Logo className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">ARWAYS TMS</h1>
          <p className="mt-2 text-sm text-slate-500">Transportation Management System</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-lg shadow-slate-200/50">
          <form onSubmit={submit} aria-label="Login" className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="email">Email</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Icons.User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  aria-describedby={emailHint(email) ? 'email-hint' : undefined}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-[#0e7a70] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0e7a70] transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {emailHint(email) && <FieldHint id="email-hint" tone="error">{emailHint(email)}</FieldHint>}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="password">Password</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Icons.Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  aria-describedby={[error ? 'login-error' : null, capsOn && password ? 'pw-caps' : null, password && password.length < 10 ? 'pw-len' : null].filter(Boolean).join(' ') || undefined}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:border-[#0e7a70] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0e7a70] transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => setCapsOn(e.getModifierState('CapsLock'))}
                  onKeyUp={(e) => setCapsOn(e.getModifierState('CapsLock'))}
                  onBlur={() => setCapsOn(false)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0e7a70] focus:ring-offset-1 rounded"
                >
                  {showPassword ? <Icons.EyeOff className="h-4 w-4" /> : <Icons.Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsOn && password.length > 0 && (
                <p id="pw-caps" role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {capsLockWarning()}
                </p>
              )}
              {password.length > 0 && password.length < 10 && (
                <FieldHint id="pw-len" tone="hint">{shortPasswordGuidance(password.length)}</FieldHint>
              )}
            </div>
            {error && (
              <div id="login-error" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2" role="alert">
                <Icons.AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <button
              disabled={busy}
              className="w-full rounded-lg bg-[#0e7a70] py-2.5 text-sm font-semibold text-white shadow-md shadow-[#0e7a70]/20 transition-all hover:bg-[#0b625a] hover:shadow-lg hover:shadow-[#0e7a70]/30 focus:outline-none focus:ring-2 focus:ring-[#0e7a70] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? 'Signing in…' : 'Login'}
            </button>
            <div className="flex items-center text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0e7a70] focus:ring-[#0e7a70]"
                />
                Remember me
              </label>
            </div>
            <p className="text-center text-sm text-slate-500">
              <a href="/forgot" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                Forgot Password?
              </a>
              <span className="mx-2 text-slate-300" aria-hidden>|</span>
              <a href="/onboarding" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                Request access
              </a>
            </p>
            <p className="text-center text-xs text-slate-400">Accounts are invite-only. Clients can request access; ARWAYS approves and sends an invite link.</p>
          </form>
        </div>
        <div className="mt-6 text-center text-xs text-slate-400">
          <p>© 2026 Arways Trucking</p>
        </div>
      </div>
    </main>
  );
}
