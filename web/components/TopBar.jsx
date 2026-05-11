'use client';

import { Settings, Radio } from 'lucide-react';
import { useClock } from '../lib/hooks';

export default function TopBar({ tunedIn, context, transmission, djName, onOpenSettings, tickerOn, onToggleTicker }) {
  const clock = useClock();
  const time = clock ? clock.toLocaleTimeString('en-GB', { hour12: false }) : '--:--:--';
  const city = context?.weather?.locationName || context?.city;
  const temp = context?.weather?.temp;
  const cond = context?.weather?.condition;

  return (
    <div
      className="absolute top-0 left-0 right-0 flex items-baseline justify-between gap-3 z-20 px-4 py-4 sm:px-8 sm:py-6"
      style={{ borderBottom: '1px solid var(--ink)' }}
    >
      <div className="flex items-baseline gap-2 sm:gap-[14px] min-w-0">
        <span className="v3-eyebrow shrink-0">SUB/WAVE</span>
        {djName && (
          <span className="v3-caption truncate" style={{ color: 'var(--accent)' }}>
            with {djName}
          </span>
        )}
        <span className="hidden md:inline v3-caption shrink-0" style={{ color: 'var(--muted)' }}>
          vol. 1 · transmission {String(transmission ?? 241).padStart(4, '0')}
        </span>
      </div>
      <div
        className="flex items-baseline gap-3 sm:gap-[18px] v3-caption shrink-0"
        style={{ color: 'var(--muted)' }}
      >
        <span className="whitespace-nowrap">
          <span style={{ color: tunedIn ? 'var(--accent)' : 'var(--muted)' }}>●</span>
          <span className="hidden sm:inline">{' '}{tunedIn ? 'on air' : 'off air'}</span>
        </span>
        {(city || temp != null || cond) && (
          <span className="hidden md:inline">
            {[city, temp != null ? `${temp}°C` : null, cond].filter(Boolean).join(' · ')}
          </span>
        )}
        <span className="v3-tab-num whitespace-nowrap" style={{ color: 'var(--ink)', fontWeight: 600 }}>
          {time}
        </span>
        {onToggleTicker && (
          <button
            onClick={onToggleTicker}
            className="v3-focus cursor-pointer"
            style={{ color: tickerOn ? 'var(--accent)' : 'var(--muted)' }}
            aria-label={tickerOn ? 'Hide booth feed ticker' : 'Show booth feed ticker'}
            title={tickerOn ? 'Hide booth ticker' : 'Show booth ticker'}
          >
            <Radio className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className="v3-focus cursor-pointer"
          style={{ color: 'var(--ink)' }}
          aria-label="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
