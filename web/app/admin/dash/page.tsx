import type { Metadata } from 'next';
import DashPanel from '../../../components/admin/DashPanel';

export const metadata: Metadata = { title: 'Dash' };

export default function AdminDashPage() {
  return <DashPanel />;
}
