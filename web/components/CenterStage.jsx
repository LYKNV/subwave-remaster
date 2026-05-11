'use client';

import { fmtTime } from '../lib/format';

export default function CenterStage({ nowPlaying, elapsed }) {
  const has = !!nowPlaying?.title;
  const duration = nowPlaying?.duration ?? 0;

  return (
    <div
      className="absolute left-4 sm:left-8"
      style={{ top: '50%', right: 96, transform: 'translateY(-58%)' }}
    >
      <div
        className="v3-caption mb-[14px]"
        style={{ color: 'var(--muted)' }}
      >
        Now playing{has && duration ? ` — ${fmtTime(elapsed)} / ${fmtTime(duration)}` : has ? ` — ${fmtTime(elapsed)}` : ''}
      </div>
      {has ? (
        <>
          <h1 className="v3-title m-0" style={{ color: 'var(--ink)' }}>
            {nowPlaying.title}
          </h1>
          <div className="v3-subtitle mt-[18px]" style={{ color: 'var(--muted)' }}>
            <span style={{ color: 'var(--ink)' }}>{nowPlaying.artist || 'Unknown artist'}</span>
            {nowPlaying.album && <span style={{ marginLeft: 14 }}> · {nowPlaying.album}</span>}
            {nowPlaying.year && <span style={{ marginLeft: 14 }}> · {nowPlaying.year}</span>}
          </div>
        </>
      ) : (
        <h1 className="v3-title m-0" style={{ color: 'var(--muted)' }}>
          scanning the dial
          <span className="v3-blink" style={{ marginLeft: '0.1em' }}>_</span>
        </h1>
      )}
    </div>
  );
}
