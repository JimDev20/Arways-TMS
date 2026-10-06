'use client';
import { useEffect, useId } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

/** Subscribe to realtime order/stop changes and refetch. */
export function useRealtime(table: string, onChange: () => void) {
  // Unique channel per hook instance. supabase-js returns the cached channel
  // for a repeated topic, and calling .on() on an already-subscribed channel
  // throws ("cannot add postgres_changes callbacks after subscribe()").
  // That happens whenever two components watch the same table at once
  // (e.g. the header bell plus the notifications page).
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb
      .channel(`arways-${table}-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [table, uid, onChange]);
}
