// Icecast listener-count monitor.
//
// Polls Icecast's status-json.xsl on an interval and caches the live listener
// count for the /stream.mp3 mount, so the DJ gates can ask "is anyone
// listening?" without each one hitting Icecast.
//
// Fail-open: if Icecast is unreachable the count is null and djCallsAllowed()
// treats the station as occupied — a stats outage must never silence the DJ.

import { config } from '../config.js';
import * as settings from '../settings.js';

let lastCount: number | null = null;        // null = unknown (not yet polled, or Icecast down)

async function fetchCount() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(config.icecast.statusUrl, { signal: ctrl.signal });
    clearTimeout(timer);
    const ic = ((await r.json()) as any)?.icestats;
    const sources = Array.isArray(ic?.source) ? ic.source : ic?.source ? [ic.source] : [];
    const src = sources.find((s: any) => String(s?.listenurl || '').includes('/stream.mp3')) || null;
    lastCount = src ? Number(src.listeners || 0) : 0;
  } catch {
    lastCount = null;
  }
  return lastCount;
}

// Last known listener count — a number, or null when it couldn't be read.
export function getListenerCount() {
  return lastCount;
}

// Force an immediate poll. Used by the request route so a listener who just
// connected isn't rejected on a stale cached value.
export async function refresh() {
  return fetchCount();
}

// True when autonomous DJ LLM work is allowed right now. When the pause toggle
// is off, always true. When on, allowed only if at least one listener is
// counted — an unknown count (Icecast unreachable) is treated as occupied so a
// stats outage can never take the DJ off the air.
export function djCallsAllowed() {
  if (!settings.get()?.llm?.pauseWhenEmpty) return true;
  if (lastCount === null) return true;
  return lastCount > 0;
}

export function startListenerMonitor() {
  fetchCount();
  setInterval(fetchCount, 15000);
}
