// Subsonic API client for Navidrome.
// Uses the proper salt+token auth (not plaintext password).

import crypto from 'node:crypto';
import { config } from './config.js';

function buildAuth() {
  const salt = crypto.randomBytes(8).toString('hex');
  const token = crypto
    .createHash('md5')
    .update(config.navidrome.password + salt)
    .digest('hex');
  return { u: config.navidrome.user, t: token, s: salt };
}

function buildUrl(endpoint, params = {}) {
  const url = new URL(`${config.navidrome.url}/rest/${endpoint}`);
  const auth = buildAuth();
  url.searchParams.set('u', auth.u);
  url.searchParams.set('t', auth.t);
  url.searchParams.set('s', auth.s);
  url.searchParams.set('v', config.navidrome.apiVersion);
  url.searchParams.set('c', config.navidrome.clientName);
  url.searchParams.set('f', 'json');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function call(endpoint, params = {}) {
  const url = buildUrl(endpoint, params);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Subsonic ${endpoint} failed: ${res.status}`);
  const data = await res.json();
  const sub = data['subsonic-response'];
  if (sub.status !== 'ok') throw new Error(`Subsonic error: ${sub.error?.message || 'unknown'}`);
  return sub;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function search(query, { songCount = 20 } = {}) {
  const r = await call('search3', { query, songCount, artistCount: 5, albumCount: 5 });
  return r.searchResult3?.song || [];
}

export async function getRandomSongs({ size = 20, genre, fromYear, toYear } = {}) {
  const r = await call('getRandomSongs', { size, genre, fromYear, toYear });
  return r.randomSongs?.song || [];
}

export async function getSongsByGenre(genre, { count = 20 } = {}) {
  const r = await call('getSongsByGenre', { genre, count });
  return r.songsByGenre?.song || [];
}

export async function getSimilarSongs(id, { count = 20 } = {}) {
  const r = await call('getSimilarSongs2', { id, count });
  return r.similarSongs2?.song || [];
}

export async function getStarred() {
  const r = await call('getStarred2');
  return r.starred2?.song || [];
}

export async function getAlbumList(offset = 0, size = 500) {
  const r = await call('getAlbumList2', { type: 'alphabeticalByName', size, offset });
  return r.albumList2?.album || [];
}

export async function getAlbum(id) {
  const r = await call('getAlbum', { id });
  return r.album?.song || [];
}

// Returns { id, name, albumCount, album: [{ id, name, year, ... }] }
export async function getArtist(id) {
  const r = await call('getArtist', { id });
  return r.artist || null;
}

// Search just the artist index and return matching artist objects.
export async function searchArtists(query, { artistCount = 5 } = {}) {
  const r = await call('search3', { query, artistCount, albumCount: 0, songCount: 0 });
  return r.searchResult3?.artist || [];
}

// Async iterator over every song in the library. Walks albums in batches.
export async function* iterateAllSongs() {
  let offset = 0;
  const BATCH = 500;
  while (true) {
    const albums = await getAlbumList(offset, BATCH);
    if (albums.length === 0) break;
    for (const album of albums) {
      try {
        const songs = await getAlbum(album.id);
        for (const s of songs) yield s;
      } catch (err) {
        console.error(`[subsonic] getAlbum(${album.id}) failed: ${err.message}`);
      }
    }
    if (albums.length < BATCH) break;
    offset += albums.length;
  }
}

export async function getPlaylists() {
  const r = await call('getPlaylists');
  return r.playlists?.playlist || [];
}

export async function getPlaylist(id) {
  const r = await call('getPlaylist', { id });
  return r.playlist?.entry || [];
}

// Returns a streamable URL for Liquidsoap to read. Wrapped in the `subhttp:`
// protocol scheme so Liquidsoap's radio.liq routes the fetch through curl
// instead of its built-in http.get.stream (which returns spurious 522s
// against the Cloudflare-fronted Navidrome origin).
export function getStreamUrl(songId) {
  return `subhttp:${buildUrl('stream', { id: songId, format: 'mp3' })}`;
}

// Returns the local file path if Navidrome and the controller share the music
// volume — much more efficient than streaming over HTTP for the radio.
// Set MUSIC_LIBRARY_PATH to mount your library inside the controller container.
export function getLocalPath(song) {
  const libRoot = process.env.MUSIC_LIBRARY_PATH;
  if (!libRoot || !song.path) return null;
  return `${libRoot}/${song.path}`;
}

// Best URI for Liquidsoap — local file if available, otherwise stream URL
export function getPlayableUri(song) {
  return getLocalPath(song) || getStreamUrl(song.id);
}

// Liquidsoap `annotate:` URI — embeds metadata up front so on_track_change
// reports real artist/title/album rather than waiting on stream-level ID3.
function escAnnotate(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
export function getAnnotatedUri(song) {
  const fields = [
    `title="${escAnnotate(song.title)}"`,
    `artist="${escAnnotate(song.artist)}"`,
    `album="${escAnnotate(song.album)}"`,
    `subsonic_id="${escAnnotate(song.id)}"`,
  ];
  if (song.year) fields.push(`year="${escAnnotate(song.year)}"`);
  if (song.genre) fields.push(`genre="${escAnnotate(song.genre)}"`);
  return `annotate:${fields.join(',')}:${getPlayableUri(song)}`;
}
