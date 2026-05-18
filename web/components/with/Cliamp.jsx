import Link from 'next/link';
import WithPage from './WithPage';
import StreamUrl from './StreamUrl';
import CodeBlock from '../setup/CodeBlock';

export default function Cliamp() {
  return (
    <WithPage
      eyebrow="LISTEN WITH · CLIAMP"
      title="SUB/WAVE in your terminal."
      intro="cliamp is a terminal music player with built-in internet-radio support. Point it at the stream URL and the broadcast plays straight in your shell — no browser, no window, just a small now-playing display."
      current="/with/cliamp"
    >
      <section className="bs-section">
        <p className="bs-eyebrow">INSTALL</p>
        <h2>Get cliamp.</h2>
        <p>
          cliamp is an open-source Go program. Grab a release binary, or build it from
          source with a recent Go toolchain:
        </p>
        <CodeBlock>{`# build from source — needs Go 1.25+
go install github.com/bjarneo/cliamp@latest`}</CodeBlock>
        <p className="muted">
          On Linux you also want the ALSA bridge for your audio server &mdash;{' '}
          <code className="bs-code-inline">pipewire-alsa</code> or{' '}
          <code className="bs-code-inline">pulseaudio-alsa</code>. Installing{' '}
          <code className="bs-code-inline">ffmpeg</code> is optional and only needed for
          non-MP3 codecs; SUB/WAVE broadcasts plain MP3, so cliamp plays it natively.
        </p>
        <div className="bs-callout">
          <div className="bs-eyebrow">PROJECT HOME</div>
          <p>
            cliamp lives at{' '}
            <a
              href="https://github.com/bjarneo/cliamp"
              className="bs-link"
              target="_blank"
              rel="noreferrer"
            >
              github.com/bjarneo/cliamp ↗
            </a>{' '}
            &mdash; check there for the current install steps and platform notes.
          </p>
        </div>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">TUNE IN</p>
        <h2>One command.</h2>
        <p>Pass the station&rsquo;s stream URL straight to cliamp:</p>
        <StreamUrl prefix="cliamp " />
        <p>
          cliamp shows <code className="bs-code-inline">● Streaming</code> with a
          non-interactive seek bar &mdash; that is expected. SUB/WAVE is a live
          broadcast, so there is nothing to seek through. Press{' '}
          <kbd className="bs-kbd">u</kbd> to load a different stream, or{' '}
          <kbd className="bs-kbd">R</kbd> to browse cliamp&rsquo;s own radio directory.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">TROUBLESHOOTING</p>
        <h2>If it just sits there buffering.</h2>
        <p>
          The most common snag: the public station URL is served through Cloudflare over
          HTTP/2. A radio player consumes the stream at exactly its bitrate
          (192&nbsp;kbps), and HTTP/2 flow control delivers that in bursts &mdash; fast
          enough on average, but bursty enough that a lean player underruns between
          bursts and shows <em>buffering</em>. Browsers and VLC paper over it with deep
          buffers; cliamp is lighter and notices.
        </p>
        <p>The stream itself is healthy &mdash; here is how to confirm that and fix it:</p>
        <ul className="bs-list">
          <li>
            <strong>Rule out the network.</strong> If{' '}
            <code className="bs-code-inline">mpv &lt;stream-url&gt;</code> or VLC plays
            the same URL smoothly, the stream is fine and it is the HTTP/2 path that
            cliamp is struggling with.
          </li>
          <li>
            <strong>Use a direct address.</strong> Ask the station operator for a URL
            that skips Cloudflare &mdash; a LAN or Tailscale address pointing straight at
            the station&rsquo;s edge (the Caddy port, usually{' '}
            <code className="bs-code-inline">:4800</code>). Those serve plain HTTP/1.1
            and stream at a steady, even rate.
          </li>
        </ul>
        <CodeBlock>{`# through Cloudflare — HTTP/2, may stutter in a CLI player
cliamp https://radio.example.co/stream.mp3

# direct to the station on your network — HTTP/1.1, steady
cliamp http://192.168.1.20:4800/stream.mp3
cliamp http://100.x.x.x:4800/stream.mp3   # over Tailscale`}</CodeBlock>
        <div className="bs-callout">
          <div className="bs-eyebrow">FOR OPERATORS</div>
          <p>
            If you run the station, the direct address is your host&rsquo;s LAN or
            Tailscale IP on the Caddy port from{' '}
            <code className="bs-code-inline">docker-compose.prod.yml</code> (
            <code className="bs-code-inline">4800</code> by default). It bypasses
            Cloudflare&rsquo;s HTTP/2 edge entirely. See the{' '}
            <Link href="/setup" className="bs-link">setup guide</Link> for the deployment
            layout.
          </p>
        </div>
      </section>
    </WithPage>
  );
}
