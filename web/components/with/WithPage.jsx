import Link from 'next/link';
import { WITH_PAGES } from './pages';

// Wraps a "Listen With" page: a broadsheet-style header, the page body, and
// the prev/next links derived from WITH_PAGES order.
export default function WithPage({ eyebrow, title, intro, current, children }) {
  const idx = WITH_PAGES.findIndex((p) => p.href === current);
  const prev = idx > 0 ? WITH_PAGES[idx - 1] : null;
  const next = idx >= 0 && idx < WITH_PAGES.length - 1 ? WITH_PAGES[idx + 1] : null;

  return (
    <article>
      <header className="bs-setup-hero">
        <p className="bs-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {intro ? <p>{intro}</p> : null}
      </header>

      {children}

      <nav className="bs-manual-pagelinks" aria-label="Section pagination">
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
