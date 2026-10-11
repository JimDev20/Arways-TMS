'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type ClientRow } from '@/lib/types';
import { emailHint, isEmailLike } from '@/lib/errors';
import { FieldHint, FormErrorBanner, type FormErrorItem } from '@/components/FieldHint';
import { SearchField } from '@/components/SearchField';

const EMPTY = { companyName: '', contactPerson: '', phone: '', email: '', dispatchAreaAddress: '', lon: '', lat: '', entranceInstructions: '', dispatcherContact: '' };

export default function OwnerClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FormErrorItem[]>([]);
  const fieldErr = (id: string) => fieldErrors.find((e) => e.fieldId === id)?.message;
  const [emailTouched, setEmailTouched] = useState(false);

  async function reload() {
    setClients(await api<ClientRow[]>('/clients'));
  }
  useEffect(() => {
    api<ClientRow[]>('/clients').then(setClients).catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setOkMsg(''); setEmailTouched(true);
    const problems: FormErrorItem[] = [];
    if (!form.companyName.trim()) problems.push({ fieldId: 'client-company', message: 'Company name is empty. Type the client company name.' });
    if (!form.email.trim()) problems.push({ fieldId: 'client-email', message: 'Email is empty. Type the client contact email.' });
    else if (!isEmailLike(form.email)) problems.push({ fieldId: 'client-email', message: `“${form.email.trim()}” does not look like an email. It must look like name@example.com.` });
    if (!form.dispatchAreaAddress.trim()) problems.push({ fieldId: 'client-address', message: 'Dispatch area address is empty. Type where trucks should go.' });
    const lon = Number(form.lon), lat = Number(form.lat);
    if (!form.lon.trim() || !form.lat.trim()) problems.push({ fieldId: 'client-lon', message: 'Coordinates are empty. Type the longitude and latitude where trucks should go.' });
    else if (!Number.isFinite(lon) || !Number.isFinite(lat)) problems.push({ fieldId: 'client-lon', message: 'Coordinates are not numbers. Type numeric longitude and latitude, e.g. 121.0437, 14.6760.' });
    else {
      if (lon < -180 || lon > 180) problems.push({ fieldId: 'client-lon', message: `Longitude ${form.lon.trim()} is out of range. It must be between -180 and 180.` });
      if (lat < -90 || lat > 90) problems.push({ fieldId: 'client-lat', message: `Latitude ${form.lat.trim()} is out of range. It must be between -90 and 90.` });
    }
    setFieldErrors(problems);
    if (problems.length > 0) return;
    setBusy(true);
    try {
      await api('/clients', {
        method: 'POST',
        body: JSON.stringify({
          companyName: form.companyName.trim(), contactPerson: form.contactPerson.trim(), phone: form.phone.trim(),
          email: form.email.trim(), dispatchAreaAddress: form.dispatchAreaAddress.trim(), lon, lat,
          entranceInstructions: form.entranceInstructions.trim() || null, dispatcherContact: form.dispatcherContact.trim() || null,
        }),
      });
      await reload();
      setOkMsg(`${form.companyName.trim()} was added as a client.`);
      setForm(EMPTY);
      setFieldErrors([]);
    } catch (e: unknown) {
      setErr(errorMessage(e, 'Could not add the client. Check that the email is not already used, then try again.'));
    }
    finally { setBusy(false); }
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const input = 'block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]';

  const [q, setQ] = useState('');
  const filtered = clients.filter((c) =>
    !q.trim() ||
    `${c.companyName} ${c.contactPerson} ${c.email} ${c.dispatchAreaAddress}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <Shell role="Owner" title="Clients">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search company, contact, email…"
          label="Search clients"
          className="flex-1 min-w-52"
          inputClassName="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-9 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
        />
        <span className="text-xs text-slate-500" role="status">{filtered.length} of {clients.length}</span>
      </div>
      <div className="rounded-xl bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Client Companies ({clients.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Company</th>
                <th className="px-6 py-3 font-semibold">Contact</th>
                <th className="px-6 py-3 font-semibold">Email</th>
                <th className="px-6 py-3 font-semibold">Dispatch Area</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.clientId} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-900">{c.companyName}</td>
                  <td className="px-6 py-3 text-slate-600">{c.contactPerson} · {c.phone}</td>
                  <td className="px-6 py-3 text-slate-600">{c.email}</td>
                  <td className="px-6 py-3 text-slate-600">{c.dispatchAreaAddress}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                  <p>{clients.length === 0 ? 'No clients yet. Add the first one below.' : 'No clients match. Try a different search.'}</p>
                  {clients.length > 0 && (
                    <button onClick={() => setQ('')} className="btn-ghost mt-3 text-sm">Clear filter</button>
                  )}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Add Client Company</h2>
        {okMsg && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2" role="status"><Icons.CheckCircle className="h-5 w-5 shrink-0" />{okMsg}</div>}
        <FormErrorBanner errors={fieldErrors} />
        <form onSubmit={create} className="grid gap-4 max-w-lg">
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="client-company">Company Name *</label>
            <input id="client-company" aria-describedby={fieldErr('client-company') ? 'client-company-error' : undefined} className={input} value={form.companyName} onChange={set('companyName')} required placeholder="Jollibee Foods" />
            {fieldErr('client-company') && <FieldHint id="client-company-error" tone="error">{fieldErr('client-company')}</FieldHint>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="block text-sm font-medium text-slate-700">Contact Person</label>
              <input className={input} value={form.contactPerson} onChange={set('contactPerson')} placeholder="Juan Dela Cruz" />
            </div>
            <div className="grid gap-2">
              <label className="block text-sm font-medium text-slate-700">Phone</label>
              <input className={input} value={form.phone} onChange={set('phone')} placeholder="09171234567" />
            </div>
          </div>
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="client-email">Email *</label>
            <input id="client-email" type="email" aria-describedby={(fieldErr('client-email') || (emailTouched && emailHint(form.email))) ? 'client-email-hint' : undefined} className={input} value={form.email} onChange={set('email')} onBlur={() => setEmailTouched(true)} required placeholder="dispatch@company.com" />
            {(fieldErr('client-email') || (emailTouched && emailHint(form.email))) && <FieldHint id="client-email-hint" tone="error">{fieldErr('client-email') || emailHint(form.email)}</FieldHint>}
          </div>
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="client-address">Dispatch Area Address *</label>
            <input id="client-address" aria-describedby={fieldErr('client-address') ? 'client-address-error' : undefined} className={input} value={form.dispatchAreaAddress} onChange={set('dispatchAreaAddress')} required placeholder="Commissary, Quirino Highway, QC" />
            {fieldErr('client-address') && <FieldHint id="client-address-error" tone="error">{fieldErr('client-address')}</FieldHint>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="client-lon">Longitude *</label>
              <input id="client-lon" aria-describedby={fieldErr('client-lon') ? 'client-lon-error' : undefined} className={input} value={form.lon} onChange={set('lon')} required placeholder="121.0437" inputMode="decimal" />
            </div>
            <div className="grid gap-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="client-lat">Latitude *</label>
              <input id="client-lat" aria-describedby={fieldErr('client-lat') ? 'client-lat-error' : undefined} className={input} value={form.lat} onChange={set('lat')} required placeholder="14.6760" inputMode="decimal" />
            </div>
          </div>
          {fieldErr('client-lon') && <FieldHint id="client-lon-error" tone="error">{fieldErr('client-lon')}</FieldHint>}
          {fieldErr('client-lat') && <FieldHint id="client-lat-error" tone="error">{fieldErr('client-lat')}</FieldHint>}
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700">Entrance Instructions</label>
            <textarea className={input} rows={2} value={form.entranceInstructions} onChange={set('entranceInstructions')} placeholder="Use Gate 3, wait at Loading Bay 5" />
          </div>
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700">Dispatcher Contact</label>
            <input className={input} value={form.dispatcherContact} onChange={set('dispatcherContact')} placeholder="Pedro Santos 09181234567" />
          </div>
          {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2" role="alert"><Icons.AlertCircle className="h-5 w-5 shrink-0" />{err}</div>}
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-[#0e7a70] py-2.5 text-sm font-semibold text-white hover:bg-[#0b625a] disabled:opacity-60 disabled:cursor-not-allowed">
            {busy ? 'Adding…' : 'Add Client'}
          </button>
        </form>
      </div>
    </Shell>
  );
}
