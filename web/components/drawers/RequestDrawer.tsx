'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { cn } from '@/lib/cn';
import type { NowPlayingTrack, RequestResult, StationContext } from '@/lib/types';

const SUCCESS_HOLD_MS = 2800;
const POLL_INTERVAL_MS = 1500;
const POLL_DEADLINE_MS = 60000;

// Instant, no-LLM acknowledgement shown the moment the booth accepts the
// request — so there's zero dead time before the listener gets feedback. The
// real on-air ack from the DJ replaces it once the pick resolves.
function templatedAck(name: string): string {
  const n = name.trim();
  return n
    ? `Got it, ${n} — taking it to the booth.`
    : `Got it — taking it to the booth.`;
}

interface Suggestion {
  text: string;
  attribution: string;
}

// Pull a handful of context-aware suggestion chips out of what's already
// on-air. Each chip carries an attribution so the listener understands why
// it's being offered — "from track", "from time", etc. — instead of a flat
// list of canned moods. Order: most-specific (current track) first, weakest
// (random) last. Capped at 5 so the drawer doesn't sprawl.
function buildSuggestions(
  nowPlaying: NowPlayingTrack | null,
  context: StationContext | null,
): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  const push = (text: string, attribution: string) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text, attribution });
  };

  if (nowPlaying?.artist) {
    // The controller has a dedicated "more like this" code path that picks
    // another song by the currently-playing artist, so attribute it that way
    // — clearer than vague "track-derived".
    push('more like this', `more ${nowPlaying.artist}`);
  }

  const festival = context?.festival?.name;
  if (festival) {
    push(`${festival.toLowerCase()} mood`, `festival`);
  }

  const vibe = context?.time?.vibe || context?.time?.show;
  if (vibe) {
    push(`${vibe} vibes`, `right now`);
  }

  const cond = context?.weather?.condition;
  const weatherMap: Record<string, string> = {
    clear: 'sunny afternoon',
    sunny: 'sunny afternoon',
    cloudy: 'overcast mood',
    rain: 'rainy day',
    rainy: 'rainy day',
    drizzle: 'rainy day',
    snow: 'snowy night',
    snowy: 'snowy night',
    fog: 'foggy morning',
    foggy: 'foggy morning',
    thunderstorm: 'stormy night',
  };
  if (cond && cond !== 'unknown') {
    push(weatherMap[cond] || `${cond} day`, `weather`);
  }

  // Always-available fallback.
  push('surprise me', `random`);

  return out.slice(0, 5);
}

export interface RequestDrawerProps {
  requestText: string;
  setRequestText: (text: string) => void;
  requesterName: string;
  setRequesterName: (name: string) => void;
  isSubmitting: boolean;
  onSubmit: () => Promise<RequestResult | null>;
  onPoll?: (requestId: string) => Promise<RequestResult | null>;
  onClose?: () => void;
  nowPlaying: NowPlayingTrack | null;
  context: StationContext | null;
}

