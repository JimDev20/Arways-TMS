'use client';
import { Shell } from '@/components/Shell';
import { HelpCenter } from '@/components/saas';

export default function SecretaryHelpPage() {
  return (
    <Shell role="Secretary" title="Help Center">
      <HelpCenter role="Secretary" />
    </Shell>
  );
}
