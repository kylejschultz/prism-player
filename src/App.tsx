import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, MouseEvent, ReactNode } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Disc3,
  History,
  Home,
  Library,
  ListMusic,
  Loader2,
  Music2,
  Pause,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RadioTower,
  Repeat,
  Repeat1,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Star,
  Trash2,
  Menu,
  UserRound,
  Volume2,
  Waves,
  X,
} from "lucide-react";

type LibraryViewMode = "overview" | "albums" | "artists" | "playlists" | "recentlyAdded" | "recentlyPlayed" | "favorites";
type View = LibraryViewMode | "radio" | "search" | "settings";
type SettingsTab = "connection" | "library" | "appearance" | "radio" | "privacy" | "advanced";
type ConnectionStatus = "idle" | "checking" | "connected" | "error";
type LibraryStatus = "idle" | "loading" | "ready" | "error";
type AlbumViewMode = "art" | "list";
type ArtistViewMode = "art" | "list";
type RepeatMode = "off" | "all" | "one";
type RightPanelTab = "queue" | "nowPlaying" | "lyrics";
type LyricsStatus = "idle" | "loading" | "ready" | "empty" | "error";

type NavidromeConfig = {
  serverUrl: string;
  username: string;
  password: string;
};

type AppSettings = {
  lastVolume: number;
  defaultAlbumView: AlbumViewMode;
  defaultArtistView: ArtistViewMode;
  showSidebarPlaylists: boolean;
  sidebarPlaylistLimit: number;
  analyticsEnabled: boolean;
  analyticsPromptDismissed: boolean;
  coverWashEnabled: boolean;
  radioStationUrl: string;
  radioStationUrls: string[];
};

type Album = {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  year?: number;
};

type Artist = {
  id: string;
  name: string;
  albumCount?: number;
};

type ArtistInfo = {
  biography?: string;
  musicBrainzId?: string;
  lastFmUrl?: string;
  smallImageUrl?: string;
  mediumImageUrl?: string;
  largeImageUrl?: string;
  similarArtist?: Artist[];
};

type LibraryData = {
  albums: Album[];
  recentAlbums: Album[];
  recentlyPlayedAlbums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  favorites: {
    artists: Artist[];
    albums: Album[];
    songs: Song[];
  };
};

type SearchResults = {
  artists: Artist[];
  albums: Album[];
  songs: Song[];
  playlists: Playlist[];
};

type Song = {
  id: string;
  title: string;
  albumId?: string;
  artistId?: string;
  artist?: string;
  album?: string;
  coverArt?: string;
  duration?: number;
  track?: number;
  discNumber?: number;
};

type Playlist = {
  id: string;
  name: string;
  songCount?: number;
  duration?: number;
  owner?: string;
  comment?: string;
  public?: boolean;
  created?: string;
  changed?: string;
};

type AlbumDetail = Album & {
  song?: Song[];
};

type PlaylistDetail = Playlist & {
  entry?: Song[];
};

type ArtistDetail = Artist & {
  album?: Album[];
  info?: ArtistInfo | null;
};

type DetailSelection =
  | { type: "album"; data: AlbumDetail }
  | { type: "artist"; data: ArtistDetail }
  | { type: "playlist"; data: PlaylistDetail }
  | null;

type BrowserSnapshot = {
  activeView: View;
  detailSelection: DetailSelection;
};

type SongContextMenuState = {
  song: Song;
  x: number;
  y: number;
} | null;

type LibraryContextMenuState =
  | { type: "album"; item: Album; x: number; y: number }
  | { type: "artist"; item: Artist; x: number; y: number }
  | { type: "playlist"; item: Playlist; x: number; y: number }
  | null;

type FavoriteKind = "song" | "album" | "artist";
type FavoriteIds = {
  songs: Set<string>;
  albums: Set<string>;
  artists: Set<string>;
};
type PlaylistDetailsUpdate = {
  name: string;
  comment: string;
  public: boolean;
};

type LyricsPayload = {
  lyrics?: {
    value?: string;
    synced?: boolean;
    line?: Array<{ value?: string; start?: number | string; startMs?: number | string } | string>;
  } | string;
};

type LyricLine = {
  text: string;
  startMs: number | null;
};

type PlaybackSnapshot = {
  queue: Song[];
  currentIndex: number;
  position: number;
};

type RadioTrack = {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  duration?: number;
  subsonic_id?: string;
  coverArt?: string;
  coverUrl?: string;
  requestedBy?: string;
  startedAt?: string;
  endedAt?: string;
  timestamp?: number;
};

type RadioStationState = {
  nowPlaying?: RadioTrack | null;
  now_playing?: RadioTrack;
  current?: RadioTrack;
  track?: RadioTrack;
  upcoming?: RadioTrack[];
  queue?: RadioTrack[] | { upcoming?: RadioTrack[]; current?: RadioTrack };
  history?: RadioTrack[];
  listeners?: number | { count?: number; current?: number; total?: number };
  activeShow?: { name?: string; persona?: { name?: string } };
  dj?: { name?: string };
  context?: {
    stationName?: string;
    station?: { name?: string };
  };
  station?: { name?: string };
  stream?: { bufferSeconds?: number | null };
  streamOnline?: boolean | null;
  nowPlayingKnown?: boolean;
  status?: string;
  state?: string;
};

type RadioSessionTurn = {
  t?: string | number;
  role?: string;
  kind?: string;
  text?: string;
};

type RadioSessionPayload = {
  messages?: RadioSessionTurn[];
};

type RadioStationLocale = "en-GB" | "en-US";

type RadioSchedulePersona = { id?: string; name?: string; tagline?: string };
type RadioScheduleShow = { id?: string; name?: string; topic?: string; mood?: string; personaId?: string; guestPersonaIds?: string[] };

type RadioSchedulePayload = {
  personas?: RadioSchedulePersona[];
  shows?: RadioScheduleShow[];
  schedule?: Record<string, Array<string | null>>;
  timezone?: string | null;
  locale?: RadioStationLocale;
};

type RadioNowPlayingResponse = {
  nowPlaying?: RadioTrack | null;
  context?: RadioStationState["context"] | null;
  dj?: RadioStationState["dj"] | null;
  activeShow?: RadioStationState["activeShow"] | null;
  listeners?: RadioStationState["listeners"];
  stream?: RadioStationState["stream"];
  streamOnline?: boolean | null;
};

type RadioStatus = "idle" | "checking" | "ready" | "playing" | "error";

const STORAGE_KEY = "prism-player.navidrome";
const SETTINGS_KEY = "prism-player.settings";
const LAST_PLAYED_TRACK_KEY = "prism-player.lastPlayedTrack";
const PLAYBACK_STATE_KEY = "prism-player.playbackState";
const RIGHT_PANEL_OPEN_KEY = "prism-player.rightPanelOpen";
const RIGHT_PANEL_TAB_KEY = "prism-player.rightPanelTab";
const SIDEBAR_COLLAPSED_KEY = "prism-player.sidebarCollapsed";
const INSTALL_ID_KEY = "prism-player.installId";
const ANALYTICS_LAST_PING_KEY = "prism-player.analyticsLastPing";
const APP_VERSION = "0.1.0";
const BEACON_ENDPOINT = "https://beacon.kjschultz.com/ping";
const CLIENT_ID = "PrismPlayer";
const API_VERSION = "1.16.1";

const emptyConfig: NavidromeConfig = {
  serverUrl: "",
  username: "",
  password: "",
};

const emptySearchResults: SearchResults = {
  artists: [],
  albums: [],
  songs: [],
  playlists: [],
};

const emptyLibraryData: LibraryData = {
  albums: [],
  recentAlbums: [],
  recentlyPlayedAlbums: [],
  artists: [],
  playlists: [],
  favorites: {
    artists: [],
    albums: [],
    songs: [],
  },
};

const defaultSettings: AppSettings = {
  lastVolume: 0.82,
  defaultAlbumView: "art",
  defaultArtistView: "list",
  showSidebarPlaylists: true,
  sidebarPlaylistLimit: 8,
  analyticsEnabled: false,
  analyticsPromptDismissed: false,
  coverWashEnabled: true,
  radioStationUrl: "",
  radioStationUrls: [],
};

const ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

type AlphaGroup<T> = {
  letter: string;
  items: T[];
};

function alphaSectionId(prefix: string, letter: string) {
  return `${prefix}-${letter === "#" ? "num" : letter}`;
}

function getAlphaKey(value: string) {
  const first = value.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

function groupByAlpha<T>(items: T[], getLabel: (item: T) => string): AlphaGroup<T>[] {
  const buckets = new Map<string, T[]>();

  for (const item of [...items].sort((a, b) => getLabel(a).localeCompare(getLabel(b)))) {
    const letter = getAlphaKey(getLabel(item));
    buckets.set(letter, [...(buckets.get(letter) ?? []), item]);
  }

  return ALPHABET.map((letter) => ({ letter, items: buckets.get(letter) ?? [] })).filter((group) => group.items.length);
}

function getViewLabel(view: View) {
  const labels: Record<View, string> = {
    overview: "Home",
    albums: "Albums",
    artists: "Artists",
    playlists: "Playlists",
    recentlyAdded: "Recently Added",
    recentlyPlayed: "Recently Played",
    favorites: "Favorites",
    radio: "Radio",
    search: "Search",
    settings: "Settings",
  };

  return labels[view];
}

function getGreetingPeriod() {
  const hour = new Date().getHours();
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

function formatDisplayName(value?: string) {
  if (!value) return "there";
  return value
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sortAlbumsChronologically(albums: Album[]) {
  return [...albums].sort((a, b) => {
    const yearA = a.year ?? Number.MAX_SAFE_INTEGER;
    const yearB = b.year ?? Number.MAX_SAFE_INTEGER;

    if (yearA !== yearB) return yearA - yearB;
    return a.name.localeCompare(b.name);
  });
}

function getArtistImageUrl(info?: ArtistInfo | null) {
  return info?.largeImageUrl || info?.mediumImageUrl || info?.smallImageUrl || null;
}

function cleanBiography(value?: string) {
  if (!value) return "";
  const document = new DOMParser().parseFromString(value, "text/html");
  return document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function loadStoredConfig(): NavidromeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NavidromeConfig;
    if (!parsed.serverUrl || !parsed.username || !parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRadioStationList(values: Array<string | undefined | null>) {
  const stations: string[] = [];

  values.forEach((value) => {
    const normalized = normalizeStationUrl(value ?? "");
    if (normalized && !stations.includes(normalized)) stations.push(normalized);
  });

  return stations;
}

function loadStoredSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<AppSettings> & { defaultVolume?: number };
    const activeStation = normalizeStationUrl(parsed.radioStationUrl ?? "");
    const radioStationUrls = normalizeRadioStationList([...(parsed.radioStationUrls ?? []), activeStation]);

    return {
      lastVolume: clampNumber(Number(parsed.lastVolume ?? parsed.defaultVolume ?? defaultSettings.lastVolume), 0, 1),
      defaultAlbumView: parsed.defaultAlbumView === "list" ? "list" : "art",
      defaultArtistView: parsed.defaultArtistView === "art" ? "art" : "list",
      showSidebarPlaylists: parsed.showSidebarPlaylists ?? defaultSettings.showSidebarPlaylists,
      sidebarPlaylistLimit: clampNumber(Number(parsed.sidebarPlaylistLimit ?? defaultSettings.sidebarPlaylistLimit), 3, 20),
      analyticsEnabled: Boolean(parsed.analyticsEnabled),
      analyticsPromptDismissed: Boolean(parsed.analyticsPromptDismissed),
      coverWashEnabled: parsed.coverWashEnabled ?? defaultSettings.coverWashEnabled,
      radioStationUrl: activeStation || radioStationUrls[0] || defaultSettings.radioStationUrl,
      radioStationUrls,
    };
  } catch {
    return defaultSettings;
  }
}

function getInstallId() {
  try {
    const existing = localStorage.getItem(INSTALL_ID_KEY);
    if (existing) return existing;
    const installId = crypto.randomUUID();
    localStorage.setItem(INSTALL_ID_KEY, installId);
    return installId;
  } catch {
    return "unknown-install";
  }
}

function getRuntimePlatform() {
  const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return userAgentData?.platform || navigator.platform || "unknown";
}

function getRuntimeArch() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("arm64") || userAgent.includes("aarch64")) return "arm64";
  if (userAgent.includes("x86_64") || userAgent.includes("win64") || userAgent.includes("wow64")) return "x64";
  return "unknown";
}

function isDevRuntime() {
  return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
}

async function sendAnalyticsPing() {
  const isDev = isDevRuntime();

  await fetch(BEACON_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project: "prism-player",
      install_id: getInstallId(),
      version: APP_VERSION,
      arch: getRuntimeArch(),
      timestamp: new Date().toISOString(),
      channel: isDev ? "dev" : "release",
      os: getRuntimePlatform(),
      dev: isDev,
    }),
  });
}

function lyricTextLines(value: string): LyricLine[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text, startMs: null }));
}

function parseLyricStartMs(value: number | string | undefined) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return raw.includes(".") && numeric < 1000 ? Math.round(numeric * 1000) : Math.round(numeric);
}

function normalizeLyrics(response: LyricsPayload): LyricLine[] {
  const lyrics = response.lyrics;

  if (!lyrics) return [];
  if (typeof lyrics === "string") return lyricTextLines(lyrics);
  if (typeof lyrics.value === "string") return lyricTextLines(lyrics.value);
  if (Array.isArray(lyrics.line)) {
    return lyrics.line
      .map((line) => {
        if (typeof line === "string") return { text: line.trim(), startMs: null };
        return {
          text: (line.value ?? "").trim(),
          startMs: parseLyricStartMs(line.startMs ?? line.start),
        };
      })
      .filter((line) => line.text);
  }

  return [];
}

function loadLastPlayedTrack() {
  try {
    const raw = localStorage.getItem(LAST_PLAYED_TRACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Song>;
    return typeof parsed.id === "string" && typeof parsed.title === "string" ? (parsed as Song) : null;
  } catch {
    return null;
  }
}

function isStoredSong(value: unknown): value is Song {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Partial<Song>).id === "string" &&
      typeof (value as Partial<Song>).title === "string",
  );
}

function loadPlaybackSnapshot(): PlaybackSnapshot | null {
  try {
    const raw = localStorage.getItem(PLAYBACK_STATE_KEY);
    if (!raw) {
      const lastPlayedTrack = loadLastPlayedTrack();
      return lastPlayedTrack ? { queue: [lastPlayedTrack], currentIndex: 0, position: 0 } : null;
    }
    const parsed = JSON.parse(raw) as Partial<PlaybackSnapshot>;
    const queue = Array.isArray(parsed.queue) ? parsed.queue.filter(isStoredSong) : [];
    const currentIndex = Math.round(clampNumber(Number(parsed.currentIndex ?? 0), 0, Math.max(queue.length - 1, 0)));
    const position = clampNumber(Number(parsed.position ?? 0), 0, 24 * 60 * 60);

    return queue.length ? { queue, currentIndex, position } : null;
  } catch {
    const lastPlayedTrack = loadLastPlayedTrack();
    return lastPlayedTrack ? { queue: [lastPlayedTrack], currentIndex: 0, position: 0 } : null;
  }
}

function loadStoredBoolean(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

function loadStoredRightPanelTab(): RightPanelTab {
  try {
    const storedTab = localStorage.getItem(RIGHT_PANEL_TAB_KEY);
    return storedTab === "nowPlaying" || storedTab === "lyrics" ? storedTab : "queue";
  } catch {
    return "queue";
  }
}

function normalizeServerUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function hasUrlScheme(value: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

function getServerUrlCandidates(value: string) {
  const normalized = normalizeServerUrl(value);

  if (!normalized || hasUrlScheme(normalized)) {
    return normalized ? [normalized] : [];
  }

  return [`https://${normalized}`, `http://${normalized}`];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function buildNavidromeUrl(config: NavidromeConfig, endpoint: string, params: Record<string, string | string[]>) {
  const url = new URL(`${normalizeServerUrl(config.serverUrl)}/rest/${endpoint}.view`);
  url.searchParams.set("u", config.username);
  url.searchParams.set("p", config.password);
  url.searchParams.set("v", API_VERSION);
  url.searchParams.set("c", CLIENT_ID);
  url.searchParams.set("f", "json");

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
      return;
    }

    url.searchParams.set(key, value);
  });

  return url;
}

function buildCoverArtUrl(config: NavidromeConfig, coverArt?: string, size = "420") {
  if (!coverArt) return null;
  return buildNavidromeUrl(config, "getCoverArt", { id: coverArt, size }).toString();
}

function buildStreamUrl(config: NavidromeConfig, songId: string) {
  return buildNavidromeUrl(config, "stream", { id: songId }).toString();
}

function normalizeStationUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const candidate = hasUrlScheme(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(candidate).origin;
  } catch {
    return "";
  }
}

function buildRadioApiUrl(stationUrl: string, endpoint: string) {
  return `${normalizeStationUrl(stationUrl)}/api/${endpoint.replace(/^\/+/, "")}`;
}

function buildRadioStreamUrl(stationUrl: string) {
  return `${normalizeStationUrl(stationUrl)}/stream.mp3`;
}

function buildRadioCoverUrl(stationUrl: string, track: RadioTrack | null) {
  const origin = normalizeStationUrl(stationUrl);
  if (!origin || !track) return null;

  if (track.coverUrl) {
    try {
      return new URL(track.coverUrl, origin).toString();
    } catch {
      return track.coverUrl;
    }
  }

  const coverId = track.coverArt ?? track.subsonic_id;
  return coverId ? `${origin}/api/cover/${encodeURIComponent(coverId)}` : null;
}

function firstRadioTrack(state: RadioStationState | null): RadioTrack | null {
  if (!state) return null;
  if (state.nowPlayingKnown) return state.nowPlaying ?? null;
  if (state.nowPlaying) return state.nowPlaying;
  if (state.now_playing) return state.now_playing;
  if (state.current) return state.current;
  if (state.track) return state.track;
  if (!Array.isArray(state.queue) && state.queue?.current) return state.queue.current;
  return null;
}

function upcomingRadioTracks(state: RadioStationState | null): RadioTrack[] {
  if (!state) return [];
  if (Array.isArray(state.upcoming)) return state.upcoming;
  if (!Array.isArray(state.queue) && Array.isArray(state.queue?.upcoming)) return state.queue.upcoming;
  if (Array.isArray(state.queue)) return state.queue;
  return [];
}

function previousRadioTracks(state: RadioStationState | null): RadioTrack[] {
  if (!state || !Array.isArray(state.history)) return [];
  return state.history;
}

function radioListenerCount(state: RadioStationState | null): number | null {
  const listeners = state?.listeners;
  if (typeof listeners === "number") return listeners;
  if (!listeners) return null;
  return listeners.count ?? listeners.current ?? listeners.total ?? null;
}

function radioStationName(state: RadioStationState | null, stationUrl: string) {
  return (
    state?.context?.stationName ||
    state?.context?.station?.name ||
    state?.station?.name ||
    (stationUrl ? new URL(normalizeStationUrl(stationUrl)).host : "Subwave")
  );
}

function radioTurnTimeMs(turn: RadioSessionTurn | null) {
  if (!turn?.t) return null;
  const parsed = new Date(turn.t).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function relativeRadioTurnTime(turn: RadioSessionTurn | null) {
  const turnMs = radioTurnTimeMs(turn);
  if (turnMs == null) return "just now";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - turnMs) / 1000));
  if (diffSeconds < 1) return "now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function latestRadioVoiceLine(session: RadioSessionPayload | null, track: RadioTrack | null) {
  const messages = session?.messages ?? [];
  const trackStartMs = radioTrackStartedAtMs(track, null);

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const turn = messages[index];
    if (turn?.role !== "segment") continue;
    const text = turn.text?.trim();
    if (!text) continue;

    const turnMs = radioTurnTimeMs(turn);
    const belongsToTrack = trackStartMs == null || turnMs == null || turnMs >= trackStartMs - 45_000;
    const fresh = turnMs == null || Date.now() - turnMs <= 5 * 60 * 1000;
    if (belongsToTrack && fresh) return turn;
  }

  return null;
}

function sameRadioTrack(first: RadioTrack | null | undefined, second: RadioTrack | null | undefined) {
  if (!first || !second) return false;
  if (first.subsonic_id && second.subsonic_id) return first.subsonic_id === second.subsonic_id;
  return Boolean(first.title && second.title && first.title === second.title && (first.artist ?? "") === (second.artist ?? ""));
}

function parseRadioTimestampMs(value: string | number | undefined | null) {
  if (value == null) return null;
  if (typeof value === "number") {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function radioTrackStartedAtMs(track: RadioTrack | null, state: RadioStationState | null) {
  const directStart = parseRadioTimestampMs(track?.startedAt ?? track?.timestamp);
  if (directStart != null) return directStart;

  const currentStart = sameRadioTrack(track, state?.current) ? parseRadioTimestampMs(state?.current?.startedAt ?? state?.current?.timestamp) : null;
  return currentStart;
}

function radioTrackElapsedSeconds(track: RadioTrack | null, state: RadioStationState | null, nowMs: number) {
  const startedAt = radioTrackStartedAtMs(track, state);
  if (startedAt == null) return 0;

  const bufferSeconds = clampNumber(Number(state?.stream?.bufferSeconds ?? 0), 0, 60);
  const elapsed = Math.floor((nowMs - (startedAt + bufferSeconds * 1000)) / 1000);
  const duration = track?.duration ?? 0;
  return Math.max(0, duration > 0 ? Math.min(elapsed, duration) : elapsed);
}

function radioListenerBufferMs(state: RadioStationState | null) {
  return clampNumber(Number(state?.stream?.bufferSeconds ?? 0), 0, 60) * 1000;
}

function radioTrackAudibleAtMs(track: RadioTrack | null, state: RadioStationState | null) {
  const startedAt = radioTrackStartedAtMs(track, state);
  return startedAt == null ? null : startedAt + radioListenerBufferMs(state);
}

function listenerAlignedRadioState(nextState: RadioStationState, previousState: RadioStationState | null, nowMs: number) {
  const nextTrack = firstRadioTrack(nextState);
  const previousTrack = firstRadioTrack(previousState);
  const audibleAt = radioTrackAudibleAtMs(nextTrack, nextState);

  if (!nextTrack || !previousTrack || sameRadioTrack(nextTrack, previousTrack) || audibleAt == null || audibleAt <= nowMs) {
    return { state: nextState, promoteAt: null };
  }

  const upcoming = upcomingRadioTracks(nextState);
  const heldUpcoming = upcoming.some((track) => sameRadioTrack(track, nextTrack)) ? upcoming : [nextTrack, ...upcoming];

  return {
    state: {
      ...nextState,
      nowPlaying: previousTrack,
      nowPlayingKnown: true,
      current: previousTrack,
      track: previousTrack,
      upcoming: heldUpcoming,
      history: previousState?.history ?? nextState.history,
      queue: Array.isArray(nextState.queue) ? heldUpcoming : { ...(typeof nextState.queue === "object" && nextState.queue ? nextState.queue : {}), current: previousTrack, upcoming: heldUpcoming },
    },
    promoteAt: audibleAt,
  };
}

function padHour(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

function formatStationHour(hour: number, locale: RadioStationLocale = "en-US") {
  const normalizedHour = ((hour % 24) + 24) % 24;
  if (locale === "en-US") {
    const suffix = normalizedHour < 12 ? "AM" : "PM";
    return `${normalizedHour % 12 || 12}:00 ${suffix}`;
  }
  return `${padHour(normalizedHour)}:00`;
}

function splitFeaturedTitle(title: string) {
  const match = title.match(/\s+((?:feat\.?|ft\.?|featuring)\s+.+)$/i);
  if (!match?.index) return { main: title, feature: "" };
  return {
    main: title.slice(0, match.index).trim(),
    feature: match[1]?.trim() ?? "",
  };
}

function zonedDayHour(date: Date, timezone?: string | null) {
  if (!timezone) return { day: date.getDay(), hour: date.getHours() };

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    }).formatToParts(date);
    const dayName = parts.find((part) => part.type === "weekday")?.value ?? "";
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayName);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? date.getHours());
    return { day: day >= 0 ? day : date.getDay(), hour: hour === 24 ? 0 : hour };
  } catch {
    return { day: date.getDay(), hour: date.getHours() };
  }
}

function radioScheduleDay(schedule: RadioSchedulePayload | null, day: number) {
  return schedule?.schedule?.[String(day)] ?? schedule?.schedule?.[day] ?? null;
}

function radioShowTiming(schedule: RadioSchedulePayload | null, nowMs: number) {
  const grid = schedule?.schedule;
  if (!schedule || !grid) return null;

  const { day, hour } = zonedDayHour(new Date(nowMs), schedule.timezone);
  const dayGrid = radioScheduleDay(schedule, day);
  if (!Array.isArray(dayGrid)) return null;

  const currentShowId = dayGrid[hour] ?? null;
  let endHour = hour;
  while (endHour + 1 < 24 && (dayGrid[endHour + 1] ?? null) === currentShowId) endHour++;

  const shows = schedule.shows ?? [];
  const currentShow = currentShowId ? shows.find((show) => show.id === currentShowId) ?? null : null;
  const locale = schedule.locale ?? "en-US";
  let nextShow: RadioScheduleShow | null = null;
  let nextShowHour: number | null = null;

  for (let offset = 1; offset <= 24 * 7; offset += 1) {
    const nextHourAbsolute = hour + offset;
    const nextDay = (day + Math.floor(nextHourAbsolute / 24)) % 7;
    const nextHour = nextHourAbsolute % 24;
    const nextGrid = radioScheduleDay(schedule, nextDay);
    const nextShowId = Array.isArray(nextGrid) ? nextGrid[nextHour] ?? null : null;
    if (nextShowId !== currentShowId) {
      nextShow = nextShowId ? shows.find((show) => show.id === nextShowId) ?? null : null;
      nextShowHour = nextHour;
      break;
    }
  }

  return {
    currentShow,
    until: `Until ${formatStationHour(endHour + 1, locale)}`,
    nextShow,
    nextShowAt: nextShowHour == null ? null : formatStationHour(nextShowHour, locale),
  };
}

