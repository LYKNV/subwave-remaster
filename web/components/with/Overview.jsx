import Link from 'next/link';
import WithPage from './WithPage';
import StreamUrl from './StreamUrl';

const CLIENTS = [
  {
    href: '/with/vlc',
    label: 'VLC',
    blurb:
      'The everywhere player — Windows, macOS, Linux, iOS, and Android. The safe first choice.',
  },
  {
    href: '/with/cliamp',
    label: 'cliamp',
    blurb:
      'A radio player that lives in your terminal, for listening without leaving the command line.',
  },
];

export default function Overview() {
  return (
    <WithPage
      eyebrow="LISTEN WITH"
      title="Tune in from any player."
      intro="The browser player is the front door to SUB/WAVE, but it isn't the only way in. Underneath, the station is a single Icecast MP3 stream — and any app that can open an internet-radio URL can listen along, in perfect sync with everyone else."
      current="/with"
    >
      <section className="bs-section">
        <p className="bs-eyebrow">THE ONE THING YOU NEED</p>
        <h2>The stream URL.</h2>
        <p>
          Every external player asks for the same thing: the address of the stream. For
          this station it is <code className="bs-code-inline">/stream.mp3</code> on the
          station&rsquo;s own domain &mdash;
        </p>
        <StreamUrl />
        <p className="muted">
          Paste that into any of the apps below. It is a live broadcast, so there is no
          pause and no seek &mdash; closing the app and reopening it drops you back
          wherever the station is <em>now</em>, not where you left off.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">PICK YOUR APP</p>
        <h2>A guide for each client.</h2>
        <p>
          Each page walks through installing the app and pointing it at the stream. If
          you just want something that works on every device you own, start with VLC.
        </p>
        <ul className="bs-list">
          {CLIENTS.map((c) => (
            <li key={c.href}>
              <Link href={c.href} className="bs-link">
                <strong>{c.label}</strong>
              </Link>{' '}
              &mdash; {c.blurb}
            </li>
          ))}
        </ul>
        <p className="muted">More clients will be added here over time.</p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">ONE GOTCHA</p>
        <h2>If it keeps buffering.</h2>
        <p>
          Public SUB/WAVE stations usually sit behind Cloudflare, which serves the
          stream over HTTP/2. Browsers and VLC handle that without blinking, but some
          lightweight command-line players stutter on a real-time HTTP/2 stream and sit
          there <em>buffering</em>. If that happens, ask the station operator for a
          direct address &mdash; a LAN or Tailscale URL that skips Cloudflare. The{' '}
          <Link href="/with/cliamp" className="bs-link">cliamp guide</Link> covers the
          fix in full.
        </p>
      </section>
    </WithPage>
  );
}
