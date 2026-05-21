import type { Metadata } from 'next';
import StatsPanel from '../../../components/admin/StatsPanel';

export const metadata: Metadata = {
  title: 'Stats',
};

export default function AdminStatsPage() {
  return <StatsPanel />;
}
