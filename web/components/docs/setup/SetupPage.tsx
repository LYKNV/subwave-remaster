import type { ReactNode } from 'react';
import Link from 'next/link';
import { SETUP_PAGES } from './pages';

interface SetupPageProps {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  current: string;
  children: ReactNode;
  // Optional secondary header content (e.g. a small meta line under the title).
  meta?: ReactNode;
  // Optional aside rendered beside the hero text — used for the spinning glyph.
  heroAside?: ReactNode;
}

// Wraps a setup-guide page: a broadsheet-style header, the page body, and the
// prev/next links derived from SETUP_PAGES order.
export default function SetupPage({
  eyebrow,
  title,
  intro,
  current,
  children,
  meta,
  heroAside,
}: SetupPageProps) {
  const idx = SETUP_PAGES.findIndex((p) => p.href === current);
  const prev = idx > 0 ? SETUP_PAGES[idx - 1] : null;
  const next = idx >= 0 && idx < SETUP_PAGES.length - 1 ? SETUP_PAGES[idx + 1] : null;

  const heroBody = (
    <>
      <p className="bs-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {meta ? <p className="bs-setup-meta">{meta}</p> : null}
      {intro ? <p>{intro}</p> : null}
    </>
  );

  return (
    <article>
      {heroAside ? (
        <header className="bs-setup-hero" data-aside="">
          <div className="bs-setup-hero-main">{heroBody}</div>
          <div className="bs-setup-hero-aside">{heroAside}</div>
        </header>
      ) : (
        <header className="bs-setup-hero">{heroBody}</header>
      )}

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
