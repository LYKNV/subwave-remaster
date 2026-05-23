import Link from 'next/link';
import SetupPage from './SetupPage';
import CodeBlock from "@/components/CodeBlock";

const PATHS = [
  {
    href: '/setup/quick-start',
    label: 'Quick Start',
    blurb: 'The interactive wizard, or one sentence to your AI coding agent.',
  },
  {
    href: '/setup/manual',
    label: 'Manual Install',
    blurb: 'The same outcome, command by command, for scripted or non-standard installs.',
  },
  {
    href: '/setup/development',
    label: 'Development',
    blurb: 'Hacking on SUB/WAVE itself — the two compose files and hot reload.',
  },
];

export default function SetupOverview() {
  return (
    <SetupPage
      eyebrow="SELF-HOSTED · OPEN SOURCE"
      title="Run your own SUB/WAVE."
      meta="≈ 10 min · 4 commands · needs Navidrome + an LLM"
      intro="SUB/WAVE points at your Navidrome library and your LLM — a local Ollama box by default, or any hosted provider you prefer. Once it's running, the AI DJ broadcasts from your homelab, plays from your music collection, and answers requests from anyone with the URL."
      current="/docs/setup"
      heroAside={
        <div className="bs-dj-glyph" aria-hidden="true">
          <div className="bs-dj-vinyl" />
        </div>
      }
    >
      <section className="bs-section">
        <div className="bs-faststart">
          <p className="bs-eyebrow">THE FAST PATH</p>
          <p>
            Already have Docker, Node 20+, Navidrome, and an LLM reachable? It's
            four commands — the wizard handles the rest.
          </p>
          <CodeBlock>{`git clone https://github.com/perminder-klair/subwave.git
cd subwave
npm install
npm run setup`}</CodeBlock>
          <p className="text-muted">
            The wizard asks <em>dev or production?</em>, prompts for Navidrome and
            Ollama, boots the stack, and renders the station jingles.{' '}
            <Link href="/docs/setup/quick-start" className="bs-link">
              Full walkthrough →
            </Link>
          </p>
          <p className="text-muted">
            Once it's running, <code className="bs-code-inline">npm start</code> opens
            the operator console — a menu for stack status, a diagnostic sweep, logs,
            restart, and the terminal player.
          </p>
        </div>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">IF YOU'RE NEW HERE</p>
        <h2>Start at Prerequisites.</h2>
        <p>
          SUB/WAVE talks to services it doesn't ship, so a couple of things need
          to be running first.{' '}
          <Link href="/docs/setup/prerequisites" className="bs-link">Prerequisites</Link>{' '}
          covers them, then pick whichever install path suits you — they all land
          at the same place:
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
        <p>
          Just want to <em>listen</em> to a station, not run one?{' '}
          <Link href="/manual" className="bs-link">The manual</Link> covers tuning
          in and making requests.
        </p>
      </section>
    </SetupPage>
  );
}
