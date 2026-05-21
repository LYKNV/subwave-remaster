import type { Metadata } from 'next';
import SkillsPanel from '../../../components/admin/SkillsPanel';

export const metadata: Metadata = { title: 'Skills' };

export default function AdminSkillsPage() {
  return <SkillsPanel />;
}
