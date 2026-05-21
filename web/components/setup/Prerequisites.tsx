import Link from 'next/link';
import SetupPage from './SetupPage';

export default function Prerequisites() {
  return (
    <SetupPage
      eyebrow="SETUP · 01"
      title="Have these ready."
      intro="SUB/WAVE doesn't ship Navidrome or Ollama — it talks to yours. Get them running first if they aren't already, and note the URLs and credentials. The install wizard will ask for them."
      current="/setup/prerequisites"
    >
      <section className="bs-section">
        <p className="bs-eyebrow">ON THE HOST</p>
        <h2>Docker and Node.</h2>
        <ul className="bs-list">
          <li>
            <strong>Docker + Compose plugin</strong> — the stack ships as four containers in
            dev, five in production.
          </li>
          <li>
            <strong>Node 20+</strong> — only for the{' '}
            <code className="bs-code-inline">npm run setup</code> wizard and the web dev
            server. A production deploy can run without it.
          </li>
        </ul>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">THE MUSIC LIBRARY</p>
        <h2>A Subsonic-API server.</h2>
        <p>
          SUB/WAVE plays from a <strong>Navidrome</strong> library — or any server that speaks
          the Subsonic API — reachable from wherever the stack runs. Note the URL, username,
          and password; the wizard asks for all three.
        </p>
        <p className="text-muted">
          <a href="https://www.navidrome.org/" target="_blank" rel="noreferrer" className="bs-link">
            navidrome.org ↗
          </a>
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">THE DJ'S BRAIN</p>
        <h2>An LLM provider.</h2>
        <p>
          The DJ's words and track picks come from a language model. The homelab default is{' '}
          <strong>Ollama</strong> with a tool-capable model — qwen3.5, qwen3.6, or gemma4
          all work. Note the URL and model name.
        </p>
        <p>
          Prefer a hosted model? SUB/WAVE also supports Anthropic, OpenAI, Google, OpenRouter,
          and DeepSeek. You pick the provider in the admin Settings UI after install and supply
          the API key there — not during setup.
        </p>
        <p className="text-muted">
          <a href="https://ollama.com/" target="_blank" rel="noreferrer" className="bs-link">
            ollama.com ↗
          </a>
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">READY?</p>
        <h2>Pick an install path.</h2>
        <p>
          With Navidrome and an LLM reachable, head to{' '}
          <Link href="/setup/quick-start" className="bs-link">Quick Start</Link> for the
          wizard, or <Link href="/setup/manual" className="bs-link">Manual Install</Link> to
          run the commands yourself.
        </p>
      </section>
    </SetupPage>
  );
}
