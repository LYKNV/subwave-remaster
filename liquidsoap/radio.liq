# SUB/WAVE — Liquidsoap broadcast script
# Reads a JSON queue file written by the Node.js controller,
# crossfades, ducks DJ voice over song intros, falls back to autonomous playlist.

settings.log.level := 4
settings.log.file := true
settings.log.file.path := "/var/log/liquidsoap/radio.log"

# ---------------------------------------------------------------------------
# QUEUE — read tracks from the controller
# ---------------------------------------------------------------------------
# The controller writes track URIs to /var/sub-wave/queue.txt, one per line.
# request.queue lets us push tracks programmatically; we use a polling
# wrapper so the controller can drop new tracks in without a restart.

dj_queue = request.queue(id="dj_queue")

# Periodically drain the queue file into request.queue
def poll_queue() =
  if file.exists("/var/sub-wave/next.txt") then
    contents = file.contents("/var/sub-wave/next.txt")
    file.remove("/var/sub-wave/next.txt")
    if contents != "" then
      log("Queueing: #{contents}")
      ignore(dj_queue.push(request.create(contents)))
    end
  end
end
thread.run(every=1.0, poll_queue)

# ---------------------------------------------------------------------------
# AUTONOMOUS FALLBACK — when queue is empty
# ---------------------------------------------------------------------------
# The controller maintains /var/sub-wave/auto.m3u with mood-appropriate
# tracks for the current context. Refreshed every 10 minutes.

auto_playlist = playlist(
  id="auto",
  reload_mode="watch",
  mode="randomize",
  "/var/sub-wave/auto.m3u"
)

# ---------------------------------------------------------------------------
# MAIN MUSIC SOURCE — queue takes priority, falls back to autonomous
# ---------------------------------------------------------------------------

music = fallback(
  id="music",
  track_sensitive=true,
  [dj_queue, auto_playlist]
)

# Smart crossfade — overlapping fade between tracks based on their loudness
music = crossfade(
  duration=4.0,
  smart=true,
  music
)

# ---------------------------------------------------------------------------
# DJ VOICE — TTS intros that duck the music
# ---------------------------------------------------------------------------
# Piper writes WAVs to /var/sub-wave/voice/, controller drops the path
# into /var/sub-wave/say.txt to trigger playback.

voice_queue = request.queue(id="voice_queue")

def poll_voice() =
  if file.exists("/var/sub-wave/say.txt") then
    contents = file.contents("/var/sub-wave/say.txt")
    file.remove("/var/sub-wave/say.txt")
    if contents != "" then
      log("DJ says: #{contents}")
      ignore(voice_queue.push(request.create(contents)))
    end
  end
end
thread.run(every=0.5, poll_voice)

# Mix voice over music with sidechain ducking — music drops while DJ talks
radio =
  smooth_add(
    p=0.25,        # how much music ducks (lower = more duck)
    normal=music,
    special=voice_queue
  )

# ---------------------------------------------------------------------------
# JINGLES & STATION ID — every 30 mins, rotate a jingle in
# ---------------------------------------------------------------------------

jingles = playlist(
  id="jingles",
  mode="randomize",
  reload_mode="watch",
  "/var/sub-wave/jingles.m3u"
)

radio = rotate(
  weights=[1, 30],  # 1 jingle for every 30 tracks
  [jingles, radio]
)

# ---------------------------------------------------------------------------
# SAFETY — blank detection, fallback to silence-killer playlist
# ---------------------------------------------------------------------------

# If the source dies, play a static "technical difficulties" loop
emergency = single("/var/sub-wave/emergency.mp3")
radio = fallback(track_sensitive=false, [radio, emergency])

# Blank detection — skip if more than 5s of silence
radio = blank.skip(max_blank=5.0, radio)

# Normalize loudness for consistent listener experience
radio = normalize(target=-14.0, radio)

# ---------------------------------------------------------------------------
# METADATA — write current track info for the web UI
# ---------------------------------------------------------------------------

def on_meta(m) =
  title = m["title"]
  artist = m["artist"]
  album = m["album"]
  filename = m["filename"]
  if title != "" or artist != "" then
    log("on_meta: title=#{title} | artist=#{artist} | album=#{album}")
    ts = int_of_float(time())
    json = '{"title":"#{title}","artist":"#{artist}","album":"#{album}","filename":"#{filename}","timestamp":#{ts}}'
    file.write(data=json, "/var/sub-wave/now-playing.json")
  end
end

# on_metadata fires reliably on every metadata change, even across crossfades
# and source switches (request queue → auto playlist). on_track gets swallowed
# by crossfade transitions.
music.on_metadata(on_meta)

# ---------------------------------------------------------------------------
# OUTPUT — broadcast to Icecast
# ---------------------------------------------------------------------------

output.icecast(
  %mp3(bitrate=192, samplerate=44100, stereo=true),
  host="icecast",
  port=8000,
  password=environment.get("ICECAST_SOURCE_PASSWORD"),
  mount="/stream.mp3",
  name="SUB/WAVE",
  description="Personal frequency from the homelab",
  genre="Various",
  url="http://ronin.tail.ts.net:3000",
  radio
)

# Optional: also output to local file for archiving / podcast generation
output.file(
  %mp3(bitrate=128),
  fallible=true,
  reopen_when={0m0s},
  "/var/sub-wave/archive/%Y-%m-%d/%H-00.mp3",
  radio
)
