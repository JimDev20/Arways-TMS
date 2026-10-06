'use client';
import { Shell } from '@/components/Shell';
import { HelpCenter } from '@/components/saas';

export default function DriverHelpPage() {
  return (
    <Shell role="Driver" title="Help Center">
      <HelpCenter role="Driver" />
    </Shell>
  );
}
