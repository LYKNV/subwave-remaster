import Link from 'next/link';
import ManualPage from './ManualPage';

export default function AdminSettings() {
  return (
    <ManualPage
      eyebrow="MANUAL · 04"
      title="Admin & settings."
      intro="For the operator running the station. The admin console is where you shape the DJ, choose the AI providers, schedule shows, and manage the jingles — no redeploy required."
      current="/manual/admin"
    >
      <section className="bs-section">
        <p className="bs-eyebrow">SIGNING IN</p>
        <h2>The admin console.</h2>
        <p>
          The console lives at <code className="bs-code-inline">/admin</code>. It's gated
          by a single sign-in — the <code className="bs-code-inline">ADMIN_USER</code> and{' '}
          <code className="bs-code-inline">ADMIN_PASS</code> set when the station was
          installed. In production those credentials are mandatory: the station won't
          start without them, because the admin surface reveals too much to leave open.
        </p>
        <p>
          Behind the gate are three views — the console itself,{' '}
          <code className="bs-code-inline">/admin/settings</code>, and{' '}
          <code className="bs-code-inline">/admin/debug</code>.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">SETTINGS</p>
        <h2>Tuning the station.</h2>
        <p>
          Settings are saved durably and take effect without a redeploy — most apply to
          the next thing the DJ says. The main things you'll touch:
        </p>
        <ul className="bs-list">
          <li>
            <strong>DJ personas</strong> — the roster of souls (1&ndash;10), each with a
            name and character. The DJ picks one at random per spoken moment.
          </li>
          <li>
            <strong>DJ frequency</strong> — <em>quiet</em>, <em>moderate</em>, or{' '}
            <em>aggressive</em>: how often the DJ talks, IDs the station, and reads the
            time and weather.
          </li>
          <li>
            <strong>LLM provider</strong> — which model writes the DJ's words and picks
            tracks. Ollama on your own hardware by default, or a hosted provider
            (Anthropic, OpenAI, Google, and others) with an API key. Switching reroutes
            every call immediately.
          </li>
          <li>
            <strong>Voice (TTS)</strong> — which text-to-speech engine and voice the DJ
            speaks with, optionally a different one per kind of segment.
          </li>
          <li>
            <strong>Shows schedule</strong> — paint named shows onto a weekly grid; the DJ
            runs each as its own session.
          </li>
          <li>
            <strong>Mix settings</strong> — crossfade length and how often a jingle plays
            between tracks.
          </li>
        </ul>
        <div className="bs-callout">
          <div className="bs-eyebrow">MIX CHANGES NEED A MIXER RESTART</div>
          <p>
            Crossfade and jingle-ratio changes are read by the audio mixer only at
            startup. The settings page can trigger that restart for you — the stream drops
            for a few seconds and comes back with the new values applied.
          </p>
        </div>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">JINGLES</p>
        <h2>Station idents.</h2>
        <p>
          Jingles are short pre-rendered TTS stingers the station rotates between music
          tracks. The admin console manages the set — adding, removing, and re-rendering
          them through the configured voice. A fresh install ships with none until you
          generate them; after that, new renders are picked up automatically.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">WHEN SOMETHING'S OFF</p>
        <h2>The debug view.</h2>
        <p>
          <code className="bs-code-inline">/admin/debug</code> is a live snapshot for
          diagnosing the station — recent AI calls, the mixer's status, and the most
          recent log lines. It's the first place to look if the stream stalls or the DJ
          goes quiet.
        </p>
        <p>
          Installing or updating the station rather than tuning it? That's covered in{' '}
          <Link href="/setup" className="bs-link">the setup guide</Link>.
        </p>
      </section>
    </ManualPage>
  );
}
