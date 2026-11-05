import type { Album, AlbumDetail, Song } from "./App";

export type ArtistPlaybackScope = "albums" | "appearances";
export type ArtistAlbumOrder = "newest" | "oldest";
export type DiscographyStart = { albumId: string; songId: string; trackIndex: number };

export function sortArtistAlbums(albums: Album[], order: ArtistAlbumOrder = "newest") {
  return [...new Map(albums.map(album => [album.id, album])).values()].sort((a, b) => {
    const aYear = a.year && Number.isFinite(a.year) ? a.year : null;
    const bYear = b.year && Number.isFinite(b.year) ? b.year : null;
    if (aYear == null && bYear != null) return 1;
    if (bYear == null && aYear != null) return -1;
    const chronology = aYear != null && bYear != null ? aYear - bYear : 0;
    return chronology * (order === "oldest" ? 1 : -1) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function sortAlbumSongs(songs: Song[]) {
  return [...songs].sort((a, b) =>
    (a.discNumber ?? Number.MAX_SAFE_INTEGER) - (b.discNumber ?? Number.MAX_SAFE_INTEGER)
    || (a.track ?? Number.MAX_SAFE_INTEGER) - (b.track ?? Number.MAX_SAFE_INTEGER)
    || a.title.localeCompare(b.title),
  );
}

// Fetch every displayed album through the existing cache, without a viewport or
// 50-album limit. Batches bound requests and stop scheduling superseded work.
export async function loadArtistDiscography(
  albums: Album[],
  loadAlbum: (id: string) => Promise<AlbumDetail>,
  isCurrent: () => boolean,
  start?: DiscographyStart,
  includeSong: (song: Song) => boolean = () => true,
) {
  const songs: Song[] = [];
  let startIndex = start ? -1 : 0;
  for (let offset = 0; offset < albums.length; offset += 4) {
    if (!isCurrent()) return null;
    const batch = albums.slice(offset, offset + 4);
    const details = await Promise.all(batch.map(album => loadAlbum(album.id)));
    if (!isCurrent()) return null;
    details.forEach((detail, index) => {
      const albumSongs = sortAlbumSongs((detail.song ?? []).filter(includeSong));
      if (start?.albumId === batch[index].id) {
        if (albumSongs[start.trackIndex]?.id !== start.songId) throw new Error("The album changed. Choose the track again.");
        startIndex = songs.length + start.trackIndex;
      }
      songs.push(...albumSongs);
    });
  }
  if (startIndex < 0) throw new Error("The selected release is no longer available. Choose the track again.");
  if (!songs.length) throw new Error("No tracks are available for this artist.");
  return { songs, startIndex };
}
