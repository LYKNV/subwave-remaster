import Link from 'next/link';
import WithPage from './WithPage';
import StreamUrl from './StreamUrl';

// Where the "open a network stream" command lives in each VLC build. VLC's
// menus shift slightly between versions, but these paths have been stable
// for years across desktop and the mobile apps.
const PLATFORMS = [
  {
    os: 'Windows / Linux',
    path: 'Media → Open Network Stream… (Ctrl + N), paste the URL, press Play.',
  },
  {
    os: 'macOS',
    path: 'File → Open Network… (⌘ + N), paste the URL, press Open.',
  },
  {
    os: 'iOS / iPadOS',
    path: 'Open the Network tab → Open Network Stream, type the URL, tap it to play.',
  },
  {
    os: 'Android',
    path: 'Side menu → New stream, enter the URL, tap to play.',
  },
];

export default function Vlc() {
  return (
    <WithPage
      eyebrow="LISTEN WITH · VLC"
      title="VLC, on every screen you own."
      intro="VLC is the most reliable way to tune in outside the browser. It runs on every desktop and mobile platform, opens the stream from a single URL, and buffers generously enough that a shaky connection rarely interrupts the broadcast."
      current="/with/vlc"
    >
      <section className="bs-section">
        <p className="bs-eyebrow">INSTALL</p>
        <h2>Get VLC for your device.</h2>
        <p>
          VLC is free and open-source. Desktop builds come from{' '}
          <a
            href="https://www.videolan.org/vlc/"
            className="bs-link"
            target="_blank"
            rel="noreferrer"
          >
            videolan.org ↗
          </a>
          ; the mobile apps are <strong>VLC for Mobile</strong> on the iOS App Store and{' '}
          <strong>VLC</strong> on Google Play. There is nothing to configure &mdash; the
          same app plays SUB/WAVE on all of them.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">THE STREAM</p>
        <h2>One URL, every platform.</h2>
        <p>Whichever device you are on, this is the address VLC needs:</p>
        <StreamUrl />
        <p className="muted">
          Copy it now &mdash; on a phone it is easiest to send the link to yourself and
          paste it into VLC rather than typing it in by hand.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">TUNE IN</p>
        <h2>Open a network stream.</h2>
        <p>
          Every VLC build can play a URL directly &mdash; you are looking for the{' '}
          <em>network stream</em> option, not <em>open file</em>. Here is where it lives:
        </p>
        <table className="bs-doc-table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>How to open the stream</th>
            </tr>
          </thead>
          <tbody>
            {PLATFORMS.map((p) => (
              <tr key={p.os}>
                <td><strong>{p.os}</strong></td>
                <td>{p.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Once it is playing, VLC shows the live track and artist from the stream&rsquo;s
          metadata &mdash; the same now-playing info the browser player displays. There
          is no progress bar to drag, because it is a live broadcast.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">KEEP IT HANDY</p>
        <h2>Save the station.</h2>
        <p>
          On desktop, drag the playing stream into the Playlist and save it as an{' '}
          <code className="bs-code-inline">.m3u</code> for one-click tuning later. On
          mobile, VLC keeps the stream in its history under the Network tab, so it is one
          tap away the next time you open the app.
        </p>
        <div className="bs-callout">
          <div className="bs-eyebrow">IF THE CONNECTION IS FLAKY</div>
          <p>
            VLC&rsquo;s default buffer is short. On a weak connection, raise it: desktop
            users open <em>Preferences → Show All → Input / Codecs</em> and lift{' '}
            <strong>Network caching</strong> to 3000&nbsp;ms, or launch from a terminal
            with <code className="bs-code-inline">vlc --network-caching=3000 &lt;url&gt;</code>.
            A deeper buffer trades a few seconds of start-up delay for a steadier stream.
          </p>
        </div>
      </section>
    </WithPage>
  );
}
