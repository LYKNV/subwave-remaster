'use client';

import { fmtTime } from '@/lib/format';
import DjThinkingLine from './DjThinkingLine';
import type { NowPlayingTrack, SessionTurn } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface CenterStageProps {
  nowPlaying: NowPlayingTrack | null;
  elapsed: number;
  feed: SessionTurn[];
  djLineOn: boolean;
  onOpenBooth: () => void;
}

export default function CenterStage({ nowPlaying, elapsed, feed, djLineOn, onOpenBooth }: CenterStageProps) {
  const has = !!nowPlaying?.title;
  const duration = nowPlaying?.duration ?? 0;
  const coverSrc = nowPlaying?.subsonic_id
    ? `${API_URL}/cover/${encodeURIComponent(nowPlaying.subsonic_id)}`
    : null;

  return (
    <div className="absolute top-1/2 right-24 left-4 flex -translate-y-[58%] flex-col items-start sm:left-8">
      {/* Cover + track info — side by side. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
        {coverSrc && (
          <img
            key={coverSrc}
            src={coverSrc}
            alt=""
            className="h-[clamp(72px,14vw,160px)] w-[clamp(72px,14vw,160px)] shrink-0 rounded-sm border
              border-muted object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="min-w-0">
          <div className="v3-caption mb-[14px] text-muted">
            Now playing{has && duration ? ` — ${fmtTime(elapsed)} / ${fmtTime(duration)}` : has ? ` — ${fmtTime(elapsed)}` : ''}
          </div>
          {has ? (
            <>
              <h1 className="v3-title m-0 text-ink">
                {nowPlaying?.title}
              </h1>
              <div className="v3-subtitle mt-[12px] text-muted">
                <span className="text-ink">{nowPlaying?.artist || 'Unknown artist'}</span>
                {nowPlaying?.album && <span className="ml-[14px]"> · {nowPlaying.album}</span>}
                {nowPlaying?.year && <span className="ml-[14px]"> · {nowPlaying.year}</span>}
              </div>
            </>
          ) : (
            <h1 className="v3-title m-0 text-muted">
              scanning the dial
              <span className="v3-blink ml-[0.1em]">_</span>
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
