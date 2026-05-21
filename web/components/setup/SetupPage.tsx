import type { ReactNode } from 'react';
import Link from 'next/link';
import { SETUP_PAGES } from './pages';

interface SetupPageProps {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  current: string;
  children: ReactNode;
}

// Wraps a setup-guide page: a broadsheet-style header, the page body, and the
// prev/next links derived from SETUP_PAGES order.
export default function SetupPage({ eyebrow, title, intro, current, children }: SetupPageProps) {
  const idx = SETUP_PAGES.findIndex((p) => p.href === current);
  const prev = idx > 0 ? SETUP_PAGES[idx - 1] : null;
  const next = idx >= 0 && idx < SETUP_PAGES.length - 1 ? SETUP_PAGES[idx + 1] : null;

  return (
    <article>
      <header className="bs-setup-hero">
        <p className="bs-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {intro ? <p>{intro}</p> : null}
      </header>

      {children}

      <nav className="bs-manual-pagelinks" aria-label="Setup guide pagination">
        {prev ? (
          <Link href={prev.href} className="bs-manual-pagelink" data-dir="prev">
            <span>&larr; Previous</span>
            {prev.label}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={next.href} className="bs-manual-pagelink" data-dir="next">
            <span>Next &rarr;</span>
            {next.label}
          </Link>
        ) : null}
      </nav>
    </article>
  );
}
