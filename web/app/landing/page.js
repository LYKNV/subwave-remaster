import Landing from '../../components/Landing';

export const metadata = { title: 'SUB/WAVE — A real internet radio station' };

// Fixed app-shell layout — lock out pinch-zoom on mobile. Merges with root.
export const viewport = {
  maximumScale: 1,
  userScalable: false,
};

export default function LandingPreviewPage() {
  return <Landing />;
}
