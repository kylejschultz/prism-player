import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useQueryClient } from "@tanstack/react-query";
import { navidromeClient, navidromeKeys } from "./data/navidrome";
import type { CSSProperties, FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { deleteLibraryCatalog, readLibraryCatalog, writeLibraryCatalog } from "./libraryCatalog";
import { compareVersions, getCurrentReleaseNotes, getUnreadReleaseNotes, WHATS_NEW_RELEASES, type WhatsNewRelease } from "./whatsNew";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  CalendarDays,
  Check,
  Code2,
  Copy,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Disc3,
  Download,
  ExternalLink,
  Maximize2,
  History,
  Heart,
  Home,
  Info,
  Library,
  ListMusic,
  Loader2,
  Mic2,
  Music2,
  Pause,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RadioTower,
  RefreshCw,
  Repeat,
  Search,
  Send,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Star,
  Square,
  Trash2,
  Menu,
  MessageCircle,
  UserRound,
  Volume2,
  VolumeX,
  Waves,
  X,
} from "lucide-react";
import packageJson from "../package.json";

type LibraryViewMode = "overview" | "albums" | "artists" | "songs" | "playlists" | "recentlyAdded" | "recentlyPlayed" | "favorites";
type View = LibraryViewMode | "nowPlaying" | "radio" | "search" | "settings";
type SettingsTab = "connection" | "library" | "playback" | "appearance" | "radio" | "privacy" | "about" | "advanced";
type ColorTheme = "prism" | "ocean" | "orchid" | "evergreen";
type ConnectionStatus = "idle" | "checking" | "connected" | "error";
type LibraryStatus = "idle" | "loading" | "ready" | "error";
type CatalogStatus = "idle" | "hydrating" | "syncing" | "ready" | "stale" | "error";
type AlbumViewMode = "art" | "list";
type ArtistViewMode = "art" | "list";
type RepeatMode = "off" | "all" | "one";
type RightPanelTab = "queue" | "lyrics";
type LyricsStatus = "idle" | "loading" | "ready" | "empty" | "error";
type DiscordPresenceStatus = "idle" | "connecting" | "connected" | "unavailable";
type SongSortKey = "title" | "artist" | "album" | "duration" | "track";
type SongSortDirection = "asc" | "desc";

const LIBRARY_SCAN_POLL_INTERVAL_MS = 5 * 60 * 1000;
const MEDIA_SHORTCUTS = [
  ["MediaPlayPause", "toggle"],
  ["MediaTrackNext", "next"],
  ["MediaTrackPrevious", "previous"],
] as const;

type MediaShortcutAction = (typeof MEDIA_SHORTCUTS)[number][1];

