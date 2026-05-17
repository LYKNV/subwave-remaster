import Link from 'next/link';
import SetupPage from './SetupPage';

const PATHS = [
  {
    href: '/setup/quick-start',
    label: 'Quick Start',
    blurb:
      'The interactive wizard, or one sentence to your AI coding agent. Pick this if you just want it running.',
  },
  {
    href: '/setup/manual',
    label: 'Manual Install',
    blurb:
      'The same outcome, command by command. Pick this if you script your installs or want a non-standard layout.',
  },
  {
    href: '/setup/development',
    label: 'Development',
    blurb:
      'Hacking on SUB/WAVE itself — the two compose files, hot reload, and the one rebuild gotcha.',
  },
];

export default function SetupOverview() {
  return (
    <SetupPage
      eyebrow="SELF-HOSTED · OPEN SOURCE"
      title="Run your own SUB/WAVE."
      intro="SUB/WAVE points at your Navidrome library and your LLM — a local Ollama box by default, or any hosted provider you prefer. Once it's running, the AI DJ broadcasts from your homelab, plays from your music collection, and answers requests from anyone with the URL."
      current="/setup"
    >
      <section className="bs-section">
        <p className="bs-eyebrow">WHAT'S INSIDE</p>
        <h2>Two ways to install, one way to hack.</h2>
        <p>
          Start at <Link href="/setup/prerequisites" className="bs-link">Prerequisites</Link> —
          SUB/WAVE talks to your existing services, so a couple of things need to be running
          first. Then pick whichever install path suits you. They land at the same place.
        </p>
        <ul className="bs-list">
          {PATHS.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="bs-link">
                <strong>{p.label}</strong>
              </Link>{' '}
              — {p.blurb}
            </li>
          ))}
        </ul>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">HOW LONG IT TAKES</p>
        <h2>About ten minutes.</h2>
        <p>
          If you already have Navidrome and an LLM running, the wizard gets you on the air in
          roughly ten minutes — most of it spent answering a handful of prompts and waiting on
          the first Docker build. The bulk of the work is the things SUB/WAVE depends on but
          doesn't ship, which is exactly what the next page covers.
        </p>
        <p>
          Just want to <em>listen</em> to a station, not run one?{' '}
          <Link href="/manual" className="bs-link">The manual</Link> covers tuning in and
          making requests.
        </p>
      </section>
    </SetupPage>
  );
}
