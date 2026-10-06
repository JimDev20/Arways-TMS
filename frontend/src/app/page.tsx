'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { homeFor, type SessionUser } from '@/lib/types';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    try {
      const raw = localStorage.getItem('arways_user');
      if (!raw) router.replace('/login');
      else router.replace(homeFor((JSON.parse(raw) as SessionUser).role));
    } catch { router.replace('/login'); }
  }, [router]);
  return <main className="p-8 text-sm text-zinc-500">Redirecting…</main>;
}
