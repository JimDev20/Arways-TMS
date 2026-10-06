'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type UserRow } from '@/lib/types';
import { emailHint, isEmailLike, passwordHint } from '@/lib/errors';
import { FieldHint } from '@/components/FieldHint';

const ROLE_FILTERS = ['All', 'Owner', 'Secretary', 'Client', 'Driver'];

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ email: '', password: '', fullName: '', role: 'Driver' });
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [resetId, setResetId] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState('');

  async function reload() {
    setUsers(await api<UserRow[]>('/users'));
  }
  useEffect(() => {
    api<UserRow[]>('/users').then(setUsers).catch(() => {});
  }, []);

  const filtered = users.filter((u) => {
    if (roleFilter !== 'All' && u.role !== roleFilter) return false;
    if (q) {
      const hay = `${u.fullName} ${u.email}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setOkMsg('');
    if (!form.fullName.trim()) { setErr('Enter the member\u2019s full name.'); return; }
    if (!form.email.trim()) { setErr('Enter the member\u2019s email address.'); return; }
    if (!isEmailLike(form.email)) { setErr(`“${form.email.trim()}” does not look like an email. It must look like name@example.com.`); return; }
    if (form.password.length < 8) { setErr(`Password is ${form.password.length}/8 characters. Type at least 8 characters.`); return; }
    setBusy(true);
    try {
      const created = await api<{ userId: string; email: string; fullName: string; role: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ ...form, email: form.email.trim(), fullName: form.fullName.trim() }),
      });
      await reload();
      setOkMsg(`${created.fullName} (${created.email}) was added as ${created.role}. They can now log in.`);
      setForm({ email: '', password: '', fullName: '', role: 'Driver' });
    } catch (e: unknown) {
      setErr(errorMessage(e, 'Could not create the user. Try again.'));
    }
    finally { setBusy(false); }
  }

  async function toggleStatus(u: UserRow) {
    // Destructive actions need friction (HCI): deactivation locks a member
    // out, so it takes two clicks. Reactivation stays one click.
    if (u.status === 'Active' && confirmDeactivateId !== u.userId) {
      setErr(''); setOkMsg('');
      setConfirmDeactivateId(u.userId);
      return;
    }
    setErr(''); setOkMsg('');
    setConfirmDeactivateId('');
    const next = u.status === 'Active' ? 'Inactive' : 'Active';
    setBusy(true);
    try {
      await api(`/users/${u.userId}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      await reload();
      setOkMsg(`${u.fullName} is now ${next}. ${next === 'Inactive' ? 'They can no longer log in.' : 'They can log in again.'}`);
    } catch (e: unknown) {
      setErr(errorMessage(e, 'Could not change the status. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setOkMsg('');
    const target = users.find((u) => u.userId === resetId);
    if (!target) { setErr('Pick a team member first.'); return; }
    if (newPw.length < 8) { setErr(`The new password for ${target.email} must be at least 8 characters long.`); return; }
    setBusy(true);
    try {
      await api(`/users/${target.userId}/password`, { method: 'PATCH', body: JSON.stringify({ password: newPw }) });
      setOkMsg(`Password for ${target.email} was reset. Share the new password with them securely.`);
      setResetId(''); setNewPw('');
    } catch (e: unknown) {
      setErr(errorMessage(e, 'Could not reset the password. Try again.'));
    }
    finally { setBusy(false); }
  }

  return (
    <Shell role="Owner" title="User Management">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icons.Users className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {filtered.length} of {users.length} members
        </span>
      </div>

      {/* Search + filter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Icons.Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            className="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
            placeholder="Search name or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
          {ROLE_FILTERS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      {/* Users Table */}
      <div className="rounded-xl bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Icons.Users className="h-5 w-5 text-slate-400" />
            <h3 className="text-base font-semibold text-slate-900">User List</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Name</th>
                <th className="px-6 py-3 font-semibold">Email</th>
                <th className="px-6 py-3 font-semibold">Role</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => (
                <tr key={u.userId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-900">{u.fullName}</td>
                  <td className="px-6 py-3 text-slate-600">{u.email}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      u.role === 'Owner' ? 'bg-amber-50 text-amber-700' :
                      u.role === 'Secretary' ? 'bg-blue-50 text-blue-700' :
                      u.role === 'Client' ? 'bg-purple-50 text-purple-700' :
                      u.role === 'Driver' ? 'bg-green-50 text-green-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      u.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {u.status ?? 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => toggleStatus(u)}
                      disabled={busy}
                      aria-label={u.status === 'Active'
                        ? (confirmDeactivateId === u.userId ? `Click again to confirm deactivating ${u.fullName}` : `Deactivate ${u.fullName}`)
                        : `Activate ${u.fullName}`}
                      className={`mr-3 font-medium disabled:opacity-60 ${u.status === 'Active' && confirmDeactivateId === u.userId ? 'text-red-600 hover:text-red-700' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      {u.status === 'Active' ? (confirmDeactivateId === u.userId ? 'Confirm deactivate?' : 'Deactivate') : 'Activate'}
                    </button>
                    <button onClick={() => { setResetId(u.userId); setNewPw(''); setErr(''); setOkMsg(''); }} disabled={busy} className="font-medium text-[#f5a623] hover:underline disabled:opacity-60">
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <p>No users match. Try a different search or filter.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Form */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Icons.UserPlus className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">Add Team Member</h2>
        </div>
        {err && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2" role="alert">
            <Icons.AlertCircle className="h-5 w-5 shrink-0" />
            {err}
          </div>
        )}
        {okMsg && (
          <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2" role="status">
            <Icons.CheckCircle className="h-5 w-5 shrink-0" />
            {okMsg}
          </div>
        )}
        <form onSubmit={create} className="grid gap-4 max-w-lg">
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="new-user-name">Full Name *</label>
            <input id="new-user-name"
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
              placeholder="John Doe"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="new-user-email">Email *</label>
            <input id="new-user-email"
              type="email"
              aria-describedby={emailHint(form.email) ? 'new-user-email-hint' : undefined}
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
              placeholder="john@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            {emailHint(form.email) && <FieldHint id="new-user-email-hint" tone="error">{emailHint(form.email)}</FieldHint>}
          </div>
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="new-user-password">Password (min 8 characters) *</label>
            <div className="relative">
              <input
                id="new-user-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                aria-describedby="new-user-password-hint"
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 pr-11 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#f5a623] focus:ring-offset-1 rounded"
              >
                {showPassword ? <Icons.EyeOff className="h-4 w-4" /> : <Icons.Eye className="h-4 w-4" />}
              </button>
            </div>
            <FieldHint id="new-user-password-hint" tone={form.password && form.password.length < 8 ? 'error' : 'hint'}>
              {form.password ? (passwordHint(form.password) || 'Meets the 8-character rule.') : 'Use at least 8 characters. Share it with the new member so they can log in.'}
            </FieldHint>
          </div>
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="new-user-role">Role</label>
            <select id="new-user-role"
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="Owner">Owner (Admin)</option>
              <option value="Secretary">Secretary</option>
              <option value="Client">Client</option>
              <option value="Driver">Driver</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[#f5a623] py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#e69b1e] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? 'Creating…' : 'Create User'}
          </button>
        </form>
      </div>

      {/* Reset password */}
      {resetId && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Icons.Lock className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">
              Reset password: {users.find((u) => u.userId === resetId)?.email}
            </h2>
          </div>
          <form onSubmit={resetPassword} className="grid gap-4 max-w-lg">
            <div className="grid gap-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="reset-pw">New password (min 8 characters) *</label>
              <div className="relative">
                <input id="reset-pw"
                  type={showNewPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  aria-describedby="reset-pw-hint"
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 pr-11 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
                  placeholder="••••••••"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required minLength={8}
                />
                <FieldHint id="reset-pw-hint" tone={newPw && newPw.length < 8 ? 'error' : 'hint'}>
                  {newPw ? (passwordHint(newPw) || 'Meets the 8-character rule.') : 'Use at least 8 characters. The member logs in with this password next time.'}
                </FieldHint>
                <button type="button" onClick={() => setShowNewPw((v) => !v)}
                  aria-label={showNewPw ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-700 focus:outline-none">
                  {showNewPw ? <Icons.EyeOff className="h-4 w-4" /> : <Icons.Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-400">The member logs in with this password next time. Share it with them securely.</p>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy}
                className="rounded-lg bg-[#f5a623] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e69b1e] disabled:opacity-60">
                {busy ? 'Resetting…' : 'Reset Password'}
              </button>
              <button type="button" onClick={() => { setResetId(''); setNewPw(''); }}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

    </Shell>
  );
}
