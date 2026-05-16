'use client';

import { relTime } from '../../lib/format';

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: '0.3em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        padding: '4px 0 10px',
      }}
    >
      {children}
    </div>
  );
}

export default function TimelineDrawer({ upcoming, history }) {
  const hasUpcoming = upcoming?.length > 0;
  const hasHistory = history?.length > 0;

  if (!hasUpcoming && !hasHistory) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
        Nothing played yet. The DJ is on autopilot — request a track to jump the line.
      </div>
    );
  }

  return (
    <div>
      {hasUpcoming && (
        <div style={{ marginBottom: hasHistory ? 24 : 0 }}>
          <SectionLabel>Up next</SectionLabel>
          {upcoming.map((t, i) => (
            <div
              key={`q-${i}`}
              className="flex gap-[14px] items-baseline"
              style={{ padding: '14px 0', borderBottom: '1px solid var(--separator-strong)' }}
            >
              <span
                className="v3-tab-num"
                style={{ fontSize: 28, fontWeight: 200, color: 'var(--muted)', width: 36 }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t.artist}</div>
                {t.requestedBy && (
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.3em',
                      textTransform: 'uppercase',
                      color: 'var(--accent)',
                      marginTop: 4,
                    }}
                  >
                    ↳ requested by {t.requestedBy}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasHistory && (
        <div>
          <SectionLabel>Played</SectionLabel>
          {history.map((t, i) => (
            <div
              key={`h-${i}`}
              className="flex justify-between items-baseline gap-3"
              style={{ padding: '11px 0', borderBottom: '1px solid var(--separator-soft)' }}
            >
              <div className="min-w-0">
                <div style={{ fontSize: 14, color: 'var(--ink)' }} className="truncate">{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }} className="truncate">{t.artist}</div>
              </div>
              {t.t && (
                <span
                  className="v3-tab-num shrink-0"
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.2em',
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  {relTime(t.t)} ago
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
