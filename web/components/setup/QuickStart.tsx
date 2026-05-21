import SetupPage from './SetupPage';
import CodeBlock from './CodeBlock';

export default function QuickStart() {
  return (
    <SetupPage
      eyebrow="SETUP · 02"
      title="The easy way in."
      intro="Two hands-off paths to a running stack. The interactive wizard asks a few questions and does the rest; the agent skill does the same from one sentence in your AI coding tool. Either one ends with the radio on the air."
      current="/setup/quick-start"
    >
      <section className="bs-section">
        <p className="bs-eyebrow">PATH A · INTERACTIVE WIZARD</p>
        <h2>Answer a few questions, get a running stack.</h2>
        <p>
          A terminal wizard that writes the env files, brings up the right compose file, and
          renders the station jingles. Requires Node 20+ and Docker.
        </p>
        <CodeBlock>{`git clone https://github.com/perminder-klair/subwave.git
cd subwave
npm install
npm run setup`}</CodeBlock>
        <p>
          Its first question is <em>dev or production?</em> Then it prompts for Navidrome and
          Ollama, runs <code className="bs-code-inline">scripts/setup.sh</code>, boots the
          stack, and generates jingles.
        </p>
        <ul className="bs-list">
          <li>
            <strong>Dev</strong> — uses{' '}
            <code className="bs-code-inline">docker-compose.yml</code>, keeps state in{' '}
            <code className="bs-code-inline">./state</code>, and optionally launches{' '}
            <code className="bs-code-inline">next dev</code> on{' '}
            <code className="bs-code-inline">:7700</code>.
          </li>
          <li>
            <strong>Production</strong> — uses{' '}
            <code className="bs-code-inline">docker-compose.prod.yml</code> with{' '}
            <code className="bs-code-inline">--build</code>, Caddy on{' '}
            <code className="bs-code-inline">:4800</code>, state in{' '}
            <code className="bs-code-inline">./state</code> (or wherever{' '}
            <code className="bs-code-inline">STATE_DIR</code> points). Re-run with sudo if the
            state directory isn't writable.
          </li>
        </ul>
        <div className="bs-callout">
          <div className="bs-eyebrow">SAFE TO RE-RUN</div>
          <p>
            Existing env values are kept unless you explicitly ask to reconfigure — so the
            wizard doubles as a way to bring an existing stack back up.
          </p>
        </div>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">PATH B · AI CODING AGENT</p>
        <h2>One sentence in your coding agent.</h2>
        <p>
          The repo ships an agent skill that handles setup, deploy, and update — it pings
          Navidrome and Ollama, boots the stack, generates jingles, and verifies the stream is
          on-air. It works with <strong>Claude Code</strong>, <strong>Codex</strong>,{' '}
          <strong>Cursor</strong>, or anything else that reads{' '}
          <code className="bs-code-inline">AGENTS.md</code>.
        </p>
        <p>Clone the repo, open your agent in it, and say one of:</p>
        <CodeBlock>{`git clone https://github.com/perminder-klair/subwave.git
cd subwave
# then in your agent of choice, ask:
# "set up subwave"
# "deploy subwave"
# "pull and restart"`}</CodeBlock>
        <div className="bs-callout">
          <div className="bs-eyebrow">WHY USE THE SKILL</div>
          <p>
            On updates the same skill detects which services actually changed and rebuilds
            only those. Liquidsoap and the Controller <em>COPY</em> their source at build
            time, so a plain <code className="bs-code-inline">docker compose restart</code>{' '}
            silently runs stale code — the skill won't make that mistake.
          </p>
        </div>
      </section>
    </SetupPage>
  );
}
