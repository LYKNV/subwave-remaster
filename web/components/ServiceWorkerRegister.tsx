'use client';

import { useEffect } from 'react';

// Registers /sw.js once on mount. Kept separate from PlayerApp so it also
// runs on the landing/admin/setup routes — the install prompt should work
// no matter which page the visitor lands on first.
export default function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      // Browsers refuse SW over plain HTTP on non-localhost hosts. Skipping
      // the registration call avoids a noisy console error in those setups.
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] registration failed:', err);
    });
  }, []);
  return null;
}
