import Link from 'next/link';
import { MANUAL_PAGES } from './pages';

// Wraps a manual page: a broadsheet-style header, the page body, and the
// prev/next links derived from MANUAL_PAGES order.
export default function ManualPage({ eyebrow, title, intro, current, children }) {
  const idx = MANUAL_PAGES.findIndex((p) => p.href === current);
  const prev = idx > 0 ? MANUAL_PAGES[idx - 1] : null;
  const next = idx >= 0 && idx < MANUAL_PAGES.length - 1 ? MANUAL_PAGES[idx + 1] : null;

  return (
    <article>
      <header className="bs-setup-hero">
        <p className="bs-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {intro ? <p>{intro}</p> : null}
      </header>

      {children}

      <nav className="bs-manual-pagelinks" aria-label="Manual pagination">
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
