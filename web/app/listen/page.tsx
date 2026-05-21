import type { Metadata, Viewport } from 'next';
import PlayerApp from '@/components/PlayerApp';

export const metadata: Metadata = { title: 'SUB/WAVE — Player' };

// The player is a fixed, app-shell layout — lock out pinch-zoom so it
// behaves like a native app on mobile. Merges with the root viewport.
export const viewport: Viewport = {
  maximumScale: 1,
  userScalable: false,
};

export default function ListenPage() {
  return <PlayerApp />;
}
