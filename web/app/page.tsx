import type { Viewport } from 'next';
import PlayerApp from '@/components/PlayerApp';
import Landing from '@/components/Landing';

// Read at request time so a deployment can flip player ↔ landing by just
// restarting the web container with a different env value, no rebuild.
export const dynamic = 'force-dynamic';

// Fixed app-shell layouts (both player and landing) — lock out pinch-zoom
// so they behave like a native app on mobile. Merges with the root viewport.
export const viewport: Viewport = {
  maximumScale: 1,
  userScalable: false,
};

export default function HomePage() {
  const mode = (process.env.SUBWAVE_HOMEPAGE || 'player').toLowerCase();
  return mode === 'landing' ? <Landing /> : <PlayerApp />;
}
