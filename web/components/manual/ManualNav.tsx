'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MANUAL_PAGES } from './pages';

export default function ManualNav() {
  const pathname = usePathname();

  return (
    <nav className="bs-manual-nav" aria-label="Manual contents">
      <p className="bs-eyebrow">THE MANUAL</p>
      <ol className="bs-manual-nav-list">
        {MANUAL_PAGES.map((page, i) => {
          const active = pathname === page.href;
          return (
            <li key={page.href}>
              <Link
                href={page.href}
                className="bs-manual-nav-link"
                data-active={active || undefined}
                aria-current={active ? 'page' : undefined}
              >
                <span className="bs-manual-nav-num">{String(i + 1).padStart(2, '0')}</span>
                {page.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
