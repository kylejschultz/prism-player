import type { Album, Artist, Song } from "./App";

export type ArtistCredit = { id?: string; name: string };
type Credit = Pick<Song, "artistId" | "artist" | "artists" | "albumArtists" | "albumArtist">;

const normalize = (name: string) => name.trim().toLocaleLowerCase();

function isPrimaryCombinedCredit(label: string, name: string): boolean {
  const normalized = normalize(label);
  return normalized.startsWith(name)
    && /^(?:\s+&\s+|\s+(?:feat\.?|ft\.?|featuring)\s+)/i.test(normalized.slice(name.length));
}

export function matchesArtist(credit: Credit, artist: Pick<Artist, "id" | "name">): boolean {
  if (credit.artistId === artist.id) return true;
  const name = normalize(artist.name);
  const artists = [...(credit.artists ?? []), ...(credit.albumArtists ?? [])];
  // Some servers expose a combined tag as a single structured credit too.
  // Preserve ID matching for individual artists while recognizing its lead credit.
  if (artists.length) return artists.some((entry) =>
    (entry.id ? entry.id === artist.id : normalize(entry.name) === name)
    || isPrimaryCombinedCredit(entry.name, name),
  );

  return [credit.artist, credit.albumArtist].some((value) => value
    && (normalize(value) === name || isPrimaryCombinedCredit(value, name)),
  );
}

// Album ownership and track participation are deliberately separate from the
// broad matchesArtist predicate used by discovery and Top Songs.
function matchesCreditList(credits: ArtistCredit[], artist: Pick<Artist, "id" | "name">) {
  return credits.some(credit => (credit.id ? credit.id === artist.id : normalize(credit.name) === normalize(artist.name))
    || isPrimaryCombinedCredit(credit.name, normalize(artist.name)));
}

export function matchesAlbumArtist(album: Album, artist: Pick<Artist, "id" | "name">): boolean {
  if (album.albumArtists?.length) return matchesCreditList(album.albumArtists, artist);
  if (album.albumArtist?.trim()) return normalize(album.albumArtist) === normalize(artist.name)
    || isPrimaryCombinedCredit(album.albumArtist, normalize(artist.name));
  if (album.artistId === artist.id) return true;
  // Preserve legacy lead/combined tags without promoting a contributor list over
  // an explicit primary album credit. Structured albumArtists supports all peers.
  if (album.artist?.trim()) return (!album.artistId && normalize(album.artist) === normalize(artist.name))
    || isPrimaryCombinedCredit(album.artist, normalize(artist.name));
  if (album.artistId) return false;
  return matchesCreditList(album.artists ?? [], artist);
}

export function matchesTrackArtist(song: Song, artist: Pick<Artist, "id" | "name">): boolean {
  // Album-artist tags on a song do not establish a performance credit.
  return matchesArtist({ artistId: song.artistId, artist: song.artist, artists: song.artists }, artist);
}

function artistAlbumCandidates(artist: Artist & { album?: Album[] }, albums: Album[]) {
  const candidates = new Map(albums.map(album => [album.id, album]));
  for (const album of artist.album ?? []) {
    const cached = candidates.get(album.id);
    candidates.set(album.id, { ...cached, ...album,
      albumArtists: album.albumArtists?.length ? album.albumArtists : cached?.albumArtists,
      albumArtist: album.albumArtist?.trim() || cached?.albumArtist,
    });
  }
  return [...candidates.values()];
}

export function getArtistAlbums(artist: Artist & { album?: Album[] }, albums: Album[]): Album[] {
  return artistAlbumCandidates(artist, albums).filter(album => matchesAlbumArtist(album, artist));
}

export function getArtistAppearances(artist: Artist & { album?: Album[] }, albums: Album[], songs: Song[]): Album[] {
  const serverAlbumIds = new Set((artist.album ?? []).map(album => album.id));
  const songAlbumIds = new Set(songs.filter(song => matchesTrackArtist(song, artist)).map(song => song.albumId));
  return artistAlbumCandidates(artist, albums).filter(album => !matchesAlbumArtist(album, artist)
    && (serverAlbumIds.has(album.id) || matchesArtist(album, artist) || songAlbumIds.has(album.id)));
}
