'use client';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type Order, type ReportSummary, type UserRow } from '@/lib/types';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthAgo() { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }

export default function ReportsPage() {
  return <Reports role="Owner" />;
}

export function Reports({ role }: { role: 'Owner' | 'Secretary' }) {
  const [data, setData] = useState<ReportSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [byDriver, setByDriver] = useState<Record<string, number>>({});
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    const qs = `?from=${from}&to=${to}`;
    // /users is Owner-only: secretaries skip it and fall back to short ids
    // in the driver chart (nameOf handles missing entries). Fetching it
    // anyway would 403 and fail the whole Promise.all below.
    const usersReq = role === 'Owner'
      ? api<UserRow[]>('/users')
      : Promise.resolve([] as UserRow[]);
    Promise.all([
      api<ReportSummary>(`/reports/summary${qs}`),
      api<Order[]>('/orders'),
      usersReq,
      api<Record<string, number>>('/reports/by-driver'),
    ]).then(([s, o, u, bd]) => {
      setData(s);
      setOrders(o);
      setUsers(u);
      setByDriver(bd);
    }).catch((e: unknown) => {
      setErr(errorMessage(e, 'Could not load report data.'));
    }).finally(() => setLoading(false));
  }, [from, to, role]);
  useEffect(() => {
    const qs = `?from=${from}&to=${to}`;
    const usersReq = role === 'Owner'
      ? api<UserRow[]>('/users')
      : Promise.resolve([] as UserRow[]);
    Promise.all([
      api<ReportSummary>(`/reports/summary${qs}`),
      api<Order[]>('/orders'),
      usersReq,
      api<Record<string, number>>('/reports/by-driver'),
    ]).then(([s, o, u, bd]) => {
      setData(s);
      setOrders(o);
      setUsers(u);
      setByDriver(bd);
    }).catch((e: unknown) => {
      setErr(errorMessage(e, 'Could not load report data.'));
    }).finally(() => setLoading(false));
  }, [from, to, role]);

  function exportPDF() {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      doc.text('Arways TMS: Delivery Summary', 10, 15);
      doc.text(`Period: ${from} to ${to}`, 10, 22);
      doc.text(`Total: ${data?.total ?? 0}  Delivered: ${data?.delivered ?? 0} (${data?.deliveryRatePct ?? 0}%)  Failed: ${data?.failed ?? 0}`, 10, 29);
      doc.text(`On-time: ${data?.onTimePct ?? 0}% (judged ${data?.onTimeJudged ?? 0} orders with time windows)`, 10, 36);
      doc.save('arways-summary.pdf');
    });
  }

  function exportExcel() {
    import('xlsx').then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet([{ from, to, total: data?.total, delivered: data?.delivered, deliveryRatePct: data?.deliveryRatePct, failed: data?.failed, onTimePct: data?.onTimePct, onTimeJudged: data?.onTimeJudged }]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Summary');
      XLSX.writeFile(wb, 'arways-summary.xlsx');
    });
  }

  const nameOf = (id: string) => users.find((u) => u.userId === id)?.fullName ?? id.slice(0, 8);
  const inRange = orders.filter((o) => {
    const day = String(o.createdAt ?? '').slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  });
  const byClient: Record<string, number> = {};
  for (const o of inRange) {
    const c = users.find((u) => u.userId === o.createdByUserId);
    const label = c ? `${c.fullName} (${c.role})` : 'Unknown';
    byClient[label] = (byClient[label] ?? 0) + 1;
  }
  const reasons = data ? Object.entries(data.byReason) : [];
  const maxBar = Math.max(1, ...Object.values(byClient), ...Object.values(byDriver));

  return (
    <Shell role={role} title="Reports & Analytics">
      {/* Date range */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
        <label className="text-sm font-medium text-slate-700">From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="ml-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none" />
        </label>
        <label className="text-sm font-medium text-slate-700">To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="ml-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none" />
        </label>
        <button onClick={load} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Apply</button>
        <span className="text-xs text-slate-400">Summary, client and driver charts follow this range.</span>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icons.ChartBar className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Delivery Summary</h2>
          </div>
          {data && (
            <div className="flex gap-2">
              <button
                onClick={exportPDF}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Icons.Download className="h-4 w-4" />
                PDF
              </button>
              <button
                onClick={exportExcel}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Icons.Download className="h-4 w-4" />
                Excel
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#0e7a70]" />
            <p className="mt-4 text-sm text-slate-500">Loading report data...</p>
          </div>
        ) : err ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <p className="mt-2 text-sm text-red-700" role="alert">{err}</p>
            <button onClick={load} className="mt-3 text-sm font-medium text-[#0e7a70] hover:underline">Retry</button>
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <p className="mt-2 text-sm">Failed to load report data</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard label="Total Orders" value={data.total} tone="blue" />
              <StatCard label="Delivered" value={data.delivered} tone="green" />
              <StatCard label="Failed" value={data.failed} tone="red" />
              <StatCard label="Delivery Rate" value={`${data.deliveryRatePct ?? 0}%`} tone="green" />
              <StatCard label="On-time Rate" value={data.onTimeJudged ? `${data.onTimePct}%` : '—'} tone="amber" />
            </div>
            {data.onTimeJudged === 0 && (
              <p className="mt-2 text-xs text-slate-400">On-time needs deliveries with store time windows — none in this period.</p>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Deliveries by Client</h3>
                {Object.keys(byClient).length === 0 ? (
                  <p className="text-sm text-slate-400">No orders in this period.</p>
                ) : (
                  <ul className="space-y-2">
                    {Object.entries(byClient).sort((a, b) => b[1] - a[1]).map(([name, n]) => (
                      <li key={name} className="flex items-center gap-3 text-sm">
                        <span className="w-44 truncate text-slate-700">{name}</span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded bg-slate-100">
                          <span className="block h-full rounded bg-[#0e7a70]" style={{ width: `${Math.round((n / maxBar) * 100)}%` }} />
                        </span>
                        <span className="w-8 text-right font-semibold text-slate-900">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Deliveries by Driver</h3>
                {Object.keys(byDriver).length === 0 ? (
                  <p className="text-sm text-slate-400">No routes yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {Object.entries(byDriver).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                      <li key={id} className="flex items-center gap-3 text-sm">
                        <span className="w-44 truncate text-slate-700">{nameOf(id)}</span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded bg-slate-100">
                          <span className="block h-full rounded bg-blue-500" style={{ width: `${Math.round((n / maxBar) * 100)}%` }} />
                        </span>
                        <span className="w-8 text-right font-semibold text-slate-900">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Failed Deliveries ({data.failed})</h3>
              {reasons.length === 0 ? (
                <p className="text-sm text-slate-400">No failed deliveries in this period.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr><th className="py-2 font-semibold">Reason</th><th className="py-2 font-semibold text-right">Count</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reasons.map(([reason, n]) => (
                      <tr key={reason}>
                        <td className="py-2 text-slate-700">{reason}</td>
                        <td className="py-2 text-right font-semibold text-slate-900">{n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone: 'blue' | 'green' | 'red' | 'amber' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  }[tone];

  return (
    <div className={`rounded-xl border ${colors} p-6`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