async function fetchRadioJson<T>(stationUrl: string, endpoint: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(buildRadioApiUrl(stationUrl, endpoint), {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) throw new Error("That address answered, but not like a Subwave station.");
    const data = (await response.json()) as T;
    if (!data || typeof data !== "object") throw new Error("That station response was not readable.");
    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchRadioSchedule(stationUrl: string): Promise<RadioSchedulePayload> {
  const origin = normalizeStationUrl(stationUrl);
  if (!origin) throw new Error("Enter a valid Subwave station URL.");
  return fetchRadioJson<RadioSchedulePayload>(origin, "schedule");
}

async function fetchRadioSession(stationUrl: string): Promise<RadioSessionPayload> {
  const origin = normalizeStationUrl(stationUrl);
  if (!origin) throw new Error("Enter a valid Subwave station URL.");
  return fetchRadioJson<RadioSessionPayload>(origin, "session");
}

async function fetchRadioState(stationUrl: string): Promise<RadioStationState> {
  const origin = normalizeStationUrl(stationUrl);
  if (!origin) throw new Error("Enter a valid Subwave station URL.");

  const [state, nowPlayingResponse] = await Promise.all([
    fetchRadioJson<RadioStationState>(origin, "state"),
    fetchRadioJson<RadioNowPlayingResponse>(origin, "now-playing").catch(() => null),
  ]);

  if (!nowPlayingResponse) return state;

  const stateTrack = firstRadioTrack(state);
  const nowPlaying = nowPlayingResponse.nowPlaying ?? null;
  const mergedNowPlaying = nowPlaying && stateTrack && sameRadioTrack(stateTrack, nowPlaying) ? { ...stateTrack, ...nowPlaying } : nowPlaying;

  return {
    ...state,
    nowPlaying: mergedNowPlaying,
    nowPlayingKnown: true,
    context: nowPlayingResponse.context ?? state.context,
    dj: nowPlayingResponse.dj ?? state.dj,
    activeShow: nowPlayingResponse.activeShow ?? state.activeShow,
    listeners: nowPlayingResponse.listeners ?? state.listeners,
    stream: nowPlayingResponse.stream ?? state.stream,
    streamOnline: nowPlayingResponse.streamOnline ?? state.streamOnline,
  };
}

async function navidromeRequest<T>(
  config: NavidromeConfig,
  endpoint: string,
  params: Record<string, string | string[]> = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(buildNavidromeUrl(config, endpoint, params), {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}.`);
    }

    const body = await response.json();
    const subsonic = body["subsonic-response"];

    if (!subsonic) {
      throw new Error("Response was not a Subsonic API payload.");
    }

    if (subsonic.status === "failed") {
      throw new Error(subsonic.error?.message ?? "Navidrome rejected the request.");
    }

    return subsonic as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function resolveNavidromeConfig(config: NavidromeConfig) {
  const candidates = getServerUrlCandidates(config.serverUrl);
  let lastError: unknown = null;

  for (const serverUrl of candidates) {
    const nextConfig = { ...config, serverUrl };

    try {
      await navidromeRequest(nextConfig, "ping");
      return nextConfig;
    } catch (error) {
      lastError = error;
    }
  }

  if (candidates.length > 1) {
    throw new Error(`Could not reach Navidrome over HTTPS or HTTP. ${getErrorMessage(lastError)}`);
  }

  throw lastError instanceof Error ? lastError : new Error("Could not reach Navidrome.");
}

async function fetchLibrary(config: NavidromeConfig): Promise<LibraryData> {
  const [albums, recentAlbumResponse, recentlyPlayedResponse, artistResponse, playlistResponse, starredResponse] = await Promise.all([
    fetchAlbumLibrary(config),
    navidromeRequest<{ albumList2?: { album?: Album[] } }>(config, "getAlbumList2", {
      type: "newest",
      size: "60",
    }),
    navidromeRequest<{ albumList2?: { album?: Album[] } }>(config, "getAlbumList2", {
      type: "recent",
      size: "60",
    }),
    navidromeRequest<{ artists?: { index?: Array<{ artist?: Artist[] }> } }>(config, "getArtists"),
    navidromeRequest<{ playlists?: { playlist?: Playlist[] } }>(config, "getPlaylists").catch(() => null),
    navidromeRequest<{
      starred2?: {
        artist?: Artist[];
        album?: Album[];
        song?: Song[];
      };
    }>(config, "getStarred2").catch(() => null),
  ]);

  return {
    albums,
    recentAlbums: recentAlbumResponse.albumList2?.album ?? [],
    recentlyPlayedAlbums: recentlyPlayedResponse.albumList2?.album ?? [],
    artists: artistResponse.artists?.index?.flatMap((index) => index.artist ?? []) ?? [],
    playlists: playlistResponse?.playlists?.playlist ?? [],
    favorites: {
      artists: starredResponse?.starred2?.artist ?? [],
      albums: starredResponse?.starred2?.album ?? [],
      songs: starredResponse?.starred2?.song ?? [],
    },
  };
}

async function fetchAlbumLibrary(config: NavidromeConfig): Promise<Album[]> {
  const albums: Album[] = [];
  const size = 500;

  for (let offset = 0; offset < 5000; offset += size) {
    const response = await navidromeRequest<{ albumList2?: { album?: Album[] } }>(config, "getAlbumList2", {
      type: "alphabeticalByName",
      size: String(size),
      offset: String(offset),
    });
    const page = response.albumList2?.album ?? [];
    albums.push(...page);
    if (page.length < size) break;
  }

  return albums;
}

async function fetchAlbumDetail(config: NavidromeConfig, albumId: string): Promise<AlbumDetail> {
  const response = await navidromeRequest<{ album: AlbumDetail }>(config, "getAlbum", { id: albumId });
  return response.album;
}

async function fetchArtistDetail(config: NavidromeConfig, artistId: string): Promise<ArtistDetail> {
  const [artistResponse, infoResponse] = await Promise.all([
    navidromeRequest<{ artist: ArtistDetail }>(config, "getArtist", { id: artistId }),
    navidromeRequest<{ artistInfo2?: ArtistInfo }>(config, "getArtistInfo2", { id: artistId }).catch(() => null),
  ]);

  return {
    ...artistResponse.artist,
    info: infoResponse?.artistInfo2 ?? null,
  };
}

async function fetchPlaylistDetail(config: NavidromeConfig, playlistId: string): Promise<PlaylistDetail> {
  const response = await navidromeRequest<{ playlist: PlaylistDetail }>(config, "getPlaylist", { id: playlistId });
  return response.playlist;
}

async function fetchLyrics(config: NavidromeConfig, song: Song) {
  const response = await navidromeRequest<LyricsPayload>(config, "getLyrics", {
    artist: song.artist ?? "",
    title: song.title,
  });

  return normalizeLyrics(response);
}

async function fetchAutoplaySongs(config: NavidromeConfig, seedSong: Song) {
  const similarResponse = await navidromeRequest<{ similarSongs2?: { song?: Song[] } }>(config, "getSimilarSongs2", {
    id: seedSong.id,
    count: "25",
  }).catch(() => null);

  const similarSongs = similarResponse?.similarSongs2?.song ?? [];
  if (similarSongs.length) return similarSongs;

  const randomResponse = await navidromeRequest<{ randomSongs?: { song?: Song[] } }>(config, "getRandomSongs", {
    size: "25",
  });

  return randomResponse.randomSongs?.song ?? [];
}

async function createPlaylist(config: NavidromeConfig, name: string, songs: Song[] = []) {
  await navidromeRequest(config, "createPlaylist", {
    name,
    songId: songs.map((song) => song.id),
  });
}

async function updatePlaylistDetails(config: NavidromeConfig, playlistId: string, details: PlaylistDetailsUpdate) {
  await navidromeRequest(config, "updatePlaylist", {
    playlistId,
    name: details.name,
    comment: details.comment,
    public: String(details.public),
  });
}

async function deletePlaylist(config: NavidromeConfig, playlistId: string) {
  await navidromeRequest(config, "deletePlaylist", { id: playlistId });
}

async function removePlaylistSong(config: NavidromeConfig, playlistId: string, index: number) {
  await navidromeRequest(config, "updatePlaylist", {
    playlistId,
    songIndexToRemove: String(index),
  });
}

async function replacePlaylistSongs(config: NavidromeConfig, playlist: PlaylistDetail, songs: Song[]) {
  const currentSongs = playlist.entry ?? [];
  await navidromeRequest(config, "updatePlaylist", {
    playlistId: playlist.id,
    name: playlist.name,
    comment: playlist.comment ?? "",
    public: String(Boolean(playlist.public)),
    songIndexToRemove: currentSongs.map((_, index) => String(currentSongs.length - index - 1)),
    songIdToAdd: songs.map((song) => song.id),
  });
}

async function addSongsToPlaylist(config: NavidromeConfig, playlistId: string, songs: Song[]) {
  await navidromeRequest(config, "updatePlaylist", {
    playlistId,
    songIdToAdd: songs.map((song) => song.id),
  });
}

async function setNavidromeFavorite(config: NavidromeConfig, kind: FavoriteKind, id: string, favorite: boolean) {
  const params: Record<string, string> =
    kind === "song" ? { id } : kind === "album" ? { albumId: id } : { artistId: id };

  await navidromeRequest(config, favorite ? "star" : "unstar", params);
}

async function scrobbleSong(config: NavidromeConfig, song: Song) {
  await navidromeRequest(config, "scrobble", {
    id: song.id,
    time: String(Date.now()),
    submission: "true",
  });
}

async function fetchSearchResults(config: NavidromeConfig, query: string): Promise<SearchResults> {
  const [response, playlistResponse] = await Promise.all([
    navidromeRequest<{
      searchResult3?: {
        artist?: Artist[];
        album?: Album[];
        song?: Song[];
      };
    }>(config, "search3", {
      query,
      artistCount: "12",
      albumCount: "18",
      songCount: "40",
    }),
    navidromeRequest<{ playlists?: { playlist?: Playlist[] } }>(config, "getPlaylists").catch(() => null),
  ]);

  const normalizedQuery = query.toLocaleLowerCase();
  const playlists =
    playlistResponse?.playlists?.playlist
      ?.filter((playlist) => playlist.name.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 20) ?? [];

  return {
    artists: response.searchResult3?.artist ?? [],
    albums: response.searchResult3?.album ?? [],
    songs: response.searchResult3?.song ?? [],
    playlists,
  };
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "-:--";
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getSongDisc(song: Song) {
  return song.discNumber ?? Number.MAX_SAFE_INTEGER;
}

function getSongTrack(song: Song) {
  return song.track ?? Number.MAX_SAFE_INTEGER;
}

function sortAlbumSongs(songs: Song[]) {
  return [...songs].sort((a, b) => {
    const discA = getSongDisc(a);
    const discB = getSongDisc(b);
    const trackA = getSongTrack(a);
    const trackB = getSongTrack(b);

    return (
      discA - discB ||
      trackA - trackB ||
      a.title.localeCompare(b.title)
    );
  });
}

type DiscGroup = {
  discNumber: number | null;
  songs: Song[];
};

function groupSongsByDisc(songs: Song[]): DiscGroup[] {
  const groups = new Map<number | null, Song[]>();

  for (const song of songs) {
    const discNumber = song.discNumber ?? null;
    groups.set(discNumber, [...(groups.get(discNumber) ?? []), song]);
  }

  return [...groups.entries()].map(([discNumber, groupedSongs]) => ({
    discNumber,
    songs: groupedSongs,
  }));
}

function getSnapshotLabel(snapshot: BrowserSnapshot | null) {
  if (!snapshot) return "";
  if (snapshot.detailSelection?.type === "artist") return snapshot.detailSelection.data.name;
  if (snapshot.detailSelection?.type === "album") return snapshot.detailSelection.data.name;
  if (snapshot.detailSelection?.type === "playlist") return snapshot.detailSelection.data.name;
  return getViewLabel(snapshot.activeView);
}

export function App() {
  const [initialPlaybackSnapshot] = useState(() => loadPlaybackSnapshot());
  const [activeView, setActiveView] = useState<View>("overview");
  const [config, setConfig] = useState<NavidromeConfig | null>(() => loadStoredConfig());
  const [form, setForm] = useState<NavidromeConfig>(() => loadStoredConfig() ?? emptyConfig);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadStoredSettings());
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Add a Navidrome server to start syncing.");
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>(() => (loadStoredConfig() ? "loading" : "idle"));
  const [libraryData, setLibraryData] = useState<LibraryData>(emptyLibraryData);
  const [setupOpen, setSetupOpen] = useState(() => !loadStoredConfig());
  const [detailSelection, setDetailSelection] = useState<DetailSelection>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const [detailMessage, setDetailMessage] = useState("");
  const [backStack, setBackStack] = useState<BrowserSnapshot[]>([]);
  const [forwardStack, setForwardStack] = useState<BrowserSnapshot[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults>(emptySearchResults);
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "error">("idle");
  const [searchFocused, setSearchFocused] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadStoredBoolean(SIDEBAR_COLLAPSED_KEY, false));
  const [sidebarPlaylistsOpen, setSidebarPlaylistsOpen] = useState(true);
  const [albumViewMode, setAlbumViewMode] = useState<AlbumViewMode>(() => loadStoredSettings().defaultAlbumView);
  const [artistViewMode, setArtistViewMode] = useState<ArtistViewMode>(() => loadStoredSettings().defaultArtistView);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("connection");
  const [queue, setQueue] = useState<Song[]>(() => initialPlaybackSnapshot?.queue ?? []);
  const [currentIndex, setCurrentIndex] = useState(() => initialPlaybackSnapshot?.currentIndex ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastPlayedTrack, setLastPlayedTrack] = useState<Song | null>(
    () => initialPlaybackSnapshot?.queue[initialPlaybackSnapshot.currentIndex] ?? loadLastPlayedTrack(),
  );
  const [position, setPosition] = useState(() => initialPlaybackSnapshot?.position ?? 0);
  const [playerDuration, setPlayerDuration] = useState(() => initialPlaybackSnapshot?.queue[initialPlaybackSnapshot.currentIndex]?.duration ?? 0);
  const [volume, setVolume] = useState(() => loadStoredSettings().lastVolume);
  const [rightPanelOpen, setRightPanelOpen] = useState(() => loadStoredBoolean(RIGHT_PANEL_OPEN_KEY, false));
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>(() => loadStoredRightPanelTab());
  const [lyricsStatus, setLyricsStatus] = useState<LyricsStatus>("idle");
  const [lyricsLines, setLyricsLines] = useState<LyricLine[]>([]);
  const [lyricsMessage, setLyricsMessage] = useState("");
  const [playerError, setPlayerError] = useState("");
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [radioStationInput, setRadioStationInput] = useState(appSettings.radioStationUrl);
  const [radioStationState, setRadioStationState] = useState<RadioStationState | null>(null);
  const [radioSession, setRadioSession] = useState<RadioSessionPayload | null>(null);
  const [radioSchedule, setRadioSchedule] = useState<RadioSchedulePayload | null>(null);
  const [radioStatus, setRadioStatus] = useState<RadioStatus>("idle");
  const [radioMessage, setRadioMessage] = useState(appSettings.radioStationUrl ? "Ready to tune in." : "Add a Subwave station URL to start.");
  const [radioVolume, setRadioVolume] = useState(appSettings.lastVolume);
  const [radioClockNow, setRadioClockNow] = useState(() => Date.now());
  const [suppressLocalFooter, setSuppressLocalFooter] = useState(false);
  const [draggedQueueIndex, setDraggedQueueIndex] = useState<number | null>(null);
  const [dragOverQueueIndex, setDragOverQueueIndex] = useState<number | null>(null);
  const [playlistCreatorOpen, setPlaylistCreatorOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistPublic, setPlaylistPublic] = useState(false);
  const [playlistFromQueue, setPlaylistFromQueue] = useState(true);
  const [playlistCreateStatus, setPlaylistCreateStatus] = useState<"idle" | "saving" | "error">("idle");
  const [playlistCreateMessage, setPlaylistCreateMessage] = useState("");
  const [songContextMenu, setSongContextMenu] = useState<SongContextMenuState>(null);
  const [libraryContextMenu, setLibraryContextMenu] = useState<LibraryContextMenuState>(null);
  const [playlistDeleteTarget, setPlaylistDeleteTarget] = useState<Playlist | null>(null);
  const [playlistDeleteStatus, setPlaylistDeleteStatus] = useState<"idle" | "saving" | "error">("idle");
  const [playlistDeleteMessage, setPlaylistDeleteMessage] = useState("");
  const [playlistEditRequestKey, setPlaylistEditRequestKey] = useState(0);
  const [playlistAddStatus, setPlaylistAddStatus] = useState<"idle" | "saving" | "error">("idle");
  const [playlistAddMessage, setPlaylistAddMessage] = useState("");
  const [favoriteBusyKey, setFavoriteBusyKey] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const radioAudioRef = useRef<HTMLAudioElement | null>(null);
  const radioPromoteTimerRef = useRef<number | null>(null);
  const scrobbledPlayRef = useRef("");
  const pendingResumePositionRef = useRef(initialPlaybackSnapshot?.position ?? 0);
  const lastPlaybackPersistRef = useRef(0);
  const lastPlaybackPersistTrackRef = useRef("");
  const autoplayLoadingRef = useRef(false);

  const hasConfig = Boolean(config);
  const currentTrack = queue[currentIndex] ?? null;
  const currentTrackCoverUrl = config && currentTrack ? buildCoverArtUrl(config, currentTrack.coverArt, "160") : null;
  const radioStationUrl = normalizeStationUrl(appSettings.radioStationUrl);
  const radioNowPlaying = firstRadioTrack(radioStationState);
  const radioUpcoming = upcomingRadioTracks(radioStationState);
  const radioHistory = previousRadioTracks(radioStationState);
  const isRadioPlaying = radioStatus === "playing";
  const radioElapsed = isRadioPlaying ? radioTrackElapsedSeconds(radioNowPlaying, radioStationState, radioClockNow) : 0;
  const radioCoverUrl = buildRadioCoverUrl(radioStationUrl, radioNowPlaying);
  const footerTrack = isRadioPlaying || suppressLocalFooter ? null : currentTrack ?? lastPlayedTrack;
  const footerTrackCoverUrl = config && footerTrack ? buildCoverArtUrl(config, footerTrack.coverArt, "160") : null;
  const coverWashUrl = appSettings.coverWashEnabled
    ? isRadioPlaying
      ? radioCoverUrl
      : config && footerTrack
        ? buildCoverArtUrl(config, footerTrack.coverArt, "900")
        : null
    : null;
  const currentStreamUrl = config && currentTrack ? buildStreamUrl(config, currentTrack.id) : null;
  const favoriteIds = useMemo<FavoriteIds>(
    () => ({
      songs: new Set(libraryData.favorites.songs.map((song) => song.id)),
      albums: new Set(libraryData.favorites.albums.map((album) => album.id)),
      artists: new Set(libraryData.favorites.artists.map((artist) => artist.id)),
    }),
    [libraryData.favorites.albums, libraryData.favorites.artists, libraryData.favorites.songs],
  );
  const albumLookup = useMemo(() => {
    const albums = [
      ...libraryData.albums,
      ...libraryData.recentAlbums,
      ...libraryData.recentlyPlayedAlbums,
      ...libraryData.favorites.albums,
      ...searchResults.albums,
    ];
    return new Map(albums.map((album) => [album.id, album]));
  }, [libraryData.albums, libraryData.favorites.albums, libraryData.recentAlbums, libraryData.recentlyPlayedAlbums, searchResults.albums]);
  const artistLookup = useMemo(() => {
    const artists = [...libraryData.artists, ...libraryData.favorites.artists, ...searchResults.artists];
    return new Map(artists.map((artist) => [artist.id, artist]));
  }, [libraryData.artists, libraryData.favorites.artists, searchResults.artists]);
  const playlistLookup = useMemo(() => {
    const playlists = [...libraryData.playlists, ...searchResults.playlists];
    return new Map(playlists.map((playlist) => [playlist.id, playlist]));
  }, [libraryData.playlists, searchResults.playlists]);
  const displayedQueue = useMemo(() => {
    const items = queue.map((song, index) => ({ song, index })).slice(Math.max(currentIndex, 0));
    const draggedDisplayIndex = items.findIndex((item) => item.index === draggedQueueIndex);
    const dragOverDisplayIndex = items.findIndex((item) => item.index === dragOverQueueIndex);

    if (
      draggedQueueIndex == null ||
      dragOverQueueIndex == null ||
      draggedQueueIndex === dragOverQueueIndex ||
      draggedDisplayIndex < 0 ||
      dragOverDisplayIndex < 0
    ) {
      return items;
    }

    const [draggedItem] = items.splice(draggedDisplayIndex, 1);
    items.splice(dragOverDisplayIndex, 0, draggedItem);
    return items;
  }, [currentIndex, dragOverQueueIndex, draggedQueueIndex, queue]);
  const libraryItems = useMemo(
    () => [
      { label: "Artists", value: hasConfig ? `${libraryData.artists.length} loaded` : "Needs server" },
      { label: "Albums", value: hasConfig ? `${libraryData.albums.length} loaded` : "Needs server" },
      { label: "Playlists", value: hasConfig ? `${libraryData.playlists.length} loaded` : "Needs server" },
      { label: "Recently Added", value: hasConfig ? `${libraryData.recentAlbums.length} albums` : "Needs server" },
      { label: "Recently Played", value: hasConfig ? `${libraryData.recentlyPlayedAlbums.length} albums` : "Needs server" },
      {
        label: "Favorites",
        value: hasConfig
          ? `${libraryData.favorites.artists.length + libraryData.favorites.albums.length + libraryData.favorites.songs.length} saved`
          : "Needs server",
      },
    ],
    [
      hasConfig,
      libraryData.albums.length,
      libraryData.artists.length,
      libraryData.favorites.albums.length,
      libraryData.favorites.artists.length,
      libraryData.favorites.songs.length,
      libraryData.playlists.length,
      libraryData.recentAlbums.length,
      libraryData.recentlyPlayedAlbums.length,
    ],
  );

  function normalizeAppSettings(nextSettings: AppSettings) {
    const radioStationUrls = normalizeRadioStationList([...nextSettings.radioStationUrls, nextSettings.radioStationUrl]);
    const activeStation = normalizeStationUrl(nextSettings.radioStationUrl) || radioStationUrls[0] || "";

    return {
      ...nextSettings,
      lastVolume: clampNumber(nextSettings.lastVolume, 0, 1),
      sidebarPlaylistLimit: Math.round(clampNumber(nextSettings.sidebarPlaylistLimit, 3, 20)),
      radioStationUrl: activeStation,
      radioStationUrls: radioStationUrls.includes(activeStation) ? radioStationUrls : normalizeRadioStationList([activeStation, ...radioStationUrls]),
    };
  }

  function updateAppSettings(nextSettings: AppSettings) {
    const normalizedSettings = normalizeAppSettings(nextSettings);

    setAppSettings(normalizedSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizedSettings));
  }

  function saveRadioStation(origin: string) {
    const normalized = normalizeStationUrl(origin);
    if (!normalized) return;

    updateAppSettings({
      ...appSettings,
      radioStationUrl: normalized,
      radioStationUrls: normalizeRadioStationList([...appSettings.radioStationUrls, normalized]),
    });
    setRadioStationInput(normalized);
  }

  function selectRadioStation(nextUrl: string) {
    const origin = normalizeStationUrl(nextUrl);
    if (!origin) return;

    tuneOutRadio("Ready to tune in.");
    setRadioStationState(null);
    setRadioSession(null);
    setRadioSchedule(null);
    saveRadioStation(origin);
    void refreshRadio(origin);
  }

  function removeRadioStation(nextUrl: string) {
    const origin = normalizeStationUrl(nextUrl);
    if (!origin) return;

    const remainingStations = appSettings.radioStationUrls.filter((stationUrl) => stationUrl !== origin);
    const activeStation = radioStationUrl === origin ? remainingStations[0] ?? "" : radioStationUrl;

    if (radioStationUrl === origin) {
      tuneOutRadio(activeStation ? "Ready to tune in." : "Add a Subwave station URL to start.");
      setRadioStationState(null);
      setRadioSession(null);
      setRadioSchedule(null);
    }

    updateAppSettings({
      ...appSettings,
      radioStationUrl: activeStation,
      radioStationUrls: remainingStations,
    });
    setRadioStationInput(activeStation);
  }

  function applyRadioStationState(nextState: RadioStationState) {
    if (radioPromoteTimerRef.current != null) {
      window.clearTimeout(radioPromoteTimerRef.current);
      radioPromoteTimerRef.current = null;
    }

    setRadioStationState((previousState) => {
      const aligned = listenerAlignedRadioState(nextState, previousState, Date.now());
      if (aligned.promoteAt != null) {
        radioPromoteTimerRef.current = window.setTimeout(() => {
          radioPromoteTimerRef.current = null;
          setRadioStationState(nextState);
        }, Math.max(0, aligned.promoteAt - Date.now()));
      }
      return aligned.state;
    });
  }

  async function refreshRadio(nextUrl = radioStationInput) {
    const origin = normalizeStationUrl(nextUrl);
    if (!origin) {
      setRadioStatus("error");
      setRadioMessage("Enter a valid Subwave station URL.");
      return null;
    }

    setRadioStatus((currentStatus) => (currentStatus === "playing" ? "playing" : "checking"));
    setRadioMessage("Checking station...");

    try {
      const [nextState, nextSession] = await Promise.all([
        fetchRadioState(origin),
        fetchRadioSession(origin).catch(() => null),
      ]);
      applyRadioStationState(nextState);
      if (nextSession) setRadioSession(nextSession);
      saveRadioStation(origin);
      setRadioStatus((currentStatus) => (currentStatus === "playing" ? "playing" : "ready"));
      setRadioMessage("Station connected.");
      return nextState;
    } catch (error) {
      setRadioStatus("error");
      setRadioMessage(getErrorMessage(error));
      return null;
    }
  }

  function tuneOutRadio(nextMessage?: string) {
    const message = nextMessage ?? (radioStationState ? "Ready to tune in." : "Add a Subwave station URL to start.");
    const audio = radioAudioRef.current;
    audio?.pause();
    if (audio) audio.removeAttribute("src");
    setSuppressLocalFooter(true);
    setRadioStatus(radioStationState ? "ready" : "idle");
    setRadioMessage(message);
  }

  async function tuneInRadio() {
    const origin = normalizeStationUrl(radioStationInput || appSettings.radioStationUrl);
    const radioAudio = radioAudioRef.current;
    if (!origin || !radioAudio) {
      setRadioStatus("error");
      setRadioMessage("Enter a valid Subwave station URL.");
      return;
    }

    if (!radioStationState || origin !== radioStationUrl) {
      const nextState = await refreshRadio(origin);
      if (!nextState) return;
    }

    audioRef.current?.pause();
    setIsPlaying(false);
    radioAudio.src = buildRadioStreamUrl(origin);
    radioAudio.volume = radioVolume;
    setRadioStatus("checking");
    setRadioMessage("Tuning in...");

    try {
      await radioAudio.play();
      setSuppressLocalFooter(false);
      setRadioStatus("playing");
      setRadioMessage("");
    } catch {
      setRadioStatus("error");
      setRadioMessage("The stream could not start.");
    }
  }

  function setRadioPlaybackVolume(nextVolume: number) {
    const clamped = clampNumber(nextVolume, 0, 1);
    const audio = radioAudioRef.current;
    if (audio) audio.volume = clamped;
    setRadioVolume(clamped);
    updateAppSettings({ ...appSettings, lastVolume: clamped });
  }

  function setRightPanelState(open: boolean) {
    setRightPanelOpen(open);
    localStorage.setItem(RIGHT_PANEL_OPEN_KEY, String(open));
  }

  function selectRightPanelTab(tab: RightPanelTab) {
    setRightPanelTab(tab);
    localStorage.setItem(RIGHT_PANEL_TAB_KEY, tab);
    setRightPanelState(true);
  }

  function setSidebarCollapsedState(collapsed: boolean) {
    setSidebarCollapsed(collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }

  function setAnalyticsConsent(enabled: boolean) {
    updateAppSettings({
      ...appSettings,
      analyticsEnabled: enabled,
      analyticsPromptDismissed: true,
    });

    if (enabled) {
      void sendAnalyticsPing()
        .then(() => localStorage.setItem(ANALYTICS_LAST_PING_KEY, new Date().toISOString()))
        .catch(() => undefined);
    }
  }

  function dismissAnalyticsPrompt() {
    updateAppSettings({
      ...appSettings,
      analyticsPromptDismissed: true,
    });
  }

  function resetAppSettings() {
    updateAppSettings(defaultSettings);
    setAlbumViewMode(defaultSettings.defaultAlbumView);
    setArtistViewMode(defaultSettings.defaultArtistView);
    const audio = audioRef.current;
    if (audio) audio.volume = defaultSettings.lastVolume;
    setVolume(defaultSettings.lastVolume);
  }

  async function refreshLibrary(nextConfig = config) {
    if (!nextConfig) return false;

    setStatus("checking");
    setLibraryStatus("loading");
    setStatusMessage("Checking Navidrome and loading library...");

    try {
      const resolvedConfig = await resolveNavidromeConfig(nextConfig);
      const nextLibrary = await fetchLibrary(resolvedConfig);
      setLibraryData(nextLibrary);
      setConfig(resolvedConfig);
      setForm(resolvedConfig);
      setStatus("connected");
      setLibraryStatus("ready");
      setStatusMessage(`Connected to ${resolvedConfig.serverUrl}.`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resolvedConfig));
      return true;
    } catch (error) {
      setStatus("error");
      setLibraryStatus("error");
      setStatusMessage(getErrorMessage(error));
      return false;
    }
  }

  async function saveConnection(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const nextConfig = {
      serverUrl: normalizeServerUrl(form.serverUrl),
      username: form.username.trim(),
      password: form.password,
    };

    if (!nextConfig.serverUrl || !nextConfig.username || !nextConfig.password) {
      setStatus("error");
      setStatusMessage("Server URL, username, and password are required.");
      return;
    }

    const connected = await refreshLibrary(nextConfig);

    if (connected) {
      setSetupOpen(false);
      setBackStack([]);
      setForwardStack([]);
      setDetailSelection(null);
      setActiveView("overview");
    }
  }

  async function openAlbumById(albumId: string, label = "album") {
    if (!config) return;
    const origin = { activeView, detailSelection };

    setDetailStatus("loading");
    setDetailMessage(`Loading ${label}...`);
    setActiveView("albums");

    try {
      const albumDetail = await fetchAlbumDetail(config, albumId);
      setBackStack((currentStack) => [...currentStack, origin].slice(-40));
      setForwardStack([]);
      setDetailSelection({ type: "album", data: albumDetail });
      setDetailStatus("idle");
      setDetailMessage("");
    } catch (error) {
      setDetailStatus("error");
      setDetailMessage(getErrorMessage(error));
    }
  }

  async function openAlbum(album: Album) {
    await openAlbumById(album.id, album.name);
  }

  async function openArtistById(artistId: string, label = "artist") {
    if (!config) return;
    const origin = { activeView, detailSelection };

    setDetailStatus("loading");
    setDetailMessage(`Loading ${label}...`);
    setActiveView("artists");

    try {
      const artistDetail = await fetchArtistDetail(config, artistId);
      setBackStack((currentStack) => [...currentStack, origin].slice(-40));
      setForwardStack([]);
      setDetailSelection({ type: "artist", data: artistDetail });
      setDetailStatus("idle");
      setDetailMessage("");
    } catch (error) {
      setDetailStatus("error");
      setDetailMessage(getErrorMessage(error));
    }
  }

  async function openArtist(artist: Artist) {
    await openArtistById(artist.id, artist.name);
  }

  async function openPlaylistById(playlistId: string, label = "playlist", editAfterOpen = false) {
    if (!config) return;
    const origin = { activeView, detailSelection };

    setDetailStatus("loading");
    setDetailMessage(`Loading ${label}...`);
    setActiveView("playlists");

    try {
      const playlistDetail = await fetchPlaylistDetail(config, playlistId);
      setBackStack((currentStack) => [...currentStack, origin].slice(-40));
      setForwardStack([]);
      setDetailSelection({ type: "playlist", data: playlistDetail });
      if (editAfterOpen) {
        setPlaylistEditRequestKey((key) => key + 1);
      }
      setDetailStatus("idle");
      setDetailMessage("");
    } catch (error) {
      setDetailStatus("error");
      setDetailMessage(getErrorMessage(error));
    }
  }

  async function openPlaylist(playlist: Playlist) {
    await openPlaylistById(playlist.id, playlist.name);
  }

  async function openPlaylistForEdit(playlist: Playlist) {
    await openPlaylistById(playlist.id, playlist.name, true);
  }

  async function playAlbum(album: Album) {
    if (!config) return;

    try {
      const albumDetail = await fetchAlbumDetail(config, album.id);
      replaceQueue(sortAlbumSongs(albumDetail.song ?? []));
    } catch (error) {
      setDetailStatus("error");
      setDetailMessage(getErrorMessage(error));
    }
  }

  async function playArtist(artist: Artist | ArtistDetail) {
    if (!config) return;

    try {
      const artistDetail = "album" in artist ? artist : await fetchArtistDetail(config, artist.id);
      const albums = artistDetail.album ?? [];
      const albumDetails = await Promise.all(albums.slice(0, 50).map((album) => fetchAlbumDetail(config, album.id)));
      replaceQueue(albumDetails.flatMap((album) => album.song ?? []));
    } catch (error) {
      setDetailStatus("error");
      setDetailMessage(getErrorMessage(error));
    }
  }

  async function playPlaylist(playlist: Playlist) {
    if (!config) return;

    try {
      const playlistDetail = await fetchPlaylistDetail(config, playlist.id);
      replaceQueue(playlistDetail.entry ?? []);
    } catch (error) {
      setDetailStatus("error");
      setDetailMessage(getErrorMessage(error));
    }
  }

  async function savePlaylist(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!config || playlistCreateStatus === "saving") return;

    const trimmedName = playlistName.trim();
    if (!trimmedName) {
      setPlaylistCreateStatus("error");
      setPlaylistCreateMessage("Playlist name is required.");
      return;
    }

    const seedSongs = playlistFromQueue ? queue : [];
    const trimmedDescription = playlistDescription.trim();
    setPlaylistCreateStatus("saving");
    setPlaylistCreateMessage("Creating playlist...");

    try {
      await createPlaylist(config, trimmedName, seedSongs);
      let nextLibrary = await fetchLibrary(config);

      let createdPlaylist = [...nextLibrary.playlists]
        .filter((playlist) => playlist.name === trimmedName)
        .sort((a, b) => (b.changed ?? b.created ?? "").localeCompare(a.changed ?? a.created ?? ""))[0];

      if (createdPlaylist && (trimmedDescription || playlistPublic)) {
        await updatePlaylistDetails(config, createdPlaylist.id, {
          name: trimmedName,
          comment: trimmedDescription,
          public: playlistPublic,
        });
        nextLibrary = await fetchLibrary(config);
        createdPlaylist =
          nextLibrary.playlists.find((playlist) => playlist.id === createdPlaylist?.id) ??
          [...nextLibrary.playlists]
            .filter((playlist) => playlist.name === trimmedName)
            .sort((a, b) => (b.changed ?? b.created ?? "").localeCompare(a.changed ?? a.created ?? ""))[0];
      }

      setLibraryData(nextLibrary);
      setPlaylistName("");
      setPlaylistDescription("");
      setPlaylistPublic(false);
      setPlaylistCreatorOpen(false);
      setPlaylistCreateStatus("idle");
      setPlaylistCreateMessage("");

      if (createdPlaylist) {
        await openPlaylist(createdPlaylist);
      } else {
        selectView("playlists");
      }
    } catch (error) {
      setPlaylistCreateStatus("error");
      setPlaylistCreateMessage(getErrorMessage(error));
    }
  }

  async function savePlaylistDetails(playlist: Playlist, details: PlaylistDetailsUpdate) {
    if (!config) return;

    await updatePlaylistDetails(config, playlist.id, details);
    const [nextLibrary, updatedPlaylist] = await Promise.all([
      fetchLibrary(config),
      fetchPlaylistDetail(config, playlist.id),
    ]);

    setLibraryData(nextLibrary);
    setDetailSelection({ type: "playlist", data: updatedPlaylist });
  }

  async function deletePlaylistAndReturn(playlist: Playlist) {
    if (!config) return;

    await deletePlaylist(config, playlist.id);
    const nextLibrary = await fetchLibrary(config);
    setLibraryData(nextLibrary);
    setDetailSelection(null);
    selectView("playlists");
  }

  async function confirmContextPlaylistDelete() {
    if (!playlistDeleteTarget) return;

    setPlaylistDeleteStatus("saving");
    setPlaylistDeleteMessage("Deleting playlist...");

    try {
      await deletePlaylistAndReturn(playlistDeleteTarget);
      setPlaylistDeleteTarget(null);
      setPlaylistDeleteStatus("idle");
      setPlaylistDeleteMessage("");
    } catch (error) {
      setPlaylistDeleteStatus("error");
      setPlaylistDeleteMessage(getErrorMessage(error));
    }
  }

  async function removeSongFromPlaylistAndRefresh(playlist: PlaylistDetail, index: number) {
    if (!config) return;

    await removePlaylistSong(config, playlist.id, index);
    const [nextLibrary, updatedPlaylist] = await Promise.all([
      fetchLibrary(config),
      fetchPlaylistDetail(config, playlist.id),
    ]);
    setLibraryData(nextLibrary);
    setDetailSelection({ type: "playlist", data: updatedPlaylist });
  }

  async function reorderPlaylistAndRefresh(playlist: PlaylistDetail, songs: Song[]) {
    if (!config) return;

    await replacePlaylistSongs(config, playlist, songs);
    const [nextLibrary, updatedPlaylist] = await Promise.all([
      fetchLibrary(config),
      fetchPlaylistDetail(config, playlist.id),
    ]);
    setLibraryData(nextLibrary);
    setDetailSelection({ type: "playlist", data: updatedPlaylist });
  }

  async function addSongToPlaylist(playlist: Playlist, song: Song) {
    if (!config || playlistAddStatus === "saving") return;

    setPlaylistAddStatus("saving");
    setPlaylistAddMessage(`Adding to ${playlist.name}...`);

    try {
      await addSongsToPlaylist(config, playlist.id, [song]);
      const [nextLibrary, updatedPlaylist] = await Promise.all([
        fetchLibrary(config),
        detailSelection?.type === "playlist" && detailSelection.data.id === playlist.id
          ? fetchPlaylistDetail(config, playlist.id).catch(() => null)
          : Promise.resolve(null),
      ]);

      setLibraryData(nextLibrary);
      if (updatedPlaylist) {
        setDetailSelection({ type: "playlist", data: updatedPlaylist });
      }
      setPlaylistAddStatus("idle");
      setPlaylistAddMessage("");
      setSongContextMenu(null);
    } catch (error) {
      setPlaylistAddStatus("error");
      setPlaylistAddMessage(getErrorMessage(error));
    }
  }

  async function toggleFavorite(kind: FavoriteKind, id: string, favorite: boolean) {
    if (!config) return;

    const busyKey = `${kind}:${id}`;
    setFavoriteBusyKey(busyKey);

    try {
      await setNavidromeFavorite(config, kind, id, favorite);
      const nextLibrary = await fetchLibrary(config);
      setLibraryData(nextLibrary);
      setSongContextMenu(null);
    } catch (error) {
      setPlaylistAddStatus("error");
      setPlaylistAddMessage(getErrorMessage(error));
    } finally {
      setFavoriteBusyKey("");
    }
  }

  function openSongContextMenu(event: MouseEvent<HTMLElement>, song: Song) {
    event.preventDefault();
    setLibraryContextMenu(null);
    setPlaylistAddStatus("idle");
    setPlaylistAddMessage("");
    setSongContextMenu({ song, x: event.clientX, y: event.clientY });
  }

  function openLibraryContextMenu(event: MouseEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const element = target?.closest<HTMLElement>("[data-context-kind][data-context-id]");
    if (!element || target?.closest(".search-song-row, .track-row, .song-context-menu, .library-context-menu")) return;

    const id = element.dataset.contextId;
    const type = element.dataset.contextKind;
    if (!id || !type) return;

    if (type === "album") {
      const item = albumLookup.get(id);
      if (!item) return;
      event.preventDefault();
      setSongContextMenu(null);
      setLibraryContextMenu({ type, item, x: event.clientX, y: event.clientY });
      return;
    }

    if (type === "artist") {
      const item = artistLookup.get(id);
      if (!item) return;
      event.preventDefault();
      setSongContextMenu(null);
      setLibraryContextMenu({ type, item, x: event.clientX, y: event.clientY });
      return;
    }

    if (type === "playlist") {
      const item = playlistLookup.get(id);
      if (!item) return;
      event.preventDefault();
      setSongContextMenu(null);
      setLibraryContextMenu({ type, item, x: event.clientX, y: event.clientY });
    }
  }

  function clearDetail() {
    setDetailSelection(null);
    setDetailStatus("idle");
    setDetailMessage("");
  }

  function selectView(view: View) {
    if (
      view === "overview" ||
      view === "albums" ||
      view === "artists" ||
      view === "playlists" ||
      view === "recentlyAdded" ||
      view === "recentlyPlayed" ||
      view === "favorites" ||
      view === "search"
    ) {
      clearDetail();
      setBackStack([]);
      setForwardStack([]);
    }

    setActiveView(view);
  }

  function openSettings(tab: SettingsTab = "connection") {
    setSettingsTab(tab);
    setActiveView("settings");
  }

  function openSearchView() {
    clearDetail();
    setBackStack([]);
    setForwardStack([]);
    setActiveView("search");
    setSearchFocused(false);
  }

  function currentSnapshot(): BrowserSnapshot {
    return { activeView, detailSelection };
  }

  function applySnapshot(snapshot: BrowserSnapshot) {
    setActiveView(snapshot.activeView);
    setDetailSelection(snapshot.detailSelection);
    setDetailStatus("idle");
    setDetailMessage("");
  }

  function navigateBack() {
    const previous = backStack[backStack.length - 1];
    if (!previous) return;

    setBackStack(backStack.slice(0, -1));
    setForwardStack([currentSnapshot(), ...forwardStack].slice(0, 40));
    applySnapshot(previous);
  }

  function navigateForward() {
    const next = forwardStack[0];
    if (!next) return;

    setForwardStack(forwardStack.slice(1));
    setBackStack([...backStack, currentSnapshot()].slice(-40));
    applySnapshot(next);
  }

  function resetPlaybackPosition() {
    pendingResumePositionRef.current = 0;
    setPosition(0);
  }

  function replaceQueue(songs: Song[], startIndex = 0) {
    if (!songs.length) return;
    tuneOutRadio();
    setSuppressLocalFooter(false);
    scrobbledPlayRef.current = "";
    setQueue(songs);
    setCurrentIndex(Math.min(Math.max(startIndex, 0), songs.length - 1));
    resetPlaybackPosition();
    setPlayerError("");
    setIsPlaying(true);
  }

  function appendToQueue(song: Song) {
    setQueue((currentQueue) => [...currentQueue, song]);
  }

  function insertNextInQueue(song: Song) {
    setQueue((currentQueue) => {
      if (!currentQueue.length) return [song];
      const nextQueue = [...currentQueue];
      nextQueue.splice(currentIndex + 1, 0, song);
      return nextQueue;
    });
  }

  function playSong(song: Song) {
    const existingIndex = queue.findIndex((queuedSong) => queuedSong.id === song.id);
    tuneOutRadio();
    setSuppressLocalFooter(false);

    if (existingIndex >= 0) {
      scrobbledPlayRef.current = "";
      setCurrentIndex(existingIndex);
      resetPlaybackPosition();
      setPlayerError("");
      setIsPlaying(true);
      return;
    }

    scrobbledPlayRef.current = "";
    setQueue((currentQueue) => [...currentQueue, song]);
    setCurrentIndex(queue.length);
    resetPlaybackPosition();
    setPlayerError("");
    setIsPlaying(true);
  }

  function getRandomQueueIndex() {
    if (queue.length <= 1) return currentIndex;

    const availableIndexes = queue.map((_, index) => index).filter((index) => index !== currentIndex);
    return availableIndexes[Math.floor(Math.random() * availableIndexes.length)] ?? currentIndex;
  }

  async function continueAutoplay(seedTrack: Song) {
    if (!config || autoplayLoadingRef.current) return false;

    autoplayLoadingRef.current = true;

    try {
      const autoplaySongs = await fetchAutoplaySongs(config, seedTrack);
      const queuedIds = new Set(queue.map((song) => song.id));
      const nextSongs = autoplaySongs.filter((song) => !queuedIds.has(song.id));

      if (!nextSongs.length) return false;

      tuneOutRadio();
      setSuppressLocalFooter(false);
      audioRef.current?.pause();
      scrobbledPlayRef.current = "";
      resetPlaybackPosition();
      setQueue((currentQueue) => [...currentQueue, ...nextSongs]);
      setCurrentIndex(queue.length);
      setPlayerError("");
      setIsPlaying(true);
      return true;
    } catch {
      return false;
    } finally {
      autoplayLoadingRef.current = false;
    }
  }

  function playNext(fromTrackEnd = false) {
    if (!queue.length) return;

    if (fromTrackEnd && repeatMode === "one") {
      scrobbledPlayRef.current = "";
      seekTo(0);
      pendingResumePositionRef.current = 0;
      setIsPlaying(true);
      void audioRef.current?.play().catch(() => {
        setPlayerError("Playback was blocked by the browser.");
      });
      return;
    }

    if (shuffleEnabled && queue.length > 1) {
      audioRef.current?.pause();
      scrobbledPlayRef.current = "";
      setCurrentIndex(getRandomQueueIndex());
      resetPlaybackPosition();
      setPlayerError("");
      setIsPlaying(true);
      return;
    }

    if (currentIndex >= queue.length - 1) {
      if (repeatMode === "all") {
        audioRef.current?.pause();
        if (queue.length > 1) {
          scrobbledPlayRef.current = "";
          setCurrentIndex(0);
        } else {
          scrobbledPlayRef.current = "";
          seekTo(0);
          void audioRef.current?.play().catch(() => {
            setPlayerError("Playback was blocked by the browser.");
          });
        }
        resetPlaybackPosition();
        setPlayerError("");
        setIsPlaying(true);
        return;
      }

      if (config && currentTrack) {
        void continueAutoplay(currentTrack).then((continued) => {
          if (!continued) {
            setIsPlaying(false);
            seekTo(0);
          }
        });
        return;
      }

      setIsPlaying(false);
      seekTo(0);
      return;
    }

    audioRef.current?.pause();
    scrobbledPlayRef.current = "";
    setCurrentIndex((index) => Math.min(index + 1, queue.length - 1));
    resetPlaybackPosition();
    setPlayerError("");
    setIsPlaying(true);
  }

  function playPrevious() {
    if (!queue.length) return;
    audioRef.current?.pause();
    scrobbledPlayRef.current = "";
    setCurrentIndex((index) => Math.max(index - 1, 0));
    resetPlaybackPosition();
    setPlayerError("");
    setIsPlaying(true);
  }

  function seekTo(nextPosition: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextPosition)) return;
    audio.currentTime = nextPosition;
    setPosition(nextPosition);
  }

  function handleLoadedMetadata(duration: number) {
    setPlayerDuration(duration || currentTrack?.duration || 0);

    const audio = audioRef.current;
    const resumePosition = pendingResumePositionRef.current;
    pendingResumePositionRef.current = 0;

    if (!audio || !currentTrack || resumePosition <= 0) return;

    const safeDuration = duration || currentTrack.duration || 0;
    const safePosition = safeDuration > 0 ? Math.min(resumePosition, Math.max(safeDuration - 2, 0)) : resumePosition;

    if (safePosition <= 0) return;
    audio.currentTime = safePosition;
    setPosition(safePosition);
  }

  function persistPlaybackSnapshot(positionOverride = position) {
    if (!queue.length) {
      localStorage.removeItem(PLAYBACK_STATE_KEY);
      return;
    }

    const safeIndex = Math.min(Math.max(currentIndex, 0), queue.length - 1);
    const safePosition = clampNumber(positionOverride, 0, 24 * 60 * 60);
    localStorage.setItem(
      PLAYBACK_STATE_KEY,
      JSON.stringify({
        queue,
        currentIndex: safeIndex,
        position: safePosition,
      }),
    );
  }

  function selectQueueTrack(index: number) {
    tuneOutRadio();
    setSuppressLocalFooter(false);
    audioRef.current?.pause();
    scrobbledPlayRef.current = "";
    setCurrentIndex(index);
    resetPlaybackPosition();
    setPlayerError("");
    setIsPlaying(true);
  }

  function cycleRepeatMode() {
    setRepeatMode((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off"));
  }

  function reorderQueueItem(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || !queue[fromIndex] || !queue[toIndex]) return;

    setQueue((currentQueue) => {
      const nextQueue = [...currentQueue];
      const [movedSong] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, movedSong);
      return nextQueue;
    });

    if (currentIndex === fromIndex) {
      setCurrentIndex(toIndex);
    } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
      setCurrentIndex((index) => index - 1);
    } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
      setCurrentIndex((index) => index + 1);
    }
  }

  function dropQueueItem(toIndex: number) {
    if (draggedQueueIndex == null) return;
    reorderQueueItem(draggedQueueIndex, toIndex);
    setDraggedQueueIndex(null);
    setDragOverQueueIndex(null);
  }

  function removeQueueItem(index: number) {
    if (!queue[index]) return;

    const removingCurrentTrack = index === currentIndex;
    setQueue((currentQueue) => currentQueue.filter((_, queueIndex) => queueIndex !== index));

    if (queue.length <= 1) {
      audioRef.current?.pause();
      setCurrentIndex(0);
      resetPlaybackPosition();
      setIsPlaying(false);
      return;
    }

    if (index < currentIndex) {
      setCurrentIndex((current) => Math.max(0, current - 1));
    } else if (removingCurrentTrack) {
      audioRef.current?.pause();
      scrobbledPlayRef.current = "";
      setCurrentIndex(Math.min(currentIndex, queue.length - 2));
      resetPlaybackPosition();
      setPlayerError("");
      setIsPlaying(true);
    }
  }

  function clearQueue() {
    audioRef.current?.pause();
    setQueue([]);
    setCurrentIndex(0);
    resetPlaybackPosition();
    setPlayerDuration(0);
    setPlayerError("");
    setIsPlaying(false);
  }

  function closePlaylistCreator() {
    setPlaylistCreatorOpen(false);
    setPlaylistName("");
    setPlaylistDescription("");
    setPlaylistPublic(false);
  }

  function togglePlayback() {
    if (!queue.length) return;
    const audio = audioRef.current;

    if (isPlaying) {
      audio?.pause();
      setIsPlaying(false);
      return;
    }

    tuneOutRadio();
    setSuppressLocalFooter(false);
    if (audio && currentStreamUrl) {
      void audio.play().catch(() => {
        setPlayerError("Playback was blocked by the browser.");
      });
    }

    setIsPlaying(true);
  }

  function setPlayerVolume(nextVolume: number) {
    const clampedVolume = Math.min(1, Math.max(0, nextVolume));
    const audio = audioRef.current;
    if (audio) audio.volume = clampedVolume;
    setVolume(clampedVolume);
    updateAppSettings({ ...appSettings, lastVolume: clampedVolume });
  }

  function resetConnection() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_PLAYED_TRACK_KEY);
    localStorage.removeItem(PLAYBACK_STATE_KEY);
    setConfig(null);
    setForm(emptyConfig);
    setLibraryData(emptyLibraryData);
    setDetailSelection(null);
    setBackStack([]);
    setForwardStack([]);
    setSearchQuery("");
    setSearchResults(emptySearchResults);
    setSearchStatus("idle");
    setQueue([]);
    setLastPlayedTrack(null);
    setCurrentIndex(0);
    setIsPlaying(false);
    setStatus("idle");
    setLibraryStatus("idle");
    setStatusMessage("Add a Navidrome server to start syncing.");
    setSetupOpen(true);
    setActiveView("settings");
  }

  useEffect(() => {
    if (config) {
      void refreshLibrary(config);
    }
  }, []);

  useEffect(() => {
    if (!appSettings.analyticsEnabled) return;

    const lastPing = localStorage.getItem(ANALYTICS_LAST_PING_KEY);
    const lastPingTime = lastPing ? new Date(lastPing).getTime() : 0;
    const shouldPing = !lastPingTime || Date.now() - lastPingTime > 12 * 60 * 60 * 1000;

    if (!shouldPing) return;

    void sendAnalyticsPing()
      .then(() => localStorage.setItem(ANALYTICS_LAST_PING_KEY, new Date().toISOString()))
      .catch(() => undefined);
  }, [appSettings.analyticsEnabled]);

  useEffect(() => {
    if (!rightPanelOpen || rightPanelTab !== "lyrics") return;
    const isRadioLyricsSession = radioStatus === "playing" || radioStatus === "checking";

    if (isRadioLyricsSession || !isPlaying) {
      setLyricsStatus("idle");
      setLyricsLines([]);
      setLyricsMessage(isRadioLyricsSession ? "No lyrics available for radio yet." : "No active playback.");
      return;
    }

    if (!config || !currentTrack) {
      setLyricsStatus("idle");
      setLyricsLines([]);
      setLyricsMessage(currentTrack ? "Connect to Navidrome to load lyrics." : "Play a track to load lyrics.");
      return;
    }

    let cancelled = false;
    setLyricsStatus("loading");
    setLyricsLines([]);
    setLyricsMessage("");

    void fetchLyrics(config, currentTrack)
      .then((lines) => {
        if (cancelled) return;
        setLyricsLines(lines);
        setLyricsStatus(lines.length ? "ready" : "empty");
        setLyricsMessage(lines.length ? "" : "No lyrics found for this track.");
      })
      .catch(() => {
        if (cancelled) return;
        setLyricsLines([]);
        setLyricsStatus("error");
        setLyricsMessage("Lyrics are unavailable for this track.");
      });

    return () => {
      cancelled = true;
    };
  }, [config, currentTrack, isPlaying, radioStatus, rightPanelOpen, rightPanelTab]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    setRadioStationInput(appSettings.radioStationUrl);
  }, [appSettings.radioStationUrl]);

  useEffect(() => {
    setRadioVolume(appSettings.lastVolume);
    if (radioAudioRef.current) radioAudioRef.current.volume = appSettings.lastVolume;
  }, [appSettings.lastVolume]);

  useEffect(() => {
    if (!radioStationUrl) return;
    void refreshRadio(radioStationUrl);
    void fetchRadioSchedule(radioStationUrl)
      .then(setRadioSchedule)
      .catch(() => setRadioSchedule(null));
    void fetchRadioSession(radioStationUrl)
      .then(setRadioSession)
      .catch(() => setRadioSession(null));
    const interval = window.setInterval(() => {
      void fetchRadioState(radioStationUrl)
        .then(applyRadioStationState)
        .catch(() => undefined);
      void fetchRadioSchedule(radioStationUrl)
        .then(setRadioSchedule)
        .catch(() => undefined);
      void fetchRadioSession(radioStationUrl)
        .then(setRadioSession)
        .catch(() => undefined);
    }, 12000);

    return () => {
      window.clearInterval(interval);
      if (radioPromoteTimerRef.current != null) {
        window.clearTimeout(radioPromoteTimerRef.current);
        radioPromoteTimerRef.current = null;
      }
    };
  }, [radioStationUrl]);

  useEffect(() => {
    if (!isRadioPlaying) return;
    setRadioClockNow(Date.now());
    const interval = window.setInterval(() => setRadioClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isRadioPlaying]);

  useEffect(() => {
    if (!currentTrack) return;
    setLastPlayedTrack(currentTrack);
    localStorage.setItem(LAST_PLAYED_TRACK_KEY, JSON.stringify(currentTrack));
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentStreamUrl) {
      audio.removeAttribute("src");
      resetPlaybackPosition();
      setPlayerDuration(0);
      return;
    }

    audio.src = currentStreamUrl;
    audio.load();
    setPosition(pendingResumePositionRef.current || 0);
    setPlayerDuration(currentTrack?.duration ?? 0);
    setPlayerError("");

    if (isPlaying) {
      void audio.play().catch(() => {
        setIsPlaying(false);
        setPlayerError("Playback was blocked by the browser.");
      });
    }
  }, [currentStreamUrl]);

  useEffect(() => {
    if (!queue.length) {
      localStorage.removeItem(PLAYBACK_STATE_KEY);
      return;
    }

    const now = Date.now();
    const trackKey = queue[currentIndex]?.id ?? "";
    const trackChanged = trackKey !== lastPlaybackPersistTrackRef.current;

    if (!trackChanged && now - lastPlaybackPersistRef.current < 2000) return;

    lastPlaybackPersistRef.current = now;
    lastPlaybackPersistTrackRef.current = trackKey;
    persistPlaybackSnapshot(position);
  }, [currentIndex, position, queue]);

  useEffect(() => {
    function persistBeforeUnload() {
      persistPlaybackSnapshot(audioRef.current?.currentTime ?? position);
    }

    window.addEventListener("beforeunload", persistBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", persistBeforeUnload);
    };
  }, [currentIndex, position, queue]);

  useEffect(() => {
    if (!config || !currentTrack || !isPlaying) return;

    const duration = playerDuration || currentTrack.duration || 0;
    const listenThreshold = duration > 0 ? Math.min(240, Math.max(5, duration * 0.5)) : 30;
    const playKey = `${currentTrack.id}:${currentStreamUrl ?? ""}`;

    if (position < listenThreshold || scrobbledPlayRef.current === playKey) return;

    scrobbledPlayRef.current = playKey;
    void scrobbleSong(config, currentTrack)
      .then(() => fetchLibrary(config))
      .then((nextLibrary) => setLibraryData(nextLibrary))
      .catch(() => {
        scrobbledPlayRef.current = "";
      });
  }, [config, currentStreamUrl, currentTrack, isPlaying, playerDuration, position]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentStreamUrl) return;

    if (isPlaying) {
      void audio.play().catch(() => {
        setIsPlaying(false);
        setPlayerError("Playback was blocked by the browser.");
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, currentStreamUrl]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchFocused(true);
        document.querySelector<HTMLInputElement>(".global-search input")?.focus();
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        seekTo(Math.min((playerDuration || currentTrack?.duration || 0), position + 10));
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekTo(Math.max(0, position - 10));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTrack?.duration, playerDuration, position, queue.length, isPlaying, currentStreamUrl]);

  useEffect(() => {
    function closeContextMenus(event: PointerEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest(".song-context-menu, .library-context-menu")) return;
      setSongContextMenu(null);
      setLibraryContextMenu(null);
      setPlaylistAddStatus("idle");
      setPlaylistAddMessage("");
    }

    function closeContextMenusWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSongContextMenu(null);
      setLibraryContextMenu(null);
      setPlaylistAddStatus("idle");
      setPlaylistAddMessage("");
    }

    window.addEventListener("pointerdown", closeContextMenus);
    window.addEventListener("keydown", closeContextMenusWithEscape);

    return () => {
      window.removeEventListener("pointerdown", closeContextMenus);
      window.removeEventListener("keydown", closeContextMenusWithEscape);
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist ?? "Unknown artist",
        album: currentTrack.album ?? "",
        artwork: currentTrackCoverUrl ? [{ src: currentTrackCoverUrl, sizes: "160x160", type: "image/jpeg" }] : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
      setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler("previoustrack", playPrevious);
    navigator.mediaSession.setActionHandler("nexttrack", () => playNext(false));
    navigator.mediaSession.setActionHandler("seekbackward", () => seekTo(Math.max(0, position - 10)));
    navigator.mediaSession.setActionHandler("seekforward", () => seekTo(Math.min((playerDuration || currentTrack?.duration || 0), position + 10)));

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    };
  }, [currentTrack, currentTrackCoverUrl, isPlaying, playerDuration, position]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (!config || trimmedQuery.length < 2) {
      setSearchResults(emptySearchResults);
      setSearchStatus("idle");
      return;
    }

    setSearchStatus("searching");

    const timeout = window.setTimeout(() => {
      void fetchSearchResults(config, trimmedQuery)
        .then((results) => {
          setSearchResults(results);
          setSearchStatus("idle");
        })
        .catch(() => {
          setSearchResults(emptySearchResults);
          setSearchStatus("error");
        });
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [config, searchQuery]);

  const radioDuration = radioNowPlaying?.duration ?? 0;
  const radioHasTimedTrack = Boolean(isRadioPlaying && radioNowPlaying && radioDuration > 0);
  const footerRadioTitle = radioNowPlaying?.title ?? radioStationName(radioStationState, radioStationUrl);
  const footerRadioMeta = radioNowPlaying
    ? radioNowPlaying.artist || radioStationName(radioStationState, radioStationUrl)
    : "Live broadcast";
  const seekDuration = isRadioPlaying ? (radioHasTimedTrack ? radioDuration : Math.max(radioElapsed, 1)) : playerDuration || currentTrack?.duration || 0;
  const seekPosition = isRadioPlaying ? (radioHasTimedTrack ? Math.min(radioElapsed, radioDuration) : 0) : position;

  return (
    <main
      className={`app-shell ${rightPanelOpen ? "with-right-panel" : "right-panel-collapsed"} ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      } ${coverWashUrl ? "with-cover-wash" : ""}`}
      onContextMenu={openLibraryContextMenu}
    >
      {coverWashUrl ? <div className="cover-wash-backdrop" style={{ backgroundImage: `url(${coverWashUrl})` }} aria-hidden="true" /> : null}

      {sidebarCollapsed ? (
        <div className="sidebar-rail sidebar-rail-left" aria-label="Collapsed sidebar">
          <button
            className="sidebar-edge-button sidebar-edge-button-left"
            type="button"
            aria-label="Show sidebar"
            title="Show sidebar"
            onClick={() => setSidebarCollapsedState(false)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      ) : null}

      {!sidebarCollapsed ? <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <p className="eyebrow">Prism</p>
            <h1>Player</h1>
          </div>
        </div>
        <button
          className="sidebar-edge-button sidebar-edge-button-left"
          type="button"
          aria-label="Hide sidebar"
          title="Hide sidebar"
          onClick={() => setSidebarCollapsedState(true)}
        >
          <ChevronLeft size={16} />
        </button>

        <nav className="nav-list">
          <button
            className={`nav-item nav-home ${activeView === "overview" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("overview")}
          >
            <Home size={18} />
            Home
          </button>
          <button
            className={`nav-item nav-home ${activeView === "radio" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("radio")}
          >
            <RadioTower size={18} />
            Radio
          </button>
          <div className="nav-section-label">
            <Library size={16} />
            Your Library
          </div>
          <button
            className={`nav-item nav-child ${activeView === "artists" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("artists")}
          >
            <UserRound size={18} />
            Artists
          </button>
          <button
            className={`nav-item nav-child ${activeView === "albums" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("albums")}
          >
            <Disc3 size={18} />
            Albums
          </button>
          <div className="nav-parent-row">
            <button
              className={`nav-item nav-child nav-parent ${activeView === "playlists" ? "active" : ""}`}
              type="button"
              onClick={() => selectView("playlists")}
            >
              <ListMusic size={18} />
              <span>Playlists</span>
            </button>
            <button
              className={`nav-toggle ${sidebarPlaylistsOpen ? "open" : ""}`}
              type="button"
              onClick={() => setSidebarPlaylistsOpen((value) => !value)}
              aria-label={`${sidebarPlaylistsOpen ? "Collapse" : "Expand"} playlists`}
              aria-expanded={sidebarPlaylistsOpen}
            >
              {sidebarPlaylistsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
          {appSettings.showSidebarPlaylists && sidebarPlaylistsOpen && libraryData.playlists.length ? (
            <div className="nav-playlist-list" aria-label="Playlist shortcuts">
              {libraryData.playlists.slice(0, appSettings.sidebarPlaylistLimit).map((playlist) => (
                <button
                  className={`nav-item nav-child nav-playlist ${
                    detailSelection?.type === "playlist" && detailSelection.data.id === playlist.id ? "active" : ""
                  }`}
                  type="button"
                  key={playlist.id}
                  data-context-kind="playlist"
                  data-context-id={playlist.id}
                  onClick={() => void openPlaylist(playlist)}
                >
                  <span>{playlist.name}</span>
                </button>
              ))}
            </div>
          ) : null}
          <button
            className={`nav-item nav-child ${activeView === "recentlyAdded" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("recentlyAdded")}
          >
            <Plus size={18} />
            Recently Added
          </button>
          <button
            className={`nav-item nav-child ${activeView === "recentlyPlayed" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("recentlyPlayed")}
          >
            <History size={18} />
            Recently Played
          </button>
          <button
            className={`nav-item nav-child ${activeView === "favorites" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("favorites")}
          >
            <Star size={18} />
            Favorites
          </button>
        </nav>

        <div className="sidebar-actions">
          <button
            className={`nav-item sidebar-settings ${activeView === "settings" ? "active" : ""}`}
            type="button"
            onClick={() => openSettings()}
          >
            <Settings size={18} />
            Settings
          </button>
        </div>
      </aside> : null}

      <section className="workspace" aria-label="Music workspace">
        <header className="topbar">
          <BrowserNavigation
            canNavigateBack={backStack.length > 0}
            canNavigateForward={forwardStack.length > 0}
            backTarget={backStack[backStack.length - 1] ?? null}
            forwardTarget={forwardStack[0] ?? null}
            onNavigateBack={navigateBack}
            onNavigateForward={navigateForward}
          />
          <SearchBox
            query={searchQuery}
            setQuery={setSearchQuery}
            status={searchStatus}
            results={searchResults}
            hasConfig={hasConfig}
            isFocused={searchFocused}
            setFocused={setSearchFocused}
            onSubmit={openSearchView}
            onOpenAlbum={(album) => void openAlbum(album)}
            onOpenArtist={(artist) => void openArtist(artist)}
            onOpenPlaylist={openPlaylist}
            onPlaySong={playSong}
          />
        </header>

        {!appSettings.analyticsEnabled && !appSettings.analyticsPromptDismissed ? (
          <AnalyticsBanner onEnable={() => setAnalyticsConsent(true)} onDismiss={dismissAnalyticsPrompt} />
        ) : null}

        {activeView === "settings" ? (
          <SettingsView
            form={form}
            setForm={setForm}
            status={status}
            statusMessage={statusMessage}
            appSettings={appSettings}
            activeTab={settingsTab}
            setActiveTab={setSettingsTab}
            updateAppSettings={updateAppSettings}
            onSelectRadioStation={selectRadioStation}
            onRemoveRadioStation={removeRadioStation}
            setAnalyticsConsent={setAnalyticsConsent}
            resetAppSettings={resetAppSettings}
            setAlbumViewMode={setAlbumViewMode}
            setArtistViewMode={setArtistViewMode}
            onSave={saveConnection}
            onReset={resetConnection}
          />
        ) : (
          <LibraryView
            activeView={activeView}
            config={config}
            libraryStatus={libraryStatus}
            statusMessage={statusMessage}
            appSettings={appSettings}
            onSelectRadioStation={selectRadioStation}
            onOpenRadioSettings={() => openSettings("radio")}
            radioStationState={radioStationState}
            radioSession={radioSession}
            radioSchedule={radioSchedule}
            radioStatus={radioStatus}
            radioMessage={radioMessage}
            refreshRadio={refreshRadio}
            tuneInRadio={tuneInRadio}
            tuneOutRadio={tuneOutRadio}
            libraryItems={libraryItems}
            albums={libraryData.albums}
            recentAlbums={libraryData.recentAlbums}
            recentlyPlayedAlbums={libraryData.recentlyPlayedAlbums}
            favorites={libraryData.favorites}
            playlists={libraryData.playlists}
            albumViewMode={albumViewMode}
            setAlbumViewMode={setAlbumViewMode}
            artistViewMode={artistViewMode}
            setArtistViewMode={setArtistViewMode}
            artists={libraryData.artists}
            searchQuery={searchQuery}
            searchResults={searchResults}
            searchStatus={searchStatus}
            setPlaylistCreatorOpen={setPlaylistCreatorOpen}
            onSongContextMenu={openSongContextMenu}
            onRetryLibrary={() => void refreshLibrary()}
            onSelectLibraryView={selectView}
            detailSelection={detailSelection}
            detailStatus={detailStatus}
            detailMessage={detailMessage}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            favoriteIds={favoriteIds}
            favoriteBusyKey={favoriteBusyKey}
            onToggleFavorite={toggleFavorite}
            onOpenAlbum={(album) => void openAlbum(album)}
            onOpenArtist={(artist) => void openArtist(artist)}
            onOpenPlaylist={openPlaylist}
            onPlayAlbum={(album) => void playAlbum(album)}
            onPlayArtist={(artist) => void playArtist(artist)}
            onPlayPlaylist={(playlist) => void playPlaylist(playlist)}
            onSavePlaylistDetails={savePlaylistDetails}
            onDeletePlaylist={deletePlaylistAndReturn}
            playlistEditRequestKey={playlistEditRequestKey}
            onRemovePlaylistSong={removeSongFromPlaylistAndRefresh}
            onReorderPlaylist={reorderPlaylistAndRefresh}
            onReplaceQueue={replaceQueue}
            onPlaySong={playSong}
            onQueueSong={appendToQueue}
          />
        )}
      </section>

      <footer className="player-bar" aria-label="Playback controls">
        <audio
          ref={audioRef}
          preload="auto"
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget.duration)}
          onEnded={() => playNext(true)}
          onError={() => {
            if (currentTrack) {
              setIsPlaying(false);
              setPlayerError("Track stream failed.");
            }
          }}
        />
        <audio
          ref={radioAudioRef}
          preload="none"
          onPlay={() => setRadioStatus("playing")}
          onPause={() => setRadioStatus(radioStationState ? "ready" : "idle")}
          onError={() => {
            setSuppressLocalFooter(true);
            setRadioStatus("error");
            setRadioMessage("The radio stream failed.");
          }}
        />

        <div className={`now-playing ${footerTrack || isRadioPlaying ? "" : "empty"}`}>
          {isRadioPlaying ? (
            radioCoverUrl ? (
              <CoverArt src={radioCoverUrl} label={radioNowPlaying?.title ?? "Radio"} className="player-cover" fallbackIcon={<RadioTower size={20} />} />
            ) : (
              <CoverArt src={null} label="Radio" className="player-cover" fallbackIcon={<RadioTower size={20} />} />
            )
          ) : footerTrack ? (
            <CoverArt src={footerTrackCoverUrl} label={footerTrack.title} className="player-cover" fallbackIcon={<Music2 size={20} />} />
          ) : null}
          <div className="now-playing-copy">
            {isRadioPlaying ? (
              <>
                <span className="track-title radio-footer-title">{footerRadioTitle}</span>
                <p className="track-meta">
                  <span>{footerRadioMeta}</span>
                </p>
                {radioNowPlaying?.album ? <p className="track-album">{radioNowPlaying.album}</p> : null}
              </>
            ) : footerTrack ? (
              <>
                <button
                  className="track-title track-link"
                  type="button"
                  onClick={() => footerTrack.albumId && void openAlbumById(footerTrack.albumId, footerTrack.album ?? footerTrack.title)}
                  disabled={!footerTrack.albumId}
                >
                  {footerTrack.title}
                </button>
                <p className="track-meta">
                  <button
                    className="track-link"
                    type="button"
                    onClick={() => footerTrack.artistId && void openArtistById(footerTrack.artistId, footerTrack.artist ?? "artist")}
                    disabled={!footerTrack.artistId}
                  >
                    {footerTrack.artist ?? "Unknown artist"}
                  </button>
                </p>
                {footerTrack.album ? (
                  <p className="track-album">
                    <button
                      className="track-link"
                      type="button"
                      onClick={() => footerTrack.albumId && void openAlbumById(footerTrack.albumId, footerTrack.album ?? footerTrack.title)}
                      disabled={!footerTrack.albumId}
                    >
                      {footerTrack.album}
                    </button>
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="player-center">
          <div className="transport">
            <button
              className={shuffleEnabled ? "active" : ""}
              type="button"
              aria-label={shuffleEnabled ? "Disable shuffle" : "Enable shuffle"}
              aria-pressed={shuffleEnabled}
              onClick={() => setShuffleEnabled((enabled) => !enabled)}
              disabled={isRadioPlaying || queue.length < 2}
              title="Shuffle"
            >
              <Shuffle size={15} />
            </button>
            <button type="button" aria-label="Previous" onClick={playPrevious} disabled={isRadioPlaying || !queue.length || currentIndex === 0}>
              <SkipBack size={16} />
            </button>
            <button
              className="play-button"
              type="button"
              aria-label={isRadioPlaying || isPlaying ? "Pause" : "Play"}
              onClick={isRadioPlaying ? () => tuneOutRadio() : togglePlayback}
              disabled={!isRadioPlaying && !queue.length}
            >
              {isRadioPlaying || isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => playNext(false)}
              disabled={isRadioPlaying || !queue.length || (!config && !shuffleEnabled && repeatMode !== "all" && currentIndex >= queue.length - 1)}
            >
              <SkipForward size={16} />
            </button>
            <button
              className={repeatMode !== "off" ? "active" : ""}
              type="button"
              aria-label={`Repeat ${repeatMode}`}
              aria-pressed={repeatMode !== "off"}
              onClick={cycleRepeatMode}
              disabled={isRadioPlaying || !queue.length}
              title={repeatMode === "off" ? "Repeat off" : repeatMode === "all" ? "Repeat all" : "Repeat one"}
            >
              {repeatMode === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
            </button>
          </div>
          <div className="seek-row">
            <span>{formatDuration(isRadioPlaying ? radioElapsed : position)}</span>
            <input
              className="seek-slider"
              type="range"
              min="0"
              max={Math.max(seekDuration, 1)}
              step="1"
              value={Math.min(seekPosition, Math.max(seekDuration, 1))}
              onChange={(event) => seekTo(Number(event.target.value))}
              disabled={isRadioPlaying || !currentTrack}
              aria-label="Seek"
            />
            <span>{isRadioPlaying ? (radioHasTimedTrack ? formatDuration(radioDuration) : "") : formatDuration(playerDuration || currentTrack?.duration)}</span>
          </div>
          {radioStatus === "error" ? <p className="player-error">{radioMessage}</p> : playerError ? <p className="player-error">{playerError}</p> : null}
        </div>

        <div className="player-actions">
          <div className="volume-control">
            <Volume2 size={16} />
            <input
              className="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isRadioPlaying ? radioVolume : volume}
              onChange={(event) => (isRadioPlaying ? setRadioPlaybackVolume(Number(event.target.value)) : setPlayerVolume(Number(event.target.value)))}
              aria-label="Volume"
            />
          </div>
          <button
            className={`player-panel-toggle ${rightPanelOpen ? "active" : ""}`}
            type="button"
            aria-label={rightPanelOpen ? "Hide right sidebar" : "Show right sidebar"}
            aria-pressed={rightPanelOpen}
            title={rightPanelOpen ? "Hide sidebar" : "Show sidebar"}
            onClick={() => setRightPanelState(!rightPanelOpen)}
          >
            {rightPanelOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </button>
        </div>
      </footer>

      {rightPanelOpen ? (
        <RightSidebar
          tab={rightPanelTab}
          setTab={selectRightPanelTab}
          config={config}
          queue={queue}
          displayedQueue={displayedQueue}
          currentIndex={currentIndex}
          currentTrack={currentTrack}
          radioStationState={radioStationState}
          radioNowPlaying={radioNowPlaying}
          radioUpcoming={radioUpcoming}
          radioHistory={radioHistory}
          radioCoverUrl={radioCoverUrl}
          radioStationUrl={radioStationUrl}
          radioStatus={radioStatus}
          radioElapsed={radioElapsed}
          isRadioPlaying={isRadioPlaying}
          playerDuration={playerDuration}
          position={position}
          isPlaying={isPlaying}
          lyricsStatus={lyricsStatus}
          lyricsLines={lyricsLines}
          lyricsMessage={lyricsMessage}
          favoriteIds={favoriteIds}
          favoriteBusyKey={favoriteBusyKey}
          draggedQueueIndex={draggedQueueIndex}
          dragOverQueueIndex={dragOverQueueIndex}
          setDraggedQueueIndex={setDraggedQueueIndex}
          setDragOverQueueIndex={setDragOverQueueIndex}
          onDropQueueItem={dropQueueItem}
          onSelectQueueTrack={selectQueueTrack}
          onRemoveQueueItem={removeQueueItem}
          onClearQueue={clearQueue}
          onToggleFavorite={toggleFavorite}
          onOpenAlbumById={(albumId, label) => void openAlbumById(albumId, label)}
          onOpenArtistById={(artistId, label) => void openArtistById(artistId, label)}
        />
      ) : null}

      {setupOpen ? (
        <FirstRunWizard
          form={form}
          setForm={setForm}
          status={status}
          statusMessage={statusMessage}
          onSave={saveConnection}
          onClose={() => setSetupOpen(false)}
        />
      ) : null}
      {playlistCreatorOpen ? (
        <div className="modal-backdrop">
          <section className="playlist-modal" role="dialog" aria-modal="true" aria-labelledby="playlist-create-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Playlist</p>
                <h3 id="playlist-create-title">New Playlist</h3>
              </div>
              <button className="icon-button" type="button" onClick={closePlaylistCreator} aria-label="Close new playlist">
                <X size={16} />
              </button>
            </div>
            <PlaylistCreateForm
              queueLength={queue.length}
              name={playlistName}
              setName={setPlaylistName}
              description={playlistDescription}
              setDescription={setPlaylistDescription}
              isPublic={playlistPublic}
              setIsPublic={setPlaylistPublic}
              fromQueue={playlistFromQueue}
              setFromQueue={setPlaylistFromQueue}
              status={playlistCreateStatus}
              message={playlistCreateMessage}
              onSubmit={savePlaylist}
              onCancel={closePlaylistCreator}
            />
          </section>
        </div>
      ) : null}
      {songContextMenu ? (
        <SongPlaylistMenu
          menu={songContextMenu}
          playlists={libraryData.playlists}
          status={playlistAddStatus}
          message={playlistAddMessage}
          onAdd={(playlist) => void addSongToPlaylist(playlist, songContextMenu.song)}
          onPlayNow={(song) => {
            playSong(song);
            setSongContextMenu(null);
          }}
          onPlayNext={(song) => {
            insertNextInQueue(song);
            setSongContextMenu(null);
          }}
          onQueueSong={(song) => {
            appendToQueue(song);
            setSongContextMenu(null);
          }}
          onOpenAlbum={(song) => {
            if (song.albumId) void openAlbumById(song.albumId, song.album ?? song.title);
            setSongContextMenu(null);
          }}
          onOpenArtist={(song) => {
            if (song.artistId) void openArtistById(song.artistId, song.artist ?? "artist");
            setSongContextMenu(null);
          }}
          isFavorite={favoriteIds.songs.has(songContextMenu.song.id)}
          favoriteBusy={favoriteBusyKey === `song:${songContextMenu.song.id}`}
          onToggleFavorite={(favorite) => void toggleFavorite("song", songContextMenu.song.id, favorite)}
        />
      ) : null}
      {libraryContextMenu ? (
        <LibraryContextMenu
          menu={libraryContextMenu}
          favoriteIds={favoriteIds}
          favoriteBusyKey={favoriteBusyKey}
          onOpenAlbum={(album) => {
            void openAlbum(album);
            setLibraryContextMenu(null);
          }}
          onPlayAlbum={(album) => {
            void playAlbum(album);
            setLibraryContextMenu(null);
          }}
          onOpenArtist={(artist) => {
            void openArtist(artist);
            setLibraryContextMenu(null);
          }}
          onPlayArtist={(artist) => {
            void playArtist(artist);
            setLibraryContextMenu(null);
          }}
          onOpenPlaylist={(playlist) => {
            void openPlaylist(playlist);
            setLibraryContextMenu(null);
          }}
          onPlayPlaylist={(playlist) => {
            void playPlaylist(playlist);
            setLibraryContextMenu(null);
          }}
          onEditPlaylist={(playlist) => {
            void openPlaylistForEdit(playlist);
            setLibraryContextMenu(null);
          }}
          onDeletePlaylist={(playlist) => {
            setPlaylistDeleteTarget(playlist);
            setPlaylistDeleteStatus("idle");
            setPlaylistDeleteMessage("");
            setLibraryContextMenu(null);
          }}
          onToggleFavorite={(kind, id, favorite) => {
            void toggleFavorite(kind, id, favorite);
            setLibraryContextMenu(null);
          }}
        />
      ) : null}
      {playlistDeleteTarget ? (
        <div className="modal-backdrop confirm-backdrop">
          <section className="playlist-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="context-playlist-delete-title">
            <div className="confirm-icon" aria-hidden="true">
              <Trash2 size={22} />
            </div>
            <div className="confirm-copy">
              <p className="eyebrow">Delete Playlist</p>
              <h3 id="context-playlist-delete-title">{playlistDeleteTarget.name}</h3>
              <p>This removes the playlist from Navidrome. The songs stay in your library.</p>
            </div>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={playlistDeleteStatus === "saving"}
                onClick={() => setPlaylistDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="connect-button confirm-delete-button"
                type="button"
                disabled={playlistDeleteStatus === "saving"}
                onClick={() => void confirmContextPlaylistDelete()}
              >
                {playlistDeleteStatus === "saving" ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                Delete Playlist
              </button>
            </div>
            {playlistDeleteMessage ? (
              <p className={`confirm-status ${playlistDeleteStatus === "error" ? "bad" : ""}`}>{playlistDeleteMessage}</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function RightSidebar({
  tab,
  setTab,
  config,
  queue,
  displayedQueue,
  currentIndex,
  currentTrack,
  radioStationState,
  radioNowPlaying,
  radioUpcoming,
  radioHistory,
  radioCoverUrl,
  radioStationUrl,
  radioStatus,
  radioElapsed,
  isRadioPlaying,
  playerDuration,
  position,
  isPlaying,
  lyricsStatus,
  lyricsLines,
  lyricsMessage,
  favoriteIds,
  favoriteBusyKey,
  draggedQueueIndex,
  dragOverQueueIndex,
  setDraggedQueueIndex,
  setDragOverQueueIndex,
  onDropQueueItem,
  onSelectQueueTrack,
  onRemoveQueueItem,
  onClearQueue,
  onToggleFavorite,
  onOpenAlbumById,
  onOpenArtistById,
}: {
  tab: RightPanelTab;
  setTab: (tab: RightPanelTab) => void;
  config: NavidromeConfig | null;
  queue: Song[];
  displayedQueue: Array<{ song: Song; index: number }>;
  currentIndex: number;
  currentTrack: Song | null;
  radioStationState: RadioStationState | null;
  radioNowPlaying: RadioTrack | null;
  radioUpcoming: RadioTrack[];
  radioHistory: RadioTrack[];
  radioCoverUrl: string | null;
  radioStationUrl: string;
  radioStatus: RadioStatus;
  radioElapsed: number;
  isRadioPlaying: boolean;
  playerDuration: number;
  position: number;
  isPlaying: boolean;
  lyricsStatus: LyricsStatus;
  lyricsLines: LyricLine[];
  lyricsMessage: string;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  draggedQueueIndex: number | null;
  dragOverQueueIndex: number | null;
  setDraggedQueueIndex: (index: number | null) => void;
  setDragOverQueueIndex: (index: number | null) => void;
  onDropQueueItem: (index: number) => void;
  onSelectQueueTrack: (index: number) => void;
  onRemoveQueueItem: (index: number) => void;
  onClearQueue: () => void;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenAlbumById: (albumId: string, label: string) => void;
  onOpenArtistById: (artistId: string, label: string) => void;
}) {
  const queueDuration = queue.reduce((total, song) => total + (song.duration ?? 0), 0);
  const visibleQueueDuration = displayedQueue.reduce((total, item) => total + (item.song.duration ?? 0), 0);
  const upcomingCount = Math.max(displayedQueue.length - 1, 0);
  const radioStationLabel = radioStationName(radioStationState, radioStationUrl);
  const radioDuration = radioNowPlaying?.duration ?? 0;
  const hasRadioQueuePayload = Boolean(radioHistory.length || radioNowPlaying || radioUpcoming.length);
  const isRadioSession = isRadioPlaying || radioStatus === "checking";
  const recentRadioHistory = radioHistory.slice(0, 5).reverse();
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null);
  const activeLyricIndex = useMemo(() => {
    const elapsedMs = Math.max(0, position * 1000);
    let active = -1;

    for (let index = 0; index < lyricsLines.length; index += 1) {
      const startMs = lyricsLines[index]?.startMs;
      if (startMs == null) continue;
      if (startMs > elapsedMs) break;
      active = index;
    }

    return active;
  }, [lyricsLines, position]);

  useEffect(() => {
    if (tab !== "lyrics" || activeLyricIndex < 0) return;
    activeLyricRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLyricIndex, tab]);

  const progressLabel =
    isRadioPlaying && radioNowPlaying
      ? radioDuration
        ? `${formatDuration(radioElapsed)} / ${formatDuration(radioDuration)}`
        : "Live radio"
      : currentTrack && (playerDuration || currentTrack.duration)
      ? `${formatDuration(position)} / ${formatDuration(playerDuration || currentTrack.duration)}`
      : "Nothing playing";
  const nowPlayingCoverUrl = config && currentTrack ? buildCoverArtUrl(config, currentTrack.coverArt, "720") : null;
  const headingLabel = tab === "queue" ? "Queue" : tab === "lyrics" ? "Lyrics" : "Now Playing";

  return (
    <aside className="right-sidebar" aria-label="Now playing and queue">
      <div className="right-sidebar-heading">
        <div>
          <p className="eyebrow">Player</p>
          <h3>{headingLabel}</h3>
        </div>
      </div>

      <div className="right-tabs" role="tablist" aria-label="Right panel">
        <button className={tab === "queue" ? "active" : ""} type="button" onClick={() => setTab("queue")}>
          <ListMusic size={15} />
          Queue
        </button>
        <button className={tab === "nowPlaying" ? "active" : ""} type="button" onClick={() => setTab("nowPlaying")}>
          <Music2 size={15} />
          Now Playing
        </button>
        <button className={tab === "lyrics" ? "active" : ""} type="button" onClick={() => setTab("lyrics")}>
          <Music2 size={15} />
          Lyrics
        </button>
      </div>

      {tab === "queue" ? (
        <div className="right-panel-section queue-panel-section">
          <div className="queue-heading">
            <p className="eyebrow">{isRadioSession ? "Radio Timeline" : "Now + Next"}</p>
            {!isRadioSession ? (
              <div className="queue-heading-actions">
                <span>{displayedQueue.length ? `${displayedQueue.length} tracks` : "Empty"}</span>
                <button type="button" onClick={onClearQueue} disabled={!queue.length}>
                  Clear
                </button>
              </div>
            ) : null}
          </div>
          <div className="queue-list right-queue-list">
            {isRadioSession ? (
              hasRadioQueuePayload ? (
                <>
                  {radioHistory.length ? (
                    <div className="radio-queue-section">
                      <p>Recently played</p>
                      {recentRadioHistory.map((track, index) => (
                        <RadioQueueRow track={track} tone="previous" key={`history-${track.title ?? "track"}-${track.artist ?? "artist"}-${index}`} />
                      ))}
                    </div>
                  ) : null}
                  {radioNowPlaying ? (
                    <div className="radio-queue-section">
                      <p>On air</p>
                      <RadioQueueRow track={radioNowPlaying} marker="Now" tone="current" />
                    </div>
                  ) : null}
                  {radioUpcoming.length ? (
                    <div className="radio-queue-section">
                      <p>Up next</p>
                      {radioUpcoming.slice(0, 8).map((track, index) => (
                        <RadioQueueRow track={track} marker={`${index + 1}`} key={`upcoming-${track.title ?? "track"}-${track.artist ?? "artist"}-${index}`} />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="queue-empty">No upcoming tracks in the station payload yet.</p>
              )
            ) : queue.length ? (
              displayedQueue.map(({ song, index }) => (
                <div
                  className={`queue-row ${index === currentIndex ? "active" : ""} ${index === draggedQueueIndex ? "dragging" : ""}`}
                  key={`${song.id}-${index}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverQueueIndex(index);
                  }}
                  onDrop={() => onDropQueueItem(dragOverQueueIndex ?? index)}
                >
                  <button
                    className="queue-drag-handle"
                    type="button"
                    aria-label={`Drag ${song.title} to reorder`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(index));
                      setDraggedQueueIndex(index);
                      setDragOverQueueIndex(index);
                    }}
                    onDragEnd={() => {
                      setDraggedQueueIndex(null);
                      setDragOverQueueIndex(null);
                    }}
                  >
                    <Menu size={14} />
                  </button>
                  <button className="queue-track" type="button" onClick={() => onSelectQueueTrack(index)}>
                    <strong>{song.title}</strong>
                    <small>{song.artist ?? "Unknown artist"}</small>
                  </button>
                  <small>{formatDuration(song.duration)}</small>
                  <div className="queue-row-actions">
                    <button type="button" aria-label={`Remove ${song.title}`} onClick={() => onRemoveQueueItem(index)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="queue-empty">Play an album or song to build a queue.</p>
            )}
          </div>
          {!isRadioSession && queue.length ? (
            <p className="right-panel-footnote">
              {formatDuration(visibleQueueDuration)} showing
              {displayedQueue.length < queue.length ? ` · ${formatDuration(queueDuration)} total` : ""}
              {upcomingCount ? ` · ${upcomingCount} up next` : ""}
            </p>
          ) : null}
        </div>
      ) : tab === "nowPlaying" ? (
        <div className="right-panel-section now-playing-panel">
          {isRadioPlaying ? (
            <>
              <CoverArt
                src={radioCoverUrl}
                label={radioNowPlaying?.title ?? radioStationLabel}
                className="right-now-cover"
                fallbackIcon={<RadioTower size={42} />}
              />
              <div className="right-now-copy">
                <p className="eyebrow">{radioStatus === "playing" ? "On Air" : "Radio"}</p>
                <h3>{radioNowPlaying?.title ?? "Live radio"}</h3>
                <span className="track-link">{radioNowPlaying?.artist ?? radioStationLabel}</span>
                {radioNowPlaying?.album ? <span className="track-link">{radioNowPlaying.album}</span> : null}
              </div>
              <div className="right-now-stats">
                <span>{progressLabel}</span>
                <span>{radioStationLabel}</span>
              </div>
            </>
          ) : currentTrack ? (
            <>
              <CoverArt
                src={nowPlayingCoverUrl}
                label={currentTrack.title}
                className="right-now-cover"
                fallbackIcon={<Music2 size={42} />}
              />
              <div className="right-now-copy">
                <p className="eyebrow">{isPlaying ? "Playing" : "Paused"}</p>
                <h3>{currentTrack.title}</h3>
                <button
                  className="track-link"
                  type="button"
                  onClick={() => currentTrack.artistId && onOpenArtistById(currentTrack.artistId, currentTrack.artist ?? "artist")}
                  disabled={!currentTrack.artistId}
                >
                  {currentTrack.artist ?? "Unknown artist"}
                </button>
                <button
                  className="track-link"
                  type="button"
                  onClick={() => currentTrack.albumId && onOpenAlbumById(currentTrack.albumId, currentTrack.album ?? currentTrack.title)}
                  disabled={!currentTrack.albumId}
                >
                  {currentTrack.album ?? "Unknown album"}
                </button>
              </div>
              <div className="right-now-stats">
                <span>{progressLabel}</span>
                <span>{queue.length ? `${currentIndex + 1} of ${queue.length}` : "Queue empty"}</span>
              </div>
              <div className="right-now-actions">
                <FavoriteButton
                  active={favoriteIds.songs.has(currentTrack.id)}
                  busy={favoriteBusyKey === `song:${currentTrack.id}`}
                  label={currentTrack.title}
                  onToggle={(favorite) => onToggleFavorite("song", currentTrack.id, favorite)}
                />
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={!currentTrack.albumId}
                  onClick={() => currentTrack.albumId && onOpenAlbumById(currentTrack.albumId, currentTrack.album ?? currentTrack.title)}
                >
                  <Disc3 size={15} />
                  Album
                </button>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={!currentTrack.artistId}
                  onClick={() => currentTrack.artistId && onOpenArtistById(currentTrack.artistId, currentTrack.artist ?? "artist")}
                >
                  <UserRound size={15} />
                  Artist
                </button>
              </div>
            </>
          ) : (
            <EmptyPanel icon={<Music2 size={20} />} text="Nothing playing yet." />
          )}
        </div>
      ) : (
        <div className="right-panel-section lyrics-panel">
          {isRadioSession ? (
            <EmptyPanel icon={<RadioTower size={20} />} text="No lyrics available for radio yet." />
          ) : isPlaying && currentTrack ? (
            <>
              <div className="lyrics-track">
                <p className="eyebrow">{currentTrack.artist ?? "Unknown artist"}</p>
                <h3>{currentTrack.title}</h3>
              </div>
              {lyricsStatus === "loading" ? (
                <EmptyPanel icon={<Loader2 size={20} className="spin" />} text="Loading lyrics..." />
              ) : lyricsLines.length ? (
                <div className="lyrics-lines">
                  {lyricsLines.map((line, index) => (
                    <p
                      className={line.startMs != null && index === activeLyricIndex ? "active" : line.startMs == null ? "plain" : ""}
                      key={`${line.text}-${line.startMs ?? "plain"}-${index}`}
                      ref={index === activeLyricIndex ? activeLyricRef : undefined}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              ) : (
                <EmptyPanel icon={<Music2 size={20} />} text={lyricsMessage || "No lyrics loaded yet."} />
              )}
            </>
          ) : (
            <EmptyPanel icon={<Music2 size={20} />} text="No active playback." />
          )}
        </div>
      )}
    </aside>
  );
}

function RadioQueueRow({ track, marker, tone = "next" }: { track: RadioTrack; marker?: string; tone?: "previous" | "current" | "next" }) {
  return (
    <div className={`queue-row radio-queue-row ${tone} ${marker ? "" : "no-marker"}`}>
      {marker ? <small>{marker}</small> : null}
      <div className="queue-track">
        <strong>{track.title ?? "Unknown track"}</strong>
        <small>{track.artist ?? track.album ?? "Subwave"}</small>
      </div>
      {track.duration ? <small>{formatDuration(track.duration)}</small> : null}
    </div>
  );
}

function BrowserNavigation({
  canNavigateBack,
  canNavigateForward,
  backTarget,
  forwardTarget,
  onNavigateBack,
  onNavigateForward,
}: {
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  backTarget: BrowserSnapshot | null;
  forwardTarget: BrowserSnapshot | null;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
}) {
  const backLabel = getSnapshotLabel(backTarget);
  const forwardLabel = getSnapshotLabel(forwardTarget);

  return (
    <div className="browser-nav" aria-label="Browser history">
      <button
        className="icon-button"
        type="button"
        onClick={onNavigateBack}
        disabled={!canNavigateBack}
        aria-label={canNavigateBack ? `Back to ${backLabel}` : "No back history"}
        title={canNavigateBack ? `Back to ${backLabel}` : "No back history"}
      >
        <ChevronLeft size={17} />
      </button>
      <button
        className="icon-button"
        type="button"
        onClick={onNavigateForward}
        disabled={!canNavigateForward}
        aria-label={canNavigateForward ? `Forward to ${forwardLabel}` : "No forward history"}
        title={canNavigateForward ? `Forward to ${forwardLabel}` : "No forward history"}
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

function SearchBox({
  query,
  setQuery,
  status,
  results,
  hasConfig,
  isFocused,
  setFocused,
  onSubmit,
  onOpenAlbum,
  onOpenArtist,
  onOpenPlaylist,
  onPlaySong,
}: {
  query: string;
  setQuery: (query: string) => void;
  status: "idle" | "searching" | "error";
  results: SearchResults;
  hasConfig: boolean;
  isFocused: boolean;
  setFocused: (focused: boolean) => void;
  onSubmit: () => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  onPlaySong: (song: Song) => void;
}) {
  const trimmedQuery = query.trim();
  const totalResults = results.artists.length + results.albums.length + results.songs.length + results.playlists.length;
  const showSuggestions = isFocused && trimmedQuery.length >= 2 && (status !== "idle" || totalResults > 0);

  return (
    <form
      className="global-search"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmedQuery.length >= 2) onSubmit();
      }}
    >
      <Search size={16} />
      <input
        type="search"
        value={query}
        placeholder="Search"
        disabled={!hasConfig}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
      />
      {status === "searching" ? <Loader2 size={14} className="spin search-spinner" /> : null}

      {showSuggestions ? (
        <div className="search-suggestions">
          {status === "error" ? <p className="suggestion-note">Search unavailable</p> : null}
          {status === "searching" && !totalResults ? <p className="suggestion-note">Searching</p> : null}
          {results.artists.length ? (
            <div className="suggestion-section">
              <p>Artists</p>
              {results.artists.slice(0, 2).map((artist) => (
                <button className="suggestion-row" type="button" key={`artist-${artist.id}`} onMouseDown={() => onOpenArtist(artist)}>
                  <UserRound size={15} />
                  <span>{artist.name}</span>
                  <small>{artist.albumCount ? `${artist.albumCount} albums` : "Artist"}</small>
                </button>
              ))}
            </div>
          ) : null}
          {results.albums.length ? (
            <div className="suggestion-section">
              <p>Albums</p>
              {results.albums.slice(0, 3).map((album) => (
                <button className="suggestion-row" type="button" key={`album-${album.id}`} onMouseDown={() => onOpenAlbum(album)}>
                  <Disc3 size={15} />
                  <span>{album.name}</span>
                  <small>{album.artist || "Album"}</small>
                </button>
              ))}
            </div>
          ) : null}
          {results.playlists.length ? (
            <div className="suggestion-section">
              <p>Playlists</p>
              {results.playlists.slice(0, 3).map((playlist) => (
                <button
                  className="suggestion-row"
                  type="button"
                  key={`playlist-${playlist.id}`}
                  onMouseDown={() => onOpenPlaylist(playlist)}
                >
                  <ListMusic size={15} />
                  <span>{playlist.name}</span>
                  <small>{playlist.songCount ? `${playlist.songCount} songs` : "Playlist"}</small>
                </button>
              ))}
            </div>
          ) : null}
          {results.songs.length ? (
            <div className="suggestion-section">
              <p>Songs</p>
              {results.songs.slice(0, 5).map((song) => (
                <button className="suggestion-row" type="button" key={`song-${song.id}`} onMouseDown={() => onPlaySong(song)}>
                  <Music2 size={15} />
                  <span>{song.title}</span>
                  <small>{song.artist ?? song.album ?? "Song"}</small>
                </button>
              ))}
            </div>
          ) : null}
          {totalResults > 4 ? (
            <button className="suggestion-row view-all" type="button" onMouseDown={onSubmit}>
              <Search size={15} />
              <span>View all results</span>
              <small>{totalResults}</small>
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function AnalyticsBanner({
  onEnable,
  onDismiss,
}: {
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="analytics-banner" aria-label="Anonymous analytics">
      <div className="analytics-banner-icon" aria-hidden="true">
        <CheckCircle2 size={18} />
      </div>
      <div>
        <strong>Help improve Prism</strong>
        <p>Share anonymous install analytics through Beacon. No library, account, or playback data is sent.</p>
      </div>
      <div className="analytics-banner-actions">
        <button className="secondary-button compact-button" type="button" onClick={onDismiss}>
          Not Now
        </button>
        <button className="connect-button compact-button" type="button" onClick={onEnable}>
          Enable
        </button>
      </div>
    </section>
  );
}

function SettingsView({
  form,
  setForm,
  status,
  statusMessage,
  appSettings,
  activeTab,
  setActiveTab,
  updateAppSettings,
  onSelectRadioStation,
  onRemoveRadioStation,
  setAnalyticsConsent,
  resetAppSettings,
  setAlbumViewMode,
  setArtistViewMode,
  onSave,
  onReset,
}: {
  form: NavidromeConfig;
  setForm: (config: NavidromeConfig) => void;
  status: ConnectionStatus;
  statusMessage: string;
  appSettings: AppSettings;
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
  updateAppSettings: (settings: AppSettings) => void;
  onSelectRadioStation: (stationUrl: string) => void;
  onRemoveRadioStation: (stationUrl: string) => void;
  setAnalyticsConsent: (enabled: boolean) => void;
  resetAppSettings: () => void;
  setAlbumViewMode: (mode: AlbumViewMode) => void;
  setArtistViewMode: (mode: ArtistViewMode) => void;
  onSave: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  onReset: () => void;
}) {
  const [newRadioStationUrl, setNewRadioStationUrl] = useState("");

  function setDefaultAlbumView(mode: AlbumViewMode) {
    updateAppSettings({ ...appSettings, defaultAlbumView: mode });
    setAlbumViewMode(mode);
  }

  function setDefaultArtistView(mode: ArtistViewMode) {
    updateAppSettings({ ...appSettings, defaultArtistView: mode });
    setArtistViewMode(mode);
  }

  function addRadioStation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const origin = normalizeStationUrl(newRadioStationUrl);
    if (!origin) return;

    onSelectRadioStation(origin);
    setNewRadioStationUrl("");
  }

  return (
    <section className="settings-layout">
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {[
          { id: "connection", label: "Connection", icon: <CheckCircle2 size={15} /> },
          { id: "library", label: "Library", icon: <Library size={15} /> },
          { id: "appearance", label: "Appearance", icon: <Waves size={15} /> },
          { id: "radio", label: "Radio", icon: <RadioTower size={15} /> },
          { id: "privacy", label: "Privacy", icon: <CheckCircle2 size={15} /> },
          { id: "advanced", label: "Advanced", icon: <Settings size={15} /> },
        ].map((tab) => (
          <button
            className={activeTab === tab.id ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
            key={tab.id}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "connection" ? <form className="settings-form" onSubmit={onSave}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Navidrome</p>
            <h3>Server connection</h3>
          </div>
          <ConnectionStatusBadge status={status} />
        </div>

        <div className={`connection-status-row ${status === "error" ? "bad" : ""}`}>
          <div className="status-icon" aria-hidden="true">
            {status === "connected" ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
          </div>
          <div>
            <p className="eyebrow">Connection state</p>
            <h3>{status === "connected" ? "Server verified" : "Waiting for a valid server"}</h3>
            <p>{statusMessage}</p>
          </div>
        </div>

        <label>
          Server URL
          <input
            value={form.serverUrl}
            onChange={(event) => setForm({ ...form, serverUrl: event.target.value })}
            placeholder="https://music.example.com"
            autoComplete="url"
          />
        </label>

        <label>
          Username
          <input
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            placeholder="kyle"
            autoComplete="username"
          />
        </label>

        <label>
          Password
          <input
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            type="password"
            placeholder="Navidrome password"
            autoComplete="current-password"
          />
        </label>

        <div className="form-actions">
          <button className="connect-button" type="submit" disabled={status === "checking"}>
            {status === "checking" ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
            Save and Test
          </button>
          <button className="secondary-button" type="button" onClick={onReset}>
            Reset Connection
          </button>
        </div>
      </form> : null}

      {activeTab === "library" ? <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h3>Browsing defaults</h3>
          </div>
          <Library size={18} />
        </div>
        <label>
          Albums
          <select value={appSettings.defaultAlbumView} onChange={(event) => setDefaultAlbumView(event.target.value as AlbumViewMode)}>
            <option value="art">Art</option>
            <option value="list">List</option>
          </select>
        </label>
        <label>
          Artists
          <select value={appSettings.defaultArtistView} onChange={(event) => setDefaultArtistView(event.target.value as ArtistViewMode)}>
            <option value="list">List</option>
            <option value="art">Art</option>
          </select>
        </label>
      </section> : null}

      {activeTab === "library" ? <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Sidebar</p>
            <h3>Playlist shortcuts</h3>
          </div>
          <ListMusic size={18} />
        </div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={appSettings.showSidebarPlaylists}
            onChange={(event) => updateAppSettings({ ...appSettings, showSidebarPlaylists: event.target.checked })}
          />
          <span>Show playlists</span>
        </label>
        <label>
          Playlist count
          <input
            type="number"
            min="3"
            max="20"
            value={appSettings.sidebarPlaylistLimit}
            disabled={!appSettings.showSidebarPlaylists}
            onChange={(event) => updateAppSettings({ ...appSettings, sidebarPlaylistLimit: Number(event.target.value) })}
          />
        </label>
      </section> : null}

      {activeTab === "appearance" ? <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Appearance</p>
            <h3>Album cover wash</h3>
          </div>
          <Waves size={18} />
        </div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={appSettings.coverWashEnabled}
            onChange={(event) => updateAppSettings({ ...appSettings, coverWashEnabled: event.target.checked })}
          />
          <span>Use current album art as the background wash</span>
        </label>
      </section> : null}

      {activeTab === "radio" ? <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Radio</p>
            <h3>Subwave channels</h3>
          </div>
          <RadioTower size={18} />
        </div>
        {appSettings.radioStationUrls.length ? (
          <div className="settings-station-list">
            {appSettings.radioStationUrls.map((stationUrl) => (
              <div className={`settings-station-row ${stationUrl === appSettings.radioStationUrl ? "active" : ""}`} key={stationUrl}>
                <button className="settings-station-main" type="button" onClick={() => onSelectRadioStation(stationUrl)}>
                  <RadioTower size={15} />
                  <span>{stationUrl.replace(/^https?:\/\//, "")}</span>
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove ${stationUrl}`}
                  onClick={() => onRemoveRadioStation(stationUrl)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="settings-note">No Subwave channels saved yet.</p>
        )}
        <form className="settings-station-form" onSubmit={addRadioStation}>
          <input
            value={newRadioStationUrl}
            onChange={(event) => setNewRadioStationUrl(event.target.value)}
            placeholder="https://radio.example.com"
            autoComplete="url"
            inputMode="url"
          />
          <button className="secondary-button compact-button" type="submit" disabled={!normalizeStationUrl(newRadioStationUrl)}>
            <Plus size={15} />
            Add
          </button>
        </form>
        <p className="settings-note">Prism validates this against `/api/state` and plays the station stream from `/stream.mp3`.</p>
      </section> : null}

      {activeTab === "privacy" ? <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Analytics</p>
            <h3>Anonymous install stats</h3>
          </div>
          <CheckCircle2 size={18} />
        </div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={appSettings.analyticsEnabled}
            onChange={(event) => setAnalyticsConsent(event.target.checked)}
          />
          <span>Share anonymous install analytics</span>
        </label>
        <p className="settings-note">
          Sends a periodic Beacon ping with app version, install id, platform, channel, and dev/release flag. No library, account, or playback data is sent.
        </p>
      </section> : null}

      {activeTab === "advanced" ? <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Advanced</p>
            <h3>Local preferences</h3>
          </div>
          <Settings size={18} />
        </div>
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={resetAppSettings}>
            Reset App Settings
          </button>
        </div>
      </section> : null}
    </section>
  );
}

function FirstRunWizard({
  form,
  setForm,
  status,
  statusMessage,
  onSave,
  onClose,
}: {
  form: NavidromeConfig;
  setForm: (config: NavidromeConfig) => void;
  status: ConnectionStatus;
  statusMessage: string;
  onSave: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <button className="icon-button close-button" type="button" aria-label="Close setup" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="setup-art" aria-hidden="true">
          <Music2 size={42} />
        </div>
        <p className="eyebrow">First run</p>
        <h2 id="setup-title">Connect Prism to Navidrome</h2>
        <p className="setup-copy">
          Add your server once and Prism will use it for library browsing. Playback comes after the live data spine.
        </p>

        <form className="wizard-form" onSubmit={onSave}>
          <input
            value={form.serverUrl}
            onChange={(event) => setForm({ ...form, serverUrl: event.target.value })}
            placeholder="https://music.example.com"
            autoComplete="url"
          />
          <div className="split-inputs">
            <input
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              placeholder="Username"
              autoComplete="username"
            />
            <input
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              type="password"
              placeholder="Password"
              autoComplete="current-password"
            />
          </div>
          <button className="connect-button" type="submit" disabled={status === "checking"}>
            {status === "checking" ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
            Connect Library
          </button>
        </form>

        <p className={`wizard-status ${status === "error" ? "bad" : ""}`}>{statusMessage}</p>
      </section>
    </div>
  );
}

function RadioView({
  appSettings,
  onSelectStation,
  onOpenSettings,
  stationState,
  session,
  schedule,
  status,
  message,
  refreshRadio,
  tuneIn,
  tuneOut,
}: {
  appSettings: AppSettings;
  onSelectStation: (stationUrl: string) => void;
  onOpenSettings: () => void;
  stationState: RadioStationState | null;
  session: RadioSessionPayload | null;
  schedule: RadioSchedulePayload | null;
  status: RadioStatus;
  message: string;
  refreshRadio: (nextUrl?: string) => Promise<RadioStationState | null>;
  tuneIn: () => Promise<void>;
  tuneOut: () => void;
}) {
  const stationUrl = normalizeStationUrl(appSettings.radioStationUrl);
  const savedStations = appSettings.radioStationUrls;
  const nowPlaying = firstRadioTrack(stationState);
  const listenerCount = radioListenerCount(stationState);
  const stationName = radioStationName(stationState, stationUrl);
  const showTiming = radioShowTiming(schedule, Date.now());
  const showName = stationState?.activeShow?.name ?? showTiming?.currentShow?.name;
  const personaId = showTiming?.currentShow?.personaId;
  const scheduleDjName = personaId ? schedule?.personas?.find((persona) => persona.id === personaId)?.name : null;
  const djName = stationState?.activeShow?.persona?.name ?? stationState?.dj?.name ?? scheduleDjName;
  const nextPersonaId = showTiming?.nextShow?.personaId;
  const nextDjName = nextPersonaId ? schedule?.personas?.find((persona) => persona.id === nextPersonaId)?.name : null;
  const boothLine = `${showName ?? "Autonomous"}${djName ? ` with ${djName}` : ""}`;
  const nextShowLine = showTiming?.nextShowAt
    ? `${showTiming.nextShow?.name ?? "Autonomous"}${nextDjName ? ` with ${nextDjName}` : ""}`
    : "No later show";
  const coverUrl = buildRadioCoverUrl(stationUrl, nowPlaying);
  const isPlaying = status === "playing";
  const radioTitle = nowPlaying?.title ?? "Tune into Subwave";
  const radioTitleParts = splitFeaturedTitle(radioTitle);
  const latestVoice = latestRadioVoiceLine(session, nowPlaying);
  const latestVoiceAge = latestVoice ? relativeRadioTurnTime(latestVoice) : null;

  return (
    <section className="radio-view">
      <div className="radio-hero">
        {coverUrl ? <div className="radio-cover-wash" style={{ backgroundImage: `url(${coverUrl})` }} aria-hidden="true" /> : null}
        <div className="radio-cover-card">
          {coverUrl ? (
            <img src={coverUrl} alt={`${nowPlaying?.title ?? stationName} cover`} />
          ) : (
            <div className="radio-cover-fallback">
              <RadioTower size={42} />
            </div>
          )}
        </div>

        <div className="radio-copy">
          <p className="eyebrow">{listenerCount == null ? "Radio" : `${listenerCount} listener${listenerCount === 1 ? "" : "s"}`}</p>
          <h3>
            <span>{radioTitleParts.main}</span>
            {radioTitleParts.feature ? <em>{radioTitleParts.feature}</em> : null}
          </h3>
          <p className="radio-artist">{nowPlaying?.artist ?? stationName}</p>
          {nowPlaying?.album ? <p className="radio-album">{nowPlaying.album}{nowPlaying.year ? ` / ${nowPlaying.year}` : ""}</p> : null}

          {savedStations.length > 1 ? (
            <label className="radio-channel-select">
              <span>Channel</span>
              <select value={stationUrl} onChange={(event) => onSelectStation(event.target.value)}>
                {savedStations.map((savedStationUrl) => (
                  <option value={savedStationUrl} key={savedStationUrl}>
                    {savedStationUrl.replace(/^https?:\/\//, "")}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="radio-dj-callout">
            <div>
              <span>From the Booth</span>
              {latestVoiceAge ? <small>{latestVoiceAge}</small> : null}
            </div>
            <p>{latestVoice?.text ?? "Quiet in the booth..."}</p>
          </div>

          <div className="radio-controls">
            <button className="connect-button compact-button" type="button" onClick={isPlaying ? () => tuneOut() : () => void tuneIn()}>
              {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              {isPlaying ? "Tune Out" : "Tune In"}
            </button>
            <button className="secondary-button compact-button" type="button" onClick={() => void refreshRadio()}>
              <RadioTower size={15} />
              Refresh
            </button>
            <button className="icon-button" type="button" onClick={onOpenSettings} aria-label="Radio settings" title="Radio settings">
              <Settings size={16} />
            </button>
          </div>
          {status === "error" ? <p className="radio-status bad">{message}</p> : null}
        </div>

        <div className={`radio-waveform ${isPlaying ? "playing" : ""}`} aria-hidden="true">
          {Array.from({ length: 42 }, (_, index) => (
            <span key={index} style={{ "--bar": `${24 + ((index * 19) % 62)}%`, "--delay": `${(index % 11) * -110}ms` } as CSSProperties} />
          ))}
        </div>

        <div className="radio-broadcast-details" aria-label="Station details">
          <div>
            <span>In the Booth</span>
            <strong>{boothLine}</strong>
            <small>{showTiming?.until ?? "Schedule unavailable"}</small>
          </div>
          <div>
            <span>Up Next</span>
            <strong>{nextShowLine}</strong>
            {showTiming?.nextShowAt ? <small>at {showTiming.nextShowAt}</small> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function LibraryView({
  activeView,
  config,
  libraryStatus,
  statusMessage,
  appSettings,
  onSelectRadioStation,
  onOpenRadioSettings,
  radioStationState,
  radioSession,
  radioSchedule,
  radioStatus,
  radioMessage,
  refreshRadio,
  tuneInRadio,
  tuneOutRadio,
  libraryItems,
  albums,
  recentAlbums,
  recentlyPlayedAlbums,
  favorites,
  playlists,
  albumViewMode,
  setAlbumViewMode,
  artistViewMode,
  setArtistViewMode,
  artists,
  searchQuery,
  searchResults,
  searchStatus,
  setPlaylistCreatorOpen,
  onSongContextMenu,
  onSelectLibraryView,
  detailSelection,
  detailStatus,
  detailMessage,
  currentTrack,
  isPlaying,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onOpenAlbum,
  onOpenArtist,
  onOpenPlaylist,
  onPlayAlbum,
  onPlayArtist,
  onPlayPlaylist,
  onSavePlaylistDetails,
  onDeletePlaylist,
  playlistEditRequestKey,
  onRemovePlaylistSong,
  onReorderPlaylist,
  onReplaceQueue,
  onPlaySong,
  onQueueSong,
  onRetryLibrary,
}: {
  activeView: View;
  config: NavidromeConfig | null;
  libraryStatus: LibraryStatus;
  statusMessage: string;
  appSettings: AppSettings;
  onSelectRadioStation: (stationUrl: string) => void;
  onOpenRadioSettings: () => void;
  radioStationState: RadioStationState | null;
  radioSession: RadioSessionPayload | null;
  radioSchedule: RadioSchedulePayload | null;
  radioStatus: RadioStatus;
  radioMessage: string;
  refreshRadio: (nextUrl?: string) => Promise<RadioStationState | null>;
  tuneInRadio: () => Promise<void>;
  tuneOutRadio: () => void;
  libraryItems: Array<{ label: string; value: string }>;
  albums: Album[];
  recentAlbums: Album[];
  recentlyPlayedAlbums: Album[];
  favorites: LibraryData["favorites"];
  playlists: Playlist[];
  albumViewMode: AlbumViewMode;
  setAlbumViewMode: (mode: AlbumViewMode) => void;
  artistViewMode: ArtistViewMode;
  setArtistViewMode: (mode: ArtistViewMode) => void;
  artists: Artist[];
  searchQuery: string;
  searchResults: SearchResults;
  searchStatus: "idle" | "searching" | "error";
  setPlaylistCreatorOpen: (open: boolean) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song) => void;
  onSelectLibraryView: (view: View) => void;
  detailSelection: DetailSelection;
  detailStatus: "idle" | "loading" | "error";
  detailMessage: string;
  currentTrack: Song | null;
  isPlaying: boolean;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  onPlayAlbum: (album: Album) => void;
  onPlayArtist: (artist: Artist | ArtistDetail) => void;
  onPlayPlaylist: (playlist: Playlist) => void;
  onSavePlaylistDetails: (playlist: Playlist, details: PlaylistDetailsUpdate) => Promise<void>;
  onDeletePlaylist: (playlist: Playlist) => Promise<void>;
  playlistEditRequestKey: number;
  onRemovePlaylistSong: (playlist: PlaylistDetail, index: number) => Promise<void>;
  onReorderPlaylist: (playlist: PlaylistDetail, songs: Song[]) => Promise<void>;
  onReplaceQueue: (songs: Song[], startIndex?: number) => void;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
  onRetryLibrary: () => void;
}) {
  if (activeView === "radio") {
    return (
      <RadioView
        appSettings={appSettings}
        onSelectStation={onSelectRadioStation}
        onOpenSettings={onOpenRadioSettings}
        stationState={radioStationState}
        session={radioSession}
        schedule={radioSchedule}
        status={radioStatus}
        message={radioMessage}
        refreshRadio={refreshRadio}
        tuneIn={tuneInRadio}
        tuneOut={tuneOutRadio}
      />
    );
  }

  const panelTitle = getViewLabel(activeView);
  const loadedItemCount =
    albums.length +
    recentAlbums.length +
    recentlyPlayedAlbums.length +
    artists.length +
    playlists.length +
    favorites.artists.length +
    favorites.albums.length +
    favorites.songs.length;
  const showInitialLoader = libraryStatus === "loading" && loadedItemCount === 0 && activeView !== "search";
  const showLibraryError = libraryStatus === "error" && activeView !== "search";

  return (
    <section className="browser-panel">
      {detailStatus !== "idle" || detailSelection ? (
        <DetailPanel
          config={config}
          detailSelection={detailSelection}
          detailStatus={detailStatus}
          detailMessage={detailMessage}
          currentTrack={currentTrack}
          favoriteIds={favoriteIds}
          favoriteBusyKey={favoriteBusyKey}
          onToggleFavorite={onToggleFavorite}
          albumViewMode={albumViewMode}
          setAlbumViewMode={setAlbumViewMode}
          onOpenAlbum={onOpenAlbum}
          onOpenArtist={onOpenArtist}
          onPlayAlbum={onPlayAlbum}
          onPlayArtist={onPlayArtist}
          onPlayPlaylist={onPlayPlaylist}
          onSavePlaylistDetails={onSavePlaylistDetails}
          onDeletePlaylist={onDeletePlaylist}
          playlistEditRequestKey={playlistEditRequestKey}
          onRemovePlaylistSong={onRemovePlaylistSong}
          onReorderPlaylist={onReorderPlaylist}
          onReplaceQueue={onReplaceQueue}
          onQueueSong={onQueueSong}
          onSongContextMenu={onSongContextMenu}
        />
      ) : (
        <>
          <div className="panel-heading browser-heading">
            <h3>{panelTitle}</h3>
            <div className="heading-actions">
              {activeView === "albums" ? (
                <div className="view-toggle" aria-label="Album view">
                  <button className={albumViewMode === "art" ? "active" : ""} type="button" onClick={() => setAlbumViewMode("art")}>
                    Art
                  </button>
                  <button className={albumViewMode === "list" ? "active" : ""} type="button" onClick={() => setAlbumViewMode("list")}>
                    List
                  </button>
                </div>
              ) : null}
              {activeView === "artists" ? (
                <div className="view-toggle" aria-label="Artist view">
                  <button className={artistViewMode === "art" ? "active" : ""} type="button" onClick={() => setArtistViewMode("art")}>
                    Art
                  </button>
                  <button className={artistViewMode === "list" ? "active" : ""} type="button" onClick={() => setArtistViewMode("list")}>
                    List
                  </button>
                </div>
              ) : null}
              {activeView === "playlists" ? (
                <button className="secondary-button compact-button" type="button" onClick={() => setPlaylistCreatorOpen(true)}>
                  <Plus size={15} />
                  New Playlist
                </button>
              ) : null}
            </div>
          </div>
          {showLibraryError ? (
            <StateNotice
              tone="bad"
              icon={<AlertCircle size={16} />}
              title="Library sync failed"
              text={statusMessage}
              actionLabel="Retry"
              onAction={onRetryLibrary}
            />
          ) : null}
          {showInitialLoader ? (
            <LibraryLoadingSkeleton view={activeView} />
          ) : null}
          {!showInitialLoader ? (
            <>
          {activeView === "overview" ? (
            <OverviewHome
              config={config}
              libraryItems={libraryItems}
              recentAlbums={recentAlbums}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              favoriteIds={favoriteIds}
              favoriteBusyKey={favoriteBusyKey}
              onToggleFavorite={onToggleFavorite}
              onSelectLibraryView={onSelectLibraryView}
              onOpenAlbum={onOpenAlbum}
              onPlayAlbum={onPlayAlbum}
            />
          ) : null}
          {activeView === "albums" ? (
            <AlbumBrowser
              viewMode={albumViewMode}
              config={config}
              albums={albums}
              favoriteIds={favoriteIds}
              favoriteBusyKey={favoriteBusyKey}
              onToggleFavorite={onToggleFavorite}
              onOpenAlbum={onOpenAlbum}
              onPlayAlbum={onPlayAlbum}
            />
          ) : null}
          {activeView === "artists" ? (
            <ArtistBrowser
              viewMode={artistViewMode}
              artists={artists}
              favoriteIds={favoriteIds}
              favoriteBusyKey={favoriteBusyKey}
              onToggleFavorite={onToggleFavorite}
              onOpenArtist={onOpenArtist}
              onPlayArtist={onPlayArtist}
            />
          ) : null}
          {activeView === "playlists" ? (
            <PlaylistBrowser playlists={playlists} onOpenPlaylist={onOpenPlaylist} onPlayPlaylist={onPlayPlaylist} />
          ) : null}
          {activeView === "recentlyAdded" ? (
            <AlbumBrowser
              viewMode="list"
              config={config}
              albums={recentAlbums}
              favoriteIds={favoriteIds}
              favoriteBusyKey={favoriteBusyKey}
              onToggleFavorite={onToggleFavorite}
              onOpenAlbum={onOpenAlbum}
              onPlayAlbum={onPlayAlbum}
              withAlphabetRail={false}
              emptyText="No recently added albums yet."
            />
          ) : null}
          {activeView === "recentlyPlayed" ? (
            <AlbumBrowser
              viewMode="list"
              config={config}
              albums={recentlyPlayedAlbums}
              favoriteIds={favoriteIds}
              favoriteBusyKey={favoriteBusyKey}
              onToggleFavorite={onToggleFavorite}
              onOpenAlbum={onOpenAlbum}
              onPlayAlbum={onPlayAlbum}
              withAlphabetRail={false}
              emptyText="No listening history yet."
            />
          ) : null}
          {activeView === "favorites" ? (
            <FavoritesView
              favorites={favorites}
              config={config}
              currentTrack={currentTrack}
              favoriteIds={favoriteIds}
              favoriteBusyKey={favoriteBusyKey}
              onToggleFavorite={onToggleFavorite}
              onOpenAlbum={onOpenAlbum}
              onOpenArtist={onOpenArtist}
              onPlayAlbum={onPlayAlbum}
              onPlayArtist={onPlayArtist}
              onPlaySong={onPlaySong}
              onQueueSong={onQueueSong}
              onSongContextMenu={onSongContextMenu}
            />
          ) : null}
          {activeView === "search" ? (
            <SearchResultsView
              query={searchQuery}
              status={searchStatus}
              results={searchResults}
              config={config}
              currentTrack={currentTrack}
              favoriteIds={favoriteIds}
              favoriteBusyKey={favoriteBusyKey}
              onToggleFavorite={onToggleFavorite}
              onOpenAlbum={onOpenAlbum}
              onOpenArtist={onOpenArtist}
              onOpenPlaylist={onOpenPlaylist}
              onPlayAlbum={onPlayAlbum}
              onPlayArtist={onPlayArtist}
              onPlaySong={onPlaySong}
              onQueueSong={onQueueSong}
              onSongContextMenu={onSongContextMenu}
            />
          ) : null}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

function OverviewHome({
  config,
  libraryItems,
  recentAlbums,
  currentTrack,
  isPlaying,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onSelectLibraryView,
  onOpenAlbum,
  onPlayAlbum,
}: {
  config: NavidromeConfig | null;
  libraryItems: Array<{ label: string; value: string }>;
  recentAlbums: Album[];
  currentTrack: Song | null;
  isPlaying: boolean;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onSelectLibraryView: (view: View) => void;
  onOpenAlbum: (album: Album) => void;
  onPlayAlbum: (album: Album) => void;
}) {
  const shortcutItems = libraryItems;
  const visualAlbums = recentAlbums.slice(0, 5);
  const featuredAlbum = visualAlbums[0] ?? null;
  const featuredCoverUrl = config && featuredAlbum ? buildCoverArtUrl(config, featuredAlbum.coverArt, "520") : null;
  const greeting = `Good ${getGreetingPeriod()}, ${formatDisplayName(config?.username)}`;
  const librarySummary = libraryItems
    .slice(0, 3)
    .map((item) => `${item.value.replace(" loaded", "")} ${item.label.toLowerCase()}`)
    .join(" · ");
  const currentTrackSummary = currentTrack ? `${currentTrack.title} - ${currentTrack.artist ?? "Unknown artist"}` : "";
  const shortcutMeta: Record<string, ReactNode> = {
    Artists: <UserRound size={18} />,
    Albums: <Disc3 size={18} />,
    Playlists: <ListMusic size={18} />,
    "Recently Added": <Plus size={18} />,
    "Recently Played": <History size={18} />,
    Favorites: <Star size={18} />,
  };

  return (
    <div className="home-view">
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">Home</p>
          <h3>{greeting}</h3>
          <p className="home-library-state">{config ? librarySummary : "Connect Navidrome to load your library."}</p>
          {isPlaying && currentTrackSummary ? <p className="home-now-playing">Now playing: {currentTrackSummary}</p> : null}
        </div>
        <div className="home-cover-stage">
          {visualAlbums.map((album, index) => {
            const coverUrl = config ? buildCoverArtUrl(config, album.coverArt, index === 0 ? "520" : "260") : null;

            return (
              <button
                className={`home-cover-peek peek-${index + 1}`}
                type="button"
                key={album.id}
                onClick={() => onOpenAlbum(album)}
                aria-label={`Open ${album.name}`}
              >
                <CoverArt src={coverUrl} label={album.name} className="home-cover-art" />
              </button>
            );
          })}
          {!visualAlbums.length ? <CoverArt src={featuredCoverUrl} label="Prism library" className="home-cover-art home-cover-empty" /> : null}
        </div>
      </section>

      <section>
        <div className="section-label">
          <h4>Library</h4>
        </div>
        <div className="home-shortcuts">
          {shortcutItems.map((item) => (
            <button
              className="home-shortcut"
              type="button"
              key={item.label}
              onClick={() => {
                if (item.label === "Albums") onSelectLibraryView("albums");
                if (item.label === "Artists") onSelectLibraryView("artists");
                if (item.label === "Playlists") onSelectLibraryView("playlists");
                if (item.label === "Recently Added") onSelectLibraryView("recentlyAdded");
                if (item.label === "Recently Played") onSelectLibraryView("recentlyPlayed");
                if (item.label === "Favorites") onSelectLibraryView("favorites");
              }}
            >
              <span className="home-shortcut-icon">{shortcutMeta[item.label]}</span>
              <span className="home-shortcut-copy">
                <strong>{item.label}</strong>
                <small>{item.value}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="section-label">
          <h4>Recently added</h4>
          <button className="detail-back" type="button" onClick={() => onSelectLibraryView("albums")}>
            View albums
          </button>
        </div>
        <AlbumGrid
          config={config}
          albums={recentAlbums}
          favoriteIds={favoriteIds}
          favoriteBusyKey={favoriteBusyKey}
          onToggleFavorite={onToggleFavorite}
          onOpenAlbum={onOpenAlbum}
          onPlayAlbum={onPlayAlbum}
          withAlphabetRail={false}
        />
      </section>
    </div>
  );
}

function FavoritesView({
  favorites,
  config,
  currentTrack,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onOpenAlbum,
  onOpenArtist,
  onPlayAlbum,
  onPlayArtist,
  onPlaySong,
  onQueueSong,
  onSongContextMenu,
}: {
  favorites: LibraryData["favorites"];
  config: NavidromeConfig | null;
  currentTrack: Song | null;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlayAlbum: (album: Album) => void;
  onPlayArtist: (artist: Artist | ArtistDetail) => void;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song) => void;
}) {
  const totalFavorites = favorites.artists.length + favorites.albums.length + favorites.songs.length;

  if (!totalFavorites) {
    return <EmptyPanel icon={<Star size={20} />} text="No favorites yet." />;
  }

  return (
    <div className="search-results">
      <section className="search-summary">
        <div>
          <p className="eyebrow">Favorites</p>
          <h4>Starred library</h4>
        </div>
        <div className="search-counts" aria-label="Favorite counts">
          <span>{favorites.songs.length} songs</span>
          <span>{favorites.albums.length} albums</span>
          <span>{favorites.artists.length} artists</span>
        </div>
      </section>
      {favorites.artists.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Artists</h4>
            <small>{favorites.artists.length}</small>
          </div>
          <ArtistList
            artists={favorites.artists}
            favoriteIds={favoriteIds}
            favoriteBusyKey={favoriteBusyKey}
            onToggleFavorite={onToggleFavorite}
            onOpenArtist={onOpenArtist}
            onPlayArtist={onPlayArtist}
            withAlphabetRail={false}
          />
        </section>
      ) : null}
      {favorites.albums.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Albums</h4>
            <small>{favorites.albums.length}</small>
          </div>
          <AlbumList
            config={config}
            albums={favorites.albums}
            favoriteIds={favoriteIds}
            favoriteBusyKey={favoriteBusyKey}
            onToggleFavorite={onToggleFavorite}
            onOpenAlbum={onOpenAlbum}
            onPlayAlbum={onPlayAlbum}
            withAlphabetRail={false}
          />
        </section>
      ) : null}
      {favorites.songs.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Songs</h4>
            <small>{favorites.songs.length}</small>
          </div>
          <SearchSongList
            songs={favorites.songs}
            currentTrack={currentTrack}
            favoriteIds={favoriteIds}
            favoriteBusyKey={favoriteBusyKey}
            onToggleFavorite={onToggleFavorite}
            onPlaySong={onPlaySong}
            onQueueSong={onQueueSong}
            onSongContextMenu={onSongContextMenu}
          />
        </section>
      ) : null}
    </div>
  );
}

function SearchResultsView({
  query,
  status,
  results,
  config,
  currentTrack,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onOpenAlbum,
  onOpenArtist,
  onOpenPlaylist,
  onPlayAlbum,
  onPlayArtist,
  onPlaySong,
  onQueueSong,
  onSongContextMenu,
}: {
  query: string;
  status: "idle" | "searching" | "error";
  results: SearchResults;
  config: NavidromeConfig | null;
  currentTrack: Song | null;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  onPlayAlbum: (album: Album) => void;
  onPlayArtist: (artist: Artist | ArtistDetail) => void;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song) => void;
}) {
  const trimmedQuery = query.trim();
  const totalResults = results.artists.length + results.albums.length + results.songs.length + results.playlists.length;

  if (trimmedQuery.length < 2) {
    return <EmptyPanel icon={<Search size={20} />} text="Start typing in the top search." />;
  }

  if (status === "searching" && !totalResults) {
    return <EmptyPanel icon={<Loader2 size={20} className="spin" />} text="Searching your library..." />;
  }

  if (status === "error") {
    return <EmptyPanel icon={<AlertCircle size={20} />} text="Search could not load." />;
  }

  if (!totalResults) {
    return <EmptyPanel icon={<Search size={20} />} text="No matches found." />;
  }

  return (
    <div className="search-results">
      <section className="search-summary">
        <div>
          <p className="eyebrow">Search results</p>
          <h4>{trimmedQuery}</h4>
        </div>
        <div className="search-counts" aria-label="Result counts">
          <span>{results.songs.length} songs</span>
          <span>{results.albums.length} albums</span>
          <span>{results.artists.length} artists</span>
          <span>{results.playlists.length} playlists</span>
        </div>
      </section>
      {results.artists.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Artists</h4>
            <small>{results.artists.length}</small>
          </div>
          <ArtistList
            artists={results.artists}
            favoriteIds={favoriteIds}
            favoriteBusyKey={favoriteBusyKey}
            onToggleFavorite={onToggleFavorite}
            onOpenArtist={onOpenArtist}
            onPlayArtist={onPlayArtist}
            withAlphabetRail={false}
          />
        </section>
      ) : null}
      {results.albums.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Albums</h4>
            <small>{results.albums.length}</small>
          </div>
          <AlbumList
            config={config}
            albums={results.albums}
            favoriteIds={favoriteIds}
            favoriteBusyKey={favoriteBusyKey}
            onToggleFavorite={onToggleFavorite}
            onOpenAlbum={onOpenAlbum}
            onPlayAlbum={onPlayAlbum}
            withAlphabetRail={false}
          />
        </section>
      ) : null}
      {results.playlists.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Playlists</h4>
            <small>{results.playlists.length}</small>
          </div>
          <SearchPlaylistList playlists={results.playlists} onOpenPlaylist={onOpenPlaylist} />
        </section>
      ) : null}
      {results.songs.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Songs</h4>
            <small>{results.songs.length}</small>
          </div>
          <SearchSongList
            songs={results.songs}
            currentTrack={currentTrack}
            favoriteIds={favoriteIds}
            favoriteBusyKey={favoriteBusyKey}
            onToggleFavorite={onToggleFavorite}
            onPlaySong={onPlaySong}
            onQueueSong={onQueueSong}
            onSongContextMenu={onSongContextMenu}
          />
        </section>
      ) : null}
    </div>
  );
}

function SearchPlaylistList({
  playlists,
  onOpenPlaylist,
}: {
  playlists: Playlist[];
  onOpenPlaylist: (playlist: Playlist) => void;
}) {
  return (
    <div className="search-playlist-list">
      {playlists.map((playlist) => (
        <button
          className="search-playlist-row"
          type="button"
          key={playlist.id}
          data-context-kind="playlist"
          data-context-id={playlist.id}
          onClick={() => onOpenPlaylist(playlist)}
        >
          <ListMusic size={18} />
          <span>
            <strong>{playlist.name}</strong>
            <small>
              {[playlist.songCount ? `${playlist.songCount} songs` : "Playlist", playlist.duration ? formatDuration(playlist.duration) : null]
                .filter(Boolean)
                .join(" - ")}
            </small>
          </span>
          <ChevronRight size={15} />
        </button>
      ))}
    </div>
  );
}

function SearchSongList({
  songs,
  currentTrack,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onPlaySong,
  onQueueSong,
  onSongContextMenu,
}: {
  songs: Song[];
  currentTrack: Song | null;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song) => void;
}) {
  return (
    <div className="search-song-list">
      {songs.map((song) => (
        <div
          className={`search-song-row ${currentTrack?.id === song.id ? "active" : ""}`}
          key={song.id}
          onContextMenu={(event) => onSongContextMenu(event, song)}
        >
          <button className="track-play" type="button" onClick={() => onPlaySong(song)} aria-label={`Play ${song.title}`}>
            <Play size={14} fill="currentColor" />
          </button>
          <button className="search-song-main" type="button" onClick={() => onPlaySong(song)}>
            <strong>{song.title}</strong>
            <small>{[song.artist, song.album].filter(Boolean).join(" - ") || "Song"}</small>
          </button>
          <small>{formatDuration(song.duration)}</small>
          <FavoriteButton
            active={favoriteIds.songs.has(song.id)}
            busy={favoriteBusyKey === `song:${song.id}`}
            label={song.title}
            onToggle={(favorite) => onToggleFavorite("song", song.id, favorite)}
          />
          <button className="track-queue" type="button" onClick={() => onQueueSong(song)} aria-label={`Queue ${song.title}`}>
            <Plus size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function AlphabetRail({ letters, prefix }: { letters: string[]; prefix: string }) {
  const available = new Set(letters);

  return (
    <div className="alphabet-rail" aria-label="Alphabet jump">
      {ALPHABET.map((letter) => (
        <button
          type="button"
          key={letter}
          disabled={!available.has(letter)}
          onClick={() => document.getElementById(alphaSectionId(prefix, letter))?.scrollIntoView({ block: "start", behavior: "smooth" })}
          aria-label={`Jump to ${letter}`}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

function AlbumBrowser({
  viewMode,
  config,
  albums,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onOpenAlbum,
  onPlayAlbum,
  withAlphabetRail = true,
  emptyText,
}: {
  viewMode: AlbumViewMode;
  config: NavidromeConfig | null;
  albums: Album[];
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenAlbum: (album: Album) => void;
  onPlayAlbum: (album: Album) => void;
  withAlphabetRail?: boolean;
  emptyText?: string;
}) {
  if (viewMode === "list") {
    return (
      <AlbumList
        config={config}
        albums={albums}
        favoriteIds={favoriteIds}
        favoriteBusyKey={favoriteBusyKey}
        onToggleFavorite={onToggleFavorite}
        onOpenAlbum={onOpenAlbum}
        onPlayAlbum={onPlayAlbum}
        withAlphabetRail={withAlphabetRail}
        emptyText={emptyText}
      />
    );
  }

  return (
    <AlbumGrid
      config={config}
      albums={albums}
      favoriteIds={favoriteIds}
      favoriteBusyKey={favoriteBusyKey}
      onToggleFavorite={onToggleFavorite}
      onOpenAlbum={onOpenAlbum}
      onPlayAlbum={onPlayAlbum}
      withAlphabetRail={withAlphabetRail}
      emptyText={emptyText}
    />
  );
}

function AlbumGrid({
  config,
  albums,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onOpenAlbum,
  onPlayAlbum,
  withAlphabetRail = true,
  emptyText = "No albums loaded yet.",
}: {
  config: NavidromeConfig | null;
  albums: Album[];
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenAlbum: (album: Album) => void;
  onPlayAlbum: (album: Album) => void;
  withAlphabetRail?: boolean;
  emptyText?: string;
}) {
  if (!albums.length) {
    return <EmptyPanel icon={<Disc3 size={20} />} text={emptyText} />;
  }

  const groups = groupByAlpha(albums, (album) => album.name);

  if (!withAlphabetRail) {
    return (
      <div className="album-grid">
        {albums.map((album) => {
          const coverUrl = config ? buildCoverArtUrl(config, album.coverArt, "360") : null;

          return (
            <div className="album-tile" key={album.id} data-context-kind="album" data-context-id={album.id}>
              <PlayableCover
                src={coverUrl}
                label={album.name}
                className="album-cover"
                onOpen={() => onOpenAlbum(album)}
                onPlay={() => onPlayAlbum(album)}
              />
              <button className="album-title-button" type="button" onClick={() => onOpenAlbum(album)}>
                {album.name}
              </button>
              <div className="tile-meta-row">
                <small>{album.artist || `${album.songCount ?? 0} tracks`}</small>
                <FavoriteButton
                  active={favoriteIds.albums.has(album.id)}
                  busy={favoriteBusyKey === `album:${album.id}`}
                  label={album.name}
                  onToggle={(favorite) => onToggleFavorite("album", album.id, favorite)}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="alpha-layout">
      <div className="alpha-sections">
        {groups.map((group) => (
          <section className="alpha-section" id={alphaSectionId("albums-art", group.letter)} key={group.letter}>
            <p className="alpha-heading">{group.letter}</p>
            <div className="album-grid">
              {group.items.map((album) => {
                const coverUrl = config ? buildCoverArtUrl(config, album.coverArt, "360") : null;

                return (
                  <div className="album-tile" key={album.id} data-context-kind="album" data-context-id={album.id}>
                    <PlayableCover
                      src={coverUrl}
                      label={album.name}
                      className="album-cover"
                      onOpen={() => onOpenAlbum(album)}
                      onPlay={() => onPlayAlbum(album)}
                    />
                    <button className="album-title-button" type="button" onClick={() => onOpenAlbum(album)}>
                      {album.name}
                    </button>
                    <div className="tile-meta-row">
                      <small>{album.artist || `${album.songCount ?? 0} tracks`}</small>
                      <FavoriteButton
                        active={favoriteIds.albums.has(album.id)}
                        busy={favoriteBusyKey === `album:${album.id}`}
                        label={album.name}
                        onToggle={(favorite) => onToggleFavorite("album", album.id, favorite)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <AlphabetRail letters={groups.map((group) => group.letter)} prefix="albums-art" />
    </div>
  );
}

function AlbumList({
  config,
  albums,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onOpenAlbum,
  onPlayAlbum,
  withAlphabetRail = true,
  emptyText = "No albums loaded yet.",
}: {
  config: NavidromeConfig | null;
  albums: Album[];
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenAlbum: (album: Album) => void;
  onPlayAlbum: (album: Album) => void;
  withAlphabetRail?: boolean;
  emptyText?: string;
}) {
  if (!albums.length) {
    return <EmptyPanel icon={<Disc3 size={20} />} text={emptyText} />;
  }

  const groups = groupByAlpha(albums, (album) => album.name);

  if (!withAlphabetRail) {
    return (
      <div className="album-list">
        {albums.map((album) => {
          const coverUrl = config ? buildCoverArtUrl(config, album.coverArt, "160") : null;
          const detailParts = [album.year, album.songCount ? `${album.songCount} tracks` : null].filter(Boolean);

          return (
            <div className="album-list-row" key={album.id} data-context-kind="album" data-context-id={album.id}>
              <button className="album-list-main" type="button" onClick={() => onOpenAlbum(album)}>
                <CoverArt src={coverUrl} label={album.name} className="album-list-cover" />
                <span>
                  <strong>{album.name}</strong>
                  <small>{detailParts.join(" - ") || "Album"}</small>
                </span>
              </button>
              <button className="track-play" type="button" onClick={() => onPlayAlbum(album)} aria-label={`Play ${album.name}`}>
                <Play size={14} fill="currentColor" />
              </button>
              <FavoriteButton
                active={favoriteIds.albums.has(album.id)}
                busy={favoriteBusyKey === `album:${album.id}`}
                label={album.name}
                onToggle={(favorite) => onToggleFavorite("album", album.id, favorite)}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="alpha-layout">
      <div className="alpha-sections">
        {groups.map((group) => (
          <section className="alpha-section" id={alphaSectionId("albums-list", group.letter)} key={group.letter}>
            <p className="alpha-heading">{group.letter}</p>
            <div className="album-list">
              {group.items.map((album) => {
                const coverUrl = config ? buildCoverArtUrl(config, album.coverArt, "160") : null;
                const detailParts = [album.artist, album.year, album.songCount ? `${album.songCount} tracks` : null].filter(Boolean);

                return (
                  <div className="album-list-row" key={album.id} data-context-kind="album" data-context-id={album.id}>
                    <button className="album-list-main" type="button" onClick={() => onOpenAlbum(album)}>
                      <CoverArt src={coverUrl} label={album.name} className="album-list-cover" />
                      <span>
                        <strong>{album.name}</strong>
                        <small>{detailParts.join(" - ") || "Album"}</small>
                      </span>
                    </button>
                    <button className="track-play" type="button" onClick={() => onPlayAlbum(album)} aria-label={`Play ${album.name}`}>
                      <Play size={14} fill="currentColor" />
                    </button>
                    <FavoriteButton
                      active={favoriteIds.albums.has(album.id)}
                      busy={favoriteBusyKey === `album:${album.id}`}
                      label={album.name}
                      onToggle={(favorite) => onToggleFavorite("album", album.id, favorite)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <AlphabetRail letters={groups.map((group) => group.letter)} prefix="albums-list" />
    </div>
  );
}

function PlayableCover({
  src,
  label,
  className,
  rounded = false,
  disabled = false,
  fallbackIcon,
  onOpen,
  onPlay,
}: {
  src: string | null;
  label: string;
  className: string;
  rounded?: boolean;
  disabled?: boolean;
  fallbackIcon?: ReactNode;
  onOpen?: () => void;
  onPlay: () => void;
}) {
  const cover = <CoverArt src={src} label={label} className={className} fallbackIcon={fallbackIcon} />;

  return (
    <div className={`playable-cover ${rounded ? "round" : ""}`}>
      {onOpen ? (
        <button className="cover-open-button" type="button" onClick={onOpen} aria-label={`Open ${label}`}>
          {cover}
        </button>
      ) : (
        cover
      )}
      <button className="cover-play-button" type="button" onClick={onPlay} disabled={disabled} aria-label={`Play ${label}`}>
        <Play size={18} fill="currentColor" />
      </button>
    </div>
  );
}

function CoverArt({
  src,
  label,
  className,
  fallbackIcon = <Disc3 size={28} />,
}: {
  src: string | null;
  label: string;
  className: string;
  fallbackIcon?: ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (!src || imageFailed) {
    return (
      <div className={`${className} cover-fallback`} aria-hidden="true">
        {fallbackIcon}
      </div>
    );
  }

  return <img className={className} src={src} alt={`${label} cover`} loading="lazy" onError={() => setImageFailed(true)} />;
}

function ArtistBrowser({
  viewMode,
  artists,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onOpenArtist,
  onPlayArtist,
}: {
  viewMode: ArtistViewMode;
  artists: Artist[];
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlayArtist: (artist: Artist) => void;
}) {
  if (viewMode === "art") {
    return (
      <ArtistGrid
        artists={artists}
        favoriteIds={favoriteIds}
        favoriteBusyKey={favoriteBusyKey}
        onToggleFavorite={onToggleFavorite}
        onOpenArtist={onOpenArtist}
        onPlayArtist={onPlayArtist}
      />
    );
  }

  return (
    <ArtistList
      artists={artists}
      favoriteIds={favoriteIds}
      favoriteBusyKey={favoriteBusyKey}
      onToggleFavorite={onToggleFavorite}
      onOpenArtist={onOpenArtist}
      onPlayArtist={onPlayArtist}
    />
  );
}

function ArtistGrid({
  artists,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onOpenArtist,
  onPlayArtist,
}: {
  artists: Artist[];
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlayArtist: (artist: Artist) => void;
}) {
  if (!artists.length) {
    return <EmptyPanel icon={<UserRound size={20} />} text="No artists loaded yet." />;
  }

  const groups = groupByAlpha(artists, (artist) => artist.name);

  return (
    <div className="alpha-layout">
      <div className="alpha-sections">
        {groups.map((group) => (
          <section className="alpha-section" id={alphaSectionId("artists-art", group.letter)} key={group.letter}>
            <p className="alpha-heading">{group.letter}</p>
            <div className="artist-grid">
              {group.items.map((artist) => (
                <div className="artist-tile" key={artist.id} data-context-kind="artist" data-context-id={artist.id}>
                  <PlayableCover
                    src={null}
                    label={artist.name}
                    className="artist-grid-cover"
                    rounded
                    fallbackIcon={<UserRound size={30} />}
                    onOpen={() => onOpenArtist(artist)}
                    onPlay={() => onPlayArtist(artist)}
                  />
                  <button className="album-title-button" type="button" onClick={() => onOpenArtist(artist)}>
                    {artist.name}
                  </button>
                  <div className="tile-meta-row">
                    <small>{artist.albumCount ?? 0} albums</small>
                    <FavoriteButton
                      active={favoriteIds.artists.has(artist.id)}
                      busy={favoriteBusyKey === `artist:${artist.id}`}
                      label={artist.name}
                      onToggle={(favorite) => onToggleFavorite("artist", artist.id, favorite)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <AlphabetRail letters={groups.map((group) => group.letter)} prefix="artists-art" />
    </div>
  );
}

function ArtistList({
  artists,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onOpenArtist,
  onPlayArtist,
  withAlphabetRail = true,
}: {
  artists: Artist[];
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlayArtist: (artist: Artist) => void;
  withAlphabetRail?: boolean;
}) {
  if (!artists.length) {
    return <EmptyPanel icon={<UserRound size={20} />} text="No artists loaded yet." />;
  }

  if (!withAlphabetRail) {
    return (
      <div className="artist-list">
        {artists.map((artist) => (
          <div className="artist-row" key={artist.id} data-context-kind="artist" data-context-id={artist.id}>
            <button className="artist-main" type="button" onClick={() => onOpenArtist(artist)}>
              <UserRound size={18} />
              <span>{artist.name}</span>
              <small>{artist.albumCount ?? 0} albums</small>
            </button>
            <button className="track-play" type="button" onClick={() => onPlayArtist(artist)} aria-label={`Play ${artist.name}`}>
              <Play size={14} fill="currentColor" />
            </button>
            <FavoriteButton
              active={favoriteIds.artists.has(artist.id)}
              busy={favoriteBusyKey === `artist:${artist.id}`}
              label={artist.name}
              onToggle={(favorite) => onToggleFavorite("artist", artist.id, favorite)}
            />
          </div>
        ))}
      </div>
    );
  }

  const groups = groupByAlpha(artists, (artist) => artist.name);

  return (
    <div className="alpha-layout">
      <div className="alpha-sections">
        {groups.map((group) => (
          <section className="alpha-section" id={alphaSectionId("artists-list", group.letter)} key={group.letter}>
            <p className="alpha-heading">{group.letter}</p>
            <div className="artist-list">
              {group.items.map((artist) => (
                <div className="artist-row" key={artist.id} data-context-kind="artist" data-context-id={artist.id}>
                  <button className="artist-main" type="button" onClick={() => onOpenArtist(artist)}>
                    <UserRound size={18} />
                    <span>{artist.name}</span>
                    <small>{artist.albumCount ?? 0} albums</small>
                  </button>
                  <button className="track-play" type="button" onClick={() => onPlayArtist(artist)} aria-label={`Play ${artist.name}`}>
                    <Play size={14} fill="currentColor" />
                  </button>
                  <FavoriteButton
                    active={favoriteIds.artists.has(artist.id)}
                    busy={favoriteBusyKey === `artist:${artist.id}`}
                    label={artist.name}
                    onToggle={(favorite) => onToggleFavorite("artist", artist.id, favorite)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <AlphabetRail letters={groups.map((group) => group.letter)} prefix="artists-list" />
    </div>
  );
}

function PlaylistCreateForm({
  queueLength,
  name,
  setName,
  description,
  setDescription,
  isPublic,
  setIsPublic,
  fromQueue,
  setFromQueue,
  status,
  message,
  onSubmit,
  onCancel,
}: {
  queueLength: number;
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (description: string) => void;
  isPublic: boolean;
  setIsPublic: (isPublic: boolean) => void;
  fromQueue: boolean;
  setFromQueue: (fromQueue: boolean) => void;
  status: "idle" | "saving" | "error";
  message: string;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const canUseQueue = queueLength > 0;

  return (
    <form className="playlist-create-form" onSubmit={onSubmit}>
      <div className="playlist-create-fields">
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New playlist"
            disabled={status === "saving"}
            autoFocus
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional playlist description"
            disabled={status === "saving"}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={isPublic}
            disabled={status === "saving"}
            onChange={(event) => setIsPublic(event.target.checked)}
          />
          <span>Public playlist</span>
          <small>Visible to other Navidrome users</small>
        </label>
        <label className={`checkbox-row ${canUseQueue ? "" : "disabled"}`}>
          <input
            type="checkbox"
            checked={fromQueue && canUseQueue}
            disabled={!canUseQueue || status === "saving"}
            onChange={(event) => setFromQueue(event.target.checked)}
          />
          <span>Start with current queue</span>
          <small>{canUseQueue ? `${queueLength} tracks` : "Queue empty"}</small>
        </label>
      </div>
      <div className="playlist-create-actions">
        {message ? <p className={status === "error" ? "bad" : ""}>{message}</p> : null}
        <button className="secondary-button" type="button" onClick={onCancel} disabled={status === "saving"}>
          Cancel
        </button>
        <button className="connect-button" type="submit" disabled={status === "saving"}>
          {status === "saving" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
          Create
        </button>
      </div>
    </form>
  );
}

function PlaylistBrowser({
  playlists,
  onOpenPlaylist,
  onPlayPlaylist,
}: {
  playlists: Playlist[];
  onOpenPlaylist: (playlist: Playlist) => void;
  onPlayPlaylist: (playlist: Playlist) => void;
}) {
  if (!playlists.length) {
    return <EmptyPanel icon={<ListMusic size={20} />} text="No playlists yet." />;
  }

  const sortedPlaylists = [...playlists].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="playlist-list">
      {sortedPlaylists.map((playlist) => (
        <div className="playlist-row" key={playlist.id} data-context-kind="playlist" data-context-id={playlist.id}>
          <button className="playlist-main" type="button" onClick={() => onOpenPlaylist(playlist)}>
            <span className="playlist-icon" aria-hidden="true">
              <ListMusic size={18} />
            </span>
            <span>
              <strong>{playlist.name}</strong>
              <small>{getPlaylistMeta(playlist)}</small>
            </span>
          </button>
          <button className="track-play" type="button" onClick={() => onPlayPlaylist(playlist)} aria-label={`Play ${playlist.name}`}>
            <Play size={14} fill="currentColor" />
          </button>
        </div>
      ))}
    </div>
  );
}

function getPlaylistMeta(playlist: Playlist) {
  const parts = [
    playlist.songCount != null ? `${playlist.songCount} songs` : null,
    playlist.duration ? formatDuration(playlist.duration) : null,
    playlist.owner ? `by ${playlist.owner}` : null,
  ].filter(Boolean);

  return parts.join(" - ") || "Playlist";
}

function PlaylistDetailPanel({
  config,
  playlist,
  currentTrack,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onPlayPlaylist,
  onSavePlaylistDetails,
  onDeletePlaylist,
  playlistEditRequestKey,
  onRemovePlaylistSong,
  onReorderPlaylist,
  onReplaceQueue,
  onQueueSong,
  onSongContextMenu,
}: {
  config: NavidromeConfig | null;
  playlist: PlaylistDetail;
  currentTrack: Song | null;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onPlayPlaylist: (playlist: Playlist) => void;
  onSavePlaylistDetails: (playlist: Playlist, details: PlaylistDetailsUpdate) => Promise<void>;
  onDeletePlaylist: (playlist: Playlist) => Promise<void>;
  playlistEditRequestKey: number;
  onRemovePlaylistSong: (playlist: PlaylistDetail, index: number) => Promise<void>;
  onReorderPlaylist: (playlist: PlaylistDetail, songs: Song[]) => Promise<void>;
  onReplaceQueue: (songs: Song[], startIndex?: number) => void;
  onQueueSong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song) => void;
}) {
  const songs = playlist.entry ?? [];
  const playlistCover =
    config && songs.length ? buildCoverArtUrl(config, songs.find((song) => song.coverArt)?.coverArt, "460") : null;
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(playlist.name);
  const [comment, setComment] = useState(playlist.comment ?? "");
  const [isPublic, setIsPublic] = useState(Boolean(playlist.public));
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [trackStatus, setTrackStatus] = useState<"idle" | "saving" | "error">("idle");
  const [trackMessage, setTrackMessage] = useState("");
  const [draftSongs, setDraftSongs] = useState(songs);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    setName(playlist.name);
    setComment(playlist.comment ?? "");
    setIsPublic(Boolean(playlist.public));
    setEditing(false);
    setConfirmingDelete(false);
    setStatus("idle");
    setMessage("");
    setTrackStatus("idle");
    setTrackMessage("");
    setDraftSongs(playlist.entry ?? []);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [playlist.id, playlist.name, playlist.comment, playlist.public]);

  useEffect(() => {
    setDraftSongs(songs);
  }, [playlist.id, playlist.entry]);

  useEffect(() => {
    if (playlistEditRequestKey > 0) {
      setEditing(true);
    }
  }, [playlistEditRequestKey]);

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setStatus("error");
      setMessage("Playlist name is required.");
      return;
    }

    setStatus("saving");
    setMessage("Saving playlist details...");

    try {
      await onSavePlaylistDetails(playlist, {
        name: trimmedName,
        comment: comment.trim(),
        public: isPublic,
      });
      setStatus("idle");
      setMessage("");
      setEditing(false);
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  }

  async function deleteCurrentPlaylist() {
    setStatus("saving");
    setMessage("Deleting playlist...");

    try {
      await onDeletePlaylist(playlist);
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  }

  async function removeTrack(index: number) {
    setTrackStatus("saving");
    setTrackMessage("Removing track...");

    try {
      await onRemovePlaylistSong(playlist, index);
      setTrackStatus("idle");
      setTrackMessage("");
    } catch (error) {
      setTrackStatus("error");
      setTrackMessage(getErrorMessage(error));
    }
  }

  async function dropTrack(toIndex: number) {
    if (draggedIndex == null || draggedIndex === toIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const nextSongs = [...draftSongs];
    const [movedSong] = nextSongs.splice(draggedIndex, 1);
    nextSongs.splice(toIndex, 0, movedSong);
    setDraftSongs(nextSongs);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setTrackStatus("saving");
    setTrackMessage("Saving playlist order...");

    try {
      await onReorderPlaylist(playlist, nextSongs);
      setTrackStatus("idle");
      setTrackMessage("");
    } catch (error) {
      setDraftSongs(songs);
      setTrackStatus("error");
      setTrackMessage(getErrorMessage(error));
    }
  }

  return (
    <section className="detail-panel">
      <div className="panel-heading">
        <h3>{playlist.name}</h3>
        <span>{songs.length} tracks</span>
      </div>
      <div className="playlist-hero">
        <PlayableCover
          src={playlistCover}
          label={playlist.name}
          className="detail-cover"
          fallbackIcon={<ListMusic size={30} />}
          disabled={!songs.length}
          onPlay={() => onPlayPlaylist(playlist)}
        />
        <div>
          <div className="detail-title">
            <p className="eyebrow">Playlist</p>
            <h3>{playlist.name}</h3>
          </div>
          <div className="detail-stats">
            <span>{songs.length} tracks</span>
            {playlist.duration ? <span>{formatDuration(playlist.duration)}</span> : null}
            {playlist.owner ? <span>{playlist.owner}</span> : null}
            {playlist.public != null ? <span>{playlist.public ? "Public" : "Private"}</span> : null}
          </div>
          {playlist.comment ? <p className="playlist-comment">{playlist.comment}</p> : null}
          <div className="detail-actions">
            <button className="connect-button" type="button" onClick={() => onReplaceQueue(songs)} disabled={!songs.length}>
              <Play size={16} fill="currentColor" />
              Play Playlist
            </button>
            <button className="secondary-button" type="button" onClick={() => songs.forEach(onQueueSong)} disabled={!songs.length}>
              <ListMusic size={16} />
              Queue Playlist
            </button>
            <button className="secondary-button" type="button" onClick={() => setEditing((value) => !value)}>
              <Settings size={16} />
              Edit Details
            </button>
          </div>
        </div>
      </div>
      {editing ? (
        <div className="modal-backdrop">
          <section className="playlist-modal" role="dialog" aria-modal="true" aria-labelledby="playlist-edit-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Playlist</p>
                <h3 id="playlist-edit-title">Edit Details</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setEditing(false)} aria-label="Close playlist details">
                <X size={16} />
              </button>
            </div>
            <form className="playlist-detail-form" onSubmit={saveDetails}>
              <div className="playlist-detail-fields">
                <label>
                  Name
                  <input value={name} onChange={(event) => setName(event.target.value)} disabled={status === "saving"} autoFocus />
                </label>
                <label>
                  Description
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    disabled={status === "saving"}
                    placeholder="Add a short playlist description"
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    disabled={status === "saving"}
                    onChange={(event) => setIsPublic(event.target.checked)}
                  />
                  <span>Public playlist</span>
                  <small>Visible to other Navidrome users</small>
                </label>
              </div>
              <div className="playlist-create-actions">
                {message ? <p className={status === "error" ? "bad" : ""}>{message}</p> : null}
                <button className="secondary-button" type="button" disabled={status === "saving"} onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button className="secondary-button danger-button" type="button" disabled={status === "saving"} onClick={() => setConfirmingDelete(true)}>
                  <Trash2 size={15} />
                  Delete
                </button>
                <button className="connect-button" type="submit" disabled={status === "saving"}>
                  {status === "saving" ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                  Save
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {confirmingDelete ? (
        <div className="modal-backdrop confirm-backdrop">
          <section className="playlist-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="playlist-delete-title">
            <div className="confirm-icon" aria-hidden="true">
              <Trash2 size={22} />
            </div>
            <div className="confirm-copy">
              <p className="eyebrow">Delete Playlist</p>
              <h3 id="playlist-delete-title">{playlist.name}</h3>
              <p>This removes the playlist from Navidrome. The songs stay in your library.</p>
            </div>
            <div className="confirm-actions">
              <button className="secondary-button" type="button" disabled={status === "saving"} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
              <button className="connect-button confirm-delete-button" type="button" disabled={status === "saving"} onClick={deleteCurrentPlaylist}>
                {status === "saving" ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                Delete Playlist
              </button>
            </div>
            {message ? <p className={`confirm-status ${status === "error" ? "bad" : ""}`}>{message}</p> : null}
          </section>
        </div>
      ) : null}
      <EditablePlaylistTrackList
        songs={draftSongs}
        busy={trackStatus === "saving"}
        message={trackMessage}
        draggedIndex={draggedIndex}
        dragOverIndex={dragOverIndex}
        setDraggedIndex={setDraggedIndex}
        setDragOverIndex={setDragOverIndex}
        onDropTrack={dropTrack}
        onRemoveTrack={removeTrack}
        currentTrack={currentTrack}
        favoriteIds={favoriteIds}
        favoriteBusyKey={favoriteBusyKey}
        onToggleFavorite={onToggleFavorite}
        onPlaySong={(song) => onReplaceQueue(draftSongs, Math.max(0, draftSongs.findIndex((playlistSong) => playlistSong.id === song.id)))}
        onQueueSong={onQueueSong}
        onSongContextMenu={onSongContextMenu}
      />
    </section>
  );
}

function DetailPanel({
  config,
  detailSelection,
  detailStatus,
  detailMessage,
  currentTrack,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  albumViewMode,
  setAlbumViewMode,
  onOpenAlbum,
  onOpenArtist,
  onPlayAlbum,
  onPlayArtist,
  onPlayPlaylist,
  onSavePlaylistDetails,
  onDeletePlaylist,
  playlistEditRequestKey,
  onRemovePlaylistSong,
  onReorderPlaylist,
  onReplaceQueue,
  onQueueSong,
  onSongContextMenu,
}: {
  config: NavidromeConfig | null;
  detailSelection: DetailSelection;
  detailStatus: "idle" | "loading" | "error";
  detailMessage: string;
  currentTrack: Song | null;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  albumViewMode: AlbumViewMode;
  setAlbumViewMode: (mode: AlbumViewMode) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlayAlbum: (album: Album) => void;
  onPlayArtist: (artist: ArtistDetail) => void;
  onPlayPlaylist: (playlist: Playlist) => void;
  onSavePlaylistDetails: (playlist: Playlist, details: PlaylistDetailsUpdate) => Promise<void>;
  onDeletePlaylist: (playlist: Playlist) => Promise<void>;
  playlistEditRequestKey: number;
  onRemovePlaylistSong: (playlist: PlaylistDetail, index: number) => Promise<void>;
  onReorderPlaylist: (playlist: PlaylistDetail, songs: Song[]) => Promise<void>;
  onReplaceQueue: (songs: Song[], startIndex?: number) => void;
  onQueueSong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song) => void;
}) {
  if (detailStatus === "loading" || detailStatus === "error") {
    return (
      <section className={`detail-panel ${detailStatus === "error" ? "bad" : ""}`}>
        <div className="panel-heading">
          <h3>{detailStatus === "loading" ? "Loading" : "Could not load"}</h3>
          {detailStatus === "loading" ? <Loader2 size={16} className="spin" /> : <AlertCircle size={16} />}
        </div>
        <div className="detail-empty">
          <p>{detailMessage}</p>
        </div>
      </section>
    );
  }

  if (!detailSelection) return null;

  if (detailSelection.type === "artist") {
    const artist = detailSelection.data;
    const artistAlbums = sortAlbumsChronologically(artist.album ?? []);
    const artistInfo = artist.info;
    const artistImage = getArtistImageUrl(artistInfo);
    const firstCover = artistImage || (config ? buildCoverArtUrl(config, artistAlbums.find((album) => album.coverArt)?.coverArt, "420") : null);
    const biography = cleanBiography(artistInfo?.biography);
    const similarArtists = artistInfo?.similarArtist?.slice(0, 8) ?? [];
    const activeYears = artistAlbums.map((album) => album.year).filter(Boolean) as number[];
    const yearRange = activeYears.length
      ? `${Math.min(...activeYears)}${Math.min(...activeYears) === Math.max(...activeYears) ? "" : `-${Math.max(...activeYears)}`}`
      : "Years unavailable";

    return (
      <section className="detail-panel">
        <div className="panel-heading">
          <h3>{artist.name}</h3>
          <span>{artist.album?.length ?? 0} albums</span>
        </div>
        <div className="artist-hero">
          <PlayableCover src={firstCover} label={artist.name} className="artist-cover" rounded onPlay={() => onPlayArtist(artist)} />
          <div>
            <p className="eyebrow">Artist</p>
            <h3>{artist.name}</h3>
            <FavoriteButton
              active={favoriteIds.artists.has(artist.id)}
              busy={favoriteBusyKey === `artist:${artist.id}`}
              label={artist.name}
              onToggle={(favorite) => onToggleFavorite("artist", artist.id, favorite)}
            />
            <div className="detail-stats">
              <span>{artist.albumCount ?? artistAlbums.length} albums</span>
              <span>{yearRange}</span>
              {artistInfo?.musicBrainzId ? <span>MusicBrainz</span> : null}
            </div>
          </div>
        </div>
        {biography || similarArtists.length || artistInfo?.lastFmUrl ? (
          <div className="artist-info-panel">
            {biography ? (
              <div className="artist-bio">
                <p className="eyebrow">About</p>
                <p>{biography}</p>
              </div>
            ) : null}
            {similarArtists.length ? (
              <div className="similar-artists">
                <p className="eyebrow">Similar artists</p>
                <div className="similar-list">
                  {similarArtists.map((similar) =>
                    similar.id ? (
                      <button className="similar-chip" type="button" key={similar.id} onClick={() => onOpenArtist(similar)}>
                        {similar.name}
                      </button>
                    ) : (
                      <span className="similar-chip" key={similar.name}>
                        {similar.name}
                      </span>
                    ),
                  )}
                </div>
              </div>
            ) : null}
            {artistInfo?.lastFmUrl ? (
              <a className="artist-source-link" href={artistInfo.lastFmUrl} target="_blank" rel="noreferrer">
                Last.fm
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="section-label">
          <h4>Albums</h4>
          <div className="view-toggle" aria-label="Artist album view">
            <button className={albumViewMode === "art" ? "active" : ""} type="button" onClick={() => setAlbumViewMode("art")}>
              Art
            </button>
            <button className={albumViewMode === "list" ? "active" : ""} type="button" onClick={() => setAlbumViewMode("list")}>
              List
            </button>
          </div>
        </div>
        <AlbumBrowser
          viewMode={albumViewMode}
          config={config}
          albums={artistAlbums}
          favoriteIds={favoriteIds}
          favoriteBusyKey={favoriteBusyKey}
          onToggleFavorite={onToggleFavorite}
          onOpenAlbum={onOpenAlbum}
          onPlayAlbum={onPlayAlbum}
          withAlphabetRail={false}
        />
      </section>
    );
  }

  if (detailSelection.type === "playlist") {
    return (
      <PlaylistDetailPanel
        config={config}
        playlist={detailSelection.data}
        currentTrack={currentTrack}
        favoriteIds={favoriteIds}
        favoriteBusyKey={favoriteBusyKey}
        onToggleFavorite={onToggleFavorite}
        onPlayPlaylist={onPlayPlaylist}
        onSavePlaylistDetails={onSavePlaylistDetails}
        onDeletePlaylist={onDeletePlaylist}
        playlistEditRequestKey={playlistEditRequestKey}
        onRemovePlaylistSong={onRemovePlaylistSong}
        onReorderPlaylist={onReorderPlaylist}
        onReplaceQueue={onReplaceQueue}
        onQueueSong={onQueueSong}
        onSongContextMenu={onSongContextMenu}
      />
    );
  }

  const album = detailSelection.data;
  const songs = sortAlbumSongs(album.song ?? []);
  const albumCover = config ? buildCoverArtUrl(config, album.coverArt ?? songs.find((song) => song.coverArt)?.coverArt, "460") : null;
  const discCount = new Set(songs.map((song) => song.discNumber).filter((discNumber) => discNumber != null)).size;

  return (
    <section className="detail-panel">
      <div className="panel-heading">
        <h3>{album.name}</h3>
        <span>{songs.length} tracks</span>
      </div>
      <div className="album-hero">
        <PlayableCover src={albumCover} label={album.name} className="detail-cover" disabled={!songs.length} onPlay={() => onReplaceQueue(songs)} />
        <div>
          <div className="detail-title">
            <p className="eyebrow">{album.artist}</p>
            <h3>{album.name}</h3>
          </div>
          <FavoriteButton
            active={favoriteIds.albums.has(album.id)}
            busy={favoriteBusyKey === `album:${album.id}`}
            label={album.name}
            onToggle={(favorite) => onToggleFavorite("album", album.id, favorite)}
          />
          <div className="detail-stats">
            <span>{album.year ?? "Year unavailable"}</span>
            <span>{songs.length} tracks</span>
            {discCount > 1 ? <span>{discCount} discs</span> : null}
          </div>
          <div className="detail-actions">
            <button className="connect-button" type="button" onClick={() => onReplaceQueue(songs)} disabled={!songs.length}>
              <Play size={16} fill="currentColor" />
              Play Album
            </button>
            <button className="secondary-button" type="button" onClick={() => songs.forEach(onQueueSong)} disabled={!songs.length}>
              <ListMusic size={16} />
              Queue Album
            </button>
          </div>
        </div>
      </div>
      <TrackList
        songs={songs}
        currentTrack={currentTrack}
        favoriteIds={favoriteIds}
        favoriteBusyKey={favoriteBusyKey}
        onToggleFavorite={onToggleFavorite}
        onPlaySong={(song) => onReplaceQueue(songs, Math.max(0, songs.findIndex((albumSong) => albumSong.id === song.id)))}
        onQueueSong={onQueueSong}
        onSongContextMenu={onSongContextMenu}
      />
    </section>
  );
}

function TrackList({
  songs,
  currentTrack,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  emptyText = "No tracks available for this album.",
  onPlaySong,
  onQueueSong,
  onSongContextMenu,
}: {
  songs: Song[];
  currentTrack: Song | null;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  emptyText?: string;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song) => void;
}) {
  if (!songs.length) {
    return <EmptyPanel icon={<Music2 size={20} />} text={emptyText} />;
  }

  const discGroups = groupSongsByDisc(songs);
  const showDiscHeaders = discGroups.length > 1;

  return (
    <div className="track-list">
      {discGroups.map((group) => (
        <div className="disc-group" key={group.discNumber ?? "unknown-disc"}>
          {showDiscHeaders ? (
            <div className="disc-heading">
              <span>{group.discNumber != null ? `Disc ${group.discNumber}` : "Disc"}</span>
              <small>{group.songs.length} tracks</small>
            </div>
          ) : null}
          {group.songs.map((song, index) => (
            <div
              className={`track-row ${currentTrack?.id === song.id ? "active" : ""}`}
              key={song.id}
              onContextMenu={(event) => onSongContextMenu(event, song)}
              onDoubleClick={() => onPlaySong(song)}
            >
              <button
                className="track-play"
                type="button"
                aria-label={`Play ${song.title}`}
                onClick={() => onPlaySong(song)}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <Play size={14} fill="currentColor" />
              </button>
              <span className="track-number">{song.track ?? index + 1}</span>
              <button
                className="track-name"
                type="button"
                onClick={() => onPlaySong(song)}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                {song.title}
              </button>
              <span className="track-duration">{formatDuration(song.duration)}</span>
              <FavoriteButton
                active={favoriteIds.songs.has(song.id)}
                busy={favoriteBusyKey === `song:${song.id}`}
                label={song.title}
                onToggle={(favorite) => onToggleFavorite("song", song.id, favorite)}
                onDoubleClick={(event) => event.stopPropagation()}
              />
              <button
                className="track-queue"
                type="button"
                aria-label={`Queue ${song.title}`}
                onClick={() => onQueueSong(song)}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <Plus size={14} />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EditablePlaylistTrackList({
  songs,
  busy,
  message,
  draggedIndex,
  dragOverIndex,
  setDraggedIndex,
  setDragOverIndex,
  onDropTrack,
  onRemoveTrack,
  currentTrack,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onPlaySong,
  onQueueSong,
  onSongContextMenu,
}: {
  songs: Song[];
  busy: boolean;
  message: string;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  setDraggedIndex: (index: number | null) => void;
  setDragOverIndex: (index: number | null) => void;
  onDropTrack: (index: number) => void;
  onRemoveTrack: (index: number) => void;
  currentTrack: Song | null;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song) => void;
}) {
  const displayedSongs = useMemo(() => {
    if (draggedIndex == null || dragOverIndex == null || draggedIndex === dragOverIndex) {
      return songs.map((song, index) => ({ song, index }));
    }

    const nextSongs = songs.map((song, index) => ({ song, index }));
    const [movedSong] = nextSongs.splice(draggedIndex, 1);
    nextSongs.splice(dragOverIndex, 0, movedSong);
    return nextSongs;
  }, [dragOverIndex, draggedIndex, songs]);

  if (!songs.length) {
    return <EmptyPanel icon={<Music2 size={20} />} text="No tracks in this playlist yet." />;
  }

  return (
    <div className="playlist-track-editor">
      <div className="playlist-track-editor-heading">
        <p className="eyebrow">Tracks</p>
        {message ? <span className={busy ? "" : "bad"}>{message}</span> : null}
      </div>
      <div className="track-list">
        {displayedSongs.map(({ song, index }, displayIndex) => (
          <div
            className={`track-row playlist-track-row ${currentTrack?.id === song.id ? "active" : ""} ${index === draggedIndex ? "dragging" : ""}`}
            key={`${song.id}-${index}`}
            onContextMenu={(event) => onSongContextMenu(event, song)}
            onDoubleClick={() => onPlaySong(song)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverIndex(displayIndex);
            }}
            onDrop={() => onDropTrack(dragOverIndex ?? displayIndex)}
          >
            <button
              className="queue-drag-handle"
              type="button"
              aria-label={`Drag ${song.title} to reorder`}
              draggable
              disabled={busy}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(index));
                setDraggedIndex(index);
                setDragOverIndex(index);
              }}
              onDragEnd={() => {
                setDraggedIndex(null);
                setDragOverIndex(null);
              }}
            >
              <Menu size={14} />
            </button>
            <span className="track-number">{displayIndex + 1}</span>
            <button
              className="track-name"
              type="button"
              onClick={() => onPlaySong(song)}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              {song.title}
            </button>
            <span className="track-duration">{formatDuration(song.duration)}</span>
            <FavoriteButton
              active={favoriteIds.songs.has(song.id)}
              busy={favoriteBusyKey === `song:${song.id}`}
              label={song.title}
              onToggle={(favorite) => onToggleFavorite("song", song.id, favorite)}
              onDoubleClick={(event) => event.stopPropagation()}
            />
            <button
              className="track-queue"
              type="button"
              aria-label={`Queue ${song.title}`}
              onClick={() => onQueueSong(song)}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <Plus size={14} />
            </button>
            <button
              className="track-queue"
              type="button"
              aria-label={`Remove ${song.title} from playlist`}
              disabled={busy}
              onClick={() => onRemoveTrack(index)}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FavoriteButton({
  active,
  busy,
  label,
  onToggle,
  onDoubleClick,
}: {
  active: boolean;
  busy: boolean;
  label: string;
  onToggle: (favorite: boolean) => void;
  onDoubleClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`favorite-button ${active ? "active" : ""}`}
      type="button"
      disabled={busy}
      aria-label={`${active ? "Remove favorite" : "Favorite"} ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(!active);
      }}
      onDoubleClick={onDoubleClick}
    >
      {busy ? <Loader2 size={14} className="spin" /> : <Star size={14} fill={active ? "currentColor" : "none"} />}
    </button>
  );
}

function LibraryContextMenu({
  menu,
  favoriteIds,
  favoriteBusyKey,
  onOpenAlbum,
  onPlayAlbum,
  onOpenArtist,
  onPlayArtist,
  onOpenPlaylist,
  onPlayPlaylist,
  onEditPlaylist,
  onDeletePlaylist,
  onToggleFavorite,
}: {
  menu: Exclude<LibraryContextMenuState, null>;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onOpenAlbum: (album: Album) => void;
  onPlayAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlayArtist: (artist: Artist) => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  onPlayPlaylist: (playlist: Playlist) => void;
  onEditPlaylist: (playlist: Playlist) => void;
  onDeletePlaylist: (playlist: Playlist) => void;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
}) {
  const title = menu.item.name;
  const menuLabel = menu.type === "album" ? "Album" : menu.type === "artist" ? "Artist" : "Playlist";

  return (
    <div
      className="song-context-menu library-context-menu"
      style={{
        left: Math.min(menu.x, window.innerWidth - 280),
        top: Math.min(menu.y, window.innerHeight - 360),
      }}
      role="menu"
      aria-label={`${menuLabel} actions for ${title}`}
    >
      <div className="song-context-heading">
        <div>
          <p className="eyebrow">{menuLabel}</p>
          <strong>{title}</strong>
        </div>
      </div>
      <div className="song-context-section">
        {menu.type === "album" ? (
          <>
            <button className="song-context-action" type="button" onClick={() => onOpenAlbum(menu.item)}>
              <Disc3 size={15} />
              Open Album
            </button>
            <button className="song-context-action" type="button" onClick={() => onPlayAlbum(menu.item)}>
              <Play size={15} fill="currentColor" />
              Play Album
            </button>
            <button
              className="song-context-action"
              type="button"
              disabled={favoriteBusyKey === `album:${menu.item.id}`}
              onClick={() => onToggleFavorite("album", menu.item.id, !favoriteIds.albums.has(menu.item.id))}
            >
              {favoriteBusyKey === `album:${menu.item.id}` ? (
                <Loader2 size={15} className="spin" />
              ) : (
                <Star size={15} fill={favoriteIds.albums.has(menu.item.id) ? "currentColor" : "none"} />
              )}
              {favoriteIds.albums.has(menu.item.id) ? "Remove Favorite" : "Add Favorite"}
            </button>
          </>
        ) : null}
        {menu.type === "artist" ? (
          <>
            <button className="song-context-action" type="button" onClick={() => onOpenArtist(menu.item)}>
              <UserRound size={15} />
              Open Artist
            </button>
            <button className="song-context-action" type="button" onClick={() => onPlayArtist(menu.item)}>
              <Play size={15} fill="currentColor" />
              Play Artist
            </button>
            <button
              className="song-context-action"
              type="button"
              disabled={favoriteBusyKey === `artist:${menu.item.id}`}
              onClick={() => onToggleFavorite("artist", menu.item.id, !favoriteIds.artists.has(menu.item.id))}
            >
              {favoriteBusyKey === `artist:${menu.item.id}` ? (
                <Loader2 size={15} className="spin" />
              ) : (
                <Star size={15} fill={favoriteIds.artists.has(menu.item.id) ? "currentColor" : "none"} />
              )}
              {favoriteIds.artists.has(menu.item.id) ? "Remove Favorite" : "Add Favorite"}
            </button>
          </>
        ) : null}
        {menu.type === "playlist" ? (
          <>
            <button className="song-context-action" type="button" onClick={() => onOpenPlaylist(menu.item)}>
              <ListMusic size={15} />
              Open Playlist
            </button>
            <button className="song-context-action" type="button" onClick={() => onPlayPlaylist(menu.item)}>
              <Play size={15} fill="currentColor" />
              Play Playlist
            </button>
            <button className="song-context-action" type="button" onClick={() => onEditPlaylist(menu.item)}>
              <Settings size={15} />
              Edit Details
            </button>
            <button className="song-context-action danger-context-action" type="button" onClick={() => onDeletePlaylist(menu.item)}>
              <Trash2 size={15} />
              Delete Playlist
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SongPlaylistMenu({
  menu,
  playlists,
  status,
  message,
  onAdd,
  onPlayNow,
  onPlayNext,
  onQueueSong,
  onOpenAlbum,
  onOpenArtist,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
}: {
  menu: Exclude<SongContextMenuState, null>;
  playlists: Playlist[];
  status: "idle" | "saving" | "error";
  message: string;
  onAdd: (playlist: Playlist) => void;
  onPlayNow: (song: Song) => void;
  onPlayNext: (song: Song) => void;
  onQueueSong: (song: Song) => void;
  onOpenAlbum: (song: Song) => void;
  onOpenArtist: (song: Song) => void;
  isFavorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: (favorite: boolean) => void;
}) {
  const sortedPlaylists = [...playlists].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div
      className="song-context-menu"
      style={{
        left: Math.min(menu.x, window.innerWidth - 280),
        top: Math.min(menu.y, window.innerHeight - 440),
      }}
      role="menu"
      aria-label={`Song actions for ${menu.song.title}`}
    >
      <div className="song-context-heading">
        <div>
          <p className="eyebrow">Song</p>
          <strong>{menu.song.title}</strong>
        </div>
      </div>
      {message ? <p className={`song-context-status ${status === "error" ? "bad" : ""}`}>{message}</p> : null}
      <div className="song-context-section">
        <button className="song-context-action" type="button" onClick={() => onPlayNow(menu.song)}>
          <Play size={15} fill="currentColor" />
          Play Now
        </button>
        <button className="song-context-action" type="button" onClick={() => onPlayNext(menu.song)}>
          <ListMusic size={15} />
          Play Next
        </button>
        <button className="song-context-action" type="button" onClick={() => onQueueSong(menu.song)}>
          <Plus size={15} />
          Add to Queue
        </button>
      </div>
      <div className="song-context-section">
        <button className="song-context-action" type="button" onClick={() => onOpenAlbum(menu.song)} disabled={!menu.song.albumId}>
          <Disc3 size={15} />
          Go to Album
        </button>
        <button className="song-context-action" type="button" onClick={() => onOpenArtist(menu.song)} disabled={!menu.song.artistId}>
          <UserRound size={15} />
          Go to Artist
        </button>
        <button className="song-context-action" type="button" onClick={() => onToggleFavorite(!isFavorite)} disabled={favoriteBusy}>
          {favoriteBusy ? <Loader2 size={15} className="spin" /> : <Star size={15} fill={isFavorite ? "currentColor" : "none"} />}
          {isFavorite ? "Remove Favorite" : "Add Favorite"}
        </button>
      </div>
      <div className="song-context-subheading">Add to playlist</div>
      {sortedPlaylists.length ? (
        <div className="song-context-list">
          {sortedPlaylists.map((playlist) => (
            <button
              type="button"
              role="menuitem"
              key={playlist.id}
              onClick={() => onAdd(playlist)}
              disabled={status === "saving"}
            >
              <ListMusic size={15} />
              <span>
                <strong>{playlist.name}</strong>
                <small>{getPlaylistMeta(playlist)}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="song-context-empty">Create a playlist first.</p>
      )}
    </div>
  );
}

function StateNotice({
  tone = "neutral",
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  tone?: "neutral" | "bad";
  icon: ReactNode;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className={`state-notice ${tone}`}>
      <span className="state-notice-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      {actionLabel && onAction ? (
        <button className="secondary-button compact-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

function LibraryLoadingSkeleton({ view }: { view: View }) {
  const rows = view === "overview" ? 6 : view === "albums" ? 12 : 10;

  return (
    <div className="loading-state" aria-label="Loading library">
      {view === "overview" ? (
        <div className="loading-hero">
          <div>
            <span className="skeleton-line short" />
            <span className="skeleton-line title" />
            <span className="skeleton-line medium" />
          </div>
          <span className="skeleton-cover-stack" />
        </div>
      ) : null}
      <div className={view === "albums" || view === "overview" ? "skeleton-grid" : "skeleton-list"}>
        {Array.from({ length: rows }, (_, index) => (
          <span className="skeleton-card" key={index} />
        ))}
      </div>
    </div>
  );
}

function EmptyPanel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="empty-panel">
      {icon}
      <p>{text}</p>
    </div>
  );
}

function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`status-badge ${status}`}>
      {status === "checking" ? <Loader2 size={14} className="spin" /> : null}
      {status === "connected" ? <CheckCircle2 size={14} /> : null}
      {status === "error" ? <AlertCircle size={14} /> : null}
      {status === "idle" ? <Settings size={14} /> : null}
      {status}
    </span>
  );
}
