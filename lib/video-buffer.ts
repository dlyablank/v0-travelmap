'use client';
import { useSyncExternalStore } from 'react';

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
function connection() {
  return (navigator as Navigator & { connection?: Connection }).connection;
}
function snapshot() {
  const c = connection();
  return (
    !document.hidden && !c?.saveData && !['slow-2g', '2g', '3g'].includes(c?.effectiveType || '')
  );
}
function subscribe(callback: () => void) {
  const c = connection();
  c?.addEventListener('change', callback);
  document.addEventListener('visibilitychange', callback);
  return () => {
    c?.removeEventListener('change', callback);
    document.removeEventListener('visibilitychange', callback);
  };
}
/** Never preload the whole feed; suspend neighbours for Data Saver/slow networks/hidden tabs. */
export function useVideoBuffer() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
