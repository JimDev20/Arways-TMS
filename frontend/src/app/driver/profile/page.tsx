'use client';
import { useRouter } from 'next/navigation';
import { Shell, useSession } from '@/components/Shell';
import { Card } from '@/components/saas';
import { useTheme } from '@/lib/theme';
import { Icons } from '@/lib/createLucideIcon';

/**
 * Driver Profile tab (Feature Placement). Account, theme, language note,
 * password (via Owner until F1), devices/sign-out, support contact.
 */
export default function DriverProfilePage() {
  const user = useSession();
  const router = useRouter();
  const { theme, set } = useTheme();

  function logout() {
    localStorage.removeItem('arways_token');
    localStorage.removeItem('arways_user');
    router.replace('/login');
  }

  return (
    <Shell role="Driver" title="Profile">
      <div className="grid max-w-2xl gap-6">
        <Card title="Account">
          {user ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-slate-500">Full name</dt><dd className="font-medium">{user.fullName}</dd>
              <dt className="text-slate-500">Email</dt><dd className="font-medium">{user.email}</dd>
              <dt className="text-slate-500">Role</dt><dd className="font-medium">{user.role}</dd>
            </dl>
          ) : <p className="text-sm text-slate-400">Loading…</p>}
          <p className="mt-3 text-xs text-slate-400">Password changes go through your Owner or Secretary until email reset (F1) ships. Language: English today; Filipino driver screens are planned.</p>
        </Card>
        <Card title="Theme">
          <div className="flex gap-2">
            <button onClick={() => set('light')} aria-pressed={theme === 'light'} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${theme === 'light' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200'}`}>
              <Icons.Sun className="h-4 w-4" />Light
            </button>
            <button onClick={() => set('dark')} aria-pressed={theme === 'dark'} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${theme === 'dark' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200'}`}>
              <Icons.Moon className="h-4 w-4" />Dark
            </button>
          </div>
        </Card>
        <Card title="Support">
          <div className="flex flex-wrap gap-3">
            <a href="tel:+639171234567" className="btn-ghost inline-flex items-center gap-2 text-sm"><Icons.Phone className="h-4 w-4" />Call Secretary</a>
            <a href="mailto:support@arways.com" className="btn-ghost inline-flex items-center gap-2 text-sm"><Icons.Mail className="h-4 w-4" />Email support</a>
          </div>
        </Card>
        <button onClick={logout} className="btn-ghost w-fit text-sm">Sign out</button>
      </div>
    </Shell>
  );
}