export default function RequestDrawer({
  requestText, setRequestText,
  requesterName, setRequesterName,
  isSubmitting, onSubmit, onPoll, onClose,
  nowPlaying, context,
}: RequestDrawerProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // `result` drives the render: { success, pending, ack, track, message }.
  // Null while idle. On accept it's a `pending` success card showing the
  // instant templated ack; polling fills in the real track + on-air ack.
  const [result, setResult] = useState<RequestResult | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStopRef = useRef(false);

  useEffect(() => () => {
    pollStopRef.current = true;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  // Hold the resolved card briefly, then slide the drawer shut and reset.
  const scheduleClose = () => {
    if (!onClose || closeTimerRef.current) return;
    closeTimerRef.current = setTimeout(() => {
      onClose();
      // Defer state reset until after the close animation so the form
      // doesn't flash back in during the slide.
      setTimeout(() => setResult(null), 300);
    }, SUCCESS_HOLD_MS);
  };

  // Poll the controller until the request resolves, fails, or the deadline
  // passes. While pending the templated ack card stays up; on resolve it
  // morphs into the real track + DJ ack, then auto-closes.
  const startPolling = (requestId: string) => {
    pollStopRef.current = false;
    const deadline = Date.now() + POLL_DEADLINE_MS;
    const tick = async () => {
      if (pollStopRef.current) return;
      if (Date.now() > deadline) { scheduleClose(); return; }
      const data = await onPoll?.(requestId);
      if (pollStopRef.current) return;
      if (data?.status === 'resolved') {
        setResult(prev => ({
          success: true,
          ack: data.ack || prev?.ack,
          track: data.track,
          queuePosition: data.queuePosition,
        }));
        scheduleClose();
        return;
      }
      if (data?.status === 'failed') {
        setResult({ success: false, message: data.message || 'No match — try different words.' });
        return;
      }
      if (data?.status === 'unknown') { scheduleClose(); return; }
      // pending, or a transient network null — keep polling.
      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
  };

  const handleSubmit = async () => {
    // Capture before the await — onSubmit clears requestText on accept.
    const askedText = requestText.trim();
    const askedName = requesterName.trim();
    const data = await onSubmit();
    if (!data) return;
    // 429 / 503 / network error — surface the miss banner, no polling.
    if (!data.success) {
      setResult(data);
      return;
    }
    // Accepted. Show the instant ack now; poll for the real pick.
    setResult({
      success: true,
      pending: true,
      ack: templatedAck(askedName),
      requestText: askedText,
    });
    if (data.requestId && onPoll) {
      startPolling(data.requestId);
    } else {
      scheduleClose();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (result?.success) {
    return <SuccessCard result={result} />;
  }

  return (
    <div>
      <p className="mt-0 text-[13px] leading-normal text-muted">
        Describe a mood, a memory, an artist. Ollama parses it, matches the library,
        and the DJ acknowledges you on-air.
      </p>

      <SuggestionChips
        nowPlaying={nowPlaying}
        context={context}
        onPick={text => { setRequestText(text); taRef.current?.focus(); }}
      />

      <Input
        type="text"
        value={requesterName}
        onChange={e => setRequesterName(e.target.value)}
        placeholder="your name (optional)"
        className="mb-2"
      />

      <Textarea
        ref={taRef}
        value={requestText}
        onChange={e => { setRequestText(e.target.value); if (result) setResult(null); }}
        onKeyDown={onKeyDown}
        placeholder='"something for late-night driving"…'
        rows={3}
        /* 16px text avoids iOS zoom-on-focus on this listener-facing field. */
        className="resize-none p-3.5 text-[16px]"
      />

      {result && !result.success && (
        <div className="mt-2.5 border border-[#c0392b] bg-[rgba(192,57,43,0.06)] px-3 py-2.5 text-xs leading-normal text-[#7a2218]">
          {result.message || 'No match — try different words.'}
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !requestText.trim()}
        variant="accent"
        className="mt-3 w-full px-6 py-3.5"
      >
        {isSubmitting ? 'Sending…' : 'Send to the booth'}
      </Button>
    </div>
  );
}

interface SuccessCardProps {
  result: RequestResult;
}

function SuccessCard({ result }: SuccessCardProps) {
  const { ack, track, queuePosition, pending, requestText } = result;
  return (
    <div className="sw-success-in py-2">
      <div className="mb-[14px] text-[9px] tracking-[0.4em] text-vermilion uppercase">
        {pending ? '✓ Sent to the booth' : '✓ Queued'}
      </div>

      {ack && (
        <div className="mb-[22px] border-l-2 border-l-vermilion pl-[14px] [font-family:Georgia,'Times_New_Roman',serif] text-lg leading-snug text-ink italic">
          "{ack}"
        </div>
      )}

      <div className="border-y border-soft-border py-4">
        <div className="mb-1.5 text-[9px] tracking-[0.3em] text-muted uppercase">
          {pending ? 'The DJ is digging' : 'Now in the booth'}
        </div>
        {pending ? (
          <>
            <div className="sw-pulse [font-family:Georgia,'Times_New_Roman',serif] text-base leading-snug text-ink italic">
              finding your track…
            </div>
            {requestText && (
              <div className="mt-1 text-[13px] text-muted">
                "{requestText}"
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-[22px] leading-tight font-semibold text-ink">
              {track?.title}
            </div>
            <div className="mt-0.5 text-[13px] text-muted">
              {track?.artist}
            </div>
          </>
        )}
      </div>

      {!pending && typeof queuePosition === 'number' && queuePosition > 0 && (
        <div className="v3-tab-num mt-[14px] text-[11px] tracking-[0.15em] text-muted uppercase">
          Position #{queuePosition} in queue
        </div>
      )}

      <div className="mt-[26px] text-[10px] tracking-[0.3em] text-muted uppercase">
        {pending ? 'You can close this — your request is locked in' : 'Closing…'}
      </div>
    </div>
  );
}

interface SuggestionChipsProps {
  nowPlaying: NowPlayingTrack | null;
  context: StationContext | null;
  onPick: (text: string) => void;
}

// Context-aware chip row. Each chip is a two-line button: the prompt text on
// top, a small attribution caption underneath ("more <artist>", "weather",
// "festival", "right now", "random"). Listeners see *why* a suggestion is
// being offered instead of a flat canned list.
function SuggestionChips({ nowPlaying, context, onPick }: SuggestionChipsProps) {
  // Listing only the fields buildSuggestions actually reads — depending on the
  // whole nowPlaying/context objects would recompute on every poll cycle.
  const chips = useMemo(
    () => buildSuggestions(nowPlaying, context),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nowPlaying?.artist, nowPlaying?.title, context?.festival?.name,
     context?.time?.vibe, context?.time?.show, context?.weather?.condition]
  );

  return (
    <div className={cn('my-[18px] flex flex-wrap gap-1.5')}>
      {chips.map(chip => (
        <button
          key={chip.text}
          onClick={() => onPick(chip.text)}
          className="v3-focus cursor-pointer border border-ink bg-transparent px-3 py-1.5 text-left font-[inherit] leading-tight text-ink"
          title={`Suggested via ${chip.attribution}`}
        >
          <span className="block text-[11px] tracking-[0.08em]">
            {chip.text}
          </span>
          <span className="mt-[3px] block text-[8px] tracking-[0.22em] text-muted uppercase">
            {chip.attribution}
          </span>
        </button>
      ))}
    </div>
  );
}
