'use client';

import Link from 'next/link';
import Masthead from '../landing/Masthead';
import StationFooter from '../landing/StationFooter';
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

export default function SetupPage() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh' }}>
      <Masthead />

      <main className="bs-paper">
        <section className="bs-setup-hero">
          <p className="bs-eyebrow">SELF-HOSTED · OPEN SOURCE</p>
          <h1>Run your own SUB/WAVE.</h1>
          <p>
            SUB/WAVE points at <strong style={{ color: 'var(--ink)' }}>your</strong> Navidrome
            library and <strong style={{ color: 'var(--ink)' }}>your</strong> LLM — a local
            Ollama box by default, or any hosted provider you prefer. Once it's running, the
            LLM-driven DJ broadcasts from your homelab, plays from your music collection, and
            answers requests from anyone with the URL. About ten minutes to set up if you
            already have Navidrome and an LLM running.
          </p>
        </section>

        {/* ── Prerequisites ───────────────────────────────────────────────── */}
        <section className="bs-section" id="prereqs">
          <p className="bs-eyebrow">BEFORE YOU START</p>
          <h2>Have these ready.</h2>
          <p>
            SUB/WAVE doesn't ship Navidrome or Ollama — it talks to yours. Get them
            running first if they aren't already.
          </p>
          <ul className="bs-list">
            <li><strong>Docker + Compose plugin</strong> — the stack ships as four (dev) or five (prod) containers.</li>
            <li><strong>Node 20+</strong> — only for the <code className="bs-code-inline">npm run setup</code> wizard and the web dev server.</li>
            <li>
              <strong>Navidrome</strong> (or any Subsonic-API server) reachable from where the
              stack runs. Note the URL, username, password.
              <a href="https://www.navidrome.org/" target="_blank" rel="noreferrer" className="bs-link" style={{ marginLeft: 6, fontSize: 12 }}>navidrome.org ↗</a>
            </li>
            <li>
              <strong>An LLM provider.</strong> The homelab default is{' '}
              <strong>Ollama</strong> with a tool-capable model (qwen2.5:7b, llama3.1:8b,
              nemotron) — note the URL and model name.
              <a href="https://ollama.com/" target="_blank" rel="noreferrer" className="bs-link" style={{ marginLeft: 6, fontSize: 12 }}>ollama.com ↗</a>
              {' '}Or use a hosted provider (Anthropic, OpenAI, Google, OpenRouter,
              DeepSeek) — pick it in the admin Settings UI and supply the API key.
            </li>
            <li>
              <strong>(Optional) ffmpeg</strong> — used by{' '}
              <code className="bs-code-inline">scripts/setup.sh</code> to render the
              emergency fallback and studio bed audio.
            </li>
          </ul>
        </section>

        {/* ── Path A: npm wizard ──────────────────────────────────────────── */}
        <section className="bs-section" id="wizard">
          <div className="bs-callout">
            <div className="bs-eyebrow">PATH A · INTERACTIVE WIZARD</div>
            <h2 style={{ margin: '4px 0 8px' }}>Answer a few questions, get a running stack.</h2>
            <p>Interactive terminal wizard. Requires Node 20+ and Docker.</p>
            <CodeBlock>{`git clone https://github.com/perminder-klair/subwave.git
cd subwave
npm install
npm run setup`}</CodeBlock>
            <p>
              First question: <em>dev or production?</em> Then prompts for Navidrome and
              Ollama, runs <code className="bs-code-inline">scripts/setup.sh</code>, brings
              up the right compose file, and renders jingles.
            </p>
            <ul className="bs-list">
              <li>
                <strong>Dev</strong> — <code className="bs-code-inline">docker-compose.yml</code>,
                state in <code className="bs-code-inline">./state</code>, optionally
                launches <code className="bs-code-inline">next dev</code> on{' '}
                <code className="bs-code-inline">:7700</code>.
              </li>
              <li>
                <strong>Production</strong> —{' '}
                <code className="bs-code-inline">docker-compose.prod.yml</code> with{' '}
                <code className="bs-code-inline">--build</code>, Caddy on{' '}
                <code className="bs-code-inline">:4800</code>, state in{' '}
                <code className="bs-code-inline">./state</code> (or wherever you
                point <code className="bs-code-inline">STATE_DIR</code>). Re-run with sudo
                if the state dir isn't writable.
              </li>
            </ul>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Safe to re-run — existing env values are kept unless you ask to reconfigure.
            </p>
          </div>
        </section>

        {/* ── Path B: agent skill ─────────────────────────────────────────── */}
        <section className="bs-section" id="agent">
          <div className="bs-callout">
            <div className="bs-eyebrow">PATH B · AI CODING AGENT</div>
            <h2 style={{ margin: '4px 0 8px' }}>One sentence in your coding agent.</h2>
            <p>
              The repo ships an agent skill that handles setup, deploy, and update — it
              pings Navidrome and Ollama, boots the stack, generates jingles, and verifies
              the stream is on-air. Works with{' '}
              <strong style={{ color: 'var(--ink)' }}>Claude Code</strong>,{' '}
              <strong style={{ color: 'var(--ink)' }}>Codex</strong>,{' '}
              <strong style={{ color: 'var(--ink)' }}>Cursor</strong>, or anything else
              that reads <code className="bs-code-inline">AGENTS.md</code>.
            </p>
            <p>
              Clone the repo, open your agent in it, and say one of:
            </p>
            <CodeBlock>{`git clone https://github.com/perminder-klair/subwave.git
cd subwave
# then in your agent of choice, ask:
# "set up subwave"
# "deploy subwave"
# "pull and restart"`}</CodeBlock>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              On updates the same skill detects which services actually changed and only
              rebuilds those — Liquidsoap and the Controller <em>COPY</em> source at build
              time, so a plain <code className="bs-code-inline">docker compose restart</code>
              {' '}silently runs stale code. The skill won't make that mistake.
            </p>
          </div>
        </section>

        {/* ── Development workflow ────────────────────────────────────────── */}
        <section className="bs-section" id="dev-mode">
          <p className="bs-eyebrow">DEVELOPMENT WORKFLOW</p>
          <h2>Hacking on SUB/WAVE.</h2>
          <p>
            Two compose files, two deployment shapes. Dev mode runs the radio backend in
            Docker and the Next.js UI on the host with hot reload, so you can iterate on
            the web without a rebuild.
          </p>

          <table className="bs-rebuild-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Compose file</th>
                <th>What runs</th>
                <th>State dir</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code className="bs-code-inline">docker/docker-compose.yml</code></td>
                <td>icecast · liquidsoap · controller (web runs separately on host)</td>
                <td><code className="bs-code-inline">./state</code></td>
              </tr>
              <tr>
                <td><code className="bs-code-inline">docker/docker-compose.prod.yml</code></td>
                <td>+ web (built image) + caddy edge</td>
                <td><code className="bs-code-inline">${'{STATE_DIR:-<repo>/state}'}</code></td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 24 }}>Day-to-day commands</h3>
          <p>
            All wired into <code className="bs-code-inline">package.json</code> so you don't
            have to remember the compose flags:
          </p>
          <CodeBlock>{`npm run setup        # interactive wizard (writes envs, brings the stack up)
npm run dev          # alias for setup — same wizard
npm run dev:docker   # docker compose up -d        (radio backend only)
npm run dev:web      # next dev on :7700           (hot-reloaded UI)
npm run rebuild      # docker compose up -d --build  (after controller/liquidsoap src changes)
npm run logs         # tail docker logs
npm run jingles      # render station idents via Piper
npm run down         # stop the stack`}</CodeBlock>

          <h3 style={{ marginTop: 24 }}>A typical dev session</h3>
          <CodeBlock>{`# one-time, in two terminals:
npm run dev:docker   # terminal 1: backend (Icecast, Liquidsoap, Controller)
npm run dev:web      # terminal 2: Next.js on http://localhost:7700

# editing web/** — saves are hot-reloaded, no docker action needed.
# editing controller/src/** or liquidsoap/radio.liq:
npm run rebuild      # rebuilds + recreates the affected containers`}</CodeBlock>

          <div className="bs-callout" style={{ marginTop: 16 }}>
            <div className="bs-eyebrow">THE ONE GOTCHA</div>
            <p>
              <strong>Code changes need a rebuild, not a restart.</strong> Both the
              controller and Liquidsoap Dockerfiles <code className="bs-code-inline">COPY</code>
              {' '}their source at build time — they don't bind-mount it. So{' '}
              <code className="bs-code-inline">docker compose restart controller</code> will
              cheerfully rerun the same baked-in code as before.{' '}
              <code className="bs-code-inline">npm run rebuild</code> (or{' '}
              <code className="bs-code-inline">docker compose up -d --build &lt;service&gt;</code>)
              is what you want.
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
              The web dev server (<code className="bs-code-inline">npm run dev:web</code>) is
              exempt — Next.js hot-reloads, so edits to{' '}
              <code className="bs-code-inline">web/**</code> show up instantly without
              touching Docker.
            </p>
          </div>
        </section>

        {/* ── Path C: Manual ──────────────────────────────────────────────── */}
        <section className="bs-section" id="manual">
          <p className="bs-eyebrow">PATH C · MANUAL</p>
          <h2>Run the commands yourself.</h2>
          <p>
            Same outcome as Path A, just without the wizard wrapping it. Useful if you're
            scripting around the install, want a non-standard layout, or just prefer
            running each command by hand. The numbered steps below land you at the same
            public-facing single-host deploy — Caddy on the edge, Cloudflare in front,
            internal-only Icecast/Controller/Web.
          </p>
        </section>

        {/* ── Step 1 ── clone ─────────────────────────────────────────────── */}
        <div className="bs-step">
          <div className="bs-step-num">01</div>
          <div className="bs-step-body">
            <h3>Clone the repo</h3>
            <CodeBlock>{`git clone https://github.com/perminder-klair/subwave.git
cd subwave`}</CodeBlock>
          </div>
        </div>

        {/* ── Step 2 ── controller .env ───────────────────────────────────── */}
        <div className="bs-step">
          <div className="bs-step-num">02</div>
          <div className="bs-step-body">
            <h3>Tell the controller where your Navidrome library lives</h3>
            <p>Copy the template and fill in your values:</p>
            <CodeBlock>{`cp controller/.env.example controller/.env
$EDITOR controller/.env`}</CodeBlock>
            <p>
              The values that actually matter (the rest of the template has good
              defaults). The LLM provider and model are chosen later, in the admin
              Settings UI — not here:
            </p>
            <CodeBlock lang="env">{ENV_TEMPLATE}</CodeBlock>
            <div className="bs-callout">
              <div className="bs-eyebrow">CONNECTION TEST</div>
              <p>
                Before booting the stack, you can sanity-check Navidrome from your terminal:
              </p>
              <CodeBlock>{`curl "$NAVIDROME_URL/rest/ping.view?u=$NAVIDROME_USER&p=$NAVIDROME_PASS&v=1.16.1&c=sub-wave&f=json"`}</CodeBlock>
              <p>You should get back <code className="bs-code-inline">{'{ "subsonic-response": { "status": "ok" ... } }'}</code>.</p>
            </div>
          </div>
        </div>

        {/* ── Step 3 ── icecast/state ─────────────────────────────────────── */}
        <div className="bs-step">
          <div className="bs-step-num">03</div>
          <div className="bs-step-body">
            <h3>Configure the broadcast layer</h3>
            <p>
              Icecast needs three passwords and a state directory the containers
              can share. <code className="bs-code-inline">scripts/setup.sh</code> renders
              the Icecast config from a template; running it once is enough.
            </p>
            <CodeBlock lang="env">{ICECAST_ENV}</CodeBlock>
            <CodeBlock>{`sudo ./scripts/setup.sh   # state defaults to <repo>/state`}</CodeBlock>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              The <code className="bs-code-inline">STATE_DIR</code> is where Liquidsoap, the
              controller, and the web container exchange files (next track, voice WAVs,
              now-playing). Anything that survives <code className="bs-code-inline">docker compose down</code>
              {' '}lives there.
            </p>
          </div>
        </div>

        {/* ── Step 4 ── boot ──────────────────────────────────────────────── */}
        <div className="bs-step">
          <div className="bs-step-num">04</div>
          <div className="bs-step-body">
            <h3>Boot the stack</h3>
            <CodeBlock>{`docker compose -f docker/docker-compose.prod.yml up -d --build`}</CodeBlock>
            <p>What just started:</p>
            <ul className="bs-list">
              <li><strong>icecast</strong> — broadcast endpoint, internal-only</li>
              <li><strong>liquidsoap</strong> — mixer feeding Icecast</li>
              <li><strong>controller</strong> — the DJ brain (this is the one talking to Navidrome + Ollama)</li>
              <li><strong>web</strong> — Next.js UI, internal-only</li>
              <li><strong>caddy</strong> — the only thing bound to a host port (<code className="bs-code-inline">:4800</code>)</li>
            </ul>
            <p>
              Generate the Piper station idents the first time:
            </p>
            <CodeBlock>{`./scripts/generate-jingles.sh`}</CodeBlock>
          </div>
        </div>

        {/* ── Step 5 ── open ──────────────────────────────────────────────── */}
        <div className="bs-step">
          <div className="bs-step-num">05</div>
          <div className="bs-step-body">
            <h3>Tune in</h3>
            <CodeBlock>{`open http://localhost:4800`}</CodeBlock>
            <p>
              Behind a domain? Put it behind Cloudflare or Tailscale; Caddy
              has <code className="bs-code-inline">auto_https off</code>, so terminate TLS upstream.
            </p>
            <div className="bs-callout">
              <div className="bs-eyebrow">EDIT THE DJ</div>
              <p>
                Sign in to the admin console at{' '}
                <code className="bs-code-inline">/admin</code> (the{' '}
                <code className="bs-code-inline">ADMIN_USER</code> /{' '}
                <code className="bs-code-inline">ADMIN_PASS</code> you set earlier).
                Build a roster of DJ personas — each with its own name, soul, voice,
                and skills — pick the LLM provider, and paint the weekly Shows
                schedule. Persona changes apply on the next intro — no restart needed.
              </p>
            </div>
          </div>
        </div>

        {/* ── Step 6 ── verify ───────────────────────────────────────────── */}
        <div className="bs-step">
          <div className="bs-step-num">06</div>
          <div className="bs-step-body">
            <h3>Verify the broadcast</h3>
            <p>
              The repo ships a health-probe that checks the containers,
              hits <code className="bs-code-inline">/api/health</code> and
              {' '}<code className="bs-code-inline">/api/now-playing</code>, and
              scans recent logs for errors. Run it after any deploy:
            </p>
            <CodeBlock>{`./scripts/health-check.sh`}</CodeBlock>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Auto-detects which compose file is live and which host port Caddy
              is mapped to. Exits 0 if healthy. Safe to wire into cron or a
              status page.
            </p>
          </div>
        </div>

        {/* ── Updates ─────────────────────────────────────────────────────── */}
        <section className="bs-section" id="updates">
          <p className="bs-eyebrow">KEEPING IT UP TO DATE</p>
          <h2>Pull, rebuild only what changed, recreate.</h2>
          <p>
            Liquidsoap and the Controller <em>COPY</em> source at build time, so{' '}
            <code className="bs-code-inline">docker compose restart</code> does{' '}
            <strong>not</strong> pick up code changes — you need{' '}
            <code className="bs-code-inline">up -d --build &lt;service&gt;</code>.
          </p>

          <table className="bs-rebuild-table">
            <thead>
              <tr>
                <th>If this changed</th>
                <th>Rebuild</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code className="bs-code-inline">controller/src/**</code></td>          <td>controller</td></tr>
              <tr><td><code className="bs-code-inline">liquidsoap/radio.liq</code></td>       <td>liquidsoap</td></tr>
              <tr><td><code className="bs-code-inline">web/**</code></td>                     <td>web (prod) · hot-reload (dev)</td></tr>
              <tr><td><code className="bs-code-inline">docker/Caddyfile</code></td>           <td>just <code className="bs-code-inline">restart caddy</code> (mounted)</td></tr>
              <tr><td><code className="bs-code-inline">docker/docker-compose*.yml</code></td> <td><code className="bs-code-inline">up -d</code> (compose decides)</td></tr>
              <tr><td>README / TODO / docs</td>                                               <td>nothing</td></tr>
            </tbody>
          </table>

          <p style={{ marginTop: 16 }}>Typical manual deploy:</p>
          <CodeBlock>{`git pull --ff-only
# rebuild only what changed (example: controller + web)
docker compose -f docker/docker-compose.prod.yml up -d --build controller web
# then verify
./scripts/health-check.sh`}</CodeBlock>

          <div className="bs-callout">
            <div className="bs-eyebrow">OR LET CLAUDE CODE DO IT</div>
            <p>
              The <code className="bs-code-inline">subwave-deploy</code> skill at{' '}
              <code className="bs-code-inline">.claude/skills/subwave-deploy/</code>{' '}
              automates the entire "pull, detect what changed, rebuild only the affected
              services, verify health" loop. Open a Claude Code session in the repo and say
              {' '}<em>"deploy subwave"</em> or <em>"pull and restart"</em>.
            </p>
          </div>
        </section>

        {/* ── Troubleshooting ─────────────────────────────────────────────── */}
        <section className="bs-section">
          <p className="bs-eyebrow">WHEN THINGS GO WRONG</p>
          <h2>Logs are the source of truth.</h2>
          <ul className="bs-list">
            <li>
              <strong>Controller logs</strong> —
              <code className="bs-code-inline">docker compose -f docker/docker-compose.prod.yml logs -f controller</code>
            </li>
            <li>
              <strong>Liquidsoap logs</strong> —
              <code className="bs-code-inline">docker compose -f docker/docker-compose.prod.yml logs -f liquidsoap</code>
            </li>
            <li>
              <strong>Built-in diagnostics</strong> —
              open <Link href="/admin/debug" className="bs-link">/admin/debug</Link> for a live snapshot
              of every state file, recent LLM calls, Icecast status, and the most recent
              100 lines of Liquidsoap.
            </li>
            <li>
              <strong>Source code</strong> —{' '}
              <a href="https://github.com/perminder-klair/subwave" target="_blank" rel="noreferrer" className="bs-link">
                github.com/perminder-klair/subwave ↗
              </a>{' '}
              — file an issue or read the CLAUDE.md for architecture notes.
            </li>
          </ul>
        </section>

        <StationFooter />
      </main>
    </div>
  );
}
