'use client';
import { Shell } from '@/components/Shell';
import { HelpCenter } from '@/components/saas';

export default function ClientHelpPage() {
  return (
    <Shell role="Client" title="Help Center">
      <HelpCenter role="Client" />
    </Shell>
  );
}
