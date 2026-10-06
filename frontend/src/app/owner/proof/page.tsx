'use client';
import { Shell } from '@/components/Shell';
import { ProofList } from '@/components/ProofList';

export default function OwnerProofPage() {
  return (
    <Shell role="Owner" title="Proof of Delivery">
      <ProofList />
    </Shell>
  );
}
