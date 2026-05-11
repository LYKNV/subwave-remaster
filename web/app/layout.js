import './globals.css';

export const metadata = {
  title: 'SUB/WAVE',
  description: 'Personal radio frequency from the homelab',
};

export const viewport = {
  themeColor: '#0c0a09',
  colorScheme: 'dark',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
