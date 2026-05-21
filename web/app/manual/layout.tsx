import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import ManualShell from '../../components/manual/ManualShell';

export const metadata: Metadata = {
  title: 'SUB/WAVE — Manual',
  description:
    'How to use SUB/WAVE — tuning in, making requests, how the AI DJ works, and running the station from the admin console.',
};

export default function ManualLayout({ children }: { children: ReactNode }) {
  return <ManualShell>{children}</ManualShell>;
}
