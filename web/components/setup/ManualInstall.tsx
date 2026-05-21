import Link from 'next/link';
import SetupPage from './SetupPage';
import CodeBlock from './CodeBlock';

const ENV_TEMPLATE = `# controller/.env — point SUB/WAVE at your services

# Navidrome (or any Subsonic-API server)
NAVIDROME_URL=http://navidrome.local:4533
NAVIDROME_USER=your-username
NAVIDROME_PASS=your-password

# (Optional) If the controller can read your music files directly from
# disk, set this to the mount path — skips streaming over HTTP.
# MUSIC_LIBRARY_PATH=/music

# LLM — the active provider + model are chosen in the admin Settings UI,
# not here. Ollama (the homelab default) needs no key. Only set a cloud
# key below if you switch to a hosted provider in Settings.
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
# OPENROUTER_API_KEY=
# DEEPSEEK_API_KEY=
# ELEVENLABS_API_KEY=     # only for the 'cloud' TTS voice

# Icecast source password (any string; just match the docker-compose env)
ICECAST_SOURCE_PASSWORD=replace-me-with-a-strong-string

# Admin auth — gates the /admin console. REQUIRED in production (the
# controller refuses to boot without it); optional for local dev.
ADMIN_USER=admin
ADMIN_PASS=replace-me`;

const ICECAST_ENV = `# docker/.env
ICECAST_SOURCE_PASSWORD=replace-me-with-a-strong-string
ICECAST_ADMIN_PASSWORD=another-strong-string
ICECAST_RELAY_PASSWORD=another-strong-string
SUBWAVE_HOMEPAGE=landing
# STATE_DIR=/srv/subwave   # optional — defaults to <repo>/state`;

export default function ManualInstall() {
  return (
    <SetupPage
      eyebrow="SETUP · 03"
      title="Run the commands yourself."
      intro="The same outcome as the wizard, just without the wizard wrapping it. Useful if you're scripting the install, want a non-standard layout, or just prefer running each command by hand. These six steps land at a public-facing single-host deploy — Caddy on the edge, Cloudflare in front, internal-only Icecast, Controller, and Web."
      current="/setup/manual"
    >
      <section className="bs-section">
        <div className="bs-step">
          <div className="bs-step-num">01</div>
          <div className="bs-step-body">
            <h3>Clone the repo</h3>
            <CodeBlock>{`git clone https://github.com/perminder-klair/subwave.git
cd subwave`}</CodeBlock>
          </div>
        </div>

        <div className="bs-step">
          <div className="bs-step-num">02</div>
          <div className="bs-step-body">
            <h3>Tell the controller where your Navidrome library lives</h3>
            <p>Copy the template and fill in your values:</p>
            <CodeBlock>{`cp controller/.env.example controller/.env
$EDITOR controller/.env`}</CodeBlock>
            <p>
              The values that actually matter — the rest of the template has good defaults.
              The LLM provider and model are chosen later, in the admin Settings UI, not here:
            </p>
            <CodeBlock lang="env">{ENV_TEMPLATE}</CodeBlock>
            <div className="bs-callout">
              <div className="bs-eyebrow">CONNECTION TEST</div>
              <p>Before booting the stack, sanity-check Navidrome from your terminal:</p>
              <CodeBlock>{`curl "$NAVIDROME_URL/rest/ping.view?u=$NAVIDROME_USER&p=$NAVIDROME_PASS&v=1.16.1&c=sub-wave&f=json"`}</CodeBlock>
              <p>
                You should get back{' '}
                <code className="bs-code-inline">{'{ "subsonic-response": { "status": "ok" ... } }'}</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="bs-step">
          <div className="bs-step-num">03</div>
          <div className="bs-step-body">
            <h3>Configure the broadcast layer</h3>
            <p>
              Icecast needs three passwords and a state directory the containers can share.{' '}
              <code className="bs-code-inline">scripts/setup.sh</code> renders the Icecast
              config from a template; running it once is enough.
            </p>
            <CodeBlock lang="env">{ICECAST_ENV}</CodeBlock>
            <CodeBlock>{`sudo ./scripts/setup.sh   # state defaults to <repo>/state`}</CodeBlock>
            <p className="text-muted">
              <code className="bs-code-inline">STATE_DIR</code> is where Liquidsoap, the
              controller, and the web container exchange files — next track, voice WAVs,
              now-playing. Anything that survives{' '}
              <code className="bs-code-inline">docker compose down</code> lives there.
            </p>
          </div>
        </div>

        <div className="bs-step">
          <div className="bs-step-num">04</div>
          <div className="bs-step-body">
            <h3>Boot the stack</h3>
            <CodeBlock>{`docker compose -f docker/docker-compose.prod.yml up -d --build`}</CodeBlock>
            <p>What just started:</p>
            <ul className="bs-list">
              <li><strong>icecast</strong> — broadcast endpoint, internal-only</li>
              <li><strong>liquidsoap</strong> — mixer feeding Icecast</li>
              <li><strong>controller</strong> — the DJ brain; the one talking to Navidrome and Ollama</li>
              <li><strong>web</strong> — Next.js UI, internal-only</li>
              <li>
                <strong>caddy</strong> — the only thing bound to a host port (
                <code className="bs-code-inline">:4800</code>)
              </li>
            </ul>
            <p>Generate the Piper station idents the first time:</p>
            <CodeBlock>{`./scripts/generate-jingles.sh`}</CodeBlock>
          </div>
        </div>

        <div className="bs-step">
          <div className="bs-step-num">05</div>
          <div className="bs-step-body">
            <h3>Tune in</h3>
            <CodeBlock>{`open http://localhost:4800`}</CodeBlock>
            <p>
              Behind a domain? Put it behind Cloudflare or Tailscale; Caddy has{' '}
              <code className="bs-code-inline">auto_https off</code>, so terminate TLS
              upstream.
            </p>
            <div className="bs-callout">
              <div className="bs-eyebrow">EDIT THE DJ</div>
              <p>
                Sign in to the admin console at{' '}
                <code className="bs-code-inline">/admin</code> with the{' '}
                <code className="bs-code-inline">ADMIN_USER</code> /{' '}
                <code className="bs-code-inline">ADMIN_PASS</code> you set earlier. Build a
                roster of DJ personas — each with its own name, soul, voice, and skills — pick
                the LLM provider, and paint the weekly Shows schedule. Persona changes apply
                on the next intro, no restart needed.
              </p>
            </div>
          </div>
        </div>

        <div className="bs-step">
          <div className="bs-step-num">06</div>
          <div className="bs-step-body">
            <h3>Verify the broadcast</h3>
            <p>
              The repo ships a health probe that checks the containers, hits{' '}
              <code className="bs-code-inline">/api/health</code> and{' '}
              <code className="bs-code-inline">/api/now-playing</code>, and scans recent logs
              for errors. Run it after any deploy:
            </p>
            <CodeBlock>{`./scripts/health-check.sh`}</CodeBlock>
            <p className="text-muted">
              Auto-detects which compose file is live and which host port Caddy is mapped to.
              Exits 0 if healthy. Safe to wire into cron or a status page.
            </p>
          </div>
        </div>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">WHAT'S NEXT</p>
        <h2>Keep it running.</h2>
        <p>
          The stack is on the air. When a new version lands, head to{' '}
          <Link href="/setup/updates" className="bs-link">Updates &amp; Help</Link> for the
          rebuild-only-what-changed workflow and the troubleshooting checklist.
        </p>
      </section>
    </SetupPage>
  );
}
