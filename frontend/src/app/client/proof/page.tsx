'use client';
import { Shell } from '@/components/Shell';
import { ProofList } from '@/components/ProofList';

export default function ClientProofPage() {
  return (
    <Shell role="Client" title="Proof of Delivery">
      <p className="mb-4 text-sm text-slate-500">Receipts and notes for your delivered stops.</p>
      <ProofList />
    </Shell>
  );
}
