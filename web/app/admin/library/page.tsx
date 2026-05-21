import type { Metadata } from 'next';
import LibraryPanel from '../../../components/admin/LibraryPanel';

export const metadata: Metadata = { title: 'Library' };

export default function AdminLibraryPage() {
  return <LibraryPanel />;
}
