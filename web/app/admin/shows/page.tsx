import type { Metadata } from 'next';
import ShowsPanel from '../../../components/admin/ShowsPanel';

export const metadata: Metadata = { title: 'Shows' };

export default function AdminShowsPage() {
  return <ShowsPanel />;
}
