'use client';
import { Shell } from '@/components/Shell';
import { HelpCenter } from '@/components/saas';

export default function OwnerHelpPage() {
  return (
    <Shell role="Owner" title="Help Center">
      <HelpCenter role="Owner" />
    </Shell>
  );
}
