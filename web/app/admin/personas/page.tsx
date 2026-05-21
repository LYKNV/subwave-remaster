import type { Metadata } from 'next';
import PersonasPanel from '../../../components/admin/PersonasPanel';

export const metadata: Metadata = { title: 'Personas' };

export default function AdminPersonasPage() {
  return <PersonasPanel />;
}