function PrismDialog({
  open,
  onOpenChange,
  children,
  className = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={`modal-backdrop ${className}`.trim()} />
        <Dialog.Content asChild>{children}</Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PrismAlertDialog({
  open,
  onOpenChange,
  children,
  className = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={`modal-backdrop ${className}`.trim()} />
        <AlertDialog.Content asChild>{children}</AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function libraryCatalogKey(config: Pick<NavidromeConfig, "serverUrl" | "username">) {
  return `${normalizeServerUrl(config.serverUrl).toLowerCase()}::${config.username.trim().toLowerCase()}`;
}

type AvailableUpdate = {
  version: string;
  releaseUrl: string;
};

function shuffled<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function versionParts(version: string) {
  return version.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isVersionNewer(candidate: string, current: string) {
  const candidateParts = versionParts(candidate);
  const currentParts = versionParts(current);
  const length = Math.max(candidateParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    if ((candidateParts[index] ?? 0) !== (currentParts[index] ?? 0)) {
      return (candidateParts[index] ?? 0) > (currentParts[index] ?? 0);
    }
  }

  return false;
}

function isTauriDesktopApp() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isAppForegrounded() {
  return document.visibilityState === "visible" && document.hasFocus();
}

export type NavidromeConfig = {
  serverUrl: string;
  username: string;
  password: string;
};

type StoredNavidromeConfig = Omit<NavidromeConfig, "password"> & {
  // Present only in installations created before native credential storage.
  password?: string;
};

type AppSettings = {
  lastVolume: number;
  defaultAlbumView: AlbumViewMode;
  defaultArtistView: ArtistViewMode;
  analyticsEnabled: boolean;
  analyticsPromptDismissed: boolean;
  discordPresenceEnabled: boolean;
  updateDismissedVersion: string;
  lastSeenWhatsNewVersion: string;
  coverWashEnabled: boolean;
  colorTheme: ColorTheme;
  lowPerformanceMode: boolean;
  showSharedPlaylists: boolean;
  radioStationUrl: string;
  radioStationUrls: string[];
  radioStationNames: Record<string, string>;
  trackTransitionSeconds: number;
};

const colorThemes: Array<{ id: ColorTheme; label: string; description: string; swatches: [string, string, string] }> = [
  { id: "prism", label: "Prism", description: "Warm gold and ember", swatches: ["#f0d27b", "#be4d3b", "#429184"] },
  { id: "ocean", label: "Ocean", description: "Blue and sea-glass", swatches: ["#73c7f2", "#397ec4", "#5dc6b2"] },
  { id: "orchid", label: "Orchid", description: "Violet and rose", swatches: ["#d3a5f7", "#ba5b92", "#8765c5"] },
  { id: "evergreen", label: "Evergreen", description: "Fern and amber", swatches: ["#a9d88a", "#3f8b72", "#d3aa57"] },
];

export type Album = {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  year?: number;
};

export type Artist = {
  id: string;
  name: string;
  albumCount?: number;
};

export type ArtistInfo = {
  biography?: string;
  musicBrainzId?: string;
  lastFmUrl?: string;
  smallImageUrl?: string;
  mediumImageUrl?: string;
  largeImageUrl?: string;
  similarArtist?: Artist[];
};

export type LibraryData = {
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

export type SearchResults = {
  artists: Artist[];
  albums: Album[];
  songs: Song[];
  playlists: Playlist[];
};

export type Song = {
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

type ListeningSource =
  | { type: "album"; id: string; name: string; coverArt?: string; artist?: string }
  | { type: "playlist"; id: string; name: string; coverArt?: string };

type ListeningHistoryEntry = {
  id: string;
  song: Song;
  playedAt: string;
  playedSeconds: number;
  completed: boolean;
  source: ListeningSource | "library";
};

export type Playlist = {
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

export type AlbumDetail = Album & {
  song?: Song[];
};

export type PlaylistDetail = Playlist & {
  entry?: Song[];
};

export type ArtistDetail = Artist & {
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
  settingsTab?: SettingsTab;
};

type PrismHistoryState = {
  prismSnapshot: BrowserSnapshot;
};

type SongContextMenuState = {
  song: Song;
  songs: Song[];
} | null;

type LibraryContextMenuState =
  | { type: "album"; item: Album }
  | { type: "artist"; item: Artist }
  | { type: "playlist"; item: Playlist }
  | null;

export type FavoriteKind = "song" | "album" | "artist";
type FavoriteIds = {
  songs: Set<string>;
  albums: Set<string>;
  artists: Set<string>;
};
export type PlaylistDetailsUpdate = {
  name: string;
  comment: string;
  public: boolean;
};

export type LyricsPayload = {
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

export type RadioLikeStatus = {
  enabled?: boolean;
  songId?: string | null;
  liked?: boolean;
  count?: number;
  ok?: boolean;
  alreadyLiked?: boolean;
  error?: string;
};

export type RadioStationState = {
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
  stream?: { bufferSeconds?: number | null; bitrate?: number | string | null; format?: string | null; mount?: string | null };
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

export type RadioSessionPayload = {
  messages?: RadioSessionTurn[];
};

type RadioStationLocale = "en-GB" | "en-US";

type RadioSchedulePersona = { id?: string; name?: string; tagline?: string };
type RadioScheduleShow = { id?: string; name?: string; topic?: string; mood?: string; personaId?: string; guestPersonaIds?: string[] };

export type RadioSchedulePayload = {
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

type RadioRequestStatus = "pending" | "resolved" | "failed" | "unknown";

export type RadioRequestResult = {
  success: boolean;
  pending?: boolean;
  ack?: string;
  track?: RadioTrack;
  queuePosition?: number;
  requestId?: string;
  requestText?: string;
  message?: string;
  status?: RadioRequestStatus;
};

type RadioStatus = "idle" | "checking" | "ready" | "playing" | "error";

const STORAGE_KEY = "prism-player.navidrome";
const SETTINGS_KEY = "prism-player.settings";
const LAST_PLAYED_TRACK_KEY = "prism-player.lastPlayedTrack";
const PLAYBACK_STATE_KEY = "prism-player.playbackState";
const LISTENING_HISTORY_KEY = "prism-player.listeningHistory";
const RIGHT_PANEL_OPEN_KEY = "prism-player.rightPanelOpen";
const RIGHT_PANEL_TAB_KEY = "prism-player.rightPanelTab";
const SIDEBAR_COLLAPSED_KEY = "prism-player.sidebarCollapsed";
const SIDEBAR_WIDTH_KEY = "prism-player.sidebarWidth";
const SIDEBAR_MIN_WIDTH = 208;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 248;
const RIGHT_SIDEBAR_WIDTH_KEY = "prism-player.rightSidebarWidth";
const RIGHT_SIDEBAR_MIN_WIDTH = 280;
const RIGHT_SIDEBAR_MAX_WIDTH = 520;
const RIGHT_SIDEBAR_DEFAULT_WIDTH = 338;
const INSTALL_ID_KEY = "prism-player.installId";
const ANALYTICS_LAST_PING_KEY = "prism-player.analyticsLastPing";
const PRISM_RELEASES_URL = "https://github.com/kylejschultz/prism-player/releases/latest";
const PRISM_LATEST_RELEASE_API = "https://api.github.com/repos/kylejschultz/prism-player/releases/latest";
const PRISM_REPOSITORY_URL = "https://github.com/kylejschultz/prism-player";
const PRISM_DISCORD_URL = "https://discord.gg/hzeAqu7EwF";
const APP_VERSION = packageJson.version;
const APP_COMMIT_SHA = __APP_COMMIT_SHA__;
const BEACON_ENDPOINT = "https://beacon.kjschultz.com/ping";
const CLIENT_ID = "PrismPlayer";
const HAVE_FUTURE_DATA = 3;
const RADIO_RECONNECT_BASE_MS = 750;
const RADIO_RECONNECT_MAX_MS = 30_000;
const RADIO_REQUEST_POLL_INTERVAL_MS = 1500;
const RADIO_REQUEST_POLL_DEADLINE_MS = 60_000;
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
  analyticsEnabled: false,
  analyticsPromptDismissed: false,
  discordPresenceEnabled: false,
  updateDismissedVersion: "",
  lastSeenWhatsNewVersion: "",
  coverWashEnabled: true,
  colorTheme: "prism",
  lowPerformanceMode: false,
  showSharedPlaylists: true,
  radioStationUrl: "",
  radioStationUrls: [],
  radioStationNames: {},
  trackTransitionSeconds: 0,
};

const ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

type AlphaGroup<T> = {
  letter: string;
  items: T[];
};

function alphaSectionId(prefix: string, letter: string) {
  return `${prefix}-${letter === "#" ? "num" : letter}`;
}

function scrollElementWithin(container: HTMLElement, target: HTMLElement, block: "start" | "center" = "start") {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetTop = targetRect.top - containerRect.top + container.scrollTop;
  const offset = block === "center" ? (container.clientHeight - targetRect.height) / 2 : 52;

  container.scrollTo({
    top: Math.max(0, targetTop - offset),
    behavior: "smooth",
  });
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
    songs: "Songs",
    playlists: "Playlists",
    recentlyAdded: "Recently Added",
    recentlyPlayed: "Recently Played",
    favorites: "Favorites",
    nowPlaying: "Now Playing",
    radio: "Radio",
    search: "Search",
    settings: "Settings",
  };

  return labels[view];
}

function getSettingsTabLabel(tab: SettingsTab) {
  const labels: Record<SettingsTab, string> = {
    connection: "Connection",
    library: "Library",
    playback: "Playback",
    appearance: "Appearance",
    radio: "Radio",
    privacy: "Privacy",
    about: "About",
    advanced: "Advanced",
  };

  return labels[tab];
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

function readStoredConfig(): StoredNavidromeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredNavidromeConfig;
    if (!parsed.serverUrl || !parsed.username) return null;
    return {
      serverUrl: parsed.serverUrl,
      username: parsed.username,
      password: parsed.password,
    };
  } catch {
    return null;
  }
}

function loadStoredConfig(): NavidromeConfig | null {
  // Browser previews deliberately do not persist a Navidrome password.
  return null;
}

function writeStoredConfig(config: NavidromeConfig) {
  const stored: StoredNavidromeConfig = { serverUrl: config.serverUrl, username: config.username };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

async function storeNativePassword(password: string) {
  if (!isTauriDesktopApp()) return;
  await invoke("set_navidrome_password", { password });
}

async function clearNativePassword() {
  if (!isTauriDesktopApp()) return;
  await invoke("clear_navidrome_password");
}

async function loadNativeStoredConfig(): Promise<NavidromeConfig | null> {
  const stored = readStoredConfig();
  if (!stored) return null;

  if (!isTauriDesktopApp()) return null;

  const password = await invoke<string | null>("get_navidrome_password");
  if (password) return { ...stored, password };

  // One-time migration for versions that saved the password in localStorage.
  if (!stored.password) return null;
  await storeNativePassword(stored.password);
  writeStoredConfig({ ...stored, password: stored.password });
  return { ...stored, password: stored.password };
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

function normalizeRadioStationNames(values: Record<string, string> | undefined, stations: string[]) {
  const names: Record<string, string> = {};

  Object.entries(values ?? {}).forEach(([stationUrl, name]) => {
    const origin = normalizeStationUrl(stationUrl);
    const normalizedName = name.trim();
    if (origin && stations.includes(origin) && normalizedName) names[origin] = normalizedName;
  });

  return names;
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
      analyticsEnabled: Boolean(parsed.analyticsEnabled),
      analyticsPromptDismissed: Boolean(parsed.analyticsPromptDismissed),
      discordPresenceEnabled: Boolean(parsed.discordPresenceEnabled),
      updateDismissedVersion: typeof parsed.updateDismissedVersion === "string" ? parsed.updateDismissedVersion : "",
      lastSeenWhatsNewVersion: typeof parsed.lastSeenWhatsNewVersion === "string" ? parsed.lastSeenWhatsNewVersion : "",
      coverWashEnabled: parsed.coverWashEnabled ?? defaultSettings.coverWashEnabled,
      colorTheme: colorThemes.some((theme) => theme.id === parsed.colorTheme) ? parsed.colorTheme as ColorTheme : defaultSettings.colorTheme,
      lowPerformanceMode: Boolean(parsed.lowPerformanceMode),
      showSharedPlaylists: parsed.showSharedPlaylists ?? defaultSettings.showSharedPlaylists,
      radioStationUrl: activeStation || radioStationUrls[0] || defaultSettings.radioStationUrl,
      radioStationUrls,
      radioStationNames: normalizeRadioStationNames(parsed.radioStationNames, radioStationUrls),
      trackTransitionSeconds: clampNumber(Number(parsed.trackTransitionSeconds ?? defaultSettings.trackTransitionSeconds), 0, 12),
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

async function getRuntimeArch() {
  if (!isTauriDesktopApp()) return "unknown";

  try {
    const architecture = await invoke<string>("get_native_architecture");
    if (architecture === "arm64" || architecture === "x64") return architecture;
  } catch {
    // Analytics stays best-effort when native runtime details are unavailable.
  }

  return "unknown";
}

function isDevRuntime() {
  return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
}

function getLibraryStats(libraryData?: LibraryData) {
  if (!libraryData) return {};

  return {
    artist_count: libraryData.artists.length,
    album_count: libraryData.albums.length,
    song_count: libraryData.albums.reduce((total, album) => total + (album.songCount ?? 0), 0),
  };
}

async function sendAnalyticsPing(libraryData?: LibraryData) {
  const isDev = isDevRuntime();

  await fetch(BEACON_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project: "prism-player",
      install_id: getInstallId(),
      version: APP_VERSION,
      arch: await getRuntimeArch(),
      timestamp: new Date().toISOString(),
      channel: isDev ? "dev" : "release",
      os: getRuntimePlatform(),
      dev: isDev,
      ...getLibraryStats(libraryData),
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

function loadListeningHistory(): ListeningHistoryEntry[] {
  try {
    const raw = localStorage.getItem(LISTENING_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is ListeningHistoryEntry => {
      if (!entry || typeof entry !== "object") return false;
      const value = entry as Partial<ListeningHistoryEntry>;
      return (
        typeof value.id === "string" &&
        isStoredSong(value.song) &&
        typeof value.playedAt === "string" &&
        Number.isFinite(value.playedSeconds) &&
        typeof value.completed === "boolean" &&
        (value.source === "library" || isListeningSource(value.source))
      );
    });
  } catch {
    return [];
  }
}

function isListeningSource(source: unknown): source is ListeningSource {
  if (!source || typeof source !== "object") return false;
  const value = source as Partial<ListeningSource>;
  return (value.type === "album" || value.type === "playlist") && typeof value.id === "string" && typeof value.name === "string";
}

function albumListeningSource(song: Song): ListeningSource | "library" {
  return song.albumId && song.album
    ? { type: "album", id: song.albumId, name: song.album, coverArt: song.coverArt, artist: song.artist }
    : "library";
}

function createListeningHistoryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `listen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

function loadStoredNumber(key: string, fallback: number, min: number, max: number) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? clampNumber(value, min, max) : fallback;
  } catch {
    return fallback;
  }
}

function loadStoredRightPanelTab(): RightPanelTab {
  try {
    const storedTab = localStorage.getItem(RIGHT_PANEL_TAB_KEY);
    return storedTab === "lyrics" ? storedTab : "queue";
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

function normalizeRadioTrackMetadata(track: RadioTrack): RadioTrack {
  const artist = track.artist?.trimEnd();
  const title = track.title?.trim();

  // Some station metadata sources split a parenthesized feature credit at its
  // opening parenthesis, producing `Artist (` and `Title feat. Guest)`. Put
  // that credit back with the artist before rendering it anywhere in Prism.
  const splitFeature = artist?.endsWith("(") && title?.match(/^(.+?)\s+((?:feat\.?|ft\.?|featuring)\s+.+)\)$/i);
  if (!splitFeature) return track;

  return {
    ...track,
    artist: `${artist} ${splitFeature[2]})`,
    title: splitFeature[1]?.trim() ?? title,
  };
}

function normalizeRadioTracks(tracks: RadioTrack[] | undefined) {
  return tracks?.map(normalizeRadioTrackMetadata);
}

function normalizeRadioStateMetadata(state: RadioStationState): RadioStationState {
  return {
    ...state,
    nowPlaying: state.nowPlaying ? normalizeRadioTrackMetadata(state.nowPlaying) : state.nowPlaying,
    now_playing: state.now_playing ? normalizeRadioTrackMetadata(state.now_playing) : state.now_playing,
    current: state.current ? normalizeRadioTrackMetadata(state.current) : state.current,
    track: state.track ? normalizeRadioTrackMetadata(state.track) : state.track,
    upcoming: normalizeRadioTracks(state.upcoming),
    history: normalizeRadioTracks(state.history),
    queue: Array.isArray(state.queue)
      ? normalizeRadioTracks(state.queue)
      : state.queue
        ? {
            ...state.queue,
            current: state.queue.current ? normalizeRadioTrackMetadata(state.queue.current) : state.queue.current,
            upcoming: normalizeRadioTracks(state.queue.upcoming),
          }
        : state.queue,
  };
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

function formatRadioStreamLabel(bitrate: number | string | null | undefined, format: string | null | undefined) {
  const rawFormat = format?.trim().toLowerCase();
  const normalizedFormat = !rawFormat || rawFormat === "audio/mpeg" || rawFormat === "mpeg" ? "MP3" : rawFormat.toUpperCase();
  if (bitrate == null || bitrate === "") return normalizedFormat;

  const parsedBitrate = typeof bitrate === "string" ? Number.parseFloat(bitrate) : bitrate;
  const bitrateText =
    Number.isFinite(parsedBitrate)
      ? `${parsedBitrate > 1000 ? Math.round(parsedBitrate / 1000) : parsedBitrate} kbps`
      : String(bitrate).replace(/\s*kbps$/i, " kbps");
  return `${normalizedFormat} / ${bitrateText}`;
}

function radioStationName(state: RadioStationState | null, stationUrl: string, savedName?: string) {
  return (
    savedName ||
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

function radioBoothTurnKey(turn: RadioSessionTurn) {
  return `${turn.t ?? ""}:${turn.role ?? ""}:${turn.kind ?? ""}:${turn.text ?? ""}`;
}

function radioSpokenBoothLines(session: RadioSessionPayload | null) {
  return (session?.messages ?? []).filter((turn) => turn.role === "segment" && Boolean(turn.text?.trim()));
}

function mergeRadioBoothHistory(previous: RadioSessionTurn[], session: RadioSessionPayload | null) {
  const seen = new Set(previous.map(radioBoothTurnKey));
  const next = [...previous];

  for (const turn of radioSpokenBoothLines(session)) {
    const key = radioBoothTurnKey(turn);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(turn);
  }

  return next.slice(-24);
}

function radioScheduleItems(schedule: RadioSchedulePayload | null, nowMs: number) {
  if (!schedule?.schedule) return [];
  const { day, hour } = zonedDayHour(new Date(nowMs), schedule.timezone);
  const shows = schedule.shows ?? [];
  const personas = schedule.personas ?? [];
  const locale = schedule.locale ?? "en-US";
  const items: Array<{
    key: string;
    time: string;
    showName: string;
    djName: string;
    detail: string;
    isCurrent: boolean;
  }> = [];
  let previousShowId: string | null | undefined = undefined;

  for (let offset = 0; offset < 24 && items.length < 4; offset += 1) {
    const absoluteHour = hour + offset;
    const nextDay = (day + Math.floor(absoluteHour / 24)) % 7;
    const nextHour = absoluteHour % 24;
    const dayGrid = radioScheduleDay(schedule, nextDay);
    const showId = Array.isArray(dayGrid) ? dayGrid[nextHour] ?? null : null;
    if (!showId || showId === previousShowId) {
      previousShowId = showId;
      continue;
    }

    const show = shows.find((candidate) => candidate.id === showId);
    const persona = show?.personaId ? personas.find((candidate) => candidate.id === show.personaId) : null;
    const detail = offset === 0 ? persona?.tagline || show?.mood || "" : "";
    items.push({
      key: `${nextDay}-${nextHour}-${showId}`,
      time: offset === 0 ? "Now" : formatStationHour(nextHour, locale),
      showName: show?.name ?? "Autonomous",
      djName: persona?.name ?? "",
      detail,
      isCurrent: offset === 0,
    });
    previousShowId = showId;
  }

  return items;
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
  if (match?.index) {
    return {
      main: title.slice(0, match.index).trim(),
      feature: match[1]?.trim() ?? "",
    };
  }

  const liveParenthetical = title.match(/\s+(\((?=[^)]*\blive\b)[^)]+\))$/i);
  if (liveParenthetical?.index) {
    return {
      main: title.slice(0, liveParenthetical.index).trim(),
      feature: liveParenthetical[1]?.replace(/^\((.*)\)$/, "$1").trim() ?? "",
    };
  }

  const liveSuffix = title.match(/\s+(?:[-–—]\s*)?((?:live)(?:\s+(?:at|from|in)\b)?.+)$/i);
  if (liveSuffix?.index) {
    return {
      main: title.slice(0, liveSuffix.index).trim(),
      feature: liveSuffix[1]?.trim() ?? "",
    };
  }

  const parentheticalSuffix = title.match(/\s+((?:\([^)]*\)\s*)+)$/);
  if (parentheticalSuffix?.index) {
    const qualifiers = [...parentheticalSuffix[1].matchAll(/\(([^)]*)\)/g)]
      .map((match) => match[1]?.trim())
      .filter((qualifier): qualifier is string => Boolean(qualifier));
    if (qualifiers.length) {
      return {
        main: title.slice(0, parentheticalSuffix.index).trim(),
        feature: qualifiers.join(" · "),
      };
    }
  }

  return {
    main: title,
    feature: "",
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

async function submitRadioRequest(stationUrl: string, text: string, name: string): Promise<RadioRequestResult> {
  const origin = normalizeStationUrl(stationUrl);
  if (!origin) throw new Error("Enter a valid Subwave station URL.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(buildRadioApiUrl(origin, "request"), {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, name }),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as Partial<RadioRequestResult> & { error?: string };
    if (!response.ok) {
      return { success: false, message: data.message ?? data.error ?? "The booth could not take that request." };
    }
    return data as RadioRequestResult;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchRadioRequestStatus(stationUrl: string, requestId: string): Promise<RadioRequestResult | null> {
  const origin = normalizeStationUrl(stationUrl);
  if (!origin) throw new Error("Enter a valid Subwave station URL.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(buildRadioApiUrl(origin, `request/${encodeURIComponent(requestId)}`), {
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 404) return { success: false, status: "unknown" };
    return (await response.json()) as RadioRequestResult;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchRadioLikeStatus(stationUrl: string): Promise<RadioLikeStatus | null> {
  const origin = normalizeStationUrl(stationUrl);
  if (!origin) return null;

  try {
    const response = await fetch(buildRadioApiUrl(origin, "like"), { cache: "no-store" });
    return (await response.json()) as RadioLikeStatus;
  } catch {
    return null;
  }
}

async function submitRadioLike(stationUrl: string, songId: string): Promise<RadioLikeStatus | null> {
  const origin = normalizeStationUrl(stationUrl);
  if (!origin || !songId) return null;

  try {
    const response = await fetch(buildRadioApiUrl(origin, "like"), {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId }),
    });
    return (await response.json()) as RadioLikeStatus;
  } catch {
    return null;
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

  if (!nowPlayingResponse) return normalizeRadioStateMetadata(state);

  const stateTrack = firstRadioTrack(state);
  const nowPlaying = nowPlayingResponse.nowPlaying ?? null;
  const mergedNowPlaying = nowPlaying && stateTrack && sameRadioTrack(stateTrack, nowPlaying) ? { ...stateTrack, ...nowPlaying } : nowPlaying;

  return normalizeRadioStateMetadata({
    ...state,
    nowPlaying: mergedNowPlaying,
    nowPlayingKnown: true,
    context: nowPlayingResponse.context ?? state.context,
    dj: nowPlayingResponse.dj ?? state.dj,
    activeShow: nowPlayingResponse.activeShow ?? state.activeShow,
    listeners: nowPlayingResponse.listeners ?? state.listeners,
    stream: nowPlayingResponse.stream ?? state.stream,
    streamOnline: nowPlayingResponse.streamOnline ?? state.streamOnline,
  });
}

// Transitional compatibility helpers. New call sites use data/navidrome.ts;
// this block will be deleted once #118's persistent catalog lands on top of it.
/* eslint-disable @typescript-eslint/no-unused-vars */
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

async function fetchNavidromeProfileName(config: NavidromeConfig) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${normalizeServerUrl(config.serverUrl)}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: config.username, password: config.password }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);

    const profile = (await response.json()) as { name?: string };
    return profile.name?.trim() ?? "";
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

type NavidromeScanStatus = {
  scanning?: boolean;
  lastScan?: string | number;
};

async function fetchNavidromeScanStatus(config: NavidromeConfig): Promise<NavidromeScanStatus | null> {
  const response = await navidromeRequest<{ scanStatus?: NavidromeScanStatus }>(config, "getScanStatus");
  return response.scanStatus ?? null;
}

function scanTimestamp(lastScan: NavidromeScanStatus["lastScan"]) {
  if (lastScan == null) return null;
  return String(lastScan);
}

function scanHasAdvanced(previous: string, next: string) {
  const previousTime = Number.isFinite(Number(previous)) ? Number(previous) : Date.parse(previous);
  const nextTime = Number.isFinite(Number(next)) ? Number(next) : Date.parse(next);

  if (Number.isFinite(previousTime) && Number.isFinite(nextTime)) return nextTime > previousTime;
  return previous !== next;
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

async function fetchSongLibrary(
  config: NavidromeConfig,
  albums: Album[],
  onProgress?: (completed: number, total: number) => void,
  onSongs?: (songs: Song[]) => void,
) {
  const songs: Song[] = [];
  const batchSize = 10;

  for (let index = 0; index < albums.length; index += batchSize) {
    const batch = albums.slice(index, index + batchSize);
    const details = await Promise.all(batch.map((album) => fetchAlbumDetail(config, album.id)));
    songs.push(...details.flatMap((album) => album.song ?? []));
    onProgress?.(Math.min(index + batch.length, albums.length), albums.length);
    onSongs?.(sortSongs(songs, "title", "asc"));
  }

  return songs.sort((left, right) => `${left.title}\u0000${left.artist ?? ""}`.localeCompare(`${right.title}\u0000${right.artist ?? ""}`));
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

/* eslint-enable @typescript-eslint/no-unused-vars */
function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "-:--";
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function sortSongs(songs: Song[], key: SongSortKey, direction: SongSortDirection) {
  const factor = direction === "asc" ? 1 : -1;
  return [...songs].sort((left, right) => {
    if (key === "duration") return ((left.duration ?? 0) - (right.duration ?? 0)) * factor;
    if (key === "track") {
      return (
        getSongDisc(left) - getSongDisc(right)
        || getSongTrack(left) - getSongTrack(right)
        || left.title.localeCompare(right.title)
      ) * factor;
    }
    const leftValue = key === "title" ? left.title : left[key] ?? "";
    const rightValue = key === "title" ? right.title : right[key] ?? "";
    return leftValue.localeCompare(rightValue, undefined, { sensitivity: "base" }) * factor;
  });
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
  if (snapshot.activeView === "settings") return `${getViewLabel(snapshot.activeView)} / ${getSettingsTabLabel(snapshot.settingsTab ?? "connection")}`;
  return getViewLabel(snapshot.activeView);
}

function snapshotEquals(left: BrowserSnapshot | null, right: BrowserSnapshot | null) {
  if (!left || !right) return left === right;

  return (
    left.activeView === right.activeView &&
    (left.settingsTab ?? "connection") === (right.settingsTab ?? "connection") &&
    left.detailSelection?.type === right.detailSelection?.type &&
    left.detailSelection?.data.id === right.detailSelection?.data.id
  );
}

export function App() {
  const queryClient = useQueryClient();
  const [initialPlaybackSnapshot] = useState(() => loadPlaybackSnapshot());
  const [activeView, setActiveView] = useState<View>("overview");
  const [config, setConfig] = useState<NavidromeConfig | null>(() => loadStoredConfig());
  const [form, setForm] = useState<NavidromeConfig>(() => loadStoredConfig() ?? emptyConfig);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadStoredSettings());
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.prismTheme = appSettings.colorTheme;
  }, [appSettings.colorTheme]);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<"idle" | "checking" | "up-to-date" | "available" | "error">("idle");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Add a Navidrome server to start syncing.");
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>(() => (loadStoredConfig() ? "loading" : "idle"));
  const [libraryData, setLibraryData] = useState<LibraryData>(emptyLibraryData);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>(() => (loadStoredConfig() ? "hydrating" : "idle"));
  const [catalogProgress, setCatalogProgress] = useState<{ completed: number; total: number } | null>(null);
  const [listenerName, setListenerName] = useState("");
  const [songLibrary, setSongLibrary] = useState<Song[]>([]);
  const [songLibraryStatus, setSongLibraryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [listeningHistory, setListeningHistory] = useState<ListeningHistoryEntry[]>(() => loadListeningHistory());
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
  const [sidebarWidth, setSidebarWidth] = useState(() => loadStoredNumber(
    SIDEBAR_WIDTH_KEY,
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MIN_WIDTH,
    SIDEBAR_MAX_WIDTH,
  ));
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => loadStoredNumber(
    RIGHT_SIDEBAR_WIDTH_KEY,
    RIGHT_SIDEBAR_DEFAULT_WIDTH,
    RIGHT_SIDEBAR_MIN_WIDTH,
    RIGHT_SIDEBAR_MAX_WIDTH,
  ));
  const [albumViewMode, setAlbumViewMode] = useState<AlbumViewMode>(() => loadStoredSettings().defaultAlbumView);
  const [artistViewMode, setArtistViewMode] = useState<ArtistViewMode>(() => loadStoredSettings().defaultArtistView);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("connection");
  const [queue, setQueue] = useState<Song[]>(() => initialPlaybackSnapshot?.queue ?? []);
  const [sourceQueue, setSourceQueue] = useState<Song[]>(() => initialPlaybackSnapshot?.queue ?? []);
  const [currentIndex, setCurrentIndex] = useState(() => initialPlaybackSnapshot?.currentIndex ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePlaybackSource, setActivePlaybackSource] = useState<"local" | "radio">("local");
  const [playlistPlaybackSource, setPlaylistPlaybackSource] = useState<Playlist | null>(null);
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
  const [radioBoothHistory, setRadioBoothHistory] = useState<RadioSessionTurn[]>([]);
  const [radioSchedule, setRadioSchedule] = useState<RadioSchedulePayload | null>(null);
  const [radioStatus, setRadioStatus] = useState<RadioStatus>("idle");
  const [radioMessage, setRadioMessage] = useState(appSettings.radioStationUrl ? "Ready to tune in." : "Add a Subwave station URL to start.");
  const [radioVolume, setRadioVolume] = useState(appSettings.lastVolume);
  const [isMuted, setIsMuted] = useState(false);
  const [radioClockNow, setRadioClockNow] = useState(() => Date.now());
  const [radioPopover, setRadioPopover] = useState<"schedule" | "request" | "booth" | null>(null);
  const [radioLikeStatus, setRadioLikeStatus] = useState<RadioLikeStatus | null>(null);
  const [radioLikeBusy, setRadioLikeBusy] = useState(false);
  const [suppressLocalFooter, setSuppressLocalFooter] = useState(false);
  const [isRadioTuning, setIsRadioTuning] = useState(false);
  const [draggedQueueIndex, setDraggedQueueIndex] = useState<number | null>(null);
  const [dragOverQueueIndex, setDragOverQueueIndex] = useState<number | null>(null);
  const [playlistCreatorOpen, setPlaylistCreatorOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistPublic, setPlaylistPublic] = useState(false);
  const [playlistFromQueue, setPlaylistFromQueue] = useState(true);
  const [playlistSeedSongs, setPlaylistSeedSongs] = useState<Song[] | null>(null);
  const [playlistCreateStatus, setPlaylistCreateStatus] = useState<"idle" | "saving" | "error">("idle");
  const [playlistCreateMessage, setPlaylistCreateMessage] = useState("");
  const [sidebarPlaylistMenuOpen, setSidebarPlaylistMenuOpen] = useState(false);
  const [songContextMenu, setSongContextMenu] = useState<SongContextMenuState>(null);
  const [libraryContextMenu, setLibraryContextMenu] = useState<LibraryContextMenuState>(null);
  const [playlistDeleteTarget, setPlaylistDeleteTarget] = useState<Playlist | null>(null);
  const [playlistDeleteStatus, setPlaylistDeleteStatus] = useState<"idle" | "saving" | "error">("idle");
  const [playlistDeleteMessage, setPlaylistDeleteMessage] = useState("");
  const [playlistEditRequestKey, setPlaylistEditRequestKey] = useState(0);
  const [playlistAddStatus, setPlaylistAddStatus] = useState<"idle" | "saving" | "error">("idle");
  const [playlistAddMessage, setPlaylistAddMessage] = useState("");
  const [favoriteBusyKey, setFavoriteBusyKey] = useState("");
  const primaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const secondaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const [activeAudioSlot, setActiveAudioSlot] = useState<0 | 1>(0);
  const transitionInProgressRef = useRef(false);
  const transitionGenerationRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const [transitionCompleteNonce, setTransitionCompleteNonce] = useState(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const radioAudioRef = useRef<HTMLAudioElement | null>(null);
  const radioPromoteTimerRef = useRef<number | null>(null);
  const radioWatchdogTimerRef = useRef<number | null>(null);
  const radioRetryCountRef = useRef(0);
  const radioGenerationRef = useRef(0);
  const radioWatchdogArmedAtRef = useRef(0);
  const scrobbledPlayRef = useRef("");
  const locallyRecordedPlayRef = useRef("");
  const pendingResumePositionRef = useRef(initialPlaybackSnapshot?.position ?? 0);
  const lastPlaybackPersistRef = useRef(0);
  const lastPlaybackPersistTrackRef = useRef("");
  const lastLibraryScanRef = useRef<string | null>(null);
  const libraryScanWasInProgressRef = useRef(false);
  const libraryScanCheckInFlightRef = useRef(false);
  const libraryRefreshInFlightRef = useRef(false);
  const libraryRefreshGenerationRef = useRef(0);
  const desktopNotificationTimesRef = useRef(new Map<string, number>());
  const mediaShortcutHandlerRef = useRef<(action: MediaShortcutAction) => void>(() => undefined);
  const lastBackgroundTrackRef = useRef<string | null>(null);
  const libraryDataRef = useRef<LibraryData>(emptyLibraryData);
  const catalogSongsCompleteRef = useRef(false);
  const catalogSongSyncInFlightRef = useRef(false);
  const catalogHydratedKeyRef = useRef("");
  const trackpadNavigationRef = useRef({ accumulatedDeltaX: 0, lastEventAt: 0, consumed: false });
  const [discordPresenceSyncNonce, setDiscordPresenceSyncNonce] = useState(0);
  const [discordPresenceStatus, setDiscordPresenceStatus] = useState<DiscordPresenceStatus>("idle");
  const navigationStateRef = useRef({
    snapshot: { activeView, detailSelection, settingsTab } satisfies BrowserSnapshot,
    backStack,
    forwardStack,
  });

  navigationStateRef.current = {
    snapshot: { activeView, detailSelection, settingsTab },
    backStack,
    forwardStack,
  };

  const currentReleaseNotes = useMemo(() => getCurrentReleaseNotes(APP_VERSION), []);
  const unreadReleaseNotes = useMemo(
    () => getUnreadReleaseNotes(APP_VERSION, appSettings.lastSeenWhatsNewVersion),
    [appSettings.lastSeenWhatsNewVersion],
  );
  const whatsNewReleases = unreadReleaseNotes.length ? unreadReleaseNotes : currentReleaseNotes ? [currentReleaseNotes] : [];

  useEffect(() => {
    if (unreadReleaseNotes.length) setWhatsNewOpen(true);
  }, [unreadReleaseNotes]);

  useEffect(() => {
    window.history.replaceState({ prismSnapshot: navigationStateRef.current.snapshot } satisfies PrismHistoryState, "");

    const handlePopState = (event: PopStateEvent) => {
      const target = (event.state as PrismHistoryState | null)?.prismSnapshot;
      if (!target) return;

      const { snapshot, backStack: currentBackStack, forwardStack: currentForwardStack } = navigationStateRef.current;
      if (snapshotEquals(snapshot, target)) return;

      if (snapshotEquals(currentBackStack[currentBackStack.length - 1] ?? null, target)) {
        setBackStack(currentBackStack.slice(0, -1));
        setForwardStack([snapshot, ...currentForwardStack].slice(0, 40));
      } else if (snapshotEquals(currentForwardStack[0] ?? null, target)) {
        setBackStack([...currentBackStack, snapshot].slice(-40));
        setForwardStack(currentForwardStack.slice(1));
      } else {
        setBackStack([]);
        setForwardStack([]);
      }

      setActiveView(target.activeView);
      setDetailSelection(target.detailSelection);
      if (target.settingsTab) setSettingsTab(target.settingsTab);
      setDetailStatus("idle");
      setDetailMessage("");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const hasConfig = Boolean(config);
  const currentTrack = queue[currentIndex] ?? null;
  const currentTrackCoverUrl = config && currentTrack ? buildCoverArtUrl(config, currentTrack.coverArt, "160") : null;
  const radioStationUrl = normalizeStationUrl(appSettings.radioStationUrl);
  const radioNowPlaying = firstRadioTrack(radioStationState);
  const radioNowPlayingSongId = radioNowPlaying?.subsonic_id ? String(radioNowPlaying.subsonic_id) : "";
  const radioUpcoming = upcomingRadioTracks(radioStationState);
  const radioHistory = previousRadioTracks(radioStationState);
  const isRadioPlaying = radioStatus === "playing";
  const isRadioPresentation = isRadioPlaying || isRadioTuning;
  const radioElapsed = isRadioPlaying ? radioTrackElapsedSeconds(radioNowPlaying, radioStationState, radioClockNow) : 0;
  const radioCoverUrl = buildRadioCoverUrl(radioStationUrl, radioNowPlaying);
  const footerTrack = isRadioPresentation || suppressLocalFooter ? null : currentTrack ?? lastPlayedTrack;
  const footerTrackCoverUrl = config && footerTrack ? buildCoverArtUrl(config, footerTrack.coverArt, "160") : null;
  const visualEffectsEnabled = !appSettings.lowPerformanceMode;
  const personalPlaylists = useMemo(
    () => libraryData.playlists
      .filter((playlist) => !playlist.owner || playlist.owner.localeCompare(config?.username ?? "", undefined, { sensitivity: "accent" }) === 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [config?.username, libraryData.playlists],
  );
  const sharedPlaylists = useMemo(
    () => libraryData.playlists
      .filter((playlist) => playlist.owner && playlist.owner.localeCompare(config?.username ?? "", undefined, { sensitivity: "accent" }) !== 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [config?.username, libraryData.playlists],
  );

  async function notifyDesktop(key: string, title: string, body: string, cooldownMs = 15_000) {
    if (!isTauriDesktopApp() || isAppForegrounded()) return;

    const now = Date.now();
    const lastNotification = desktopNotificationTimesRef.current.get(key) ?? 0;
    if (now - lastNotification < cooldownMs) return;

    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (!granted) return;
      if (isAppForegrounded()) return;

      desktopNotificationTimesRef.current.set(key, now);
      sendNotification({ title, body });
    } catch {
      // Native notifications are optional: preview builds and restricted OS
      // notification settings must never interrupt playback.
    }
  }
  const coverWashUrl = appSettings.coverWashEnabled && visualEffectsEnabled
    ? isRadioPlaying
      ? radioCoverUrl
      : isPlaying && config && currentTrack
        ? buildCoverArtUrl(config, currentTrack.coverArt, "900")
        : null
    : null;

  useEffect(() => {
    let cancelled = false;

    setRadioLikeStatus(null);
    if (!isRadioPlaying || !radioStationUrl || !radioNowPlayingSongId) return;

    void fetchRadioLikeStatus(radioStationUrl).then((status) => {
      if (cancelled) return;
      if (status?.songId && status.songId !== radioNowPlayingSongId) return;
      setRadioLikeStatus(status);
    });

    return () => {
      cancelled = true;
    };
  }, [isRadioPlaying, radioNowPlayingSongId, radioStationUrl]);
  const currentStreamUrl = config && currentTrack ? buildStreamUrl(config, currentTrack.id) : null;
  const nextTrack = currentIndex < queue.length - 1 ? queue[currentIndex + 1] : null;
  const nextStreamUrl = config && nextTrack ? buildStreamUrl(config, nextTrack.id) : null;

  function getActiveAudio() {
    return activeAudioSlot === 0 ? primaryAudioRef.current : secondaryAudioRef.current;
  }

  function getStandbyAudio() {
    return activeAudioSlot === 0 ? secondaryAudioRef.current : primaryAudioRef.current;
  }

  function clearTrackTransitionTimer() {
    if (transitionTimerRef.current != null) {
      window.clearInterval(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }

  function stopTrackTransition(pauseAll = false) {
    transitionGenerationRef.current += 1;
    clearTrackTransitionTimer();
    transitionInProgressRef.current = false;
    const activeAudio = getActiveAudio();
    if (activeAudio) activeAudio.volume = volumeRef.current;
    [primaryAudioRef.current, secondaryAudioRef.current].forEach((audio) => {
      if (audio && (pauseAll || audio !== activeAudio)) {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
      }
    });
  }

  useEffect(() => () => {
    if (transitionTimerRef.current != null) window.clearInterval(transitionTimerRef.current);
  }, []);

  function recordListeningHistory(completed = false, seconds = position) {
    if (!currentTrack || !Number.isFinite(seconds) || seconds < 5) return;

    const playKey = `${currentTrack.id}:${currentStreamUrl ?? ""}`;
    if (locallyRecordedPlayRef.current.startsWith(`${playKey}:`)) {
      const entryId = locallyRecordedPlayRef.current.slice(playKey.length + 1);
      setListeningHistory((previous) => {
        const next = previous.map((entry) =>
          entry.id === entryId
            ? { ...entry, playedSeconds: Math.max(entry.playedSeconds, Math.round(seconds)), completed: entry.completed || completed }
            : entry,
        );
        localStorage.setItem(LISTENING_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
      return;
    }

    const entry: ListeningHistoryEntry = {
      id: createListeningHistoryId(),
      song: currentTrack,
      playedAt: new Date().toISOString(),
      playedSeconds: Math.round(seconds),
      completed,
      source: playlistPlaybackSource
        ? { type: "playlist", id: playlistPlaybackSource.id, name: playlistPlaybackSource.name }
        : albumListeningSource(currentTrack),
    };
    locallyRecordedPlayRef.current = `${playKey}:${entry.id}`;

    setListeningHistory((previous) => {
      const next = [entry, ...previous].slice(0, 250);
      localStorage.setItem(LISTENING_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }

  function clearListeningHistory() {
    setListeningHistory([]);
    localStorage.removeItem(LISTENING_HISTORY_KEY);
  }
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
    const displayedQueue = useMemo(
      () => queue.map((song, index) => ({ song, index })).slice(Math.max(currentIndex, 0)),
      [currentIndex, queue],
    );
  function normalizeAppSettings(nextSettings: AppSettings) {
    const radioStationUrls = normalizeRadioStationList([...nextSettings.radioStationUrls, nextSettings.radioStationUrl]);
    const activeStation = normalizeStationUrl(nextSettings.radioStationUrl) || radioStationUrls[0] || "";

    return {
      ...nextSettings,
      lastVolume: clampNumber(nextSettings.lastVolume, 0, 1),
      trackTransitionSeconds: clampNumber(nextSettings.trackTransitionSeconds, 0, 12),
      radioStationUrl: activeStation,
      radioStationUrls: radioStationUrls.includes(activeStation) ? radioStationUrls : normalizeRadioStationList([activeStation, ...radioStationUrls]),
      radioStationNames: normalizeRadioStationNames(nextSettings.radioStationNames, radioStationUrls),
    };
  }

  function updateAppSettings(nextSettings: AppSettings) {
    const normalizedSettings = normalizeAppSettings(nextSettings);

    setAppSettings(normalizedSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizedSettings));
  }

  function dismissWhatsNew() {
    updateAppSettings({ ...appSettings, lastSeenWhatsNewVersion: APP_VERSION });
    setWhatsNewOpen(false);
  }

  function saveRadioStation(origin: string, discoveredName?: string) {
    const normalized = normalizeStationUrl(origin);
    if (!normalized) return;

    const stationUrls = normalizeRadioStationList([...appSettings.radioStationUrls, normalized]);
    const existingName = appSettings.radioStationNames[normalized];
    const name = discoveredName?.trim();

    updateAppSettings({
      ...appSettings,
      radioStationUrl: normalized,
      radioStationUrls: stationUrls,
      // The first name returned by a station is remembered. A value edited in
      // Settings is intentionally left alone as a user-friendly override.
      radioStationNames: existingName || !name ? appSettings.radioStationNames : { ...appSettings.radioStationNames, [normalized]: name },
    });
    setRadioStationInput(normalized);
  }

  function selectRadioStation(nextUrl: string) {
    const origin = normalizeStationUrl(nextUrl);
    if (!origin) return;

    tuneOutRadio("Ready to tune in.");
    setRadioStationState(null);
    setRadioSession(null);
    setRadioBoothHistory([]);
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
      setRadioBoothHistory([]);
      setRadioSchedule(null);
    }

    updateAppSettings({
      ...appSettings,
      radioStationUrl: activeStation,
      radioStationUrls: remainingStations,
      radioStationNames: normalizeRadioStationNames(appSettings.radioStationNames, remainingStations),
    });
    setRadioStationInput(activeStation);
  }

  function applyRadioStationState(nextState: RadioStationState, requestGeneration = radioGenerationRef.current) {
    if (requestGeneration !== radioGenerationRef.current) return;

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

  function applyRadioSession(nextSession: RadioSessionPayload | null) {
    setRadioSession(nextSession);
    setRadioBoothHistory((previous) => mergeRadioBoothHistory(previous, nextSession));
  }

  function clearRadioWatchdog() {
    if (radioWatchdogTimerRef.current != null) {
      window.clearTimeout(radioWatchdogTimerRef.current);
      radioWatchdogTimerRef.current = null;
    }
  }

  function closeRadioStream(audio: HTMLAudioElement) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function buildRadioPlaybackUrl(origin: string) {
    const streamUrl = new URL(buildRadioStreamUrl(origin));
    streamUrl.searchParams.set("t", String(Date.now()));
    return streamUrl.toString();
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

    const requestGeneration = radioGenerationRef.current;

    try {
      const [nextState, nextSession] = await Promise.all([
        fetchRadioState(origin),
        fetchRadioSession(origin).catch(() => null),
      ]);
      if (requestGeneration !== radioGenerationRef.current) return null;

      applyRadioStationState(nextState, requestGeneration);
      if (nextSession) applyRadioSession(nextSession);
      saveRadioStation(origin, radioStationName(nextState, origin));
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
    radioGenerationRef.current += 1;
    clearRadioWatchdog();
    radioRetryCountRef.current = 0;
    if (audio) closeRadioStream(audio);
    setSuppressLocalFooter(true);
    setIsRadioTuning(false);
    setRadioStatus(radioStationState ? "ready" : "idle");
    setRadioMessage(message);
  }

  async function tuneInRadio(nextUrl?: string) {
    const origin = normalizeStationUrl(nextUrl || radioStationInput || appSettings.radioStationUrl);
    const radioAudio = radioAudioRef.current;
    if (!origin || !radioAudio) {
      setRadioStatus("error");
      setRadioMessage("Enter a valid Subwave station URL.");
      return;
    }

    stopTrackTransition(true);

    // Invalidate in-flight metadata before starting another connection. A
    // station can answer an earlier request after audio has already resumed.
    radioGenerationRef.current += 1;

    // A previous station's state must never be presented as the next station
    // is connecting. The footer has a dedicated tuning state until fresh
    // metadata arrives from this connection.
    setSuppressLocalFooter(true);
    setRadioStationState(null);
    setRadioSession(null);
    setRadioBoothHistory([]);
    setRadioSchedule(null);
    setIsRadioTuning(true);
    setRadioStatus("checking");
    setRadioMessage("Tuning in...");

    const nextState = await refreshRadio(origin);
    if (!nextState) return;

    getActiveAudio()?.pause();
    setIsPlaying(false);
    radioGenerationRef.current += 1;
    radioRetryCountRef.current = 0;
    clearRadioWatchdog();
    radioAudio.src = buildRadioPlaybackUrl(origin);
    radioAudio.volume = radioVolume;
    try {
      await radioAudio.play();
      setSuppressLocalFooter(false);
      setIsRadioTuning(false);
      setRadioStatus("playing");
      setRadioMessage("");
    } catch {
      setIsRadioTuning(false);
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

  function setSidebarWidthState(nextWidth: number) {
    const width = clampNumber(nextWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
    setSidebarWidth(width);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  }

  function setRightSidebarWidthState(nextWidth: number) {
    const width = clampNumber(nextWidth, RIGHT_SIDEBAR_MIN_WIDTH, RIGHT_SIDEBAR_MAX_WIDTH);
    setRightSidebarWidth(width);
    localStorage.setItem(RIGHT_SIDEBAR_WIDTH_KEY, String(width));
  }

  function beginSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (sidebarCollapsed) return;

    event.preventDefault();
    const initialWidth = sidebarWidth;
    const startX = event.clientX;
    let nextWidth = initialWidth;

    document.body.classList.add("sidebar-resizing");

    const handleMove = (moveEvent: PointerEvent) => {
      nextWidth = clampNumber(initialWidth + moveEvent.clientX - startX, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
      setSidebarWidth(nextWidth);
    };
    const handleEnd = () => {
      document.body.classList.remove("sidebar-resizing");
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth));
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd, { once: true });
    window.addEventListener("pointercancel", handleEnd, { once: true });
  }

  function beginRightSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const initialWidth = rightSidebarWidth;
    const startX = event.clientX;
    let nextWidth = initialWidth;

    document.body.classList.add("right-sidebar-resizing");

    const handleMove = (moveEvent: PointerEvent) => {
      nextWidth = clampNumber(initialWidth + startX - moveEvent.clientX, RIGHT_SIDEBAR_MIN_WIDTH, RIGHT_SIDEBAR_MAX_WIDTH);
      setRightSidebarWidth(nextWidth);
    };
    const handleEnd = () => {
      document.body.classList.remove("right-sidebar-resizing");
      localStorage.setItem(RIGHT_SIDEBAR_WIDTH_KEY, String(nextWidth));
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd, { once: true });
    window.addEventListener("pointercancel", handleEnd, { once: true });
  }

  function setAnalyticsConsent(enabled: boolean) {
    updateAppSettings({
      ...appSettings,
      analyticsEnabled: enabled,
      analyticsPromptDismissed: true,
    });

    if (enabled) {
      void sendAnalyticsPing(libraryData)
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
    const audio = getActiveAudio();
    if (audio) audio.volume = defaultSettings.lastVolume;
    setVolume(defaultSettings.lastVolume);
  }

  // These wrappers are the migration seam for server-owned data. They make
  // repeated navigation reuse a response while preserving the existing local
  // playback and navigation state machine.
  function loadLibraryData(nextConfig: NavidromeConfig) {
    return queryClient.fetchQuery({
      queryKey: navidromeKeys.library(nextConfig),
      queryFn: () => navidromeClient.library(nextConfig),
    });
  }

  function loadAlbumDetail(nextConfig: NavidromeConfig, albumId: string) {
    return queryClient.fetchQuery({
      queryKey: navidromeKeys.album(nextConfig, albumId),
      queryFn: () => navidromeClient.album(nextConfig, albumId),
    });
  }

  function loadArtistDetail(nextConfig: NavidromeConfig, artistId: string) {
    return queryClient.fetchQuery({
      queryKey: navidromeKeys.artist(nextConfig, artistId),
      queryFn: () => navidromeClient.artist(nextConfig, artistId),
    });
  }

  function loadPlaylistDetail(nextConfig: NavidromeConfig, playlistId: string) {
    return queryClient.fetchQuery({
      queryKey: navidromeKeys.playlist(nextConfig, playlistId),
      queryFn: () => navidromeClient.playlist(nextConfig, playlistId),
    });
  }

  function loadSearchResults(nextConfig: NavidromeConfig, query: string) {
    return queryClient.fetchQuery({
      queryKey: navidromeKeys.search(nextConfig, query),
      queryFn: () => navidromeClient.search(nextConfig, query),
      staleTime: 15_000,
    });
  }

  async function invalidateNavidromeData(nextConfig: NavidromeConfig) {
    await queryClient.invalidateQueries({ queryKey: navidromeKeys.root(nextConfig) });
  }

  async function syncFullSongCatalog(syncConfig: NavidromeConfig, albums: Album[]) {
    if (catalogSongsCompleteRef.current || catalogSongSyncInFlightRef.current) return;
    catalogSongSyncInFlightRef.current = true;
    setCatalogStatus("syncing");
    setCatalogProgress({ completed: 0, total: albums.length });
    setSongLibraryStatus("loading");

    try {
      if (!albums.length) {
        setSongLibrary([]);
        setSongLibraryStatus("ready");
        catalogSongsCompleteRef.current = true;
        setCatalogStatus("ready");
        return;
      }

      let songsAreUsable = false;
      const songs = await fetchSongLibrary(
        syncConfig,
        albums,
        (completed, total) => setCatalogProgress({ completed, total }),
        (nextSongs) => {
          setSongLibrary(nextSongs);
          if (!songsAreUsable) {
            songsAreUsable = true;
            setSongLibraryStatus("ready");
          }
        },
      );
      setSongLibrary(songs);
      setSongLibraryStatus("ready");
      catalogSongsCompleteRef.current = true;
      setCatalogStatus("ready");
    } catch {
      // The base catalog remains usable. A later launch or Songs visit retries this optional sync.
      setCatalogStatus("error");
    } finally {
      setCatalogProgress(null);
      catalogSongSyncInFlightRef.current = false;
    }
  }

  async function refreshLibrary(nextConfig = config) {
    if (!nextConfig || libraryRefreshInFlightRef.current) return false;

    const refreshGeneration = libraryRefreshGenerationRef.current;
    libraryRefreshInFlightRef.current = true;

    setStatus("checking");
    if (libraryDataRef.current.albums.length === 0) setLibraryStatus("loading");
    setStatusMessage(libraryDataRef.current.albums.length ? "Refreshing library in the background..." : "Checking Navidrome and loading library...");

    try {
      const resolvedConfig = await navidromeClient.resolveConfig(nextConfig);
      const [scanStatus, nextLibrary, nextListenerName] = await Promise.all([
        navidromeClient.scanStatus(resolvedConfig).catch(() => null),
        loadLibraryData(resolvedConfig),
        navidromeClient.profileName(resolvedConfig).catch(() => ""),
      ]);
      if (refreshGeneration !== libraryRefreshGenerationRef.current) return false;
      await storeNativePassword(resolvedConfig.password);
      writeStoredConfig(resolvedConfig);
      setLibraryData(nextLibrary);
      libraryDataRef.current = nextLibrary;
      setListenerName(nextListenerName);
      setConfig(resolvedConfig);
      setForm(resolvedConfig);
      setStatus("connected");
      setLibraryStatus("ready");
      setStatusMessage(`Connected to ${resolvedConfig.serverUrl}.`);
      libraryScanWasInProgressRef.current = Boolean(scanStatus?.scanning);
      const lastScan = scanTimestamp(scanStatus?.lastScan);
      if (lastScan) lastLibraryScanRef.current = lastScan;
      void syncFullSongCatalog(resolvedConfig, nextLibrary.albums);
      return true;
    } catch (error) {
      if (refreshGeneration !== libraryRefreshGenerationRef.current) return false;

      setStatus("error");
      if (libraryDataRef.current.albums.length) {
        setLibraryStatus("ready");
        setCatalogStatus("stale");
        setStatusMessage("Showing your saved library. Prism will refresh it when Navidrome is available.");
      } else {
        setLibraryStatus("error");
        setCatalogStatus("error");
        setStatusMessage(getErrorMessage(error));
      }
      return false;
    } finally {
      libraryRefreshInFlightRef.current = false;
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
      replaceBrowserHistory({ activeView: "overview", detailSelection: null, settingsTab });
    }
  }

  async function openAlbumById(albumId: string, label = "album") {
    if (!config) return;
    const origin = { activeView, detailSelection };

    setDetailStatus("loading");
    setDetailMessage(`Loading ${label}...`);
    setActiveView("albums");

    try {
      const albumDetail = await loadAlbumDetail(config, albumId);
      const nextSnapshot: BrowserSnapshot = { activeView: "albums", detailSelection: { type: "album", data: albumDetail }, settingsTab };
      pushBrowserHistory(nextSnapshot, origin);
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
      const artistDetail = await loadArtistDetail(config, artistId);
      const nextSnapshot: BrowserSnapshot = { activeView: "artists", detailSelection: { type: "artist", data: artistDetail }, settingsTab };
      pushBrowserHistory(nextSnapshot, origin);
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
      const playlistDetail = await loadPlaylistDetail(config, playlistId);
      const nextSnapshot: BrowserSnapshot = { activeView: "playlists", detailSelection: { type: "playlist", data: playlistDetail }, settingsTab };
      pushBrowserHistory(nextSnapshot, origin);
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
      const albumDetail = await loadAlbumDetail(config, album.id);
      replaceQueue(sortAlbumSongs(albumDetail.song ?? []));
    } catch (error) {
      setDetailStatus("error");
      setDetailMessage(getErrorMessage(error));
    }
  }

  async function playArtist(artist: Artist | ArtistDetail) {
    if (!config) return;

    try {
      const artistDetail = "album" in artist ? artist : await loadArtistDetail(config, artist.id);
      const albums = artistDetail.album ?? [];
      const albumDetails = await Promise.all(albums.slice(0, 50).map((album) => loadAlbumDetail(config, album.id)));
      replaceQueue(albumDetails.flatMap((album) => album.song ?? []));
    } catch (error) {
      setDetailStatus("error");
      setDetailMessage(getErrorMessage(error));
    }
  }

  async function playPlaylist(playlist: Playlist) {
    if (!config) return;

    try {
      const playlistDetail = await loadPlaylistDetail(config, playlist.id);
      replaceQueue(playlistDetail.entry ?? [], 0, playlist);
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

    const seedSongs = playlistSeedSongs ?? (playlistFromQueue ? queue : []);
    const trimmedDescription = playlistDescription.trim();
    setPlaylistCreateStatus("saving");
    setPlaylistCreateMessage("Creating playlist...");

    try {
      await navidromeClient.createPlaylist(config, trimmedName, seedSongs);
      await invalidateNavidromeData(config);
      let nextLibrary = await loadLibraryData(config);

      let createdPlaylist = [...nextLibrary.playlists]
        .filter((playlist) => playlist.name === trimmedName)
        .sort((a, b) => (b.changed ?? b.created ?? "").localeCompare(a.changed ?? a.created ?? ""))[0];

      if (createdPlaylist && (trimmedDescription || playlistPublic)) {
        await navidromeClient.updatePlaylist(config, createdPlaylist.id, {
          name: trimmedName,
          comment: trimmedDescription,
          public: playlistPublic,
        });
        await invalidateNavidromeData(config);
        nextLibrary = await loadLibraryData(config);
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
      setPlaylistSeedSongs(null);
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

    await navidromeClient.updatePlaylist(config, playlist.id, details);
    await invalidateNavidromeData(config);
    const [nextLibrary, updatedPlaylist] = await Promise.all([
      loadLibraryData(config),
      loadPlaylistDetail(config, playlist.id),
    ]);

    setLibraryData(nextLibrary);
    setDetailSelection({ type: "playlist", data: updatedPlaylist });
  }

  async function deletePlaylistAndReturn(playlist: Playlist) {
    if (!config) return;

    await navidromeClient.deletePlaylist(config, playlist.id);
    await invalidateNavidromeData(config);
    const nextLibrary = await loadLibraryData(config);
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

    await navidromeClient.removePlaylistSong(config, playlist.id, index);
    await invalidateNavidromeData(config);
    const [nextLibrary, updatedPlaylist] = await Promise.all([
      loadLibraryData(config),
      loadPlaylistDetail(config, playlist.id),
    ]);
    setLibraryData(nextLibrary);
    setDetailSelection({ type: "playlist", data: updatedPlaylist });
  }

  async function reorderPlaylistAndRefresh(playlist: PlaylistDetail, songs: Song[]) {
    if (!config) return;

    await navidromeClient.replacePlaylistSongs(config, playlist, songs);
    await invalidateNavidromeData(config);
    const [nextLibrary, updatedPlaylist] = await Promise.all([
      loadLibraryData(config),
      loadPlaylistDetail(config, playlist.id),
    ]);
    setLibraryData(nextLibrary);
    setDetailSelection({ type: "playlist", data: updatedPlaylist });
  }

  async function addSongsToSelectedPlaylist(playlist: Playlist, songs: Song[]) {
    if (!config || playlistAddStatus === "saving") return;

    setPlaylistAddStatus("saving");
    setPlaylistAddMessage(`Adding ${songs.length === 1 ? "song" : `${songs.length} songs`} to ${playlist.name}...`);

    try {
      await navidromeClient.addPlaylistSongs(config, playlist.id, songs);
      await invalidateNavidromeData(config);
      const [nextLibrary, updatedPlaylist] = await Promise.all([
        loadLibraryData(config),
        detailSelection?.type === "playlist" && detailSelection.data.id === playlist.id
          ? loadPlaylistDetail(config, playlist.id).catch(() => null)
          : Promise.resolve(null),
      ]);

      setLibraryData(nextLibrary);
      if (updatedPlaylist) {
        setDetailSelection({ type: "playlist", data: updatedPlaylist });
      }
      setPlaylistAddStatus("idle");
      setPlaylistAddMessage("");
      setSongContextMenu(null);
      setLibraryContextMenu(null);
    } catch (error) {
      setPlaylistAddStatus("error");
      setPlaylistAddMessage(getErrorMessage(error));
    }
  }

  async function addAlbumToPlaylist(playlist: Playlist, album: Album) {
    if (!config) return;

    try {
      const detail = await loadAlbumDetail(config, album.id);
      await addSongsToSelectedPlaylist(playlist, sortAlbumSongs(detail.song ?? []));
    } catch (error) {
      setPlaylistAddStatus("error");
      setPlaylistAddMessage(getErrorMessage(error));
    }
  }

  async function addArtistToPlaylist(playlist: Playlist, artist: Artist) {
    if (!config) return;

    try {
      const detail = await loadArtistDetail(config, artist.id);
      const albums = detail.album ?? [];
      const albumDetails = await Promise.all(albums.slice(0, 50).map((album) => loadAlbumDetail(config, album.id)));
      await addSongsToSelectedPlaylist(playlist, albumDetails.flatMap((album) => album.song ?? []));
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
      await navidromeClient.setFavorite(config, kind, id, favorite);
      await invalidateNavidromeData(config);
      const nextLibrary = await loadLibraryData(config);
      setLibraryData(nextLibrary);
      setSongContextMenu(null);
    } catch (error) {
      setPlaylistAddStatus("error");
      setPlaylistAddMessage(getErrorMessage(error));
    } finally {
      setFavoriteBusyKey("");
    }
  }

  async function likeCurrentRadioTrack() {
    if (!radioStationUrl || !radioNowPlayingSongId || radioLikeBusy) return;

    setRadioLikeBusy(true);
    try {
      const result = await submitRadioLike(radioStationUrl, radioNowPlayingSongId);
      if (result?.ok || result?.alreadyLiked || result?.liked) {
        setRadioLikeStatus({
          ...result,
          enabled: result.enabled ?? radioLikeStatus?.enabled ?? true,
          songId: result.songId ?? radioNowPlayingSongId,
          liked: true,
          count: result.count ?? radioLikeStatus?.count ?? 0,
        });
        return;
      }

      const status = await fetchRadioLikeStatus(radioStationUrl);
      setRadioLikeStatus(status);
    } finally {
      setRadioLikeBusy(false);
    }
  }

  function openSongContextMenu(event: MouseEvent<HTMLElement>, song: Song, selectedSongs: Song[] = [song]) {
    setLibraryContextMenu(null);
    setPlaylistAddStatus("idle");
    setPlaylistAddMessage("");
    setSongContextMenu({ song, songs: selectedSongs.some((selectedSong) => selectedSong.id === song.id) ? selectedSongs : [song] });
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
      setSongContextMenu(null);
      setLibraryContextMenu({ type, item });
      return;
    }

    if (type === "artist") {
      const item = artistLookup.get(id);
      if (!item) return;
      setSongContextMenu(null);
      setLibraryContextMenu({ type, item });
      return;
    }

    if (type === "playlist") {
      const item = playlistLookup.get(id);
      if (!item) return;
      setSongContextMenu(null);
      setLibraryContextMenu({ type, item });
    }
  }

  function handleSidebarPlaylistMenuOpenChange(open: boolean) {
    // A playlist's right-click menu is rendered in its own Radix portal. Keep
    // the sidebar flyout open while that related menu owns focus, rather than
    // treating the portal boundary as an outside interaction.
    if (!open && libraryContextMenu?.type === "playlist") return;
    setSidebarPlaylistMenuOpen(open);
  }

  function keepSidebarPlaylistMenuOpenForPlaylistContext(event: Event) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".library-context-menu")) {
      event.preventDefault();
    }
  }

  function clearDetail() {
    setDetailSelection(null);
    setDetailStatus("idle");
    setDetailMessage("");
  }

  function currentSnapshot(): BrowserSnapshot {
    return { activeView, detailSelection, settingsTab };
  }

  function pushBrowserHistory(nextSnapshot: BrowserSnapshot, origin = currentSnapshot()) {
    setBackStack((currentStack) => {
      if (snapshotEquals(currentStack[currentStack.length - 1] ?? null, origin)) return currentStack;
      return [...currentStack, origin].slice(-40);
    });
    setForwardStack([]);
    window.history.pushState({ prismSnapshot: nextSnapshot } satisfies PrismHistoryState, "");
  }

  function replaceBrowserHistory(snapshot: BrowserSnapshot) {
    window.history.replaceState({ prismSnapshot: snapshot } satisfies PrismHistoryState, "");
  }

  function selectView(view: View) {
    const nextSnapshot: BrowserSnapshot = { activeView: view, detailSelection: null, settingsTab };
    if (snapshotEquals(currentSnapshot(), nextSnapshot)) return;

    pushBrowserHistory(nextSnapshot);
    clearDetail();
    setActiveView(view);
    if (view === "songs" && config && songLibraryStatus !== "ready" && songLibraryStatus !== "loading") void loadSongLibrary();
  }

  async function loadSongLibrary() {
    if (!config) return;
    await syncFullSongCatalog(config, libraryData.albums);
  }

  function openSettings(tab: SettingsTab = "connection") {
    const nextSnapshot: BrowserSnapshot = { activeView: "settings", detailSelection: null, settingsTab: tab };
    if (snapshotEquals(currentSnapshot(), nextSnapshot)) return;

    pushBrowserHistory(nextSnapshot);
    setSettingsTab(tab);
    clearDetail();
    setActiveView("settings");
  }

  function selectSettingsTab(tab: SettingsTab) {
    if (settingsTab === tab) return;

    pushBrowserHistory({ ...currentSnapshot(), settingsTab: tab });
    setSettingsTab(tab);
  }

  function openSearchView() {
    selectView("search");
    setSearchFocused(false);
  }

  function navigateBack() {
    if (!backStack.length) return;
    window.history.back();
  }

  function navigateForward() {
    if (!forwardStack.length) return;
    window.history.forward();
  }

  useEffect(() => {
    const handleTrackpadNavigation = (event: WheelEvent) => {
      // With WebKit's own history gesture disabled, horizontal trackpad
      // movement reaches the page as wheel events. Consume a deliberate swipe
      // here so Prism can use its own history without WebKit sliding the whole
      // window surface.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;

      const gesture = trackpadNavigationRef.current;
      const now = performance.now();
      if (now - gesture.lastEventAt > 180) {
        gesture.accumulatedDeltaX = 0;
        gesture.consumed = false;
      }
      gesture.lastEventAt = now;
      gesture.accumulatedDeltaX += event.deltaX;

      if (gesture.consumed || Math.abs(gesture.accumulatedDeltaX) < 80) return;

      if (gesture.accumulatedDeltaX > 0 && backStack.length) {
        gesture.consumed = true;
        event.preventDefault();
        window.history.back();
      } else if (gesture.accumulatedDeltaX < 0 && forwardStack.length) {
        gesture.consumed = true;
        event.preventDefault();
        window.history.forward();
      }
    };

    window.addEventListener("wheel", handleTrackpadNavigation, { passive: false });
    return () => window.removeEventListener("wheel", handleTrackpadNavigation);
  }, [backStack.length, forwardStack.length]);

  function resetPlaybackPosition() {
    pendingResumePositionRef.current = 0;
    setPosition(0);
  }

  function replaceQueue(songs: Song[], startIndex = 0, playlistSource: Playlist | null = null) {
    if (!songs.length) return;
    const safeStartIndex = Math.min(Math.max(startIndex, 0), songs.length - 1);
    stopTrackTransition(songs[safeStartIndex]?.id !== currentTrack?.id);
    recordListeningHistory();
    tuneOutRadio();
    setActivePlaybackSource("local");
    setPlaylistPlaybackSource(playlistSource);
    setSuppressLocalFooter(false);
    scrobbledPlayRef.current = "";
    locallyRecordedPlayRef.current = "";
    const nextQueue = shuffleEnabled
      ? [songs[safeStartIndex], ...shuffled(songs.filter((_, index) => index !== safeStartIndex))]
      : songs;
    setSourceQueue(songs);
    setQueue(nextQueue);
    setCurrentIndex(shuffleEnabled ? 0 : safeStartIndex);
    resetPlaybackPosition();
    setPlayerError("");
    setIsPlaying(true);
  }

  function appendToQueue(song: Song) {
    setQueue((currentQueue) => [...currentQueue, song]);
    setSourceQueue((currentSourceQueue) => [...currentSourceQueue, song]);
  }

  function insertNextInQueue(song: Song) {
    setQueue((currentQueue) => {
      if (!currentQueue.length) return [song];
      const nextQueue = [...currentQueue];
      nextQueue.splice(currentIndex + 1, 0, song);
      return nextQueue;
    });
    setSourceQueue((currentSourceQueue) => {
      const sourceIndex = currentTrack ? currentSourceQueue.indexOf(currentTrack) : -1;
      const nextSourceQueue = [...currentSourceQueue];
      nextSourceQueue.splice(sourceIndex >= 0 ? sourceIndex + 1 : nextSourceQueue.length, 0, song);
      return nextSourceQueue;
    });
  }

  function playSong(song: Song) {
    const existingIndex = queue.findIndex((queuedSong) => queuedSong.id === song.id);
    stopTrackTransition(existingIndex !== currentIndex);
    recordListeningHistory();
    tuneOutRadio();
    setActivePlaybackSource("local");
    setPlaylistPlaybackSource(null);
    setSuppressLocalFooter(false);

    if (existingIndex >= 0) {
      scrobbledPlayRef.current = "";
      locallyRecordedPlayRef.current = "";
      setCurrentIndex(existingIndex);
      resetPlaybackPosition();
      setPlayerError("");
      setIsPlaying(true);
      return;
    }

    scrobbledPlayRef.current = "";
    locallyRecordedPlayRef.current = "";
    setQueue((currentQueue) => [...currentQueue, song]);
    setSourceQueue((currentSourceQueue) => [...currentSourceQueue, song]);
    setCurrentIndex(queue.length);
    resetPlaybackPosition();
    setPlayerError("");
    setIsPlaying(true);
  }

  function playNext(fromTrackEnd = false) {
    if (!queue.length) return;
    if (!fromTrackEnd) stopTrackTransition();
    recordListeningHistory(fromTrackEnd, fromTrackEnd ? playerDuration || currentTrack?.duration || position : position);

    if (fromTrackEnd && repeatMode === "one") {
      scrobbledPlayRef.current = "";
      locallyRecordedPlayRef.current = "";
      seekTo(0);
      pendingResumePositionRef.current = 0;
      setIsPlaying(true);
      void getActiveAudio()?.play().catch(() => {
        setPlayerError("Playback was blocked by the browser.");
      });
      return;
    }

    if (currentIndex >= queue.length - 1) {
      if (repeatMode === "all") {
        getActiveAudio()?.pause();
        if (sourceQueue.length > 1) {
          const nextQueue = shuffleEnabled ? shuffled(sourceQueue) : sourceQueue;
          setQueue(nextQueue);
          scrobbledPlayRef.current = "";
          locallyRecordedPlayRef.current = "";
          setCurrentIndex(0);
        } else {
          scrobbledPlayRef.current = "";
          locallyRecordedPlayRef.current = "";
          seekTo(0);
          void getActiveAudio()?.play().catch(() => {
            setPlayerError("Playback was blocked by the browser.");
          });
        }
        resetPlaybackPosition();
        setPlayerError("");
        setIsPlaying(true);
        return;
      }

      setIsPlaying(false);
      seekTo(0);
      return;
    }

    getActiveAudio()?.pause();
    scrobbledPlayRef.current = "";
    locallyRecordedPlayRef.current = "";
    setCurrentIndex((index) => Math.min(index + 1, queue.length - 1));
    resetPlaybackPosition();
    setPlayerError("");
    setIsPlaying(true);
  }

  async function advanceWithPreloadedTrack() {
    const activeAudio = getActiveAudio();
    const standbyAudio = getStandbyAudio();
    const nextIndex = currentIndex + 1;

    if (!activeAudio || !standbyAudio || !nextTrack || !nextStreamUrl || standbyAudio.src !== nextStreamUrl) return false;
    if (standbyAudio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;

    const transitionGeneration = transitionGenerationRef.current;
    transitionInProgressRef.current = true;
    recordListeningHistory(true, activeAudio.currentTime);
    scrobbledPlayRef.current = "";
    locallyRecordedPlayRef.current = "";

    const fadeSeconds = appSettings.trackTransitionSeconds;
    const fadeDurationMs = fadeSeconds * 1000;
    standbyAudio.muted = isMuted;
    standbyAudio.volume = fadeDurationMs > 0 ? 0 : volumeRef.current;

    try {
      await standbyAudio.play();
    } catch {
      transitionInProgressRef.current = false;
      return false;
    }

    if (transitionGenerationRef.current !== transitionGeneration) {
      standbyAudio.pause();
      standbyAudio.currentTime = 0;
      standbyAudio.volume = volumeRef.current;
      return false;
    }

    setActiveAudioSlot((slot) => slot === 0 ? 1 : 0);
    setCurrentIndex(nextIndex);
    setPosition(0);
    setPlayerDuration(Number.isFinite(standbyAudio.duration) && standbyAudio.duration > 0 ? standbyAudio.duration : nextTrack.duration || 0);
    setPlayerError("");

    if (!fadeDurationMs) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.volume = volumeRef.current;
      transitionInProgressRef.current = false;
      return true;
    }

    const startedAt = performance.now();
    clearTrackTransitionTimer();
    transitionTimerRef.current = window.setInterval(() => {
      const progress = Math.min((performance.now() - startedAt) / fadeDurationMs, 1);
      activeAudio.volume = volumeRef.current * (1 - progress);
      standbyAudio.volume = volumeRef.current * progress;
      if (progress < 1) return;

      clearTrackTransitionTimer();
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.volume = volumeRef.current;
      standbyAudio.volume = volumeRef.current;
      transitionInProgressRef.current = false;
      setTransitionCompleteNonce((nonce) => nonce + 1);
    }, 50);

    return true;
  }

  function handleLocalTimeUpdate(audio: HTMLAudioElement) {
    if (audio !== getActiveAudio()) return;
    setPosition(audio.currentTime);

    const duration = audio.duration || currentTrack?.duration || 0;
    if (
      !transitionInProgressRef.current
      && appSettings.trackTransitionSeconds > 0
      && nextTrack
      && duration > 0
      && duration - audio.currentTime <= appSettings.trackTransitionSeconds
    ) {
      void advanceWithPreloadedTrack();
    }
  }

  function handleLocalTrackEnded(audio: HTMLAudioElement) {
    if (audio !== getActiveAudio()) return;
    if (nextTrack && !transitionInProgressRef.current) {
      void advanceWithPreloadedTrack().then((advanced) => {
        if (!advanced) playNext(true);
      });
      return;
    }
    playNext(true);
  }

  function playPrevious() {
    if (!queue.length) return;
    stopTrackTransition();
    recordListeningHistory();
    getActiveAudio()?.pause();
    scrobbledPlayRef.current = "";
    locallyRecordedPlayRef.current = "";
    setCurrentIndex((index) => Math.max(index - 1, 0));
    resetPlaybackPosition();
    setPlayerError("");
    setIsPlaying(true);
  }

  function seekTo(nextPosition: number) {
    const audio = getActiveAudio();
    if (!audio || !Number.isFinite(nextPosition)) return;
    audio.currentTime = nextPosition;
    setPosition(nextPosition);
    setDiscordPresenceSyncNonce((nonce) => nonce + 1);
  }

  function handleLoadedMetadata(audio: HTMLAudioElement) {
    if (audio !== getActiveAudio()) return;
    const duration = audio.duration;
    setPlayerDuration(duration || currentTrack?.duration || 0);

    const resumePosition = pendingResumePositionRef.current;
    pendingResumePositionRef.current = 0;

    if (!audio || !currentTrack || resumePosition <= 0) return;

    const safeDuration = duration || currentTrack.duration || 0;
    const safePosition = safeDuration > 0 ? Math.min(resumePosition, Math.max(safeDuration - 2, 0)) : resumePosition;

    if (safePosition <= 0) return;
    audio.currentTime = safePosition;
    setPosition(safePosition);
  }

  function handleLocalDurationChange(audio: HTMLAudioElement) {
    if (audio !== getActiveAudio() || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    setPlayerDuration(audio.duration);
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
    stopTrackTransition();
    getActiveAudio()?.pause();
    scrobbledPlayRef.current = "";
    setCurrentIndex(index);
    resetPlaybackPosition();
    setPlayerError("");
    setIsPlaying(true);
  }

  function cycleRepeatMode() {
    setRepeatMode((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off"));
  }

  function toggleShuffle() {
    if (queue.length < 2 || !currentTrack) return;
    stopTrackTransition();

    if (shuffleEnabled) {
      const sourceIndex = sourceQueue.indexOf(currentTrack);
      setQueue(sourceQueue);
      setCurrentIndex(sourceIndex >= 0 ? sourceIndex : 0);
      setShuffleEnabled(false);
      return;
    }

    const sourceIndex = sourceQueue.indexOf(currentTrack);
    const remaining = sourceQueue.filter((_, index) => index !== sourceIndex);
    setQueue([currentTrack, ...shuffled(remaining)]);
    setCurrentIndex(0);
    setShuffleEnabled(true);
  }

    function reorderQueueItem(fromIndex: number, insertAtIndex: number) {
      if (!queue[fromIndex]) return;
      const toIndex = insertAtIndex > fromIndex ? insertAtIndex - 1 : insertAtIndex;
      if (fromIndex === toIndex) return;
      stopTrackTransition();

    setQueue((currentQueue) => {
      const nextQueue = [...currentQueue];
      const [movedSong] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, movedSong);
      return nextQueue;
    });

    if (!shuffleEnabled) {
      setSourceQueue((currentSourceQueue) => {
        const nextSourceQueue = [...currentSourceQueue];
        const [movedSong] = nextSourceQueue.splice(fromIndex, 1);
        nextSourceQueue.splice(toIndex, 0, movedSong);
        return nextSourceQueue;
      });
    }

    if (currentIndex === fromIndex) {
      setCurrentIndex(toIndex);
    } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
      setCurrentIndex((index) => index - 1);
    } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
      setCurrentIndex((index) => index + 1);
    }
  }

    function dropQueueItem(insertAtIndex: number, fromIndex = draggedQueueIndex) {
      if (fromIndex == null) return;
      reorderQueueItem(fromIndex, insertAtIndex);
    setDraggedQueueIndex(null);
    setDragOverQueueIndex(null);
  }

  function removeQueueItem(index: number) {
    if (!queue[index]) return;
    stopTrackTransition();

    const removingCurrentTrack = index === currentIndex;
    setQueue((currentQueue) => currentQueue.filter((_, queueIndex) => queueIndex !== index));
    setSourceQueue((currentSourceQueue) => currentSourceQueue.filter((song) => song !== queue[index]));

    if (queue.length <= 1) {
      getActiveAudio()?.pause();
      setCurrentIndex(0);
      resetPlaybackPosition();
      setIsPlaying(false);
      return;
    }

    if (index < currentIndex) {
      setCurrentIndex((current) => Math.max(0, current - 1));
    } else if (removingCurrentTrack) {
      getActiveAudio()?.pause();
      scrobbledPlayRef.current = "";
      setCurrentIndex(Math.min(currentIndex, queue.length - 2));
      resetPlaybackPosition();
      setPlayerError("");
      setIsPlaying(true);
    }
  }

  function clearQueue() {
    stopTrackTransition();
    getActiveAudio()?.pause();
    setQueue([]);
    setSourceQueue([]);
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
    setPlaylistSeedSongs(null);
  }

  function createPlaylistFromSongs(name: string, songs: Song[]) {
    setPlaylistName(name);
    setPlaylistDescription("");
    setPlaylistPublic(false);
    setPlaylistFromQueue(false);
    setPlaylistSeedSongs(songs);
    setSongContextMenu(null);
    setLibraryContextMenu(null);
    setPlaylistCreatorOpen(true);
  }

  function togglePlayback() {
    if (activePlaybackSource === "radio" && radioStationUrl) {
      const radioAudio = radioAudioRef.current;
      if (isRadioPlaying) {
        radioAudio?.pause();
        setRadioMessage("Radio paused.");
      } else if (radioAudio?.src) {
        void radioAudio.play().catch(() => {
          setRadioStatus("error");
          setRadioMessage("The stream could not resume.");
        });
      } else {
        void tuneInRadio();
      }
      return;
    }

    if (!queue.length) return;
    const audio = getActiveAudio();

    if (isPlaying) {
      stopTrackTransition(true);
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

  mediaShortcutHandlerRef.current = (action) => {
    if (action === "toggle") {
      togglePlayback();
      return;
    }

    // Live radio has no meaningful next/previous track control. Returning
    // here also prevents a media key from changing a paused local queue
    // behind an active Subwave session.
    if (activePlaybackSource === "radio" && radioStationUrl) return;

    if (action === "next") playNext(false);
    if (action === "previous") playPrevious();
  };

  function setPlayerVolume(nextVolume: number) {
    const clampedVolume = Math.min(1, Math.max(0, nextVolume));
    const audio = getActiveAudio();
    if (audio) audio.volume = clampedVolume;
    setVolume(clampedVolume);
    updateAppSettings({ ...appSettings, lastVolume: clampedVolume });
  }

  function toggleMuted() {
    setIsMuted((muted) => !muted);
  }

  async function resetConnection() {
    try {
      await clearNativePassword();
    } catch (error) {
      setStatus("error");
      setStatusMessage(`Could not remove the saved password. ${getErrorMessage(error)}`);
      return;
    }

    libraryRefreshGenerationRef.current += 1;
    lastLibraryScanRef.current = null;
    libraryScanWasInProgressRef.current = false;
    const catalogKey = config ? libraryCatalogKey(config) : null;
    if (catalogKey) void deleteLibraryCatalog(catalogKey).catch(() => undefined);
    catalogHydratedKeyRef.current = "";
    catalogSongsCompleteRef.current = false;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_PLAYED_TRACK_KEY);
    localStorage.removeItem(PLAYBACK_STATE_KEY);
    setConfig(null);
    setForm(emptyConfig);
    setListenerName("");
    setLibraryData(emptyLibraryData);
    libraryDataRef.current = emptyLibraryData;
    setSongLibrary([]);
    setSongLibraryStatus("idle");
    setDetailSelection(null);
    setBackStack([]);
    setForwardStack([]);
    setSearchQuery("");
    setSearchResults(emptySearchResults);
    setSearchStatus("idle");
    setQueue([]);
    setSourceQueue([]);
    setLastPlayedTrack(null);
    setCurrentIndex(0);
    setIsPlaying(false);
    setStatus("idle");
    setLibraryStatus("idle");
    setCatalogStatus("idle");
    setCatalogProgress(null);
    setStatusMessage("Add a Navidrome server to start syncing.");
    setSetupOpen(true);
    setActiveView("settings");
    replaceBrowserHistory({ activeView: "settings", detailSelection: null, settingsTab: "connection" });
  }

  useEffect(() => {
    if (!isTauriDesktopApp()) {
      // Remove a password that may have been saved by an older browser preview.
      const stored = readStoredConfig();
      if (stored?.password) writeStoredConfig({ ...stored, password: stored.password });
      return;
    }

    if (!appSettings.discordPresenceEnabled) {
      setDiscordPresenceStatus("idle");
      void invoke("clear_discord_presence").catch(() => undefined);
      return;
    }

    const radioPresence = activePlaybackSource === "radio" && isRadioPlaying && radioNowPlaying;
    const localPresence = activePlaybackSource === "local" && isPlaying && currentTrack;

    if (!radioPresence && !localPresence) {
      setDiscordPresenceStatus("idle");
      void invoke("clear_discord_presence").catch(() => undefined);
      return;
    }

    const track = radioPresence || localPresence;
    if (!track) return;

    setDiscordPresenceStatus("connecting");
    void invoke("update_discord_presence", {
      presence: {
        title: track.title ?? "Live radio",
        artist: track.artist ?? (radioPresence ? "Subwave" : "Unknown artist"),
        station: radioPresence ? radioStationName(radioStationState, radioStationUrl, appSettings.radioStationNames[radioStationUrl]) : null,
        playing: radioPresence ? true : isPlaying,
        startedAt: radioPresence || !isPlaying ? null : Date.now() - Math.round(position * 1000),
      },
    }).catch(() => undefined);
  }, [activePlaybackSource, appSettings.discordPresenceEnabled, currentTrack?.id, discordPresenceSyncNonce, isPlaying, isRadioPlaying, radioNowPlaying?.artist, radioNowPlaying?.album, radioNowPlaying?.title, radioStationState, radioStationUrl]);

  useEffect(() => () => {
    if (isTauriDesktopApp()) void invoke("clear_discord_presence").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isTauriDesktopApp()) return;

    let unlisten: (() => void) | undefined;
    void listen<{ state: DiscordPresenceStatus }>("discord-presence-status", (event) => {
      setDiscordPresenceStatus(event.payload.state);
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!isTauriDesktopApp()) return;

    let cancelled = false;
    void loadNativeStoredConfig()
      .then((storedConfig) => {
        if (cancelled || !storedConfig) return;
        setConfig(storedConfig);
        setForm(storedConfig);
        setSetupOpen(false);
        setLibraryStatus("loading");
        setStatus("checking");
        setStatusMessage("Loading your saved Navidrome connection...");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        setStatusMessage(`Could not access the saved password. ${getErrorMessage(error)}`);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    const catalogKey = libraryCatalogKey(config);
    let cancelled = false;
    catalogHydratedKeyRef.current = "";
    catalogSongsCompleteRef.current = false;
    setCatalogStatus("hydrating");

    void readLibraryCatalog<LibraryData, Song>(catalogKey)
      .then((snapshot) => {
        if (cancelled) return;
        if (snapshot?.version === 1) {
          setLibraryData(snapshot.library);
          libraryDataRef.current = snapshot.library;
          setSongLibrary(snapshot.songs);
          setSongLibraryStatus(snapshot.songs.length ? "ready" : "idle");
          catalogSongsCompleteRef.current = snapshot.songsComplete;
          setLibraryStatus("ready");
          setCatalogStatus("stale");
          setStatusMessage(`Showing your saved library from ${new Date(snapshot.savedAt).toLocaleString()}. Refreshing in the background...`);
        } else {
          setCatalogStatus("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setCatalogStatus("error");
      })
      .finally(() => {
        if (!cancelled) catalogHydratedKeyRef.current = catalogKey;
      });

    return () => { cancelled = true; };
  }, [config?.serverUrl, config?.username]);

  useEffect(() => {
    if (!config) return;
    const catalogKey = libraryCatalogKey(config);
    if (catalogHydratedKeyRef.current !== catalogKey || libraryData.albums.length === 0) return;

    const timer = window.setTimeout(() => {
      void writeLibraryCatalog<LibraryData, Song>({
        key: catalogKey,
        version: 1,
        savedAt: new Date().toISOString(),
        library: libraryData,
        songs: songLibrary,
        songsComplete: catalogSongsCompleteRef.current,
      }).catch(() => setCatalogStatus("error"));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [config?.serverUrl, config?.username, libraryData, songLibrary]);

  useEffect(() => {
    if (config) {
      void refreshLibrary(config);
    }
  }, [config?.serverUrl, config?.username, config?.password]);

  useEffect(() => {
    if (!config) return;
    const scanConfig = config as NavidromeConfig;

    let cancelled = false;

    async function checkForLibraryUpdates() {
      if (
        cancelled
        || document.visibilityState === "hidden"
        || libraryRefreshInFlightRef.current
        || libraryScanCheckInFlightRef.current
      ) return;

      libraryScanCheckInFlightRef.current = true;
      try {
        const scanStatus = await fetchNavidromeScanStatus(scanConfig);
        if (scanStatus?.scanning) {
          libraryScanWasInProgressRef.current = true;
          return;
        }

        const nextLastScan = scanTimestamp(scanStatus?.lastScan);
        const previousLastScan = lastLibraryScanRef.current;
        const shouldRefreshAfterScan = libraryScanWasInProgressRef.current;

        if (cancelled || !nextLastScan) return;
        if (!previousLastScan && !shouldRefreshAfterScan) {
          lastLibraryScanRef.current = nextLastScan;
          return;
        }
        const scanAdvanced = previousLastScan ? scanHasAdvanced(previousLastScan, nextLastScan) : false;
        if (!shouldRefreshAfterScan && !scanAdvanced) return;

        const refreshed = await refreshLibrary(scanConfig);
        if (refreshed) {
          lastLibraryScanRef.current = nextLastScan;
          libraryScanWasInProgressRef.current = false;
        }
      } catch {
        // Keep the active library and try again on the next foreground check.
      } finally {
        libraryScanCheckInFlightRef.current = false;
      }
    }

    function checkWhenVisible() {
      if (document.visibilityState === "visible") void checkForLibraryUpdates();
    }

    const interval = window.setInterval(() => void checkForLibraryUpdates(), LIBRARY_SCAN_POLL_INTERVAL_MS);
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    void checkForLibraryUpdates();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [config]);

  useEffect(() => {
    if (!appSettings.analyticsEnabled) return;
    if (config && libraryStatus !== "ready") return;

    const lastPing = localStorage.getItem(ANALYTICS_LAST_PING_KEY);
    const lastPingTime = lastPing ? new Date(lastPing).getTime() : 0;
    const shouldPing = !lastPingTime || Date.now() - lastPingTime > 12 * 60 * 60 * 1000;

    if (!shouldPing) return;

    void sendAnalyticsPing(libraryData)
      .then(() => localStorage.setItem(ANALYTICS_LAST_PING_KEY, new Date().toISOString()))
      .catch(() => undefined);
  }, [appSettings.analyticsEnabled, config, libraryData, libraryStatus]);

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

    void navidromeClient.lyrics(config, currentTrack).then(normalizeLyrics)
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
    [primaryAudioRef.current, secondaryAudioRef.current].forEach((audio) => {
      if (audio) audio.volume = volume;
    });
  }, [volume]);

  useEffect(() => {
    if (primaryAudioRef.current) primaryAudioRef.current.muted = isMuted;
    if (secondaryAudioRef.current) secondaryAudioRef.current.muted = isMuted;
    if (radioAudioRef.current) radioAudioRef.current.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    setRadioStationInput(appSettings.radioStationUrl);
  }, [appSettings.radioStationUrl]);

  useEffect(() => {
    setRadioVolume(appSettings.lastVolume);
    if (radioAudioRef.current) radioAudioRef.current.volume = appSettings.lastVolume;
  }, [appSettings.lastVolume]);

  useEffect(() => {
    if (!radioStationUrl) return;
    if (!isRadioPlaying) return;
    void fetchRadioSchedule(radioStationUrl)
      .then(setRadioSchedule)
      .catch(() => setRadioSchedule(null));
    void fetchRadioSession(radioStationUrl)
      .then(applyRadioSession)
      .catch(() => setRadioSession(null));
    const interval = window.setInterval(() => {
      const requestGeneration = radioGenerationRef.current;
      void fetchRadioState(radioStationUrl)
        .then((nextState) => applyRadioStationState(nextState, requestGeneration))
        .catch(() => undefined);
      void fetchRadioSchedule(radioStationUrl)
        .then(setRadioSchedule)
        .catch(() => undefined);
      void fetchRadioSession(radioStationUrl)
        .then(applyRadioSession)
        .catch(() => undefined);
    }, 12000);

    return () => {
      window.clearInterval(interval);
      if (radioPromoteTimerRef.current != null) {
        window.clearTimeout(radioPromoteTimerRef.current);
        radioPromoteTimerRef.current = null;
      }
    };
  }, [radioStationUrl, isRadioPlaying]);

  useEffect(() => {
    const audio = radioAudioRef.current;
    if (!audio) return;

    function reconnectRadio() {
      radioWatchdogTimerRef.current = null;
      const audio = radioAudioRef.current;
      if (!audio || !radioStationUrl || audio.paused || !audio.src) return;

      if (audio.readyState >= HAVE_FUTURE_DATA && audio.currentTime > radioWatchdogArmedAtRef.current) {
        radioRetryCountRef.current = 0;
        setRadioStatus("playing");
        return;
      }

      const myGeneration = radioGenerationRef.current;
      const delay = Math.min(RADIO_RECONNECT_BASE_MS * 2 ** radioRetryCountRef.current, RADIO_RECONNECT_MAX_MS);
      radioRetryCountRef.current += 1;
      audio.src = buildRadioPlaybackUrl(radioStationUrl);
      audio.volume = radioVolume;
      setIsRadioTuning(true);
      setRadioStatus("checking");
      setRadioMessage("Reconnecting radio...");

      void audio.play().then(() => {
        if (radioGenerationRef.current !== myGeneration) return;
        radioRetryCountRef.current = 0;
        setSuppressLocalFooter(false);
        setIsRadioTuning(false);
        setRadioStatus("playing");
        setRadioMessage("");
      }).catch(() => {
        if (radioGenerationRef.current !== myGeneration) return;
        radioWatchdogArmedAtRef.current = audio.currentTime;
        radioWatchdogTimerRef.current = window.setTimeout(reconnectRadio, delay);
      });
    }

    function armRadioWatchdog(delay = 5000) {
      const activeAudio = radioAudioRef.current;
      if (!activeAudio || !radioStationUrl || activeAudio.paused || !activeAudio.src) return;
      clearRadioWatchdog();
      radioWatchdogArmedAtRef.current = activeAudio.currentTime;
      radioWatchdogTimerRef.current = window.setTimeout(reconnectRadio, delay);
    }

    function handlePlaying() {
      clearRadioWatchdog();
      radioRetryCountRef.current = 0;
      setIsRadioTuning(false);
      setRadioStatus("playing");
      setRadioMessage("");
    }

    function handleWaiting() {
      setRadioStatus((currentStatus) => (currentStatus === "playing" ? "checking" : currentStatus));
      armRadioWatchdog();
    }

    function handleStalled() {
      armRadioWatchdog();
    }

    function handleError() {
      const activeAudio = radioAudioRef.current;
      if (!activeAudio || !radioStationUrl || activeAudio.paused || !activeAudio.src) return;
      const delay = Math.min(RADIO_RECONNECT_BASE_MS * 2 ** radioRetryCountRef.current, RADIO_RECONNECT_MAX_MS);
      armRadioWatchdog(delay);
    }

    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("stalled", handleStalled);
    audio.addEventListener("error", handleError);

    return () => {
      clearRadioWatchdog();
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("stalled", handleStalled);
      audio.removeEventListener("error", handleError);
    };
  }, [radioStationUrl, radioVolume]);

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
    const audio = getActiveAudio();
    if (!audio) return;

    if (!currentStreamUrl) {
      audio.removeAttribute("src");
      resetPlaybackPosition();
      setPlayerDuration(0);
      return;
    }

    if (audio.src === currentStreamUrl) return;
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
  }, [activeAudioSlot, currentStreamUrl]);

  useEffect(() => {
    const standbyAudio = getStandbyAudio();
    if (!standbyAudio || transitionInProgressRef.current) return;

    standbyAudio.pause();
    standbyAudio.currentTime = 0;
    standbyAudio.volume = volume;

    if (!nextStreamUrl) {
      standbyAudio.removeAttribute("src");
      standbyAudio.load();
      return;
    }

    if (standbyAudio.src !== nextStreamUrl) {
      standbyAudio.src = nextStreamUrl;
      standbyAudio.load();
    }
  }, [activeAudioSlot, nextStreamUrl, transitionCompleteNonce, volume]);

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
      persistPlaybackSnapshot(getActiveAudio()?.currentTime ?? position);
    }

    window.addEventListener("beforeunload", persistBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", persistBeforeUnload);
    };
  }, [currentIndex, position, queue]);

  async function checkForUpdates(signal?: AbortSignal) {
    setUpdateCheckStatus("checking");

    try {
      const response = await fetch(PRISM_LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
        signal,
      });
      if (!response.ok) throw new Error("Unable to check for updates.");

      const release = (await response.json()) as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean };
      const version = release.tag_name?.replace(/^v/, "") ?? "";
      if (!release.draft && !release.prerelease && version && isVersionNewer(version, packageJson.version)) {
        setAvailableUpdate({ version, releaseUrl: release.html_url || PRISM_RELEASES_URL });
        setUpdateCheckStatus("available");
        return;
      }

      setAvailableUpdate(null);
      setUpdateCheckStatus("up-to-date");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setAvailableUpdate(null);
        setUpdateCheckStatus("error");
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void checkForUpdates(controller.signal);

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!currentTrack || !isPlaying || activePlaybackSource !== "local") return;

    if (position >= 5) recordListeningHistory(false, position);
  }, [activePlaybackSource, currentTrack, isPlaying, playerDuration, position]);

  useEffect(() => {
    if (!config || !currentTrack || !isPlaying) return;

    const listenThreshold = 5;
    const playKey = `${currentTrack.id}:${currentStreamUrl ?? ""}`;

    if (position < listenThreshold || scrobbledPlayRef.current === playKey) return;

    scrobbledPlayRef.current = playKey;
    void navidromeClient.scrobble(config, currentTrack)
      .then(async () => {
        await invalidateNavidromeData(config);
        return loadLibraryData(config);
      })
      .then((nextLibrary) => setLibraryData(nextLibrary))
      .catch(() => {
        scrobbledPlayRef.current = "";
      });
  }, [config, currentStreamUrl, currentTrack, isPlaying, playerDuration, position]);

  useEffect(() => {
    const audio = getActiveAudio();
    if (!audio || !currentStreamUrl) return;

    if (isPlaying) {
      void audio.play().catch(() => {
        setIsPlaying(false);
        setPlayerError("Playback was blocked by the browser.");
      });
    } else {
      audio.pause();
    }
  }, [activeAudioSlot, isPlaying, currentStreamUrl]);

  useEffect(() => {
    function isTextInputTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    }

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (isTextInputTarget(target)) return;

        const selector = ".track-list, .search-song-list, .listening-history-list";
        const trackList = target?.closest<HTMLElement>(selector)
          ?? Array.from(document.querySelectorAll<HTMLElement>(selector)).find((list) => list.getClientRects().length > 0);

        event.preventDefault();
        if (trackList) window.dispatchEvent(new CustomEvent<HTMLElement>("prism:select-all-tracks", { detail: trackList }));
        return;
      }

      if (isTextInputTarget(event.target)) return;

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
  }, [currentTrack?.duration, playerDuration, position, queue.length, isPlaying, currentStreamUrl, isRadioPlaying]);

  useEffect(() => {
    if (!isTauriDesktopApp()) return;

    let active = true;
    const registeredShortcuts: string[] = [];

    void (async () => {
      for (const [shortcut, action] of MEDIA_SHORTCUTS) {
        try {
          await register(shortcut, (event) => {
            if (event.state === "Pressed") mediaShortcutHandlerRef.current(action);
          });

          if (!active) {
            void unregister(shortcut).catch(() => undefined);
            continue;
          }
          registeredShortcuts.push(shortcut);
        } catch {
          // Another app or the operating system may reserve a media key.
          // Prism continues to expose the same controls in its player UI.
        }
      }
    })();

    return () => {
      active = false;
      void Promise.all(registeredShortcuts.map((shortcut) => unregister(shortcut).catch(() => undefined)));
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const controlsRadio = activePlaybackSource === "radio" && Boolean(radioStationUrl);

    if (controlsRadio && radioNowPlaying) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: radioNowPlaying.title ?? "Subwave Radio",
        artist: radioNowPlaying.artist ?? "Subwave",
        album: radioNowPlaying.album ?? "Live radio",
        artwork: radioCoverUrl ? [{ src: radioCoverUrl, sizes: "160x160", type: "image/jpeg" }] : [],
      });
    } else if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist ?? "Unknown artist",
        album: currentTrack.album ?? "",
        artwork: currentTrackCoverUrl ? [{ src: currentTrackCoverUrl, sizes: "160x160", type: "image/jpeg" }] : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }

    navigator.mediaSession.playbackState = controlsRadio ? (isRadioPlaying ? "playing" : "paused") : isPlaying ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => {
      if (controlsRadio) {
        const radioAudio = radioAudioRef.current;
        if (radioAudio?.src) {
          void radioAudio.play().catch(() => {
            setRadioStatus("error");
            setRadioMessage("The stream could not resume.");
          });
        } else {
          void tuneInRadio();
        }
        return;
      }
      setIsPlaying(true);
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (controlsRadio) {
        radioAudioRef.current?.pause();
        setRadioMessage("Radio paused.");
        return;
      }
      stopTrackTransition(true);
      setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler("previoustrack", controlsRadio ? null : playPrevious);
    navigator.mediaSession.setActionHandler("nexttrack", controlsRadio ? null : () => playNext(false));
    navigator.mediaSession.setActionHandler("seekbackward", controlsRadio ? null : () => seekTo(Math.max(0, position - 10)));
    navigator.mediaSession.setActionHandler("seekforward", controlsRadio ? null : () => seekTo(Math.min((playerDuration || currentTrack?.duration || 0), position + 10)));

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    };
  }, [activePlaybackSource, currentTrack, currentTrackCoverUrl, isPlaying, isRadioPlaying, playerDuration, position, radioCoverUrl, radioNowPlaying, radioStationUrl]);

  useEffect(() => {
    const activeRadio = activePlaybackSource === "radio" && radioStationUrl;
    const trackKey = activeRadio
      ? radioNowPlaying
        ? `radio:${radioStationUrl}:${radioNowPlaying.subsonic_id ?? radioNowPlaying.title ?? "unknown"}`
        : null
      : isPlaying && currentTrack
        ? `local:${currentTrack.id}`
        : null;

    if (!trackKey) return;

    const previousTrackKey = lastBackgroundTrackRef.current;
    lastBackgroundTrackRef.current = trackKey;
    if (!previousTrackKey || previousTrackKey === trackKey) return;

    const title = activeRadio ? radioNowPlaying?.title ?? "Subwave Radio" : currentTrack?.title ?? "Now playing";
    const artist = activeRadio ? radioNowPlaying?.artist ?? "Subwave" : currentTrack?.artist ?? "Unknown artist";
    void notifyDesktop("track-change", title, artist, 2_000);
  }, [activePlaybackSource, currentTrack, isPlaying, radioNowPlaying, radioStationUrl]);

  useEffect(() => {
    if (!playerError) return;
    void notifyDesktop("playback-error", "Playback needs attention", playerError);
  }, [playerError]);

  useEffect(() => {
    if (radioStatus !== "error") return;
    void notifyDesktop("radio-error", "Subwave needs attention", radioMessage || "The station could not keep playing.");
  }, [radioMessage, radioStatus]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (!config || trimmedQuery.length < 2) {
      setSearchResults(emptySearchResults);
      setSearchStatus("idle");
      return;
    }

    setSearchStatus("searching");

    const timeout = window.setTimeout(() => {
      void loadSearchResults(config, trimmedQuery)
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
  const footerRadioTitle = radioNowPlaying?.title ?? radioStationName(radioStationState, radioStationUrl, appSettings.radioStationNames[radioStationUrl]);
  const footerRadioMeta = radioNowPlaying
    ? radioNowPlaying.artist || radioStationName(radioStationState, radioStationUrl, appSettings.radioStationNames[radioStationUrl])
    : "Live broadcast";
  const seekDuration = isRadioPlaying ? (radioHasTimedTrack ? radioDuration : Math.max(radioElapsed, 1)) : playerDuration || currentTrack?.duration || 0;
  const seekPosition = isRadioPlaying ? (radioHasTimedTrack ? Math.min(radioElapsed, radioDuration) : 0) : position;
  const radioScheduleMenuItems = radioScheduleItems(radioSchedule, radioClockNow);
  const radioBoothLines = radioBoothHistory.slice(-12).reverse();
  const radioCanLike = radioLikeStatus?.enabled !== false && Boolean(radioNowPlayingSongId);
  const radioIsLiked = Boolean(radioLikeStatus?.liked && (!radioLikeStatus.songId || radioLikeStatus.songId === radioNowPlayingSongId));

  useEffect(() => {
    if (!isRadioPlaying) setRadioPopover(null);
  }, [isRadioPlaying]);

  return (
    <ContextMenu.Root
      open={Boolean(songContextMenu || libraryContextMenu)}
      onOpenChange={(open) => {
        if (!open) {
          setSongContextMenu(null);
          setLibraryContextMenu(null);
          setPlaylistAddStatus("idle");
          setPlaylistAddMessage("");
        }
      }}
      modal={false}
    >
      <ContextMenu.Trigger asChild>
    <main
      className={`app-shell theme-${appSettings.colorTheme} ${rightPanelOpen ? "with-right-panel" : "right-panel-collapsed"} ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      } ${coverWashUrl ? "with-cover-wash" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px`, "--right-sidebar-width": `${rightSidebarWidth}px` } as CSSProperties}
      onContextMenu={openLibraryContextMenu}
    >
      {coverWashUrl ? <div className="cover-wash-backdrop" style={{ backgroundImage: `url(${coverWashUrl})` }} aria-hidden="true" /> : null}

      {!sidebarCollapsed ? <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <PrismMark className="brand-mark" />
          <div>
            <p className="eyebrow">Prism</p>
            <h1>Player</h1>
          </div>
        </div>
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
          <button
            className={`nav-item nav-child ${activeView === "songs" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("songs")}
          >
            <Music2 size={18} />
            Songs
          </button>
          <DropdownMenu.Root
            modal={false}
            open={sidebarPlaylistMenuOpen || libraryContextMenu?.type === "playlist"}
            onOpenChange={handleSidebarPlaylistMenuOpenChange}
          >
            <DropdownMenu.Trigger asChild>
              <button
                className={`nav-item nav-child nav-parent nav-playlist-trigger ${activeView === "playlists" ? "active" : ""}`}
                type="button"
                aria-label="Open playlists"
              >
                <ListMusic size={18} />
                <span>Playlists</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="sidebar-playlist-menu"
                side="right"
                align="start"
                sideOffset={10}
                collisionPadding={12}
                aria-label="Playlists"
                onFocusOutside={keepSidebarPlaylistMenuOpenForPlaylistContext}
                onInteractOutside={keepSidebarPlaylistMenuOpenForPlaylistContext}
              >
                <DropdownMenu.Item asChild>
                  <button className="sidebar-playlist-menu-all" type="button" onClick={() => selectView("playlists")}>
                    <ListMusic size={15} />
                    <span>All playlists</span>
                  </button>
                </DropdownMenu.Item>
                {libraryData.playlists.length ? (
                  <div className="sidebar-playlist-menu-list">
                    {personalPlaylists.length ? <p className="sidebar-playlist-menu-heading">Your playlists</p> : null}
                    {personalPlaylists.map((playlist) => (
                        <DropdownMenu.Item asChild key={playlist.id}>
                          <button
                            className={detailSelection?.type === "playlist" && detailSelection.data.id === playlist.id ? "active" : ""}
                            type="button"
                            data-context-kind="playlist"
                            data-context-id={playlist.id}
                            onClick={() => void openPlaylist(playlist)}
                          >
                            <ListMusic size={15} />
                            <span className="sidebar-playlist-menu-copy">
                              <strong>{playlist.name}</strong>
                              <small>{getSidebarPlaylistMeta(playlist)}</small>
                            </span>
                          </button>
                        </DropdownMenu.Item>
                      ))}
                    {appSettings.showSharedPlaylists && sharedPlaylists.length ? <>
                      <p className="sidebar-playlist-menu-heading">Shared playlists</p>
                      {sharedPlaylists.map((playlist) => (
                        <DropdownMenu.Item asChild key={playlist.id}>
                          <button
                            className={detailSelection?.type === "playlist" && detailSelection.data.id === playlist.id ? "active" : ""}
                            type="button"
                            data-context-kind="playlist"
                            data-context-id={playlist.id}
                            onClick={() => void openPlaylist(playlist)}
                          >
                            <ListMusic size={15} />
                            <span className="sidebar-playlist-menu-copy">
                              <strong>{playlist.name}</strong>
                              <small>{getSidebarPlaylistMeta(playlist, true)}</small>
                            </span>
                          </button>
                        </DropdownMenu.Item>
                      ))}
                    </> : null}
                  </div>
                ) : (
                  <p className="sidebar-playlist-menu-empty">No playlists yet.</p>
                )}
                <DropdownMenu.Item asChild>
                  <button className="sidebar-playlist-menu-create" type="button" onClick={() => setPlaylistCreatorOpen(true)}>
                    <Plus size={15} />
                    New playlist
                  </button>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
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
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={beginSidebarResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setSidebarWidthState(sidebarWidth - 16);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setSidebarWidthState(sidebarWidth + 16);
            }
            if (event.key === "Home") {
              event.preventDefault();
              setSidebarWidthState(SIDEBAR_MIN_WIDTH);
            }
            if (event.key === "End") {
              event.preventDefault();
              setSidebarWidthState(SIDEBAR_MAX_WIDTH);
            }
          }}
        />
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
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsedState(!sidebarCollapsed)}
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
          <button
            className="icon-button topbar-right-sidebar-toggle"
            type="button"
            aria-label={rightPanelOpen ? "Hide right sidebar" : "Show right sidebar"}
            aria-pressed={rightPanelOpen}
            title={rightPanelOpen ? "Hide sidebar" : "Show sidebar"}
            onClick={() => setRightPanelState(!rightPanelOpen)}
          >
            {rightPanelOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </button>
        </header>

        <div className="workspace-viewport">
          {!appSettings.analyticsEnabled && !appSettings.analyticsPromptDismissed ? (
            <AnalyticsBanner onEnable={() => setAnalyticsConsent(true)} onDismiss={dismissAnalyticsPrompt} />
          ) : null}
          {availableUpdate && appSettings.updateDismissedVersion !== availableUpdate.version ? (
            <UpdateBanner
              update={availableUpdate}
              onDismiss={() => updateAppSettings({ ...appSettings, updateDismissedVersion: availableUpdate.version })}
            />
          ) : null}

          {activeView === "settings" ? (
            <SettingsView
              form={form}
              setForm={setForm}
              status={status}
              statusMessage={statusMessage}
              appSettings={appSettings}
              discordPresenceStatus={discordPresenceStatus}
              activeTab={settingsTab}
              setActiveTab={selectSettingsTab}
              updateAppSettings={updateAppSettings}
              onSelectRadioStation={selectRadioStation}
              onRemoveRadioStation={removeRadioStation}
              setAnalyticsConsent={setAnalyticsConsent}
              resetAppSettings={resetAppSettings}
              setAlbumViewMode={setAlbumViewMode}
              setArtistViewMode={setArtistViewMode}
              availableUpdate={availableUpdate}
              updateCheckStatus={updateCheckStatus}
              onCheckForUpdates={() => void checkForUpdates()}
              canOpenWhatsNew={Boolean(currentReleaseNotes)}
              onSave={saveConnection}
              onReset={resetConnection}
            />
          ) : (
            <LibraryView
              activeView={activeView}
              config={config}
              listenerName={listenerName}
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
              tuneInRadio={tuneInRadio}
              onStartRadio={() => {
                selectView("radio");
                if (radioStatus !== "playing") void tuneInRadio();
              }}
              onAddFirstRadioStation={tuneInRadio}
              albums={libraryData.albums}
              recentAlbums={libraryData.recentAlbums}
              recentlyPlayedAlbums={libraryData.recentlyPlayedAlbums}
              listeningHistory={listeningHistory}
              onSelectView={selectView}
              onClearListeningHistory={clearListeningHistory}
              songs={songLibrary}
              songLibraryStatus={songLibraryStatus}
              onRetrySongs={() => void loadSongLibrary()}
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
              detailSelection={detailSelection}
              detailStatus={detailStatus}
              detailMessage={detailMessage}
              currentTrack={currentTrack}
              currentTrackCoverUrl={currentTrackCoverUrl}
              isPlaying={isPlaying}
              position={position}
              duration={playerDuration || currentTrack?.duration || 0}
              hasPrevious={currentIndex > 0}
              hasNext={repeatMode === "all" || currentIndex < queue.length - 1}
              onTogglePlayback={togglePlayback}
              onPrevious={playPrevious}
              onNext={() => playNext(false)}
              onSeek={seekTo}
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
        </div>
      </section>

      <footer className="player-bar" aria-label="Playback controls">
        <audio
          ref={primaryAudioRef}
          preload="auto"
          onPlay={() => setActivePlaybackSource("local")}
          onTimeUpdate={(event) => handleLocalTimeUpdate(event.currentTarget)}
          onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
          onDurationChange={(event) => handleLocalDurationChange(event.currentTarget)}
          onEnded={(event) => handleLocalTrackEnded(event.currentTarget)}
          onError={() => {
            if (currentTrack && primaryAudioRef.current === getActiveAudio()) {
              setIsPlaying(false);
              setPlayerError("Track stream failed.");
            }
          }}
        />
        <audio
          ref={secondaryAudioRef}
          preload="auto"
          onPlay={() => setActivePlaybackSource("local")}
          onTimeUpdate={(event) => handleLocalTimeUpdate(event.currentTarget)}
          onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
          onDurationChange={(event) => handleLocalDurationChange(event.currentTarget)}
          onEnded={(event) => handleLocalTrackEnded(event.currentTarget)}
          onError={() => {
            if (currentTrack && secondaryAudioRef.current === getActiveAudio()) {
              setIsPlaying(false);
              setPlayerError("Track stream failed.");
            }
          }}
        />
        <audio
          ref={radioAudioRef}
          preload="none"
          onPlay={() => {
            setIsRadioTuning(false);
            setActivePlaybackSource("radio");
            setRadioStatus("playing");
          }}
          onPause={() => setRadioStatus(radioStationState ? "ready" : "idle")}
          onError={() => {
            if (!radioAudioRef.current?.src) return;
            setRadioStatus("checking");
            setRadioMessage("Reconnecting radio...");
          }}
        />

        <div className={`now-playing ${footerTrack || isRadioPresentation ? "" : "empty"}`}>
          {isRadioPresentation ? (
            radioCoverUrl ? (
              <CoverArt src={isRadioTuning ? null : radioCoverUrl} label={isRadioTuning ? "Tuning In" : radioNowPlaying?.title ?? "Radio"} className="player-cover" fallbackIcon={<RadioTower size={20} />} />
            ) : (
              <CoverArt src={null} label="Radio" className="player-cover" fallbackIcon={<RadioTower size={20} />} />
            )
          ) : footerTrack ? (
            <button className="player-now-playing-trigger" type="button" onClick={() => selectView("nowPlaying")} aria-label={`Open Now Playing for ${footerTrack.title}`}>
              <CoverArt src={footerTrackCoverUrl} label={footerTrack.title} className="player-cover" fallbackIcon={<Music2 size={20} />} />
              <Maximize2 size={14} aria-hidden="true" />
            </button>
          ) : null}
          <div className="now-playing-copy">
            {isRadioPresentation ? (
              <>
                <span className="track-title radio-footer-title">{isRadioTuning ? "Tuning In" : footerRadioTitle}</span>
                <p className="track-meta">
                  <span>{isRadioTuning ? "Connecting to station…" : footerRadioMeta}</span>
                </p>
                {!isRadioTuning && radioNowPlaying?.album ? <p className="track-album">{radioNowPlaying.album}</p> : null}
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
          <div className={`transport ${isRadioPlaying ? "radio-transport" : ""}`}>
            {isRadioPlaying ? (
              <>
                <button
                  className={radioPopover === "schedule" ? "active" : ""}
                  type="button"
                  aria-label="Show radio schedule"
                  aria-expanded={radioPopover === "schedule"}
                  onClick={() => setRadioPopover((open) => (open === "schedule" ? null : "schedule"))}
                  title="Schedule"
                >
                  <CalendarDays size={15} />
                </button>
                <button
                  className={radioPopover === "request" ? "active" : ""}
                  type="button"
                  aria-label="Request a song"
                  aria-expanded={radioPopover === "request"}
                  onClick={() => setRadioPopover((open) => (open === "request" ? null : "request"))}
                  title="Request"
                >
                  <Send size={15} />
                </button>
                <button className="play-button" type="button" aria-label="Stop radio" onClick={() => tuneOutRadio()} title="Stop radio">
                  <Square size={17} fill="currentColor" />
                </button>
                <button
                  className={radioIsLiked ? "active" : ""}
                  type="button"
                  aria-label={radioIsLiked ? "Already liked this Subwave track" : "Like this Subwave track"}
                  aria-pressed={radioIsLiked}
                  onClick={likeCurrentRadioTrack}
                  disabled={!radioCanLike || radioIsLiked || radioLikeBusy}
                  title={radioIsLiked ? "Liked" : "Like this track"}
                >
                  {radioLikeBusy ? <Loader2 size={15} className="spin" /> : <Heart size={15} fill={radioIsLiked ? "currentColor" : "none"} />}
                </button>
                <button
                  className={radioPopover === "booth" ? "active" : ""}
                  type="button"
                  aria-label="Show booth feed"
                  aria-expanded={radioPopover === "booth"}
                  onClick={() => setRadioPopover((open) => (open === "booth" ? null : "booth"))}
                  title="Booth feed"
                >
                  <Mic2 size={15} />
                </button>
              </>
            ) : (
              <>
                <button
                  className={shuffleEnabled ? "active" : ""}
                  type="button"
                  aria-label={shuffleEnabled ? "Disable shuffle" : "Enable shuffle"}
                  aria-pressed={shuffleEnabled}
                  onClick={toggleShuffle}
                  disabled={queue.length < 2}
                  title="Shuffle"
                >
                  <Shuffle size={15} />
                </button>
                <button type="button" aria-label="Previous" onClick={playPrevious} disabled={!queue.length || currentIndex === 0}>
                  <SkipBack size={16} />
                </button>
                <button className="play-button" type="button" aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlayback} disabled={!queue.length}>
                  {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => playNext(false)}
                  disabled={!queue.length || (repeatMode !== "all" && currentIndex >= queue.length - 1)}
                >
                  <SkipForward size={16} />
                </button>
                <button
                  className={`repeat-button ${repeatMode !== "off" ? "active" : ""} ${repeatMode === "one" ? "repeat-one" : ""}`}
                  type="button"
                  aria-label={`Repeat ${repeatMode}`}
                  aria-pressed={repeatMode !== "off"}
                  onClick={cycleRepeatMode}
                  disabled={!queue.length}
                  title={repeatMode === "off" ? "Repeat off" : repeatMode === "all" ? "Repeat all" : "Repeat one"}
                >
                  <Repeat size={15} />
                  {repeatMode === "one" ? <span className="repeat-one-indicator" aria-hidden="true">1</span> : null}
                </button>
              </>
            )}
            {isRadioPlaying && radioPopover ? (
              <div className={`radio-control-popover ${radioPopover === "schedule" ? "schedule-popover" : ""}`} role="menu">
                <div className="radio-control-popover-title">
                  <span>{radioPopover === "schedule" ? "Schedule" : radioPopover === "request" ? "Request" : "Booth Feed"}</span>
                  <button type="button" aria-label="Close" onClick={() => setRadioPopover(null)}>
                    <X size={14} />
                  </button>
                </div>
                {radioPopover === "schedule" ? (
                  radioScheduleMenuItems.length ? (
                    <div className="radio-popover-list radio-schedule-popover-list">
                      {radioScheduleMenuItems.map((item) => (
                        <div className={`radio-schedule-popover-row ${item.isCurrent ? "current" : ""}`} key={item.key}>
                          <span>{item.time}</span>
                          <div>
                            <strong>{item.showName}</strong>
                            {item.djName ? <small>with {item.djName}</small> : null}
                            {item.detail ? <p>{item.detail}</p> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="radio-popover-empty">Schedule unavailable.</p>
                  )
                ) : radioPopover === "request" ? (
                  <RadioRequestPopover
                    stationUrl={radioStationUrl}
                    onClose={() => setRadioPopover(null)}
                    onResolved={() => {
                      if (!radioStationUrl) return;
                      const requestGeneration = radioGenerationRef.current;
                      void fetchRadioState(radioStationUrl)
                        .then((nextState) => applyRadioStationState(nextState, requestGeneration))
                        .catch(() => undefined);
                    }}
                  />
                ) : radioBoothLines.length ? (
                  <div className="radio-popover-list">
                    {radioBoothLines.map((line, index) => (
                      <div className="radio-booth-popover-row" key={`${line.t ?? "line"}-${index}`}>
                        <span>{relativeRadioTurnTime(line)}</span>
                        <p>{line.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="radio-popover-empty">Quiet in the booth.</p>
                )}
              </div>
            ) : null}
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
          <div className={`volume-control ${isMuted ? "muted" : ""}`}>
            <button className="volume-mute-button" type="button" onClick={toggleMuted} aria-label={isMuted ? "Unmute volume" : "Mute volume"} aria-pressed={isMuted}>
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              className="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isRadioPlaying ? radioVolume : volume}
              onChange={(event) => (isRadioPlaying ? setRadioPlaybackVolume(Number(event.target.value)) : setPlayerVolume(Number(event.target.value)))}
              disabled={isMuted}
              aria-label={isMuted ? "Volume muted" : "Volume"}
            />
          </div>
        </div>
      </footer>

      {rightPanelOpen ? (
        <RightSidebar
          tab={rightPanelTab}
          setTab={selectRightPanelTab}
          queue={queue}
          displayedQueue={displayedQueue}
          currentIndex={currentIndex}
          currentTrack={currentTrack}
          radioNowPlaying={radioNowPlaying}
          radioUpcoming={radioUpcoming}
          radioHistory={radioHistory}
          radioStatus={radioStatus}
          isRadioPlaying={isRadioPlaying}
          position={position}
          isPlaying={isPlaying}
          lyricsStatus={lyricsStatus}
          lyricsLines={lyricsLines}
          lyricsMessage={lyricsMessage}
          draggedQueueIndex={draggedQueueIndex}
          dragOverQueueIndex={dragOverQueueIndex}
          setDraggedQueueIndex={setDraggedQueueIndex}
          setDragOverQueueIndex={setDragOverQueueIndex}
          rightSidebarWidth={rightSidebarWidth}
          onResizeRightSidebar={beginRightSidebarResize}
          onSetRightSidebarWidth={setRightSidebarWidthState}
          onDropQueueItem={dropQueueItem}
          onSelectQueueTrack={selectQueueTrack}
          onRemoveQueueItem={removeQueueItem}
          onClearQueue={clearQueue}
        />
      ) : null}

      {setupOpen ? (
        <FirstRunWizard
          form={form}
          setForm={setForm}
          status={status}
          statusMessage={statusMessage}
          catalogStatus={catalogStatus}
          catalogProgress={catalogProgress}
          onSave={saveConnection}
          onClose={() => setSetupOpen(false)}
        />
      ) : null}
      {whatsNewOpen && whatsNewReleases.length ? (
        <WhatsNewDialog releases={whatsNewReleases} onClose={dismissWhatsNew} />
      ) : null}
      {playlistCreatorOpen ? (
        <PrismDialog open={playlistCreatorOpen} onOpenChange={(open) => !open && closePlaylistCreator()}>
          <section className="playlist-modal" aria-labelledby="playlist-create-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Playlist</p>
                <Dialog.Title asChild><h3 id="playlist-create-title">New Playlist</h3></Dialog.Title>
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
        </PrismDialog>
      ) : null}
      {songContextMenu ? (
        <SongPlaylistMenu
          menu={songContextMenu}
          playlists={libraryData.playlists}
          status={playlistAddStatus}
          message={playlistAddMessage}
          onAdd={(playlist) => void addSongsToSelectedPlaylist(playlist, songContextMenu.songs)}
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
          onCreatePlaylist={() => createPlaylistFromSongs(songContextMenu.song.title, songContextMenu.songs)}
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
          playlists={libraryData.playlists}
          status={playlistAddStatus}
          onAddAlbum={(playlist, album) => void addAlbumToPlaylist(playlist, album)}
          onAddArtist={(playlist, artist) => void addArtistToPlaylist(playlist, artist)}
          onCreateAlbumPlaylist={(album) => {
            if (!config) return;
            void loadAlbumDetail(config, album.id).then((detail) => createPlaylistFromSongs(album.name, sortAlbumSongs(detail.song ?? [])));
          }}
          onCreateArtistPlaylist={(artist) => {
            if (!config) return;
            void loadArtistDetail(config, artist.id)
              .then((detail) => Promise.all((detail.album ?? []).slice(0, 50).map((album) => loadAlbumDetail(config, album.id))))
              .then((albums) => createPlaylistFromSongs(artist.name, albums.flatMap((album) => album.song ?? [])));
          }}
        />
      ) : null}
      {playlistDeleteTarget ? (
        <PrismAlertDialog open={Boolean(playlistDeleteTarget)} onOpenChange={(open) => !open && setPlaylistDeleteTarget(null)} className="confirm-backdrop">
          <section className="playlist-modal confirm-modal" aria-labelledby="context-playlist-delete-title">
            <div className="confirm-icon" aria-hidden="true">
              <Trash2 size={22} />
            </div>
            <div className="confirm-copy">
              <p className="eyebrow">Delete Playlist</p>
              <AlertDialog.Title asChild><h3 id="context-playlist-delete-title">{playlistDeleteTarget.name}</h3></AlertDialog.Title>
              <AlertDialog.Description asChild><p>This removes the playlist from Navidrome. The songs stay in your library.</p></AlertDialog.Description>
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
        </PrismAlertDialog>
      ) : null}
    </main>
      </ContextMenu.Trigger>
    </ContextMenu.Root>
  );
}

function RightSidebar({
  tab,
  setTab,
  queue,
  displayedQueue,
  currentIndex,
  currentTrack,
  radioNowPlaying,
  radioUpcoming,
  radioHistory,
  radioStatus,
  isRadioPlaying,
  position,
  isPlaying,
  lyricsStatus,
  lyricsLines,
  lyricsMessage,
  draggedQueueIndex,
  dragOverQueueIndex,
  setDraggedQueueIndex,
  setDragOverQueueIndex,
  rightSidebarWidth,
  onResizeRightSidebar,
  onSetRightSidebarWidth,
  onDropQueueItem,
  onSelectQueueTrack,
  onRemoveQueueItem,
  onClearQueue,
}: {
  tab: RightPanelTab;
  setTab: (tab: RightPanelTab) => void;
  queue: Song[];
  displayedQueue: Array<{ song: Song; index: number }>;
  currentIndex: number;
  currentTrack: Song | null;
  radioNowPlaying: RadioTrack | null;
  radioUpcoming: RadioTrack[];
  radioHistory: RadioTrack[];
  radioStatus: RadioStatus;
  isRadioPlaying: boolean;
  position: number;
  isPlaying: boolean;
  lyricsStatus: LyricsStatus;
  lyricsLines: LyricLine[];
  lyricsMessage: string;
  draggedQueueIndex: number | null;
  dragOverQueueIndex: number | null;
  setDraggedQueueIndex: (index: number | null) => void;
  setDragOverQueueIndex: (index: number | null) => void;
  rightSidebarWidth: number;
  onResizeRightSidebar: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSetRightSidebarWidth: (width: number) => void;
  onDropQueueItem: (toIndex: number, fromIndex?: number) => void;
  onSelectQueueTrack: (index: number) => void;
  onRemoveQueueItem: (index: number) => void;
  onClearQueue: () => void;
}) {
  const queueDuration = queue.reduce((total, song) => total + (song.duration ?? 0), 0);
  const visibleQueueDuration = displayedQueue.reduce((total, item) => total + (item.song.duration ?? 0), 0);
  const upcomingCount = Math.max(displayedQueue.length - 1, 0);
  const hasRadioQueuePayload = Boolean(radioHistory.length || radioNowPlaying || radioUpcoming.length);
  const isRadioSession = isRadioPlaying || radioStatus === "checking";
  const recentRadioHistory = radioHistory.slice(0, 5).reverse();
  const lyricsScrollRef = useRef<HTMLDivElement | null>(null);
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null);
  const latestDragOverQueueIndexRef = useRef<number | null>(dragOverQueueIndex);
  const [queueDragGhost, setQueueDragGhost] = useState<{
    song: Song;
    width: number;
    height: number;
    left: number;
    top: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
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
    if (tab !== "lyrics" || activeLyricIndex < 0 || !lyricsScrollRef.current || !activeLyricRef.current) return;
    scrollElementWithin(lyricsScrollRef.current, activeLyricRef.current, "center");
  }, [activeLyricIndex, tab]);

  useEffect(() => {
    latestDragOverQueueIndexRef.current = dragOverQueueIndex;
  }, [dragOverQueueIndex]);

  const headingLabel = tab === "queue" ? (isRadioSession ? "Timeline" : "Queue") : "Lyrics";
  const queueTabLabel = isRadioSession ? "Timeline" : "Queue";
    const queueIndexFromPointer = (event: PointerEvent) => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".right-sidebar [data-queue-index]"))
        .map((row) => ({ row, index: Number(row.dataset.queueIndex) }))
        .filter((entry) => Number.isInteger(entry.index));

      if (!rows.length) return null;

      for (const { row, index } of rows) {
        const rect = row.getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) return index;
      }
      return rows[rows.length - 1]?.index + 1;
  };
    const setQueueDropTarget = (index: number | null) => {
    latestDragOverQueueIndexRef.current = index;
    setDragOverQueueIndex(index);
  };

  function startQueuePointerReorder(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (!queue[index]) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget.closest<HTMLElement>("[data-queue-index]");
    const rowRect = row?.getBoundingClientRect();
    if (rowRect) {
      setQueueDragGhost({
        song: queue[index],
        width: rowRect.width,
        height: rowRect.height,
        left: rowRect.left,
        top: rowRect.top,
        offsetX: event.clientX - rowRect.left,
        offsetY: event.clientY - rowRect.top,
      });
      }
      setDraggedQueueIndex(index);
      setQueueDropTarget(null);

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      setQueueDragGhost((ghost) => ghost ? { ...ghost, left: moveEvent.clientX - ghost.offsetX, top: moveEvent.clientY - ghost.offsetY } : ghost);
        const nextIndex = queueIndexFromPointer(moveEvent);
      if (nextIndex != null) setQueueDropTarget(nextIndex);
    };
    const handleEnd = (upEvent: PointerEvent) => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleEnd);
      document.removeEventListener("pointercancel", handleCancel);
      setQueueDragGhost(null);
        onDropQueueItem(latestDragOverQueueIndexRef.current ?? queueIndexFromPointer(upEvent) ?? index, index);
    };
    const handleCancel = () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleEnd);
      document.removeEventListener("pointercancel", handleCancel);
      setQueueDragGhost(null);
      setDraggedQueueIndex(null);
      setDragOverQueueIndex(null);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleEnd, { once: true });
    document.addEventListener("pointercancel", handleCancel, { once: true });
  }

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
          {queueTabLabel}
        </button>
        <button className={tab === "lyrics" ? "active" : ""} type="button" onClick={() => setTab("lyrics")}>
          <Music2 size={15} />
          Lyrics
        </button>
      </div>

      {tab === "queue" ? (
        <div className="right-panel-section queue-panel-section">
          {!isRadioSession ? (
            <div className="queue-heading">
              <p className="eyebrow">Now + Next</p>
              <div className="queue-heading-actions">
                <span>{displayedQueue.length ? `${displayedQueue.length} tracks` : "Empty"}</span>
                <button type="button" onClick={onClearQueue} disabled={!queue.length}>
                  Clear
                </button>
              </div>
            </div>
          ) : null}
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
                      <p className="radio-on-air-label">On air</p>
                      <RadioQueueRow track={radioNowPlaying} tone="current" />
                    </div>
                  ) : null}
                  {radioUpcoming.length ? (
                    <div className="radio-queue-section">
                      <p>Up next</p>
                      {radioUpcoming.slice(0, 8).map((track, index) => (
                        <RadioQueueRow track={track} key={`upcoming-${track.title ?? "track"}-${track.artist ?? "artist"}-${index}`} />
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
                    className={`queue-row ${index === currentIndex ? "active" : ""} ${index === draggedQueueIndex ? "dragging" : ""} ${dragOverQueueIndex === index ? "drop-before" : ""} ${dragOverQueueIndex === index + 1 ? "drop-after" : ""}`}
                  key={`${song.id}-${index}`}
                  data-queue-index={index}
                  onDragOver={(event) => {
                    event.preventDefault();
                      setQueueDropTarget(index);
                  }}
                    onPointerMove={(event) => {
                      if (draggedQueueIndex != null) {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setQueueDropTarget(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
                      }
                    }}
                  onDrop={() => onDropQueueItem(dragOverQueueIndex ?? index, draggedQueueIndex ?? undefined)}
                >
                  <button
                    className="queue-drag-handle"
                    type="button"
                    aria-label={`Move ${song.title}`}
                    onPointerDown={(event) => startQueuePointerReorder(event, index)}
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
                      <X size={13} />
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
                <div className="lyrics-lines" ref={lyricsScrollRef}>
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
      {queueDragGhost ? (
        <div
          className="queue-drag-ghost"
          style={{
            width: queueDragGhost.width,
            height: queueDragGhost.height,
            transform: `translate3d(${queueDragGhost.left}px, ${queueDragGhost.top}px, 0)`,
          }}
          aria-hidden="true"
        >
          <Menu size={14} />
          <div>
            <strong>{queueDragGhost.song.title}</strong>
            <small>{queueDragGhost.song.artist ?? "Unknown artist"}</small>
          </div>
          <small>{formatDuration(queueDragGhost.song.duration)}</small>
        </div>
      ) : null}
      <div
        className="right-sidebar-resize-handle"
        role="separator"
        aria-label="Resize right sidebar"
        aria-orientation="vertical"
        aria-valuemin={RIGHT_SIDEBAR_MIN_WIDTH}
        aria-valuemax={RIGHT_SIDEBAR_MAX_WIDTH}
        aria-valuenow={rightSidebarWidth}
        tabIndex={0}
        onPointerDown={onResizeRightSidebar}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onSetRightSidebarWidth(rightSidebarWidth + 16);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onSetRightSidebarWidth(rightSidebarWidth - 16);
          }
          if (event.key === "Home") {
            event.preventDefault();
            onSetRightSidebarWidth(RIGHT_SIDEBAR_MIN_WIDTH);
          }
          if (event.key === "End") {
            event.preventDefault();
            onSetRightSidebarWidth(RIGHT_SIDEBAR_MAX_WIDTH);
          }
        }}
      />
    </aside>
  );
}

function RadioQueueRow({ track, tone = "next" }: { track: RadioTrack; tone?: "previous" | "current" | "next" }) {
  const metaArtist = track.artist ?? track.album ?? "Subwave";
  const metaStatus = track.requestedBy ? "Request" : track.duration ? formatDuration(track.duration) : "";

  return (
    <div className={`queue-row radio-queue-row ${tone}`}>
      <div className="queue-track">
        <strong>
          <span>{track.title ?? "Unknown track"}</span>
        </strong>
        <div className="radio-queue-meta">
          <small>{metaArtist}</small>
          {metaStatus ? <small>{metaStatus}</small> : null}
        </div>
      </div>
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
  sidebarCollapsed,
  onToggleSidebar,
}: {
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  backTarget: BrowserSnapshot | null;
  forwardTarget: BrowserSnapshot | null;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const backLabel = getSnapshotLabel(backTarget);
  const forwardLabel = getSnapshotLabel(forwardTarget);

  return (
    <div className="browser-nav" aria-label="Browser history">
      <button
        className="icon-button sidebar-topbar-toggle"
        type="button"
        aria-label={sidebarCollapsed ? "Show left sidebar" : "Hide left sidebar"}
        aria-pressed={!sidebarCollapsed}
        title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        onClick={onToggleSidebar}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
      </button>
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

function PrismMark({ className = "" }: { className?: string }) {
  return (
    <div className={`prism-mark ${className}`} aria-hidden="true">
      <span>P</span>
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
        <p>Share anonymous install analytics through Beacon, including aggregate library counts. No account or playback data is sent.</p>
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

function UpdateBanner({ update, onDismiss }: { update: AvailableUpdate; onDismiss: () => void }) {
  return (
    <section className="analytics-banner update-banner" aria-label="Prism update available">
      <div className="analytics-banner-icon" aria-hidden="true">
        <Download size={18} />
      </div>
      <div>
        <strong>Prism {update.version} is available</strong>
        <p>You’re using {packageJson.version}. Visit the release page to download the latest build.</p>
      </div>
      <div className="analytics-banner-actions">
        <button className="secondary-button compact-button" type="button" onClick={onDismiss}>
          Not Now
        </button>
        <a className="connect-button compact-button" href={update.releaseUrl} target="_blank" rel="noreferrer">
          View Release
        </a>
      </div>
    </section>
  );
}

function WhatsNewDialog({ releases, onClose }: { releases: WhatsNewRelease[]; onClose: () => void }) {
  const latestRelease = releases[0];

  return (
    <PrismDialog open onOpenChange={(open) => !open && onClose()}>
      <section className="whats-new-modal" aria-labelledby="whats-new-title">
        <button className="icon-button close-button" type="button" aria-label="Close what’s new" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="whats-new-art" aria-hidden="true">
          <Star size={30} />
        </div>
        <p className="eyebrow">What’s new</p>
        <Dialog.Title asChild><h2 id="whats-new-title">Prism {latestRelease.displayVersion ?? latestRelease.version}</h2></Dialog.Title>
        <Dialog.Description asChild><p className="whats-new-copy">
          {releases.length === 1 ? latestRelease.title : `Here’s what changed since Prism ${releases[releases.length - 1]?.version}.`}
        </p></Dialog.Description>
        <div className="whats-new-release-list">
          {releases.map((release) => (
            <section className="whats-new-release" key={release.version}>
              {releases.length > 1 ? <h3>Prism {release.version}</h3> : null}
              <ul>
                {release.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
              </ul>
            </section>
          ))}
        </div>
        <div className="whats-new-actions">
          <button className="connect-button" type="button" onClick={onClose}>Got it</button>
        </div>
      </section>
    </PrismDialog>
  );
}

function SettingsView({
  form,
  setForm,
  status,
  statusMessage,
  appSettings,
  discordPresenceStatus,
  activeTab,
  setActiveTab,
  updateAppSettings,
  onSelectRadioStation,
  onRemoveRadioStation,
  setAnalyticsConsent,
  resetAppSettings,
  setAlbumViewMode,
  setArtistViewMode,
  availableUpdate,
  updateCheckStatus,
  onCheckForUpdates,
  canOpenWhatsNew,
  onSave,
  onReset,
}: {
  form: NavidromeConfig;
  setForm: (config: NavidromeConfig) => void;
  status: ConnectionStatus;
  statusMessage: string;
  appSettings: AppSettings;
  discordPresenceStatus: DiscordPresenceStatus;
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
  updateAppSettings: (settings: AppSettings) => void;
  onSelectRadioStation: (stationUrl: string) => void;
  onRemoveRadioStation: (stationUrl: string) => void;
  setAnalyticsConsent: (enabled: boolean) => void;
  resetAppSettings: () => void;
  setAlbumViewMode: (mode: AlbumViewMode) => void;
  setArtistViewMode: (mode: ArtistViewMode) => void;
  availableUpdate: AvailableUpdate | null;
  updateCheckStatus: "idle" | "checking" | "up-to-date" | "available" | "error";
  onCheckForUpdates: () => void;
  canOpenWhatsNew: boolean;
  onSave: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  onReset: () => void;
}) {
  const [newRadioStationUrl, setNewRadioStationUrl] = useState("");
  const [installIdCopied, setInstallIdCopied] = useState(false);
  const [installId, setInstallId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(INSTALL_ID_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (activeTab !== "about") return;

    try {
      setInstallId(localStorage.getItem(INSTALL_ID_KEY));
    } catch {
      setInstallId(null);
    }
  }, [activeTab]);

  async function copyInstallId() {
    if (!installId) return;

    try {
      await navigator.clipboard.writeText(installId);
      setInstallIdCopied(true);
      window.setTimeout(() => setInstallIdCopied(false), 2_000);
    } catch {
      setInstallIdCopied(false);
    }
  }

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
          { id: "playback", label: "Playback", icon: <Play size={15} /> },
          { id: "appearance", label: "Appearance", icon: <Waves size={15} /> },
          { id: "radio", label: "Radio", icon: <RadioTower size={15} /> },
          { id: "privacy", label: "Privacy", icon: <CheckCircle2 size={15} /> },
          { id: "about", label: "About", icon: <Info size={15} /> },
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
        <p className="settings-note">
          {isTauriDesktopApp()
            ? "Your password is stored in this device’s secure credential store."
            : "Browser previews use your password for this session only. Use the installed desktop app for native secure storage."}
        </p>

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
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={appSettings.showSharedPlaylists}
            onChange={(event) => updateAppSettings({ ...appSettings, showSharedPlaylists: event.target.checked })}
          />
          <span>Show shared playlists in the Playlists menu</span>
        </label>
      </section> : null}

      {activeTab === "playback" ? <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Playback</p>
            <h3>Track transitions</h3>
          </div>
          <Play size={18} />
        </div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={appSettings.trackTransitionSeconds > 0}
            onChange={(event) => updateAppSettings({ ...appSettings, trackTransitionSeconds: event.target.checked ? 5 : 0 })}
          />
          <span>Enable crossfade</span>
        </label>
        {appSettings.trackTransitionSeconds > 0 ? <label>
          Crossfade duration: {appSettings.trackTransitionSeconds} second{appSettings.trackTransitionSeconds === 1 ? "" : "s"}
          <input
            type="range"
            min="1"
            max="12"
            step="1"
            value={appSettings.trackTransitionSeconds}
            onChange={(event) => updateAppSettings({ ...appSettings, trackTransitionSeconds: Number(event.target.value) })}
          />
        </label> : null}
        <p className="settings-note">
          Gapless playback is on by default. Prism preloads the next queued local track; crossfade is optional. Radio is unchanged.
        </p>
      </section> : null}

      {activeTab === "appearance" ? <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Appearance</p>
            <h3>Color and cover wash</h3>
          </div>
          <Waves size={18} />
        </div>
        <div className="theme-picker" role="group" aria-label="Color theme">
          <p className="settings-label">Color theme</p>
          <div className="theme-options">
            {colorThemes.map((theme) => (
              <button
                className={`theme-option ${appSettings.colorTheme === theme.id ? "active" : ""}`}
                type="button"
                key={theme.id}
                aria-pressed={appSettings.colorTheme === theme.id}
                onClick={() => updateAppSettings({ ...appSettings, colorTheme: theme.id })}
              >
                <span className="theme-swatches" aria-hidden="true">
                  {theme.swatches.map((color) => <span style={{ backgroundColor: color }} key={color} />)}
                </span>
                <span className="theme-option-copy">
                  <strong>{theme.label}</strong>
                  <small>{theme.description}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={appSettings.coverWashEnabled}
            disabled={appSettings.lowPerformanceMode}
            onChange={(event) => updateAppSettings({ ...appSettings, coverWashEnabled: event.target.checked })}
          />
          <span>Use current album art as the background wash</span>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={appSettings.lowPerformanceMode}
            onChange={(event) => updateAppSettings({ ...appSettings, lowPerformanceMode: event.target.checked })}
          />
          <span>Low performance mode hides the art wash and live radio waveform</span>
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
                <div className="settings-station-details">
                  <button className="settings-station-main" type="button" onClick={() => onSelectRadioStation(stationUrl)}>
                    <RadioTower size={15} />
                    <span>{appSettings.radioStationNames[stationUrl] || stationUrl.replace(/^https?:\/\//, "")}</span>
                  </button>
                  <input
                    className="settings-station-name"
                    aria-label={`Display name for ${stationUrl}`}
                    value={appSettings.radioStationNames[stationUrl] ?? ""}
                    onChange={(event) => {
                      const name = event.target.value.trim();
                      const radioStationNames = { ...appSettings.radioStationNames };
                      if (name) radioStationNames[stationUrl] = name;
                      else delete radioStationNames[stationUrl];
                      updateAppSettings({ ...appSettings, radioStationNames });
                    }}
                    placeholder="Display name (optional)"
                  />
                </div>
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
        <p className="settings-note">Prism remembers the station name reported by `/api/state`; use Display name to override it. Streams play from `/stream.mp3`.</p>
      </section> : null}

      {activeTab === "privacy" ? <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Discord</p>
            <h3>Rich Presence</h3>
          </div>
          <MessageCircle size={18} />
        </div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={appSettings.discordPresenceEnabled}
            onChange={(event) => updateAppSettings({ ...appSettings, discordPresenceEnabled: event.target.checked })}
          />
          <span>Show what I’m playing on Discord</span>
        </label>
        <p className="settings-note">
          Desktop only. Prism sends the current track, artist, album, and playback state directly to the Discord app running on this device. Nothing is sent to Prism or a Discord bot.
        </p>
        {appSettings.discordPresenceEnabled ? <p className={`settings-note ${discordPresenceStatus === "unavailable" ? "bad" : ""}`}>
          {discordPresenceStatus === "connecting" ? "Connecting to Discord…" : null}
          {discordPresenceStatus === "connected" ? "Connected to Discord." : null}
          {discordPresenceStatus === "unavailable" ? "Discord is unavailable. Keep the desktop app open and try again." : null}
          {discordPresenceStatus === "idle" ? "Start local playback to update Discord." : null}
        </p> : null}
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
          Sends a periodic Beacon ping with app version, install id, platform, channel, dev/release flag, and aggregate artist, album, and song counts. No account or playback data is sent.
        </p>
      </section> : null}

      {activeTab === "about" ? <section className="settings-panel about-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Prism Player</p>
            <h3>About</h3>
          </div>
          <Info size={18} />
        </div>
        <div className="about-version-row">
          <div className="about-version-details">
            <span className="settings-label">Installed version</span>
            <strong>v{APP_VERSION}</strong>
            <span className="about-commit-sha" title={`Commit ${APP_COMMIT_SHA}`}>SHA {APP_COMMIT_SHA}</span>
            <div className="about-install-id">
              <span className="settings-label">Beacon install ID</span>
              {installId ? <div className="about-install-id-value">
                <code title={installId}>{installId}</code>
                <button className="secondary-button compact-button" type="button" onClick={copyInstallId}>
                  {installIdCopied ? <Check size={14} /> : <Copy size={14} />}
                  {installIdCopied ? "Copied" : "Copy ID"}
                </button>
              </div> : <span className="settings-note">Created when analytics is enabled.</span>}
            </div>
          </div>
          <div className="about-update-action">
            {availableUpdate ? <a className="connect-button compact-button" href={availableUpdate.releaseUrl} target="_blank" rel="noreferrer">
              <Download size={15} />
              Update available
            </a> : <button className="secondary-button compact-button" type="button" onClick={onCheckForUpdates} disabled={updateCheckStatus === "checking"}>
              {updateCheckStatus === "checking" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
              Check for updates
            </button>}
            <p className={`settings-note update-check-status ${updateCheckStatus === "error" ? "bad" : ""}`}>
              {updateCheckStatus === "checking" ? "Checking GitHub releases…" : null}
              {updateCheckStatus === "up-to-date" ? "You’re up to date." : null}
              {updateCheckStatus === "available" && availableUpdate ? `Prism v${availableUpdate.version} is ready to download.` : null}
              {updateCheckStatus === "error" ? "Couldn’t check for updates right now. Try again shortly." : null}
              {updateCheckStatus === "idle" ? "Check GitHub Releases for the latest Prism build." : null}
            </p>
          </div>
        </div>
        <div className="about-links" aria-label="Prism links">
          <a href={PRISM_REPOSITORY_URL} target="_blank" rel="noreferrer"><Code2 size={16} /> GitHub <ExternalLink size={13} /></a>
          <a href={PRISM_RELEASES_URL} target="_blank" rel="noreferrer"><Download size={16} /> Releases <ExternalLink size={13} /></a>
          <a href={PRISM_DISCORD_URL} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Discord <ExternalLink size={13} /></a>
        </div>
        {canOpenWhatsNew ? <section className="about-changelog" aria-label="Changelog">
          <p className="eyebrow">Changelog</p>
          {[...WHATS_NEW_RELEASES]
            .filter((release) => !release.previewForVersion)
            .sort((left, right) => compareVersions(right.version, left.version))
            .map((release) => (
              <article key={release.version}>
                <h4>Prism {release.displayVersion ?? release.version}</h4>
                <ul>{release.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
              </article>
            ))}
        </section> : null}
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
  catalogStatus,
  catalogProgress,
  onSave,
  onClose,
}: {
  form: NavidromeConfig;
  setForm: (config: NavidromeConfig) => void;
  status: ConnectionStatus;
  statusMessage: string;
  catalogStatus: CatalogStatus;
  catalogProgress: { completed: number; total: number } | null;
  onSave: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <PrismDialog open onOpenChange={(open) => !open && onClose()}>
      <section className="setup-modal" aria-labelledby="setup-title">
        <button className="icon-button close-button" type="button" aria-label="Close setup" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="setup-art" aria-hidden="true">
          <Music2 size={42} />
        </div>
        <p className="eyebrow">First run</p>
        <Dialog.Title asChild><h2 id="setup-title">Connect Prism to Navidrome</h2></Dialog.Title>
        <Dialog.Description asChild><p className="setup-copy">
          Add your server once and Prism will build a local, metadata-only library cache. Your music will open much faster after this first sync.
        </p></Dialog.Description>

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
        {catalogStatus === "syncing" && catalogProgress ? (
          <p className="wizard-status">Building local catalog: {catalogProgress.completed} of {catalogProgress.total} albums.</p>
        ) : null}
      </section>
    </PrismDialog>
  );
}

function radioRequestAck(result: RadioRequestResult, fallback: string) {
  if (result.ack) return result.ack;
  const track = result.track;
  const queuePosition = typeof result.queuePosition === "number" && result.queuePosition > 0 ? ` - #${result.queuePosition} in the queue` : "";
  if (track?.title) return `Lining up ${track.title}${track.artist ? ` by ${track.artist}` : ""}${queuePosition}.`;
  return result.message ?? fallback;
}

function RadioRequestPopover({
  stationUrl,
  onClose,
  onResolved,
}: {
  stationUrl: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [requestText, setRequestText] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const pollTimerRef = useRef<number | null>(null);
  const pollStopRef = useRef(false);

  function stopPolling() {
    pollStopRef.current = true;
    if (pollTimerRef.current != null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  useEffect(() => stopPolling, []);

  function startPolling(requestId: string) {
    pollStopRef.current = false;
    const deadline = Date.now() + RADIO_REQUEST_POLL_DEADLINE_MS;

    async function tick() {
      if (pollStopRef.current || Date.now() > deadline) return;
      const result = await fetchRadioRequestStatus(stationUrl, requestId);
      if (pollStopRef.current) return;

      if (result?.status === "resolved") {
        setStatus("sent");
        setMessage(radioRequestAck(result, "Request received - the DJ has it."));
        onResolved();
        return;
      }

      if (result?.status === "failed") {
        setStatus("error");
        setMessage(result.message ?? "The booth waved this one off.");
        return;
      }

      if (result?.status === "unknown") return;
      pollTimerRef.current = window.setTimeout(tick, RADIO_REQUEST_POLL_INTERVAL_MS);
    }

    pollTimerRef.current = window.setTimeout(tick, RADIO_REQUEST_POLL_INTERVAL_MS);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedText = requestText.trim();
    if (!trimmedText || status === "sending") return;

    stopPolling();
    setStatus("sending");
    setMessage("");

    try {
      const result = await submitRadioRequest(stationUrl, trimmedText, requesterName.trim());
      if (!result.success) {
        setStatus("error");
        setMessage(result.message ?? "The booth could not take that request.");
        return;
      }

      setRequestText("");
      setStatus("sent");
      setMessage(radioRequestAck(result, "Request received - the DJ has it."));
      if (result.requestId) startPolling(result.requestId);
      onResolved();
    } catch {
      setStatus("error");
      setMessage("The booth line is down - try again in a moment.");
    }
  }

  function newRequest() {
    stopPolling();
    setStatus("idle");
    setMessage("");
  }

  const hasReceipt = status === "sent" || (status === "error" && message);

  return (
    <div className="radio-request-popover">
      {hasReceipt ? (
        <div className="radio-request-receipt">
          <p className={status === "error" ? "bad" : ""}>{message}</p>
          <button className="secondary-button compact-button" type="button" onClick={newRequest}>
            <Send size={15} />
            New Request
          </button>
        </div>
      ) : (
        <form className="radio-request-form" onSubmit={submitRequest}>
          <label>
            <span>Request</span>
            <textarea
              value={requestText}
              onChange={(event) => setRequestText(event.target.value)}
              placeholder="Song, artist, or vibe..."
              maxLength={200}
              autoFocus
            />
          </label>
          <label>
            <span>Name</span>
            <input
              value={requesterName}
              onChange={(event) => setRequesterName(event.target.value)}
              placeholder="Optional"
              maxLength={40}
            />
          </label>
          <div className="radio-request-actions">
            <button className="secondary-button compact-button" type="button" disabled={status === "sending"} onClick={onClose}>
              <X size={15} />
              Cancel
            </button>
            <button className="connect-button compact-button" type="submit" disabled={status === "sending" || !requestText.trim()}>
              {status === "sending" ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
              Send
            </button>
          </div>
          {message ? <p className={`radio-request-status ${status === "error" ? "bad" : ""}`}>{message}</p> : null}
        </form>
      )}
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
  tuneIn,
  onAddFirstStation,
}: {
  appSettings: AppSettings;
  onSelectStation: (stationUrl: string) => void;
  onOpenSettings: () => void;
  stationState: RadioStationState | null;
  session: RadioSessionPayload | null;
  schedule: RadioSchedulePayload | null;
  status: RadioStatus;
  message: string;
  tuneIn: () => Promise<void>;
  onAddFirstStation: (stationUrl: string) => Promise<void>;
}) {
  const stationUrl = normalizeStationUrl(appSettings.radioStationUrl);
  const savedStations = appSettings.radioStationUrls;
  const [firstStationUrl, setFirstStationUrl] = useState("");
  const isPlaying = status === "playing";
  const isTuning = status === "checking";
  const stationLabel = (url: string) => radioStationName(stationState, url, appSettings.radioStationNames[normalizeStationUrl(url)]);
  const selectedStationLabel = stationUrl ? stationLabel(stationUrl) : "No station selected";

  if (!isPlaying) {
    return (
      <section className="radio-view radio-tune-view">
        <div className="radio-tune-gate">
          <div className="radio-tune-mark" aria-hidden="true">
            <RadioTower size={34} />
          </div>
          <div className="radio-tune-copy">
            <p className="eyebrow">Radio</p>
            <h3>{savedStations.length ? "Tune into Subwave" : "Add your Subwave station"}</h3>
            <span>{savedStations.length ? selectedStationLabel : "Paste your station URL to connect and start listening."}</span>
          </div>

          <div className="radio-tune-controls">
            {savedStations.length ? (
              <label className="radio-channel-select radio-tune-select">
                <span>Channel</span>
                <select value={stationUrl} onChange={(event) => onSelectStation(event.target.value)} disabled={isTuning}>
                  {savedStations.map((savedStationUrl) => (
                    <option value={savedStationUrl} key={savedStationUrl}>
                      {stationLabel(savedStationUrl)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="radio-channel-select radio-tune-select">
                <span>Station URL</span>
                <input
                  type="url"
                  value={firstStationUrl}
                  onChange={(event) => setFirstStationUrl(event.target.value)}
                  placeholder="https://radio.example.com"
                  autoComplete="url"
                  disabled={isTuning}
                />
              </label>
            )}
            <button
              className="connect-button radio-tune-button"
              type="button"
              onClick={() => void (savedStations.length ? tuneIn() : onAddFirstStation(firstStationUrl))}
              disabled={isTuning || (!savedStations.length && !firstStationUrl.trim())}
            >
              {isTuning ? <Loader2 size={18} /> : <Play size={18} fill="currentColor" />}
              {isTuning ? "Tuning In" : savedStations.length ? "Tune In" : "Add & Tune In"}
            </button>
            <button className="secondary-button compact-button" type="button" onClick={onOpenSettings}>
              <Settings size={15} />
              Stations
            </button>
          </div>
          {status === "error" ? <p className="radio-status bad">{message}</p> : null}
        </div>
      </section>
    );
  }

  const nowPlaying = firstRadioTrack(stationState);
  const listenerCount = radioListenerCount(stationState);
  const stationName = stationLabel(stationUrl);
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
  const visualEffectsEnabled = !appSettings.lowPerformanceMode;
  const radioTitle = nowPlaying?.title ?? "Tune into Subwave";
  const radioTitleParts = splitFeaturedTitle(radioTitle);
  const latestVoice = latestRadioVoiceLine(session, nowPlaying);
  const latestVoiceAge = latestVoice ? relativeRadioTurnTime(latestVoice) : null;
  const streamLabel = formatRadioStreamLabel(stationState?.stream?.bitrate, stationState?.stream?.format);
  const nowPlayingDetails = [
    nowPlaying?.album,
    nowPlaying?.year ? String(nowPlaying.year) : "",
    stationName,
  ].filter(Boolean);

  return (
    <section className="radio-view">
      <div className="radio-hero">
        {isPlaying && appSettings.coverWashEnabled && visualEffectsEnabled && coverUrl ? (
          <div className="radio-cover-wash" style={{ backgroundImage: `url(${coverUrl})` }} aria-hidden="true" />
        ) : null}
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
          <p className="eyebrow">Now Playing{listenerCount == null ? "" : ` / ${listenerCount} listener${listenerCount === 1 ? "" : "s"}`}</p>
          <h3 aria-label={radioTitle}>
            <span>{radioTitleParts.main}</span>
            {radioTitleParts.feature ? <em>{radioTitleParts.feature}</em> : null}
          </h3>
          <p className="radio-artist">{nowPlaying?.artist ?? stationName}</p>
          {nowPlayingDetails.length ? <p className="radio-album">{nowPlayingDetails.join(" / ")}</p> : null}

          {savedStations.length > 1 ? (
            <label className="radio-channel-select">
              <span>Channel</span>
              <select value={stationUrl} onChange={(event) => onSelectStation(event.target.value)}>
                {savedStations.map((savedStationUrl) => (
                  <option value={savedStationUrl} key={savedStationUrl}>
                    {stationLabel(savedStationUrl)}
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
          <div>
            <span>Stream</span>
            <strong>{stationName}</strong>
            <small>{listenerCount ?? "0"} listener{listenerCount === 1 ? "" : "s"} / {streamLabel}</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function LibraryView({
  activeView,
  config,
  listenerName,
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
  tuneInRadio,
  onStartRadio,
  onAddFirstRadioStation,
  albums,
  recentAlbums,
  recentlyPlayedAlbums,
  listeningHistory,
  onSelectView,
  onClearListeningHistory,
  songs,
  songLibraryStatus,
  onRetrySongs,
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
  detailSelection,
  detailStatus,
  detailMessage,
  currentTrack,
  currentTrackCoverUrl,
  isPlaying,
  position,
  duration,
  hasPrevious,
  hasNext,
  onTogglePlayback,
  onPrevious,
  onNext,
  onSeek,
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
  listenerName: string;
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
  tuneInRadio: () => Promise<void>;
  onStartRadio: () => void;
  onAddFirstRadioStation: (stationUrl: string) => Promise<void>;
  albums: Album[];
  recentAlbums: Album[];
  recentlyPlayedAlbums: Album[];
  listeningHistory: ListeningHistoryEntry[];
  onSelectView: (view: View) => void;
  onClearListeningHistory: () => void;
  songs: Song[];
  songLibraryStatus: "idle" | "loading" | "ready" | "error";
  onRetrySongs: () => void;
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
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song, selectedSongs?: Song[]) => void;
  detailSelection: DetailSelection;
  detailStatus: "idle" | "loading" | "error";
  detailMessage: string;
  currentTrack: Song | null;
  currentTrackCoverUrl: string | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (position: number) => void;
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
  const [isHomeScrollbarVisible, setIsHomeScrollbarVisible] = useState(false);
  const homeScrollbarTimeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (homeScrollbarTimeoutRef.current !== null) window.clearTimeout(homeScrollbarTimeoutRef.current);
  }, []);

  function revealHomeScrollbar() {
    setIsHomeScrollbarVisible(true);
    if (homeScrollbarTimeoutRef.current !== null) window.clearTimeout(homeScrollbarTimeoutRef.current);
    homeScrollbarTimeoutRef.current = window.setTimeout(() => setIsHomeScrollbarVisible(false), 700);
  }

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
        tuneIn={tuneInRadio}
        onAddFirstStation={onAddFirstRadioStation}
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
    <section
      className={`browser-panel ${activeView === "overview" || activeView === "nowPlaying" ? `home-panel ${isHomeScrollbarVisible ? "is-scrolling" : ""}` : ""}`}
      onScroll={activeView === "overview" || activeView === "nowPlaying" ? revealHomeScrollbar : undefined}
    >
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
          {activeView !== "overview" && activeView !== "nowPlaying" && activeView !== "search" ? (
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
          ) : null}
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
              listenerName={listenerName}
              albums={albums}
              recentAlbums={recentAlbums}
              recentlyPlayedAlbums={recentlyPlayedAlbums}
              listeningHistory={listeningHistory}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              radioStationName={radioStationName(radioStationState, appSettings.radioStationUrl, appSettings.radioStationNames[normalizeStationUrl(appSettings.radioStationUrl)])}
              radioStatus={radioStatus}
              onPlaySong={onPlaySong}
              onPlayAlbum={onPlayAlbum}
              onOpenAlbum={onOpenAlbum}
              onOpenPlaylist={onOpenPlaylist}
              onSelectView={onSelectView}
              onStartRadio={onStartRadio}
            />
          ) : null}
          {activeView === "nowPlaying" ? (
            <NowPlayingView
              config={config}
              currentTrack={currentTrack}
              currentTrackCoverUrl={currentTrackCoverUrl}
              isPlaying={isPlaying}
              position={position}
              duration={duration}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              onTogglePlayback={onTogglePlayback}
              onPrevious={onPrevious}
              onNext={onNext}
              onSeek={onSeek}
              onOpenAlbum={onOpenAlbum}
              onOpenArtist={onOpenArtist}
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
          {activeView === "songs" ? (
            songLibraryStatus === "loading" ? (
              <EmptyPanel icon={<Loader2 size={20} className="spin" />} text="Loading your songs…" />
            ) : songLibraryStatus === "error" ? (
              <StateNotice tone="bad" icon={<AlertCircle size={16} />} title="Songs could not load" text="Try again to reload your library tracks." actionLabel="Retry" onAction={onRetrySongs} />
            ) : (
              <SearchSongList
                songs={songs}
                currentTrack={currentTrack}
                favoriteIds={favoriteIds}
                favoriteBusyKey={favoriteBusyKey}
                onToggleFavorite={onToggleFavorite}
                onOpenAlbum={onOpenAlbum}
                onOpenArtist={onOpenArtist}
                onPlaySong={onPlaySong}
                onQueueSong={onQueueSong}
                onSongContextMenu={onSongContextMenu}
              />
            )
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
            <ListeningHistoryView history={listeningHistory} onPlaySong={onPlaySong} onClear={onClearListeningHistory} onOpenAlbum={onOpenAlbum} onOpenArtist={onOpenArtist} />
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
  listenerName,
  albums,
  recentAlbums,
  recentlyPlayedAlbums,
  listeningHistory,
  currentTrack,
  isPlaying,
  radioStationName,
  radioStatus,
  onPlaySong,
  onPlayAlbum,
  onOpenAlbum,
  onOpenPlaylist,
  onSelectView,
  onStartRadio,
}: {
  config: NavidromeConfig | null;
  listenerName: string;
  albums: Album[];
  recentAlbums: Album[];
  recentlyPlayedAlbums: Album[];
  listeningHistory: ListeningHistoryEntry[];
  currentTrack: Song | null;
  isPlaying: boolean;
  radioStationName: string;
  radioStatus: RadioStatus;
  onPlaySong: (song: Song) => void;
  onPlayAlbum: (album: Album) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  onSelectView: (view: View) => void;
  onStartRadio: () => void;
}) {
  const latestListen = listeningHistory[0]?.song;
  const isContinuing = Boolean(latestListen && currentTrack?.id === latestListen.id && isPlaying);
  const isRadioStarting = radioStatus === "checking";
  const [shuffleAlbums, setShuffleAlbums] = useState<Album[]>([]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const visibleRecentAlbums = recentlyPlayedAlbums.slice(0, 5);
  const visibleNewAlbums = recentAlbums.slice(0, 5);

  useEffect(() => {
    setShuffleAlbums(shuffled(albums).slice(0, 5));
  }, [albums]);

  const refreshShuffleAlbums = () => setShuffleAlbums(shuffled(albums).slice(0, 5));

  return (
    <div className="home-dashboard">
      <section className="home-dashboard-intro">
        <div>
          <p className="eyebrow">Your listening</p>
          <h3>{greeting}{listenerName ? `, ${listenerName}` : ""}.</h3>
          <p>{latestListen ? `Pick up where you left off with ${latestListen.title}${latestListen.artist ? ` by ${latestListen.artist}` : ""}.` : config ? "Start a record, and Prism will keep the good stuff close at hand." : "Connect your library to make this space yours."}</p>
          {latestListen ? (
            isContinuing ? (
              <span className="home-continue-status"><Pause size={16} fill="currentColor" /> Listening now</span>
            ) : (
              <button className="connect-button home-continue-button" type="button" onClick={() => onPlaySong(latestListen)}>
                <Play size={16} fill="currentColor" />
                Continue listening
              </button>
            )
          ) : null}
        </div>
        <div className="home-art-cluster" aria-label="Albums from your library">
          {visibleRecentAlbums.length ? visibleRecentAlbums.slice(0, 3).map((album, index) => (
            <CoverArt
              key={album.id}
              src={config ? buildCoverArtUrl(config, album.coverArt, "320") : null}
              label={album.name}
              className={`home-cluster-art home-cluster-art-${index + 1}`}
            />
          )) : <div className="home-cluster-empty"><Music2 size={34} /></div>}
        </div>
      </section>
      <section className="home-radio-card">
        <div className="home-radio-mark"><RadioTower size={22} /></div>
        <div>
          <p className="eyebrow">Live from Subwave</p>
          <h4>Listen to {radioStationName}</h4>
          <p>A separate place for the live station, shows, and requests.</p>
        </div>
        <button className="secondary-button home-radio-button" type="button" onClick={onStartRadio} disabled={isRadioStarting}>
          {isRadioStarting ? <Loader2 className="spin" size={16} /> : <Play size={16} fill="currentColor" />}
          {isRadioStarting ? "Tuning in" : `Listen to ${radioStationName}`}
        </button>
      </section>
      <HomeListeningShelf history={listeningHistory} fallbackAlbums={visibleRecentAlbums} config={config} onPlaySong={onPlaySong} onPlayAlbum={onPlayAlbum} onOpenAlbum={onOpenAlbum} onOpenPlaylist={onOpenPlaylist} onSelectView={onSelectView} />
      <HomeAlbumShelf title="Recently added" description="Fresh additions to your library." albums={visibleNewAlbums} config={config} onPlayAlbum={onPlayAlbum} onOpenAlbum={onOpenAlbum} onSeeAll={() => onSelectView("recentlyAdded")} />
      <HomeAlbumShelf title="Start listening" description="A few picks from your library." albums={shuffleAlbums} config={config} onPlayAlbum={onPlayAlbum} onRefresh={refreshShuffleAlbums} />
    </div>
  );
}

function HomeListeningShelf({ history, fallbackAlbums, config, onPlaySong, onPlayAlbum, onOpenAlbum, onOpenPlaylist, onSelectView }: {
  history: ListeningHistoryEntry[];
  fallbackAlbums: Album[];
  config: NavidromeConfig | null;
  onPlaySong: (song: Song) => void;
  onPlayAlbum: (album: Album) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  onSelectView: (view: View) => void;
}) {
  const items = Array.from(new Map(history.map((entry) => {
    const source = entry.source === "library" ? albumListeningSource(entry.song) : entry.source;
    const key = source === "library" ? `track:${entry.song.id}` : `${source.type}:${source.id}`;
    return [key, { source, song: entry.song }];
  })).values()).slice(0, 5);

  return (
    <section className="home-album-shelf">
      <div className="home-shelf-heading"><div><h4>Recently played</h4><p>A few listens to come back to.</p></div><button className="home-shelf-action" type="button" onClick={() => onSelectView("recentlyPlayed")}>See all <ChevronRight size={15} /></button></div>
      <div className="home-album-carousel"><div className="home-album-row" tabIndex={0} aria-label="Recently played">
        {(items.length ? items.map(({ source, song }) => {
          const playlist = source !== "library" && source.type === "playlist" ? source : null;
          const album = source !== "library" && source.type === "album" ? source : null;
          const label = playlist?.name ?? album?.name ?? song.album ?? song.title ?? "Unknown release";
          const byline = playlist ? "Playlist" : album?.artist ?? song.artist ?? "Album";
          const coverArt = playlist?.coverArt ?? album?.coverArt ?? song.coverArt;
          const open = playlist ? () => onOpenPlaylist({ id: playlist.id, name: playlist.name }) : album ? () => onOpenAlbum({ id: album.id, name: album.name, artist: album.artist ?? song.artist ?? "" }) : null;
          return <div className="home-album" key={`${label}-${song.id}`} role={open ? "button" : undefined} tabIndex={open ? 0 : undefined} onClick={open ?? undefined} onKeyDown={(event) => { if (open && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(); } }}>
            <PlayableCover src={config && coverArt ? buildCoverArtUrl(config, coverArt, "320") : null} label={label} className="home-album-cover" onOpen={open ?? undefined} onPlay={() => onPlaySong(song)} />
            <div className="home-album-copy"><strong>{label}</strong><small>{byline}</small></div>
          </div>;
        }) : fallbackAlbums.map((album) => <div className="home-album" key={album.id} role="button" tabIndex={0} onClick={() => onOpenAlbum(album)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenAlbum(album); } }}><PlayableCover src={config ? buildCoverArtUrl(config, album.coverArt, "320") : null} label={album.name} className="home-album-cover" onOpen={() => onOpenAlbum(album)} onPlay={() => onPlayAlbum(album)} /><div className="home-album-copy"><strong>{album.name}</strong><small>{album.artist || `${album.songCount ?? 0} tracks`}</small></div></div>))}
      </div></div>
    </section>
  );
}

function HomeAlbumShelf({
  title,
  description,
  albums,
  config,
  onPlayAlbum,
  onOpenAlbum,
  onSeeAll,
  onRefresh,
}: {
  title: string;
  description: string;
  albums: Album[];
  config: NavidromeConfig | null;
  onPlayAlbum: (album: Album) => void;
  onOpenAlbum?: (album: Album) => void;
  onSeeAll?: () => void;
  onRefresh?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [scrollCue, setScrollCue] = useState({ canScrollLeft: false, canScrollRight: false });

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const updateScrollCue = () => {
      const maxScrollLeft = Math.max(0, row.scrollWidth - row.clientWidth);
      setScrollCue({
        canScrollLeft: row.scrollLeft > 1,
        canScrollRight: row.scrollLeft < maxScrollLeft - 1,
      });
    };

    updateScrollCue();
    row.addEventListener("scroll", updateScrollCue, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollCue);
    resizeObserver.observe(row);
    return () => {
      row.removeEventListener("scroll", updateScrollCue);
      resizeObserver.disconnect();
    };
  }, [albums]);

  if (!albums.length) return null;

  return (
    <section className="home-album-shelf">
      <div className="home-shelf-heading">
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        {onRefresh ? <button className="home-shelf-action" type="button" onClick={onRefresh}><RefreshCw size={15} /> Refresh</button> : null}
        {onSeeAll ? <button className="home-shelf-action" type="button" onClick={onSeeAll}>See all <ChevronRight size={15} /></button> : null}
      </div>
      <div className="home-album-carousel">
        <div className="home-album-row" ref={rowRef} tabIndex={0} aria-label={`${title} albums`}>
          {albums.map((album) => (
            <div className="home-album" key={album.id} role={onOpenAlbum ? "button" : undefined} tabIndex={onOpenAlbum ? 0 : undefined} onClick={onOpenAlbum ? () => onOpenAlbum(album) : undefined} onKeyDown={(event) => { if (onOpenAlbum && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenAlbum(album); } }}>
              <PlayableCover
                src={config ? buildCoverArtUrl(config, album.coverArt, "320") : null}
                label={album.name}
                className="home-album-cover"
                onOpen={onOpenAlbum ? () => onOpenAlbum(album) : undefined}
                onPlay={() => onPlayAlbum(album)}
              />
              <div className="home-album-copy">
                <strong>{album.name}</strong>
                <small>{album.artist || `${album.songCount ?? 0} tracks`}</small>
              </div>
            </div>
          ))}
        </div>
        {scrollCue.canScrollLeft ? <ChevronLeft className="home-album-scroll-cue home-album-scroll-cue-left" size={18} aria-hidden="true" /> : null}
        {scrollCue.canScrollRight ? <ChevronRight className="home-album-scroll-cue home-album-scroll-cue-right" size={18} aria-hidden="true" /> : null}
      </div>
    </section>
  );
}

function NowPlayingView({
  config,
  currentTrack,
  currentTrackCoverUrl,
  isPlaying,
  position,
  duration,
  hasPrevious,
  hasNext,
  onTogglePlayback,
  onPrevious,
  onNext,
  onSeek,
  onOpenAlbum,
  onOpenArtist,
}: {
  config: NavidromeConfig | null;
  currentTrack: Song | null;
  currentTrackCoverUrl: string | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (position: number) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
}) {
  const hasTrack = Boolean(currentTrack);
  const title = currentTrack?.title ?? "Your next listen starts here";
  const byline = config
      ? "Pick an album, artist, or song from your library."
      : "Connect your Navidrome server to bring your music home.";
  const progress = Math.min(position, Math.max(duration, 1));
  const progressRatio = progress / Math.max(duration, 1);
  const progressFillEnd = `calc(11px + ${progressRatio * 100}% - ${22 * progressRatio}px)`;

  return (
    <div className="home-view">
      <section className={`home-now-playing-hero ${hasTrack ? "has-track" : ""}`}>
        {currentTrackCoverUrl ? (
          <div className="home-cover-wash" style={{ backgroundImage: `url(${currentTrackCoverUrl})` }} aria-hidden="true" />
        ) : null}
        <div className="home-now-playing-art">
          <CoverArt src={currentTrackCoverUrl} label={title} className="home-now-playing-cover" fallbackIcon={<Music2 size={42} />} />
        </div>
        <div className="home-now-playing-copy">
          <p className="eyebrow">{isPlaying ? "Now playing" : hasTrack ? "Paused" : "Ready when you are"}</p>
          <h3>{title}</h3>
          {currentTrack ? <p className="home-now-playing-meta">
            {currentTrack.artistId ? <button className="home-now-playing-meta-link" type="button" onClick={() => onOpenArtist({ id: currentTrack.artistId!, name: currentTrack.artist ?? "Unknown artist" })}>{currentTrack.artist ?? "Unknown artist"}</button> : <span>{currentTrack.artist ?? "Unknown artist"}</span>}
            {currentTrack.album ? <><span aria-hidden="true"> · </span>{currentTrack.albumId ? <button className="home-now-playing-meta-link" type="button" onClick={() => onOpenAlbum({ id: currentTrack.albumId!, name: currentTrack.album!, artist: currentTrack.artist ?? "", artistId: currentTrack.artistId, coverArt: currentTrack.coverArt })}>{currentTrack.album}</button> : <span>{currentTrack.album}</span>}</> : null}
          </p> : <p>{byline}</p>}
          <div className="home-playback-controls">
            <button type="button" aria-label="Previous" onClick={onPrevious} disabled={!hasPrevious}><SkipBack size={18} /></button>
            <button className="home-primary-play" type="button" aria-label={isPlaying ? "Pause" : "Play"} onClick={onTogglePlayback} disabled={!hasTrack}>
              {isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
            </button>
            <button type="button" aria-label="Next" onClick={onNext} disabled={!hasNext}><SkipForward size={18} /></button>
          </div>
          <div className="home-seek-row">
            <span>{formatDuration(position)}</span>
            <input
              className="home-seek-slider"
              type="range"
              min="0"
              max={Math.max(duration, 1)}
              step="1"
              value={progress}
              style={{ "--home-seek-fill-end": progressFillEnd } as CSSProperties}
              onChange={(event) => onSeek(Number(event.target.value))}
              disabled={!hasTrack || !duration}
              aria-label="Seek"
            />
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
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
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song, selectedSongs?: Song[]) => void;
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
            onOpenAlbum={onOpenAlbum}
            onOpenArtist={onOpenArtist}
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
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song, selectedSongs?: Song[]) => void;
}) {
  const previewLimit = 8;
  const trimmedQuery = query.trim();
  const totalResults = results.artists.length + results.albums.length + results.songs.length + results.playlists.length;
  const [resultFilter, setResultFilter] = useState<"all" | "songs" | "albums" | "artists" | "playlists">("all");
  const filters = [
    ["all", "All", totalResults],
    ["songs", "Songs", results.songs.length],
    ["albums", "Albums", results.albums.length],
    ["artists", "Artists", results.artists.length],
    ["playlists", "Playlists", results.playlists.length],
  ] as const;
  const shows = (type: Exclude<typeof resultFilter, "all">) => resultFilter === "all" || resultFilter === type;
  const visible = <T,>(type: "songs" | "albums" | "artists" | "playlists", items: T[]) => resultFilter === type ? items : items.slice(0, previewLimit);
  const canShowMore = <T,>(type: "songs" | "albums" | "artists" | "playlists", items: T[]) => resultFilter !== type && items.length > previewLimit;
  const showMore = (type: "songs" | "albums" | "artists" | "playlists") => {
    // A full section is its own focused result view. Keeping its source array
    // intact preserves Navidrome's relevance order from preview to full list.
    setResultFilter(type);
  };

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
          <h4>{trimmedQuery}</h4>
        </div>
        <div className="search-counts" aria-label="Filter results by type">
          {filters.map(([filter, label, count]) => (
            <button
              className={resultFilter === filter ? "active" : ""}
              type="button"
              key={filter}
              onClick={() => setResultFilter(filter)}
              aria-pressed={resultFilter === filter}
            >
              {label} {count}
            </button>
          ))}
        </div>
      </section>
      {shows("artists") && results.artists.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Artists</h4>
            <small>{results.artists.length}</small>
          </div>
          <ArtistList
            artists={visible("artists", results.artists)}
            favoriteIds={favoriteIds}
            favoriteBusyKey={favoriteBusyKey}
            onToggleFavorite={onToggleFavorite}
            onOpenArtist={onOpenArtist}
            onPlayArtist={onPlayArtist}
            withAlphabetRail={false}
          />
          {canShowMore("artists", results.artists) ? <button className="search-see-more" type="button" onClick={() => showMore("artists")}>See more artists ({results.artists.length - previewLimit})</button> : null}
        </section>
      ) : null}
      {shows("albums") && results.albums.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Albums</h4>
            <small>{results.albums.length}</small>
          </div>
          <AlbumList
            config={config}
            albums={visible("albums", results.albums)}
            favoriteIds={favoriteIds}
            favoriteBusyKey={favoriteBusyKey}
            onToggleFavorite={onToggleFavorite}
            onOpenAlbum={onOpenAlbum}
            onPlayAlbum={onPlayAlbum}
            withAlphabetRail={false}
          />
          {canShowMore("albums", results.albums) ? <button className="search-see-more" type="button" onClick={() => showMore("albums")}>See more albums ({results.albums.length - previewLimit})</button> : null}
        </section>
      ) : null}
      {shows("playlists") && results.playlists.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Playlists</h4>
            <small>{results.playlists.length}</small>
          </div>
          <SearchPlaylistList playlists={visible("playlists", results.playlists)} onOpenPlaylist={onOpenPlaylist} />
          {canShowMore("playlists", results.playlists) ? <button className="search-see-more" type="button" onClick={() => showMore("playlists")}>See more playlists ({results.playlists.length - previewLimit})</button> : null}
        </section>
      ) : null}
      {shows("songs") && results.songs.length ? (
        <section className="search-section">
          <div className="section-label">
            <h4>Songs</h4>
            <small>{results.songs.length}</small>
          </div>
          <SearchSongList
            songs={visible("songs", results.songs)}
            currentTrack={currentTrack}
            favoriteIds={favoriteIds}
            favoriteBusyKey={favoriteBusyKey}
            onToggleFavorite={onToggleFavorite}
            onOpenAlbum={onOpenAlbum}
            onOpenArtist={onOpenArtist}
            onPlaySong={onPlaySong}
            onQueueSong={onQueueSong}
            onSongContextMenu={onSongContextMenu}
            preserveResultOrder
          />
          {canShowMore("songs", results.songs) ? <button className="search-see-more" type="button" onClick={() => showMore("songs")}>See more songs ({results.songs.length - previewLimit})</button> : null}
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
  onOpenAlbum,
  onOpenArtist,
  onPlaySong,
  onQueueSong,
  onSongContextMenu,
  preserveResultOrder = false,
}: {
  songs: Song[];
  currentTrack: Song | null;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song, selectedSongs?: Song[]) => void;
  preserveResultOrder?: boolean;
}) {
  const { isSelected, selectTrack, selectedSongs, handleKeyDown, listRef } = useTrackSelection(songs);
  const [sortKey, setSortKey] = useState<SongSortKey | null>(preserveResultOrder ? null : "title");
  const [sortDirection, setSortDirection] = useState<SongSortDirection>("asc");
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const sortedSongs = useMemo(() => sortKey ? sortSongs(songs, sortKey, sortDirection) : songs, [songs, sortKey, sortDirection]);
  const songIndexes = useMemo(() => new Map(songs.map((song, index) => [song.id, index])), [songs]);
  const virtualizer = useVirtualizer({
    count: sortedSongs.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 35,
    overscan: 12,
    getItemKey: (index) => sortedSongs[index]?.id ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const setSongListRef = useCallback((element: HTMLDivElement | null) => {
    listRef.current = element;
    setScrollElement(element?.closest<HTMLElement>(".browser-panel") ?? null);
  }, [listRef]);

  return (
    <div className="track-list song-browser-list" ref={setSongListRef} tabIndex={0} onKeyDown={handleKeyDown} role="list" aria-label="Songs">
      <SongListHeader showTrackNumber={false} sortKey={sortKey ?? undefined} sortDirection={sortDirection} onSort={(key) => {
        setSortDirection((direction) => key === sortKey ? (direction === "asc" ? "desc" : "asc") : "asc");
        setSortKey(key);
      }} />
      <div className="virtual-song-list" style={{ height: `${virtualizer.getTotalSize()}px` }} aria-setsize={sortedSongs.length}>
        {virtualItems.map((virtualItem) => {
          const song = sortedSongs[virtualItem.index];
          const index = songIndexes.get(song.id);
          if (index == null) return null;

          return (
            <div
              className={`track-row song-browser-row ${virtualItem.index % 2 ? "alternating" : ""} ${currentTrack?.id === song.id ? "active" : ""} ${isSelected(index) ? "selected" : ""}`}
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
              data-index={virtualItem.index}
              role="listitem"
              aria-posinset={virtualItem.index + 1}
              onContextMenu={(event) => onSongContextMenu(event, song, selectedSongs)}
              onClick={(event) => selectTrack(event, index)}
            >
              <button
                className="track-play"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPlaySong(song);
                }}
                aria-label={`Play ${song.title}`}
              >
                <Play size={15} strokeWidth={1.6} />
              </button>
              <button className="track-name" type="button" aria-label={`Select ${song.title}`}>{song.title}</button>
              <ArtistNameLink song={song} onOpenArtist={onOpenArtist} />
              <AlbumNameLink song={song} onOpenAlbum={onOpenAlbum} />
              <span className="track-duration">{formatDuration(song.duration)}</span>
              <FavoriteButton
                active={favoriteIds.songs.has(song.id)}
                busy={favoriteBusyKey === `song:${song.id}`}
                label={song.title}
                onToggle={(favorite) => onToggleFavorite("song", song.id, favorite)}
              />
              <button
                className="track-queue"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onQueueSong(song);
                }}
                aria-label={`Queue ${song.title}`}
              >
                <Plus size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArtistNameLink({ song, onOpenArtist }: { song: Song; onOpenArtist: (artist: Artist) => void }) {
  const label = song.artist || "Unknown artist";

  if (!song.artistId) {
    return <span className="track-artist">{label}</span>;
  }

  return (
    <button
      className="track-artist artist-name-link"
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpenArtist({ id: song.artistId!, name: label });
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      aria-label={`Open ${label}`}
    >
      {label}
    </button>
  );
}

function AlbumNameLink({ song, onOpenAlbum }: { song: Song; onOpenAlbum: (album: Album) => void }) {
  const label = song.album || "Unknown album";

  if (!song.albumId) return <span className="track-album">{label}</span>;

  return (
    <button
      className="track-album artist-name-link"
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpenAlbum({ id: song.albumId!, name: label, artist: song.artist ?? "", artistId: song.artistId, coverArt: song.coverArt });
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      aria-label={`Open ${label}`}
    >
      {label}
    </button>
  );
}

function SongListHeader({
  showAlbum = true,
  showPlayColumn = true,
  showTrackNumber = true,
  showQueueColumn = true,
  sortKey,
  sortDirection,
  onSort,
}: {
  showAlbum?: boolean;
  showPlayColumn?: boolean;
  showTrackNumber?: boolean;
  showQueueColumn?: boolean;
  sortKey?: SongSortKey;
  sortDirection?: SongSortDirection;
  onSort?: (key: SongSortKey) => void;
}) {
  const label = (key: SongSortKey, text: string) => `${text}${sortKey === key ? `, sorted ${sortDirection === "asc" ? "ascending" : "descending"}` : ""}`;
  const column = (key: SongSortKey, text: string) => onSort ? (
    <button type="button" onClick={() => onSort(key)} aria-label={label(key, `Sort by ${text.toLocaleLowerCase()}`)}>{text}</button>
  ) : <span>{text}</span>;

  return (
    <div className="song-list-header" aria-label="Sort songs">
      {showPlayColumn ? <span aria-hidden="true" /> : null}
      {showTrackNumber ? <span aria-hidden="true" /> : null}
      {column("title", "Title")}
      {column("artist", "Artist")}
      {showAlbum ? column("album", "Album") : null}
      {column("duration", "Length")}
      <span aria-hidden="true" />
      {showQueueColumn ? <span aria-hidden="true" /> : null}
    </div>
  );
}

function AlphabetRail({ letters, prefix }: { letters: string[]; prefix: string }) {
  const available = new Set(letters);

  function jumpToLetter(letter: string) {
    const target = document.getElementById(alphaSectionId(prefix, letter));
    const browserPanel = target?.closest<HTMLElement>(".browser-panel");

    if (target && browserPanel) scrollElementWithin(browserPanel, target);
  }

  return (
    <div className="alphabet-rail" aria-label="Alphabet jump">
      {ALPHABET.map((letter) => (
        <button
          type="button"
          key={letter}
          disabled={!available.has(letter)}
          onClick={() => jumpToLetter(letter)}
          aria-label={`Jump to ${letter}`}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

function ListeningHistoryView({
  history,
  onPlaySong,
  onClear,
  onOpenAlbum,
  onOpenArtist,
}: {
  history: ListeningHistoryEntry[];
  onPlaySong: (song: Song) => void;
  onClear: () => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
}) {
  const { isSelected, selectTrack, handleKeyDown, listRef } = useTrackSelection(history.map((entry) => entry.song));

  if (!history.length) {
    return <EmptyPanel icon={<History size={20} />} text="Play a song for a little while and it will appear here. Your history stays on this device." />;
  }

  return (
    <div className="listening-history">
      <div className="listening-history-actions">
        <button className="secondary-button compact-button" type="button" onClick={onClear}>
          <Trash2 size={15} />
          Clear history
        </button>
      </div>
      <div className="listening-history-list" ref={listRef} tabIndex={0} onKeyDown={handleKeyDown} aria-label="Recently played songs">
        {history.map((entry, index) => (
          <div
            className={`track-row history-track-row ${isSelected(index) ? "selected" : ""}`}
            key={entry.id}
            onClick={(event) => selectTrack(event, index)}
            onDoubleClick={() => onPlaySong(entry.song)}
          >
            <button
              className="track-play"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPlaySong(entry.song);
              }}
              aria-label={`Play ${entry.song.title}`}
            >
              <Play size={15} strokeWidth={1.6} />
            </button>
            <button className="track-name history-track-name" type="button" aria-label={`Select ${entry.song.title}`}>
              <strong>{entry.song.title}</strong>
            </button>
            {entry.song.artistId ? <button className="history-track-artist artist-name-link" type="button" onClick={(event) => { event.stopPropagation(); onOpenArtist({ id: entry.song.artistId!, name: entry.song.artist ?? "Unknown artist" }); }}>{entry.song.artist || "Unknown artist"}</button> : <span className="history-track-artist">{entry.song.artist || "Unknown artist"}</span>}
            {entry.song.albumId ? <button className="history-track-album artist-name-link" type="button" onClick={(event) => { event.stopPropagation(); onOpenAlbum({ id: entry.song.albumId!, name: entry.song.album ?? "Unknown album", artist: entry.song.artist ?? "", artistId: entry.song.artistId, coverArt: entry.song.coverArt }); }}>{entry.song.album || "Unknown album"}</button> : <span className="history-track-album">{entry.song.album || "Unknown album"}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function useTrackSelection(songs: Song[]) {
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(() => new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selectAllTracks = () => {
    setSelectedSongIds(new Set(songs.map((song) => song.id)));
    setSelectionAnchorId(songs[0]?.id ?? null);
  };

  useEffect(() => {
    const availableIds = new Set(songs.map((song) => song.id));
    setSelectedSongIds((current) => {
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
    setSelectionAnchorId((current) => current && !availableIds.has(current) ? null : current);
  }, [songs]);

  useEffect(() => {
    function handleSelectAllTracks(event: Event) {
      if ((event as CustomEvent<HTMLElement>).detail === listRef.current) selectAllTracks();
    }

    window.addEventListener("prism:select-all-tracks", handleSelectAllTracks);
    return () => window.removeEventListener("prism:select-all-tracks", handleSelectAllTracks);
  });

  const selectTrack = (event: MouseEvent<HTMLElement>, index: number) => {
    const song = songs[index];
    if (!song) return;

    const selectionAnchor = selectionAnchorId ? songs.findIndex((candidate) => candidate.id === selectionAnchorId) : -1;
    if (event.shiftKey && selectionAnchor >= 0) {
      const rangeStart = Math.min(selectionAnchor, index);
      const rangeEnd = Math.max(selectionAnchor, index);
      setSelectedSongIds(new Set(songs.slice(rangeStart, rangeEnd + 1).map((candidate) => candidate.id)));
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedSongIds((current) => {
        const next = new Set(current);
        if (next.has(song.id)) next.delete(song.id);
        else next.add(song.id);
        return next;
      });
      setSelectionAnchorId(song.id);
      return;
    }

    setSelectedSongIds(new Set([song.id]));
    setSelectionAnchorId(song.id);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAllTracks();
    }
  };

  return {
    isSelected: (index: number) => Boolean(songs[index] && selectedSongIds.has(songs[index].id)),
    selectedSongs: songs.filter((song) => selectedSongIds.has(song.id)),
    selectTrack,
    handleKeyDown,
    listRef,
  };
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
                <Play size={15} strokeWidth={1.6} />
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
                      <Play size={15} strokeWidth={1.6} />
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
        <button className="cover-open-button" type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} aria-label={`Open ${label}`}>
          {cover}
        </button>
      ) : (
        cover
      )}
      <button className="cover-play-button" type="button" onClick={(event) => { event.stopPropagation(); onPlay(); }} disabled={disabled} aria-label={`Play ${label}`}>
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
              <Play size={15} strokeWidth={1.6} />
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
                    <Play size={15} strokeWidth={1.6} />
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
            <Play size={15} strokeWidth={1.6} />
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

function formatPlaylistDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours) return `${hours}h${minutes ? ` ${minutes}m` : ""}`;
  return `${Math.max(1, totalMinutes)}m`;
}

function getSidebarPlaylistMeta(playlist: Playlist, includeOwner = false) {
  const parts = [
    includeOwner && playlist.owner ? `by ${playlist.owner}` : null,
    playlist.songCount != null ? `${playlist.songCount} songs` : null,
    formatPlaylistDuration(playlist.duration),
  ].filter(Boolean);

  return parts.join(" · ") || "Playlist";
}

function PlaylistDetailPanel({
  config,
  playlist,
  currentTrack,
  favoriteIds,
  favoriteBusyKey,
  onToggleFavorite,
  onOpenAlbum,
  onOpenArtist,
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
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlayPlaylist: (playlist: Playlist) => void;
  onSavePlaylistDetails: (playlist: Playlist, details: PlaylistDetailsUpdate) => Promise<void>;
  onDeletePlaylist: (playlist: Playlist) => Promise<void>;
  playlistEditRequestKey: number;
  onRemovePlaylistSong: (playlist: PlaylistDetail, index: number) => Promise<void>;
  onReorderPlaylist: (playlist: PlaylistDetail, songs: Song[]) => Promise<void>;
  onReplaceQueue: (songs: Song[], startIndex?: number) => void;
  onQueueSong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song, selectedSongs?: Song[]) => void;
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
        <PrismDialog open={editing} onOpenChange={(open) => !open && setEditing(false)}>
          <section className="playlist-modal" aria-labelledby="playlist-edit-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Playlist</p>
                <Dialog.Title asChild><h3 id="playlist-edit-title">Edit Details</h3></Dialog.Title>
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
        </PrismDialog>
      ) : null}
      {confirmingDelete ? (
        <PrismAlertDialog open={confirmingDelete} onOpenChange={(open) => !open && setConfirmingDelete(false)} className="confirm-backdrop">
          <section className="playlist-modal confirm-modal" aria-labelledby="playlist-delete-title">
            <div className="confirm-icon" aria-hidden="true">
              <Trash2 size={22} />
            </div>
            <div className="confirm-copy">
              <p className="eyebrow">Delete Playlist</p>
              <AlertDialog.Title asChild><h3 id="playlist-delete-title">{playlist.name}</h3></AlertDialog.Title>
              <AlertDialog.Description asChild><p>This removes the playlist from Navidrome. The songs stay in your library.</p></AlertDialog.Description>
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
        </PrismAlertDialog>
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
        onOpenAlbum={onOpenAlbum}
        onOpenArtist={onOpenArtist}
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
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song, selectedSongs?: Song[]) => void;
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
        onOpenAlbum={onOpenAlbum}
        onOpenArtist={onOpenArtist}
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
      <div className="album-hero album-detail-hero">
        <PlayableCover src={albumCover} label={album.name} className="detail-cover" disabled={!songs.length} onPlay={() => onReplaceQueue(songs)} />
        <div>
          <div className="detail-title album-detail-title">
            <div className="album-title-row">
              <h3>{album.name}</h3>
              <FavoriteButton
                active={favoriteIds.albums.has(album.id)}
                busy={favoriteBusyKey === `album:${album.id}`}
                label={album.name}
                onToggle={(favorite) => onToggleFavorite("album", album.id, favorite)}
              />
            </div>
            {album.artistId ? (
              <button className="album-artist-link" type="button" onClick={() => onOpenArtist({ id: album.artistId!, name: album.artist })}>
                {album.artist}
              </button>
            ) : <p className="album-artist-label">{album.artist}</p>}
          </div>
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
        onOpenArtist={onOpenArtist}
        onPlaySong={(song) => onReplaceQueue(songs, Math.max(0, songs.findIndex((albumSong) => albumSong.id === song.id)))}
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
  onOpenArtist,
  emptyText = "No tracks available for this album.",
  onPlaySong,
  onSongContextMenu,
}: {
  songs: Song[];
  currentTrack: Song | null;
  favoriteIds: FavoriteIds;
  favoriteBusyKey: string;
  onToggleFavorite: (kind: FavoriteKind, id: string, favorite: boolean) => void;
  onOpenArtist: (artist: Artist) => void;
  emptyText?: string;
  onPlaySong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song, selectedSongs?: Song[]) => void;
}) {
  const { isSelected, selectTrack, selectedSongs, handleKeyDown, listRef } = useTrackSelection(songs);
  const [sortKey, setSortKey] = useState<SongSortKey>("track");
  const [sortDirection, setSortDirection] = useState<SongSortDirection>("asc");

  if (!songs.length) {
    return <EmptyPanel icon={<Music2 size={20} />} text={emptyText} />;
  }

  const sortedSongs = sortSongs(songs, sortKey, sortDirection);
  const discGroups = groupSongsByDisc(sortedSongs);
  const showDiscHeaders = discGroups.length > 1;

  return (
    <div className="track-list album-track-list" ref={listRef} tabIndex={0} onKeyDown={handleKeyDown} aria-label="Album tracks">
      <SongListHeader showAlbum={false} showPlayColumn={false} showQueueColumn={false} sortKey={sortKey} sortDirection={sortDirection} onSort={(key) => {
        setSortDirection((direction) => key === sortKey ? (direction === "asc" ? "desc" : "asc") : "asc");
        setSortKey(key);
      }} />
      {discGroups.map((group) => (
        <div className="disc-group" key={group.discNumber ?? "unknown-disc"}>
          {showDiscHeaders ? (
            <div className="disc-heading">
              <span>{group.discNumber != null ? `Disc ${group.discNumber}` : "Disc"}</span>
              <small>{group.songs.length} tracks</small>
            </div>
          ) : null}
          {group.songs.map((song, index) => {
            const songIndex = songs.findIndex((listSong) => listSong.id === song.id);

            return (
            <div
              className={`track-row album-track-row ${currentTrack?.id === song.id ? "active" : ""} ${isSelected(songIndex) ? "selected" : ""}`}
              key={song.id}
              onContextMenu={(event) => onSongContextMenu(event, song, selectedSongs)}
              onClick={(event) => selectTrack(event, songIndex)}
              onDoubleClick={() => onPlaySong(song)}
            >
              <span className="track-index">
                <span className="track-number">{song.track ?? index + 1}</span>
                <button
                  className="track-play"
                  type="button"
                  aria-label={`Play ${song.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPlaySong(song);
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <Play size={15} strokeWidth={1.6} />
                </button>
              </span>
              <button
                className="track-name"
                type="button"
                aria-label={`Select ${song.title}`}
              >
                {song.title}
              </button>
              <ArtistNameLink song={song} onOpenArtist={onOpenArtist} />
              <span className="track-duration">{formatDuration(song.duration)}</span>
              <FavoriteButton
                active={favoriteIds.songs.has(song.id)}
                busy={favoriteBusyKey === `song:${song.id}`}
                label={song.title}
                onToggle={(favorite) => onToggleFavorite("song", song.id, favorite)}
                onDoubleClick={(event) => event.stopPropagation()}
              />
            </div>
            );
          })}
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
  onOpenAlbum,
  onOpenArtist,
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
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
  onSongContextMenu: (event: MouseEvent<HTMLElement>, song: Song, selectedSongs?: Song[]) => void;
}) {
  const { isSelected, selectTrack, selectedSongs, handleKeyDown, listRef } = useTrackSelection(songs);
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
      <div className="track-list" ref={listRef} tabIndex={0} onKeyDown={handleKeyDown} aria-label="Playlist tracks">
        <SongListHeader />
        {displayedSongs.map(({ song, index }, displayIndex) => (
          <div
            className={`track-row playlist-track-row ${currentTrack?.id === song.id ? "active" : ""} ${isSelected(index) ? "selected" : ""} ${index === draggedIndex ? "dragging" : ""}`}
            key={`${song.id}-${index}`}
            onContextMenu={(event) => onSongContextMenu(event, song, selectedSongs)}
            onClick={(event) => selectTrack(event, index)}
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
              onClick={(event) => event.stopPropagation()}
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
              aria-label={`Select ${song.title}`}
            >
              {song.title}
            </button>
            <ArtistNameLink song={song} onOpenArtist={onOpenArtist} />
            <AlbumNameLink song={song} onOpenAlbum={onOpenAlbum} />
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
              onClick={(event) => {
                event.stopPropagation();
                onQueueSong(song);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <Plus size={14} />
            </button>
            <button
              className="track-queue"
              type="button"
              aria-label={`Remove ${song.title} from playlist`}
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveTrack(index);
              }}
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
  playlists,
  status,
  onAddAlbum,
  onAddArtist,
  onCreateAlbumPlaylist,
  onCreateArtistPlaylist,
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
  playlists: Playlist[];
  status: "idle" | "saving" | "error";
  onAddAlbum: (playlist: Playlist, album: Album) => void;
  onAddArtist: (playlist: Playlist, artist: Artist) => void;
  onCreateAlbumPlaylist: (album: Album) => void;
  onCreateArtistPlaylist: (artist: Artist) => void;
}) {
  const title = menu.item.name;
  const menuLabel = menu.type === "album" ? "Album" : menu.type === "artist" ? "Artist" : "Playlist";
  const sortedPlaylists = [...playlists].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="song-context-menu library-context-menu" collisionPadding={12} aria-label={`${menuLabel} actions for ${title}`}>
      <div className="song-context-heading">
        <div>
          <p className="eyebrow">{menuLabel}</p>
          <strong>{title}</strong>
        </div>
      </div>
      <div className="song-context-section">
        {menu.type === "album" ? (
          <>
            <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onOpenAlbum(menu.item)}>
              <Disc3 size={15} />
              Open Album
            </button></ContextMenu.Item>
            <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onPlayAlbum(menu.item)}>
              <Play size={15} fill="currentColor" />
              Play Album
            </button></ContextMenu.Item>
            <ContextMenu.Item asChild><button
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
            </button></ContextMenu.Item>
            <AddToPlaylistSubmenu playlists={sortedPlaylists} status={status} onAdd={(playlist) => onAddAlbum(playlist, menu.item)} onCreateNew={() => onCreateAlbumPlaylist(menu.item)} />
          </>
        ) : null}
        {menu.type === "artist" ? (
          <>
            <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onOpenArtist(menu.item)}>
              <UserRound size={15} />
              Open Artist
            </button></ContextMenu.Item>
            <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onPlayArtist(menu.item)}>
              <Play size={15} fill="currentColor" />
              Play Artist
            </button></ContextMenu.Item>
            <ContextMenu.Item asChild><button
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
            </button></ContextMenu.Item>
            <AddToPlaylistSubmenu playlists={sortedPlaylists} status={status} onAdd={(playlist) => onAddArtist(playlist, menu.item)} onCreateNew={() => onCreateArtistPlaylist(menu.item)} />
          </>
        ) : null}
        {menu.type === "playlist" ? (
          <>
            <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onOpenPlaylist(menu.item)}>
              <ListMusic size={15} />
              Open Playlist
            </button></ContextMenu.Item>
            <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onPlayPlaylist(menu.item)}>
              <Play size={15} fill="currentColor" />
              Play Playlist
            </button></ContextMenu.Item>
            <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onEditPlaylist(menu.item)}>
              <Settings size={15} />
              Edit Details
            </button></ContextMenu.Item>
            <ContextMenu.Item asChild><button className="song-context-action danger-context-action" type="button" onClick={() => onDeletePlaylist(menu.item)}>
              <Trash2 size={15} />
              Delete Playlist
            </button></ContextMenu.Item>
          </>
        ) : null}
      </div>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

function AddToPlaylistSubmenu({
  playlists,
  status,
  onAdd,
  onCreateNew,
}: {
  playlists: Playlist[];
  status: "idle" | "saving" | "error";
  onAdd: (playlist: Playlist) => void;
  onCreateNew: () => void;
}) {
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className="song-context-action song-context-submenu-trigger">
        <ListMusic size={15} />
        <span>Add to playlist</span>
        <ChevronRight size={15} />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent className="song-context-menu song-context-flyout" sideOffset={4} collisionPadding={12} aria-label="Choose playlist">
          {playlists.length ? (
            <div className="song-context-list">
              {playlists.map((playlist) => (
                <button type="button" role="menuitem" key={playlist.id} onClick={() => onAdd(playlist)} disabled={status === "saving"}>
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
          <button className="song-context-action new-playlist-action" type="button" onClick={onCreateNew}>
            <Plus size={15} />
            Add to new playlist
          </button>
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
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
  onCreatePlaylist,
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
  onCreatePlaylist: () => void;
}) {
  const sortedPlaylists = [...playlists].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="song-context-menu" collisionPadding={12} aria-label={`${menu.songs.length === 1 ? "Song" : `${menu.songs.length} selected songs`} actions for ${menu.song.title}`}>
      <div className="song-context-heading">
        <div>
          <p className="eyebrow">{menu.songs.length === 1 ? "Song" : `${menu.songs.length} songs selected`}</p>
          <strong>{menu.songs.length === 1 ? menu.song.title : `${menu.song.title} and ${menu.songs.length - 1} more`}</strong>
        </div>
      </div>
      {message ? <p className={`song-context-status ${status === "error" ? "bad" : ""}`}>{message}</p> : null}
      <div className="song-context-section">
        <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onPlayNow(menu.song)}>
          <Play size={15} fill="currentColor" />
          Play Now
        </button></ContextMenu.Item>
        <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onPlayNext(menu.song)}>
          <ListMusic size={15} />
          Play Next
        </button></ContextMenu.Item>
        <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onQueueSong(menu.song)}>
          <Plus size={15} />
          Add to Queue
        </button></ContextMenu.Item>
      </div>
      <div className="song-context-section">
        <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onOpenAlbum(menu.song)} disabled={!menu.song.albumId}>
          <Disc3 size={15} />
          Go to Album
        </button></ContextMenu.Item>
        <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onOpenArtist(menu.song)} disabled={!menu.song.artistId}>
          <UserRound size={15} />
          Go to Artist
        </button></ContextMenu.Item>
        <ContextMenu.Item asChild><button className="song-context-action" type="button" onClick={() => onToggleFavorite(!isFavorite)} disabled={favoriteBusy}>
          {favoriteBusy ? <Loader2 size={15} className="spin" /> : <Star size={15} fill={isFavorite ? "currentColor" : "none"} />}
          {isFavorite ? "Remove Favorite" : "Add Favorite"}
        </button></ContextMenu.Item>
      </div>
      <ContextMenu.Sub>
        <ContextMenu.SubTrigger className="song-context-action song-context-submenu-trigger">
          <ListMusic size={15} />
          <span>Add to playlist</span>
          <ChevronRight size={15} />
        </ContextMenu.SubTrigger>
        <ContextMenu.Portal>
          <ContextMenu.SubContent className="song-context-menu song-context-flyout" sideOffset={4} collisionPadding={12} aria-label="Choose playlist">
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
            <button className="song-context-action new-playlist-action" type="button" onClick={onCreatePlaylist}>
              <Plus size={15} />
              Add to new playlist
            </button>
          </ContextMenu.SubContent>
        </ContextMenu.Portal>
      </ContextMenu.Sub>
      </ContextMenu.Content>
    </ContextMenu.Portal>
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
