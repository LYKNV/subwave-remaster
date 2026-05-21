import type { Metadata } from 'next';
import DebugPanel from '../../../components/admin/DebugPanel';

export const metadata: Metadata = {
  title: 'Debug',
};

export default function AdminDebugPage() {
  return <DebugPanel />;
}
