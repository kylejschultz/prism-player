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

export function getArtistAlbums(artist: Artist & { album?: Album[] }, albums: Album[], songs: Song[]): Album[] {
  const songAlbumIds = new Set(songs.filter((song) => matchesArtist(song, artist)).map((song) => song.albumId));
  return [...new Map([
    ...(artist.album ?? []),
    ...albums.filter((album) => matchesArtist(album, artist) || songAlbumIds.has(album.id)),
  ].map((album) => [album.id, album])).values()];
}
