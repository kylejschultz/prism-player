import type {
  Album,
  AlbumDetail,
  Artist,
  ArtistDetail,
  ArtistInfo,
  FavoriteKind,
  LibraryData,
  LyricsPayload,
  NavidromeConfig,
  Playlist,
  PlaylistDetail,
  PlaylistDetailsUpdate,
  SearchResults,
  Song,
} from "../App";

const API_VERSION = "1.16.1";
const CLIENT_ID = "PrismPlayer";

function normalizeServerUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function hasUrlScheme(value: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

function buildUrl(config: NavidromeConfig, endpoint: string, params: Record<string, string | string[]> = {}) {
  const url = new URL(`${normalizeServerUrl(config.serverUrl)}/rest/${endpoint}.view`);
  url.searchParams.set("u", config.username);
  url.searchParams.set("p", config.password);
  url.searchParams.set("v", API_VERSION);
  url.searchParams.set("c", CLIENT_ID);
  url.searchParams.set("f", "json");
  Object.entries(params).forEach(([key, value]) => Array.isArray(value)
    ? value.forEach((item) => url.searchParams.append(key, item))
    : url.searchParams.set(key, value));
  return url;
}

async function request<T>(config: NavidromeConfig, endpoint: string, params: Record<string, string | string[]> = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(buildUrl(config, endpoint, params), { signal: controller.signal });
    if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
    const body = await response.json() as Record<string, unknown>;
    const subsonic = body["subsonic-response"] as { status?: string; error?: { message?: string } } | undefined;
    if (!subsonic) throw new Error("Response was not a Subsonic API payload.");
    if (subsonic.status === "failed") throw new Error(subsonic.error?.message ?? "Navidrome rejected the request.");
    return subsonic as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchAlbums(config: NavidromeConfig): Promise<Album[]> {
  const albums: Album[] = [];
  for (let offset = 0; offset < 5_000; offset += 500) {
    const response = await request<{ albumList2?: { album?: Album[] } }>(config, "getAlbumList2", { type: "alphabeticalByName", size: "500", offset: String(offset) });
    const page = response.albumList2?.album ?? [];
    albums.push(...page);
    if (page.length < 500) break;
  }
  return albums;
}

export const navidromeKeys = {
  root: (config: NavidromeConfig) => ["navidrome", config.serverUrl, config.username] as const,
  library: (config: NavidromeConfig) => [...navidromeKeys.root(config), "library"] as const,
  album: (config: NavidromeConfig, id: string) => [...navidromeKeys.root(config), "album", id] as const,
  artist: (config: NavidromeConfig, id: string) => [...navidromeKeys.root(config), "artist", id] as const,
  playlist: (config: NavidromeConfig, id: string) => [...navidromeKeys.root(config), "playlist", id] as const,
  search: (config: NavidromeConfig, query: string) => [...navidromeKeys.root(config), "search", query] as const,
};

export const navidromeClient = {
  buildCoverArtUrl(config: NavidromeConfig, coverArt?: string, size = "420") {
    return coverArt ? buildUrl(config, "getCoverArt", { id: coverArt, size }).toString() : null;
  },
  buildStreamUrl(config: NavidromeConfig, songId: string) {
    return buildUrl(config, "stream", { id: songId }).toString();
  },
  async resolveConfig(config: NavidromeConfig) {
    const normalized = normalizeServerUrl(config.serverUrl);
    const candidates = !normalized || hasUrlScheme(normalized) ? (normalized ? [normalized] : []) : [`https://${normalized}`, `http://${normalized}`];
    let lastError: unknown = null;
    for (const serverUrl of candidates) {
      try { await request({ ...config, serverUrl }, "ping"); return { ...config, serverUrl }; } catch (error) { lastError = error; }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not reach Navidrome.");
  },
  async profileName(config: NavidromeConfig) {
    const response = await fetch(`${normalizeServerUrl(config.serverUrl)}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: config.username, password: config.password }) });
    if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
    return ((await response.json()) as { name?: string }).name?.trim() ?? "";
  },
  async scanStatus(config: NavidromeConfig) {
    return (await request<{ scanStatus?: { scanning?: boolean; lastScan?: string | number } }>(config, "getScanStatus")).scanStatus ?? null;
  },
  async library(config: NavidromeConfig): Promise<LibraryData> {
    const [albums, newest, recent, artists, playlists, starred] = await Promise.all([
      fetchAlbums(config),
      request<{ albumList2?: { album?: Album[] } }>(config, "getAlbumList2", { type: "newest", size: "60" }),
      request<{ albumList2?: { album?: Album[] } }>(config, "getAlbumList2", { type: "recent", size: "60" }),
      request<{ artists?: { index?: Array<{ artist?: Artist[] }> } }>(config, "getArtists"),
      request<{ playlists?: { playlist?: Playlist[] } }>(config, "getPlaylists").catch(() => null),
      request<{ starred2?: { artist?: Artist[]; album?: Album[]; song?: Song[] } }>(config, "getStarred2").catch(() => null),
    ]);
    return { albums, recentAlbums: newest.albumList2?.album ?? [], recentlyPlayedAlbums: recent.albumList2?.album ?? [], artists: artists.artists?.index?.flatMap((index) => index.artist ?? []) ?? [], playlists: playlists?.playlists?.playlist ?? [], favorites: { artists: starred?.starred2?.artist ?? [], albums: starred?.starred2?.album ?? [], songs: starred?.starred2?.song ?? [] } };
  },
  async album(config: NavidromeConfig, id: string) { return (await request<{ album: AlbumDetail }>(config, "getAlbum", { id })).album; },
  async artist(config: NavidromeConfig, id: string): Promise<ArtistDetail> {
    const [artist, info] = await Promise.all([request<{ artist: ArtistDetail }>(config, "getArtist", { id }), request<{ artistInfo2?: ArtistInfo }>(config, "getArtistInfo2", { id }).catch(() => null)]);
    return { ...artist.artist, info: info?.artistInfo2 ?? null };
  },
  async playlist(config: NavidromeConfig, id: string) { return (await request<{ playlist: PlaylistDetail }>(config, "getPlaylist", { id })).playlist; },
  async lyrics(config: NavidromeConfig, song: Song) { return request<LyricsPayload>(config, "getLyrics", { artist: song.artist ?? "", title: song.title }); },
  async search(config: NavidromeConfig, query: string): Promise<SearchResults> {
    const [results, playlists] = await Promise.all([request<{ searchResult3?: { artist?: Artist[]; album?: Album[]; song?: Song[] } }>(config, "search3", { query, artistCount: "12", albumCount: "18", songCount: "40" }), request<{ playlists?: { playlist?: Playlist[] } }>(config, "getPlaylists").catch(() => null)]);
    const normalized = query.toLocaleLowerCase();
    return { artists: results.searchResult3?.artist ?? [], albums: results.searchResult3?.album ?? [], songs: results.searchResult3?.song ?? [], playlists: playlists?.playlists?.playlist?.filter((playlist) => playlist.name.toLocaleLowerCase().includes(normalized)).slice(0, 20) ?? [] };
  },
  createPlaylist: (config: NavidromeConfig, name: string, songs: Song[] = []) => request(config, "createPlaylist", { name, songId: songs.map((song) => song.id) }),
  updatePlaylist: (config: NavidromeConfig, id: string, details: PlaylistDetailsUpdate) => request(config, "updatePlaylist", { playlistId: id, name: details.name, comment: details.comment, public: String(details.public) }),
  deletePlaylist: (config: NavidromeConfig, id: string) => request(config, "deletePlaylist", { id }),
  removePlaylistSong: (config: NavidromeConfig, id: string, index: number) => request(config, "updatePlaylist", { playlistId: id, songIndexToRemove: String(index) }),
  replacePlaylistSongs: (config: NavidromeConfig, playlist: PlaylistDetail, songs: Song[]) => request(config, "updatePlaylist", { playlistId: playlist.id, name: playlist.name, comment: playlist.comment ?? "", public: String(Boolean(playlist.public)), songIndexToRemove: (playlist.entry ?? []).map((_, index, entries) => String(entries.length - index - 1)), songIdToAdd: songs.map((song) => song.id) }),
  addPlaylistSongs: (config: NavidromeConfig, id: string, songs: Song[]) => request(config, "updatePlaylist", { playlistId: id, songIdToAdd: songs.map((song) => song.id) }),
  setFavorite: (config: NavidromeConfig, kind: FavoriteKind, id: string, favorite: boolean) => request(config, favorite ? "star" : "unstar", kind === "song" ? { id } : kind === "album" ? { albumId: id } : { artistId: id }),
  scrobble: (config: NavidromeConfig, song: Song) => request(config, "scrobble", { id: song.id, time: String(Date.now()), submission: "true" }),
};
