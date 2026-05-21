// Shared types for the controller HTTP surface (`/now-playing`, `/state`,
// `/session`) and the live DJ session. These mirror the JSON the controller
// writes — for runtime guarantees, see the Zod schemas in controller/src
// (when controller TS migration lands per issue #43).

/** A track currently airing. `subsonic_id` is present for library tracks and
 *  drives MediaSession artwork via the `/api/cover/:id` proxy. Jingles +
 *  scanning have no id. */
export interface NowPlayingTrack {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  subsonic_id?: string;
}

export interface WeatherContext {
  condition?: string;
  temp?: number;
}

export interface FestivalContext {
  name?: string;
  mood?: string;
}

export interface TimeContext {
  show?: string;
  vibe?: string;
}

export interface ActiveShow {
  name?: string;
  persona?: { name?: string };
}

/** Context envelope returned by `/now-playing` — driven by controller's
 *  `context.getFullContext()`. Priority for the dominant mood is
 *  festival > weather > time. */
export interface StationContext {
  time?: TimeContext;
  weather?: WeatherContext;
  festival?: FestivalContext;
  dominantMood?: string;
  activeShow?: ActiveShow | null;
}

export interface DjState {
  // Opaque DJ status blob — shape varies per provider/persona. Consumers treat
  // it as displayable diagnostics.
  [key: string]: unknown;
}

export interface ListenerCount {
  total?: number;
  [key: string]: unknown;
}

/** `/now-playing` response. */
export interface NowPlayingResponse {
  nowPlaying: NowPlayingTrack | null;
  context: StationContext | null;
  dj?: DjState;
  activeShow?: ActiveShow | null;
  listeners?: ListenerCount | number;
  streamOnline?: boolean;
}

export interface QueueEntry {
  title?: string;
  artist?: string;
  album?: string;
  subsonic_id?: string;
  [key: string]: unknown;
}

export interface DjLogEntry {
  t?: string;
  text?: string;
  [key: string]: unknown;
}

/** `/state` response — controller's upcoming queue + recent history + DJ log. */
export interface StationState {
  upcoming: QueueEntry[];
  history: QueueEntry[];
  djLog: DjLogEntry[];
}

/** A single turn in the live DJ session — `voice` (spoken on-air), `dj` (the
 *  agent's reasoning), `track` (something that aired), `system` (state events).
 *  `role` originates as 'segment' for spoken bits and is reclassified to
 *  'voice' by `turnClass()`. */
export type SessionRole = 'segment' | 'dj' | 'track' | 'system' | string;

export interface SessionTurn {
  t?: string | number;
  role?: SessionRole;
  kind?: string;
  text?: string;
  meta?: Record<string, unknown>;
}

export interface SessionInfo {
  id?: string;
  [key: string]: unknown;
}

/** `/session` response. */
export interface SessionPayload {
  session: SessionInfo | null;
  messages: SessionTurn[];
}

/** Theme mode persisted in localStorage (or absent for `system`). */
export type ThemeMode = 'system' | 'light' | 'dark';

/** Cloud TTS provider option. */
export interface CloudVoice {
  id: string;
  label: string;
}

export type CloudProvider = 'openai' | 'elevenlabs';
