// Liquidsoap server (telnet) client — sends commands to the running mixer
// via TCP. radio.liq enables this and registers a "restart" command that
// triggers shutdown(); the container's restart-policy brings it right back
// with whatever updated settings the controller just wrote to disk.

import net from 'node:net';

const HOST = process.env.LIQUIDSOAP_HOST || 'liquidsoap';
const PORT = parseInt(process.env.LIQUIDSOAP_PORT || '1234', 10);

export function sendCommand(cmd: string, timeoutMs = 3000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const sock = net.createConnection({ host: HOST, port: PORT });
    let buf = '';
    let done = false;

    const finish = (err: Error | null, value?: string) => {
      if (done) return;
      done = true;
      try { sock.end('quit\n'); } catch {}
      try { sock.destroy(); } catch {}
      if (err) reject(err); else resolve(value as string);
    };

    sock.setTimeout(timeoutMs);
    sock.on('timeout', () => finish(new Error('liquidsoap telnet timeout')));
    sock.on('error', err => finish(err));
    sock.on('connect', () => sock.write(`${cmd}\n`));
    sock.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      // Liquidsoap terminates responses with END\r\n
      if (/END\r?\n/.test(buf)) finish(null, buf.replace(/END\r?\n.*$/s, '').trim());
    });
    sock.on('close', () => finish(null, buf.trim()));
  });
}

export async function restartLiquidsoap() {
  // The custom "restart" command in radio.liq calls shutdown().
  // We don't wait for a response — the socket will just be reset.
  try {
    await sendCommand('restart', 2000);
  } catch (err) {
    // Connection reset is expected (Liquidsoap is dying)
    if (!/ECONNRESET|EPIPE|timeout/i.test(err.message)) throw err;
  }
}

// Skip the currently playing track via the custom "skip" command in radio.liq.
// Unlike restart, this returns a normal "OK" response — Liquidsoap stays up.
export async function skipTrack() {
  return sendCommand('skip', 2000);
}

// Start / stop / query the broadcast. radio.liq registers stream_on /
// stream_off / stream_status server commands: stream_off shuts the Icecast
// output down so the /stream.mp3 mount disconnects (the station goes off
// air); stream_on recreates it. The mixer process keeps running throughout.
export async function startStream() {
  return sendCommand('stream_on', 2000);
}

export async function stopStream() {
  return sendCommand('stream_off', 2000);
}

// Returns true when on air, false otherwise. `stream_status` replies "on" /
// "off".
export async function streamStatus() {
  const res = await sendCommand('stream_status', 2000);
  return /\bon\b/i.test(res);
}
