'use client';
import { useState } from 'react';
import { Shell, useSession } from '@/components/Shell';
import { Card } from '@/components/saas';
import { RolePermissionsMatrix } from '@/components/RolePermissionsMatrix';
import { useTheme } from '@/lib/theme';
import { useStoredString } from '@/lib/storage';
import { Icons } from '@/lib/createLucideIcon';

const DEFAULTS = {
  company: 'Arways Trucking',
  address: 'Tanza, Cavite',
  phone: '09171234567',
  email: 'info@arways.com',
  timezone: 'Asia/Manila',
  currency: 'PHP',
  mapCenter: '14.5995, 120.9842',
  zoom: '12',
};

const DEFAULT_NOTIF = {
  email: true,
  sms: false,
  inApp: true,
  push: true,
  kinds: ['new', 'approved', 'delivered', 'failed', 'arrived'] as string[],
};

interface StoredSettings {
  form: typeof DEFAULTS;
  notif: typeof DEFAULT_NOTIF;
}

function parseStoredSettings(raw: string | null | undefined): StoredSettings | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as { form?: unknown; notif?: unknown };
    const form = typeof p.form === 'object' && p.form !== null ? { ...DEFAULTS, ...(p.form as Partial<typeof DEFAULTS>) } : DEFAULTS;
    const notif = typeof p.notif === 'object' && p.notif !== null ? { ...DEFAULT_NOTIF, ...(p.notif as Partial<typeof DEFAULT_NOTIF>) } : DEFAULT_NOTIF;
    return { form, notif };
  } catch {
    return null;
  }
}

/** Wireframe 2.6: full system settings (Owner). Persisted locally; backend has no settings table yet. */
export default function OwnerSettingsPage() {
  const user = useSession();
  const { theme, set } = useTheme();
  const stored = useStoredString('arways_settings');
  const [form, setForm] = useState<typeof DEFAULTS>(() => parseStoredSettings(stored)?.form ?? DEFAULTS);
  const [notif, setNotif] = useState<typeof DEFAULT_NOTIF>(() => parseStoredSettings(stored)?.notif ?? DEFAULT_NOTIF);
  const [saved, setSaved] = useState('');

  function save() {
    try {
      localStorage.setItem('arways_settings', JSON.stringify({ form, notif }));
    } catch {
      /* ignore */
    }
    setSaved('Settings saved.');
    setTimeout(() => setSaved(''), 2500);
  }

  function toggleKind(k: string) {
    setNotif((n) => ({ ...n, kinds: n.kinds.includes(k) ? n.kinds.filter((x) => x !== k) : [...n.kinds, k] }));
  }

  const field = (k: keyof typeof DEFAULTS) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <Shell role="Owner" title="System Settings">
      <div className="grid max-w-3xl gap-6">
        <Card title="Company profile">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Company name<input className="field mt-1" {...field('company')} /></label>
            <label className="text-sm">Phone<input className="field mt-1" {...field('phone')} /></label>
            <label className="text-sm">Address<input className="field mt-1" {...field('address')} /></label>
            <label className="text-sm">Email<input className="field mt-1" {...field('email')} /></label>
          </div>
          <p className="mt-2 text-xs text-slate-400">Logo upload coming soon.</p>
        </Card>

        <Card title="System preferences">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Timezone<input className="field mt-1" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} /></label>
            <label className="text-sm">Currency<input className="field mt-1" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} /></label>
            <label className="text-sm">Map center<input className="field mt-1" {...field('mapCenter')} /></label>
            <label className="text-sm">Default zoom<input className="field mt-1" {...field('zoom')} /></label>
          </div>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Theme</span>
            <button onClick={() => set('light')} aria-pressed={theme === 'light'} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${theme === 'light' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200'}`}>
              <Icons.Sun className="h-4 w-4" />Light
            </button>
            <button onClick={() => set('dark')} aria-pressed={theme === 'dark'} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${theme === 'dark' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200'}`}>
              <Icons.Moon className="h-4 w-4" />Dark
            </button>
          </div>
        </Card>

        <Card title="Notifications">
          <div className="flex flex-wrap gap-4 text-sm">
            {([['email', 'Email notifications'], ['sms', 'SMS notifications'], ['inApp', 'In-app notifications'], ['push', 'Push notifications']] as const).map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={notif[k]} onChange={(e) => setNotif((n) => ({ ...n, [k]: e.target.checked }))} className="h-4 w-4 rounded" />
                {label}
              </label>
            ))}
          </div>
          <p className="mb-2 mt-4 text-sm font-medium">Notify on:</p>
          <div className="flex flex-wrap gap-2">
            {([['new', 'New order'], ['approved', 'Order approved'], ['delivered', 'Delivered'], ['failed', 'Failed delivery'], ['arrived', 'Driver arrived']] as const).map(([k, label]) => (
              <button key={k} onClick={() => toggleKind(k)} aria-pressed={notif.kinds.includes(k)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${notif.kinds.includes(k) ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>
                {notif.kinds.includes(k) && <Icons.Check className="h-3.5 w-3.5" />}{label}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Integrations">
          <ul className="space-y-2 text-sm">
            {[
              ['Google Maps links', 'Connected', true],
              ['Email (SMTP)', 'Connected', true],
              ['SMS Gateway', 'Not connected', false],
              ['Webhook', 'Not connected', false],
            ].map(([name, status, ok]) => (
              <li key={name as string} className="flex items-center justify-between gap-3">
                <span>{name}</span>
                <span className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 ${ok ? 'text-green-700' : 'text-slate-400'}`}>{ok === true && <Icons.CheckCircle className="h-3.5 w-3.5" />}{status}</span>
                  <button className="btn-ghost px-3 py-1 text-xs">Configure</button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">Maps use free Leaflet + OpenStreetMap; navigation opens Google Maps links. Paid keys are intentionally not required.</p>
        </Card>

        <Card title="Roles & Permissions">
          <RolePermissionsMatrix />
        </Card>

        <Card title="Signed-in account">
          {user ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-slate-500">Full name</dt><dd className="font-medium">{user.fullName}</dd>
              <dt className="text-slate-500">Email</dt><dd className="font-medium">{user.email}</dd>
              <dt className="text-slate-500">Role</dt><dd className="font-medium">{user.role}</dd>
            </dl>
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
        </Card>

        <div className="flex items-center gap-3">
          <button onClick={save} className="btn-primary">Save settings</button>
          <button onClick={() => { setForm(DEFAULTS); setSaved('Reset to defaults. Press Save to keep.'); }} className="btn-ghost text-sm">Reset to default</button>
          {saved && <span role="status" className="text-sm text-green-700">{saved}</span>}
        </div>
      </div>
    </Shell>
  );
}
