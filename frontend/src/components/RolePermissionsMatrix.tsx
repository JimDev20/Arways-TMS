'use client';
import { Icons } from '@/lib/createLucideIcon';

/**
 * Capability matrix: what each role can do, verified against the backend
 * @Roles guards. Reference material for Owners.
 */
type Cell = boolean;

interface Row {
  capability: string;
  owner: Cell;
  secretary: Cell;
  client: Cell;
  driver: Cell;
}

interface Section {
  title: string;
  rows: Row[];
}

const MATRIX: Section[] = [
  {
    title: 'Orders',
    rows: [
      { capability: 'View all orders', owner: true, secretary: true, client: false, driver: false },
      { capability: 'View own orders / assigned route', owner: true, secretary: true, client: true, driver: true },
      { capability: 'Create orders', owner: true, secretary: true, client: true, driver: false },
      { capability: 'Approve or reject orders', owner: true, secretary: true, client: false, driver: false },
      { capability: 'Modify order schedule', owner: true, secretary: true, client: false, driver: false },
      { capability: 'Cancel live orders', owner: true, secretary: true, client: false, driver: false },
      { capability: 'Add stores to a route', owner: true, secretary: true, client: true, driver: false },
      { capability: 'Track deliveries live', owner: true, secretary: true, client: true, driver: false },
    ],
  },
  {
    title: 'Fleet & Clients',
    rows: [
      { capability: 'View fleet', owner: true, secretary: true, client: true, driver: false },
      { capability: 'Add or edit trucks', owner: true, secretary: true, client: false, driver: false },
      { capability: 'Maintenance log', owner: true, secretary: true, client: false, driver: false },
      { capability: 'View client companies', owner: true, secretary: true, client: false, driver: false },
      { capability: 'Add client companies', owner: true, secretary: false, client: false, driver: false },
    ],
  },
  {
    title: 'People & System',
    rows: [
      { capability: 'Manage users & passwords', owner: true, secretary: false, client: false, driver: false },
      { capability: 'Audit logs', owner: true, secretary: false, client: false, driver: false },
      { capability: 'Reports & analytics', owner: true, secretary: true, client: false, driver: false },
      { capability: 'Storage usage', owner: true, secretary: false, client: false, driver: false },
      { capability: 'Broadcast announcements', owner: true, secretary: false, client: false, driver: false },
      { capability: 'System settings', owner: true, secretary: false, client: false, driver: false },
    ],
  },
  {
    title: 'Proof & Daily Work',
    rows: [
      { capability: 'View proof of delivery', owner: true, secretary: true, client: true, driver: true },
      { capability: 'Upload receipt & waybill photos', owner: false, secretary: false, client: false, driver: true },
      { capability: 'Update stop & dispatch status', owner: false, secretary: false, client: false, driver: true },
      { capability: 'Notifications & toasts', owner: true, secretary: true, client: true, driver: true },
      { capability: 'Help center', owner: true, secretary: true, client: true, driver: true },
    ],
  },
];

function Mark({ allowed, label }: { allowed: boolean; label: string }) {
  return allowed ? (
    <span className="inline-flex items-center justify-center" role="img" aria-label={`${label}: allowed`}>
      <Icons.Check className="h-4 w-4 text-green-600" />
    </span>
  ) : (
    <span className="inline-flex items-center justify-center" role="img" aria-label={`${label}: not allowed`}>
      <Icons.X className="h-4 w-4 text-slate-300" />
    </span>
  );
}

export function RolePermissionsMatrix() {
  return (
    <div className="space-y-6">
      {MATRIX.map((s) => (
        <div key={s.title}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{s.title}</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-semibold"><span className="sr-only">Capability</span></th>
                  <th className="w-20 px-2 py-2 text-center font-semibold">Owner</th>
                  <th className="w-20 px-2 py-2 text-center font-semibold">Secretary</th>
                  <th className="w-20 px-2 py-2 text-center font-semibold">Client</th>
                  <th className="w-20 px-2 py-2 text-center font-semibold">Driver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.rows.map((r) => (
                  <tr key={r.capability} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{r.capability}</td>
                    <td className="px-2 py-2 text-center"><Mark allowed={r.owner} label={`Owner: ${r.capability}`} /></td>
                    <td className="px-2 py-2 text-center"><Mark allowed={r.secretary} label={`Secretary: ${r.capability}`} /></td>
                    <td className="px-2 py-2 text-center"><Mark allowed={r.client} label={`Client: ${r.capability}`} /></td>
                    <td className="px-2 py-2 text-center"><Mark allowed={r.driver} label={`Driver: ${r.capability}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-400">Matches the server access rules. Client data is scoped to their own company; drivers see only their assigned routes.</p>
    </div>
  );
}
