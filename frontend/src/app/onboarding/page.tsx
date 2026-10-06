'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { homeFor, type Role } from '@/lib/types';
import { Icons } from '@/lib/createLucideIcon';
import { FieldHint } from '@/components/FieldHint';

function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function phoneHint(value: string): string {
  const digits = phoneDigits(value);
  if (!digits) return 'Use 11 digits starting with 09, like 09171234567.';
  if (digits.length < 11) return `${digits.length}/11 digits. Keep typing.`;
  if (!digits.startsWith('09')) return 'Mobile numbers start with 09. Check the first two digits.';
  return '';
}

/**
 * Wireframe 1.3: Onboarding wizard (first-time users).
 * 3 steps: Profile → Preferences → Done. Persisted to localStorage so every
 * portal can skip re-onboarding; profile name syncs into the session user.
 */
const STEPS = ['Complete your profile', 'Preferences', 'Done'] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [theme, setTheme] = useState('light');
  const [error, setError] = useState('');

  function next() {
    setError('');
    if (step === 0) {
      if (!fullName.trim()) {
        setError('Full name is empty. Type your name as it should appear to dispatch.');
        return;
      }
      const digits = phoneDigits(phone);
      if (!digits) {
        setError('Phone number is empty. Type the 11-digit mobile number dispatch can reach.');
        return;
      }
      if (digits.length < 7) {
        setError(`Phone number has only ${digits.length} digits. Type at least 7 digits so dispatch can reach you.`);
        return;
      }
      if (!agree) {
        setError('Please agree to the Terms of Service to continue.');
        return;
      }
    }
    setStep((s) => Math.min(s + 1, 2));
  }

  function finish() {
    try {
      localStorage.setItem('arways_onboarded', '1');
      localStorage.setItem('arways_theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      const raw = localStorage.getItem('arways_user');
      if (raw) {
        const u = JSON.parse(raw);
        if (!u.fullName || u.fullName === 'New User') {
          u.fullName = fullName.trim();
          localStorage.setItem('arways_user', JSON.stringify(u));
        }
        router.replace(homeFor(u.role as Role));
        return;
      }
    } catch {
      /* storage unavailable: still continue */
    }
    router.replace('/login');
  }

  const pct = step === 0 ? 33 : step === 1 ? 66 : 100;
  const ph = phoneHint(phone);
  const phTone = phone && ph ? 'error' : 'hint';

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Welcome to ARWAYS TMS</h1>
          <p className="mt-1 text-sm text-slate-500">Step {step + 1} of 3: {STEPS[step]}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-slate-800 dark:bg-slate-900">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="ob-name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Full name</label>
                <input id="ob-name" className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Cruz" />
              </div>
              <div>
                <label htmlFor="ob-phone" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone number</label>
                <input id="ob-phone" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09171234567" inputMode="tel" aria-describedby={ph ? 'ob-phone-hint' : undefined} />
                {ph ? <div className="mt-1"><FieldHint id="ob-phone-hint" tone={phTone}>{ph}</FieldHint></div> : null}
              </div>
              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Profile photo</span>
                <p className="text-sm text-slate-400">Photo upload coming soon. Your initials are used for now.</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                I agree to the Terms of Service
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Theme</span>
                <div className="flex gap-2">
                  {(['light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      aria-pressed={theme === t}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium capitalize ${theme === t ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                    >
                      {t === 'light' ? <Icons.Sun className="h-4 w-4" /> : <Icons.Moon className="h-4 w-4" />}{t}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-slate-500">Notifications are on by default. You can tune them later in Settings.</p>
            </div>
          )}
          {step === 2 && (
            <div className="py-4 text-center">
              <Icons.CheckCircle className="mx-auto h-10 w-10 text-green-600" />
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">You are all set{fullName ? `, ${fullName.split(' ')[0]}` : ''}. Your workspace is ready.</p>
            </div>
          )}

          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="mt-6 flex gap-3">
            {step > 0 && step < 2 && (
              <button onClick={() => setStep((s) => s - 1)} className="btn-ghost flex-1 text-sm font-medium">Back</button>
            )}
            {step < 2 ? (
              <button onClick={next} className="btn-primary flex-1">Next</button>
            ) : (
              <button onClick={finish} className="btn-primary flex-1">Go to dashboard</button>
            )}
          </div>
          <div className="mt-4" aria-hidden>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-400">Progress: {pct}%</p>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400"><Link href="/login" className="hover:underline">Back to login</Link></p>
      </div>
    </main>
  );
}
