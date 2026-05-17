'use client';

import Link from 'next/link';
import { useClock } from '../../lib/hooks';
import ThemeToggle from './ThemeToggle';

const LAUNCH_DATE = new Date('2026-01-01T00:00:00Z');

function issueNo(d) {
  return Math.max(1, Math.floor((d.getTime() - LAUNCH_DATE.getTime()) / 86400000));
}

// Broadsheet-style header with proper landing-page navigation. Keeps the
// big SUB/WAVE wordmark and the double rules, drops the dateline/location/
// DJ-name strip that belonged on a newspaper but not a marketing site.
export default function Masthead() {
  const now = useClock();

  return (
    <header className="bs-paper" style={{ paddingTop: 28, paddingBottom: 0 }}>
      <div className="bs-rule-double" />

      <div className="bs-masthead-head">
        <div
          className="bs-caption bs-masthead-meta flex items-center"
          style={{ color: 'var(--muted)', gap: 10 }}
        >
          <span style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
            VOL. I &nbsp;·&nbsp; NO.&nbsp;{now ? issueNo(now) : '—'}
          </span>
          <ThemeToggle />
        </div>

        <Link
          href="/"
          aria-label="SUB/WAVE home"
          className="bs-wordmark bs-masthead-mark"
          style={{ textDecoration: 'none', color: 'var(--ink)' }}
        >
          SUB/WAVE
        </Link>

        <div
          className="bs-masthead-status flex items-center gap-2"
          style={{
            fontSize: 11,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          <span className="bs-live-dot" aria-hidden="true" />
          <span style={{ color: 'var(--accent)' }}>ON&nbsp;AIR</span>
        </div>
      </div>

      <div className="bs-rule" />

      <nav
        aria-label="Primary"
        className="bs-masthead-nav"
      >
        <Link href="/listen" className="bs-masthead-link">Listen</Link>
        <span aria-hidden="true" className="bs-masthead-sep">·</span>
        <Link href="/manual" className="bs-masthead-link">Manual</Link>
        <span aria-hidden="true" className="bs-masthead-sep">·</span>
        <Link href="/setup" className="bs-masthead-link">Setup</Link>
        <span aria-hidden="true" className="bs-masthead-sep">·</span>
        <a
          href="https://github.com/perminder-klair/subwave"
          target="_blank"
          rel="noreferrer"
          className="bs-masthead-link"
        >
          GitHub&nbsp;↗
        </a>
      </nav>

      <div className="bs-rule-double" />
    </header>
  );
}
