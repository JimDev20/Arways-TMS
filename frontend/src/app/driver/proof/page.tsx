'use client';
import { Shell } from '@/components/Shell';
import { ProofList } from '@/components/ProofList';

/**
 * Driver Proof tab (Feature Placement). Receipts for the driver's own
 * delivered stops. Uploads happen on Today's Route / Stops; failed uploads
 * queue as "Waiting to upload" once the offline queue ships (F3 light).
 */
export default function DriverProofPage() {
  return (
    <Shell role="Driver" title="Proof">
      <p className="mb-4 text-sm text-slate-500">Receipts for your delivered stops. Photos stay attached to each stop.</p>
      <ProofList />
    </Shell>
  );
}
