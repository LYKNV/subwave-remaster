# SUB/WAVE — Liquidsoap broadcast script
# Reads a JSON queue file written by the Node.js controller,
# crossfades, ducks DJ voice over song intros, falls back to autonomous playlist.

settings.log.level := 4
settings.log.file := true
settings.log.file.path := "/var/log/liquidsoap/radio.log"

# Telnet server — used by the controller to send a "restart" command after
# changing settings that this script reads at startup. Bound to all interfaces
# on the container's private network only; NOT exposed to the host.
settings.server.telnet := true
settings.server.telnet.bind_addr := "0.0.0.0"
settings.server.telnet.port := 1234

# ---------------------------------------------------------------------------
# RUNTIME SETTINGS — written by the controller at startup, read here.
# Two tiny text files: one int, one float. Falls back to defaults if missing.
# ---------------------------------------------------------------------------

jingle_ratio = ref(30)
crossfade_duration = ref(4.0)

if file.exists("/var/sub-wave/liquidsoap_jingle_ratio.txt") then
  raw = string.trim(file.contents("/var/sub-wave/liquidsoap_jingle_ratio.txt"))
  v = int_of_string(default=30, raw)
  if v > 0 then jingle_ratio := v end
end

if file.exists("/var/sub-wave/liquidsoap_crossfade.txt") then
  raw = string.trim(file.contents("/var/sub-wave/liquidsoap_crossfade.txt"))
  v = float_of_string(default=4.0, raw)
  if v >= 0.0 then crossfade_duration := v end
end

log("settings loaded: jingle_ratio=#{!jingle_ratio} crossfade_duration=#{!crossfade_duration}")

# ---------------------------------------------------------------------------
# HTTP(S) FETCH OVERRIDE — Liquidsoap's built-in http.get.stream returns
# spurious 522s when fetching from Cloudflare-fronted origins. Shelling out
# to curl (installed via Dockerfile.liquidsoap) is reliable.
# ---------------------------------------------------------------------------

# subhttp:<full-url> — strips the prefix and shells to curl. Used because
# Liquidsoap's built-in http.get.stream returns spurious 522s when talking
# to the Cloudflare-fronted Navidrome origin.
def proto_subhttp(~rlog, ~maxtime, arg) =
  ignore(rlog)
  uri = arg
  raw_timeout = int_of_float(maxtime - time())
  timeout = if raw_timeout < 5 then 5 else raw_timeout end
  ext =
    if string.contains(substring=".mp3", arg) then ".mp3"
    elsif string.contains(substring=".ogg", arg) then ".ogg"
    elsif string.contains(substring=".flac", arg) then ".flac"
    else ".mp3" end
  output = file.temp("liq-curl-", ext)
  cmd = "curl -sS -L --max-time #{timeout} -o #{process.quote(output)} #{process.quote(uri)}"
  ret = process.run(timeout=float_of_int(timeout), cmd)
  if ret.status == "exit" and ret.status.code == 0 and file.size(output) > 0 then
    [output]
  else
    log(label="protocol.subhttp", level=3, "curl failed for #{uri}: status=#{ret.status} code=#{ret.status.code} stderr=#{ret.stderr}")
    file.remove(output)
    []
  end
end

protocol.add(temporary=true, syntax="subhttp:<full url>", doc="Navidrome stream via curl", "subhttp", proto_subhttp)

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
  duration=!crossfade_duration,
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
  weights=[1, !jingle_ratio],  # 1 jingle for every N music tracks (settings.json)
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
  subsonic_id = m["subsonic_id"]
  if title != "" or artist != "" then
    log("on_meta: title=#{title} | artist=#{artist} | album=#{album} | id=#{subsonic_id}")
    ts = int_of_float(time())
    json = '{"title":"#{title}","artist":"#{artist}","album":"#{album}","subsonic_id":"#{subsonic_id}","filename":"#{filename}","timestamp":#{ts}}'
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

# ---------------------------------------------------------------------------
# CONTROL — custom telnet command for the controller to trigger a restart
# after writing new settings. Container restart-policy brings us back ~3s later
# with the new values applied at the top of this script.
# ---------------------------------------------------------------------------
server.register(
  "restart",
  description="Shut down so the container restarts with new settings",
  usage="restart",
  fun(_) -> begin
    log("Restart requested via server command")
    shutdown()
    "OK"
  end
)
