'use client';

import { fmtTime } from '../lib/format';
import DjThinkingLine from './DjThinkingLine';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function CenterStage({ nowPlaying, elapsed, feed, djLineOn, onOpenBooth }) {
  const has = !!nowPlaying?.title;
  const duration = nowPlaying?.duration ?? 0;
  const coverSrc = nowPlaying?.subsonic_id
    ? `${API_URL}/cover/${encodeURIComponent(nowPlaying.subsonic_id)}`
    : null;

  return (
    <div
      className="absolute left-4 sm:left-8 flex flex-col items-start"
      style={{ top: '50%', right: 96, transform: 'translateY(-58%)' }}
    >
      {/* Cover + track info — side by side. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
        {coverSrc && (
          <img
            key={coverSrc}
            src={coverSrc}
            alt=""
            className="shrink-0 rounded-sm object-cover"
            style={{
              width: 'clamp(72px, 14vw, 160px)',
              height: 'clamp(72px, 14vw, 160px)',
              border: '1px solid var(--muted)',
            }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="min-w-0">
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
              <div className="v3-subtitle mt-[12px]" style={{ color: 'var(--muted)' }}>
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
      </div>

      {/* DJ thinking — full width, under both the cover and the track info. */}
      {has && (
        <DjThinkingLine feed={feed} enabled={djLineOn} onOpenBooth={onOpenBooth} />
      )}
    </div>
  );
}
