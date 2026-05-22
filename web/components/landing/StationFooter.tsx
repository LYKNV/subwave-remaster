'use client';

import Link from 'next/link';

export default function StationFooter({ djName }: { djName?: string }) {
  return (
    <footer className="flex flex-col gap-[14px]">
      <div className="bs-rule-double" />
      <div className="flex flex-wrap items-baseline justify-between gap-4 py-5 text-[11px] tracking-[0.18em] text-muted uppercase">
        <span className="font-bold text-ink">SUB/WAVE · EST. 2026</span>
        <span>
          Navidrome · Liquidsoap · Icecast · your LLM · your voice
        </span>
        <span>
          {djName ? `${djName} on the desk · ` : ''}
          <a
            href="https://github.com/perminder-klair/subwave"
            target="_blank"
            rel="noreferrer"
            className="bs-link tracking-[inherit]"
          >
            GitHub →
          </a>
        </span>
      </div>
      <div className="pb-[6px] text-center text-[10px] tracking-[0.3em] text-muted uppercase">
        — End of broadcast page · <Link href="/listen" className="bs-link tracking-[inherit]">open the player</Link> —
      </div>
      <div className="pb-[6px] text-center text-[10px] tracking-[0.3em] text-muted uppercase">
        Set in type &amp; sent to press by{' '}
        <a
          href="https://www.klair.co"
          target="_blank"
          rel="noreferrer"
          className="bs-link tracking-[inherit]"
        >
          the Klair works ✦ klair.co
        </a>
      </div>
    </footer>
  );
}
