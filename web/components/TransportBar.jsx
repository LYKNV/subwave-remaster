'use client';

import { fmtTime } from '../lib/format';

export default function TransportBar({ tunedIn, onTune, volume, setVolume, nowPlaying, elapsed }) {
  const duration = nowPlaying?.duration ?? 0;
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;
  const cells = 12;
  const lit = Math.round(volume * cells);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex items-center gap-3 sm:gap-6 px-4 py-3 sm:px-8 sm:py-5"
      style={{
        borderTop: '1px solid var(--ink)',
        background: 'var(--bg)',
      }}
    >
      <button
        onClick={onTune}
        className="v3-eyebrow v3-focus cursor-pointer flex items-center gap-[10px] shrink-0 px-4 py-3 sm:px-7 sm:py-[14px]"
        style={{
          background: 'var(--ink)',
          color: 'var(--bg)',
          border: 'none',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: tunedIn ? 'var(--accent)' : '#5a5048',
            display: 'inline-block',
          }}
        />
        {tunedIn ? 'Tune Out' : 'Tune In'}
      </button>

      <div className="flex-1 flex flex-col gap-[6px] min-w-0">
        <div className="flex justify-between v3-caption gap-4" style={{ color: 'var(--muted)' }}>
          <span className="v3-tab-num">{fmtTime(elapsed)}</span>
          <span className="truncate">
            {nowPlaying?.title ? `${nowPlaying.title}${nowPlaying.artist ? ' · ' + nowPlaying.artist : ''}` : '—'}
          </span>
          <span className="v3-tab-num">
            {duration > 0 ? `−${fmtTime(Math.max(0, duration - elapsed))}` : '—'}
          </span>
        </div>
        <div style={{ height: 1, background: 'var(--muted)', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: -1,
              height: 3,
              width: `${progress * 100}%`,
              background: 'var(--accent)',
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-[10px] shrink-0">
        <span className="hidden sm:inline v3-caption" style={{ color: 'var(--muted)' }}>Vol</span>
        <div
          className="relative flex items-center w-[52px] sm:w-[80px]"
          style={{ height: 18, gap: 2 }}
        >
          {Array.from({ length: cells }).map((_, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                height: '100%',
                background: i < lit ? 'var(--ink)' : 'transparent',
                border: '1px solid var(--ink)',
              }}
            />
          ))}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className="absolute inset-0 opacity-0 cursor-pointer w-full"
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
}
