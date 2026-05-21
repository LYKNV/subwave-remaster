import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AdminShell from '../../components/admin/AdminShell';

export const metadata: Metadata = {
  title: 'Admin',
  // The auth gate is client-side, so the shell HTML is served regardless —
  // keep the console out of search indexes entirely.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
