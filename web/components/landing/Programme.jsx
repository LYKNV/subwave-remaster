'use client';

// "The Programme" — explains the two things that make SUB/WAVE feel like a
// staffed station rather than a shuffle: a weekly Shows schedule (operator
// programming) and Skills (between-track segments a director agent decides
// to air). Deliberately framed for listeners, not operators — the admin
// console is where this is actually configured.

const SKILLS = [
  {
    tag: 'WEATHER',
    body: 'A check on the sky outside the station — but only when conditions have genuinely changed since the last mention. No filler forecasts.',
  },
  {
    tag: 'NEWS',
    body: 'One fresh headline, read once, in a half-distracted 6 Music tone. Never an anchor voice, never "in other news". Each headline airs once.',
  },
  {
    tag: 'TRAFFIC',
    body: 'A tongue-in-cheek "traffic update for the listening area" — a queue at the kettle, a cat on the cable. Only ever during commute hours.',
  },
  {
    tag: 'RANDOM FACTS',
    body: 'One oddly-specific "did you know", lightly themed to the hour or season. Never "fun fact", never Wikipedia-rote.',
  },
  {
    tag: 'WEB SEARCH',
    body: 'One genuine, recent detail about the artist on air, worked into a single line. Optional — needs a search key.',
  },
];

const CLOCK = [
  { when: 'every track',  what: 'the DJ may write a link into the next song' },
  { when: 'every 5 min',  what: 'the segment director decides: air one skill, or stay silent' },
  { when: 'every hour',   what: 'a time check, in character' },
  { when: ':15 / :45',    what: 'a station ident' },
  { when: 'every 10 min', what: 'the fallback playlist re-tunes to the room’s mood' },
];

export default function Programme() {
  return (
    <section className="bs-section">
      <p className="bs-eyebrow">THE PROGRAMME</p>
      <h2>It runs to a schedule — and it knows things.</h2>
      <p className="muted">
        Two layers sit on top of the music: a weekly schedule of <em>shows</em>,
        and a set of <em>skills</em> the DJ can reach for between tracks.
      </p>

      <div className="bs-grid-split" style={{ marginTop: 18 }}>
        {/* Shows */}
        <div>
          <div className="bs-eyebrow" style={{ marginBottom: 10 }}>SHOWS — THE WEEKLY SCHEDULE</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>
            The operator paints a seven-day, twenty-four-hour grid. Each filled
            hour runs a <strong style={{ color: 'var(--ink)' }}>show</strong> —
            a named slot owned by one of the station's DJ personas, with its own
            brief: a theme, a mood, a voice. <em>The Night Shift</em> at 11pm,
            a brighter persona for the commute, quiet ambient on a Sunday
            morning.
          </p>
          <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>
            Any hour left empty runs <strong style={{ color: 'var(--ink)' }}>autonomously</strong> —
            the station picks its own persona and mood from the time, the
            weather, and the season. There is always something on. The schedule
            just decides <em>who</em>.
          </p>
        </div>

        <div className="bs-column-rule" aria-hidden="true" />

        {/* The clock */}
        <div>
          <div className="bs-eyebrow" style={{ marginBottom: 10 }}>THE CLOCK — WHAT TICKS</div>
          <table className="bs-dj-tools">
            <tbody>
              {CLOCK.map((c) => (
                <tr key={c.when}>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.when}</td>
                  <td>{c.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--muted)' }}>
            Every persona has a talk frequency — <strong style={{ color: 'var(--ink)' }}>quiet</strong>,{' '}
            <strong style={{ color: 'var(--ink)' }}>moderate</strong>, or{' '}
            <strong style={{ color: 'var(--ink)' }}>aggressive</strong> — that
            throttles all of it. A quiet station speaks rarely; a lively one
            checks in often. Silence is always a valid choice.
          </p>
        </div>
      </div>

      {/* Skills */}
      <div className="bs-eyebrow" style={{ margin: '34px 0 6px' }}>
        SKILLS — WHAT THE DJ CAN REACH FOR
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Every five minutes a director agent looks at the moment, checks the
        real data, and decides whether one short segment is worth airing. If
        nothing is fresh, it says nothing.
      </p>

      <div className="bs-whatis-grid" style={{ marginTop: 14 }}>
        {SKILLS.map((s) => (
          <article key={s.tag} className="bs-whatis-card">
            <div className="bs-eyebrow" style={{ marginBottom: 8 }}>{s.tag}</div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--muted)' }}>
              {s.body}
            </p>
          </article>
        ))}
      </div>

      <p
        style={{
          marginTop: 18,
          fontSize: 12,
          letterSpacing: '0.05em',
          color: 'var(--muted)',
          maxWidth: '64ch',
        }}
      >
        Each skill has a cooldown, so nothing wears thin. Personas only carry
        the skills they suit. The operator can switch any of them off. It's a
        station with a programme director — not a timer firing prompts.
      </p>
    </section>
  );
}
