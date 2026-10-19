import type { Album, Artist, Song } from "./App";

export type ArtistCredit = { id?: string; name: string };
type Credit = Pick<Song, "artistId" | "artist" | "artists" | "albumArtists" | "albumArtist">;

const normalize = (name: string) => name.trim().toLocaleLowerCase();

export function matchesArtist(credit: Credit, artist: Pick<Artist, "id" | "name">): boolean {
  if (credit.artistId === artist.id) return true;
  const artists = [...(credit.artists ?? []), ...(credit.albumArtists ?? [])];
  // Prefer explicit OpenSubsonic credits; a display name can be ambiguous.
  if (artists.length) return artists.some((entry) => entry.id
    ? entry.id === artist.id
    : normalize(entry.name) === normalize(artist.name));

  const name = normalize(artist.name);
  return [credit.artist, credit.albumArtist].some((value) => {
    if (!value) return false;
    const label = normalize(value);
    if (label === name) return true;
    // Legacy servers may expose only a combined credit. Match the leading
    // artist at a credit boundary, never a substring or arbitrary band member.
    if (!label.startsWith(name)) return false;
    return /^(?:\s+&\s+|\s+(?:feat\.?|ft\.?|featuring)\s+)/i.test(label.slice(name.length));
  });
}

export function getArtistAlbums(artist: Artist & { album?: Album[] }, albums: Album[], songs: Song[]): Album[] {
  const songAlbumIds = new Set(songs.filter((song) => matchesArtist(song, artist)).map((song) => song.albumId));
  return [...new Map([
    ...(artist.album ?? []),
    ...albums.filter((album) => matchesArtist(album, artist) || songAlbumIds.has(album.id)),
  ].map((album) => [album.id, album])).values()];
}
