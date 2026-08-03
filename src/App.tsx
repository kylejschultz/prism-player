import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Disc3,
  Library,
  ListMusic,
  Loader2,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  UserRound,
  X,
} from "lucide-react";

type LibraryViewMode = "overview" | "albums" | "artists" | "playlists";
type View = LibraryViewMode | "radio" | "search" | "settings";
type ConnectionStatus = "idle" | "checking" | "connected" | "error";

type NavidromeConfig = {
  serverUrl: string;
  username: string;
  password: string;
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

type LibraryData = {
  albums: Album[];
  artists: Artist[];
};

type Song = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  coverArt?: string;
  duration?: number;
  track?: number;
};

type AlbumDetail = Album & {
  song?: Song[];
};

type ArtistDetail = Artist & {
  album?: Album[];
};

type DetailSelection =
  | { type: "album"; data: AlbumDetail }
  | { type: "artist"; data: ArtistDetail }
  | null;

type BrowserSnapshot = {
  activeView: View;
  detailSelection: DetailSelection;
};

const STORAGE_KEY = "prism-player.navidrome";
const CLIENT_ID = "PrismPlayer";
const API_VERSION = "1.16.1";

const emptyConfig: NavidromeConfig = {
  serverUrl: "",
  username: "",
  password: "",
};

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

function buildNavidromeUrl(config: NavidromeConfig, endpoint: string, params: Record<string, string>) {
  const url = new URL(`${normalizeServerUrl(config.serverUrl)}/rest/${endpoint}.view`);
  url.searchParams.set("u", config.username);
  url.searchParams.set("p", config.password);
  url.searchParams.set("v", API_VERSION);
  url.searchParams.set("c", CLIENT_ID);
  url.searchParams.set("f", "json");

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url;
}

function buildCoverArtUrl(config: NavidromeConfig, coverArt?: string, size = "420") {
  if (!coverArt) return null;
  return buildNavidromeUrl(config, "getCoverArt", { id: coverArt, size }).toString();
}

async function navidromeRequest<T>(
  config: NavidromeConfig,
  endpoint: string,
  params: Record<string, string> = {},
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
  const [albumResponse, artistResponse] = await Promise.all([
    navidromeRequest<{ albumList2?: { album?: Album[] } }>(config, "getAlbumList2", {
      type: "recent",
      size: "24",
    }),
    navidromeRequest<{ artists?: { index?: Array<{ artist?: Artist[] }> } }>(config, "getArtists"),
  ]);

  return {
    albums: albumResponse.albumList2?.album ?? [],
    artists:
      artistResponse.artists?.index?.flatMap((index) => index.artist ?? [])?.slice(0, 36) ?? [],
  };
}

async function fetchAlbumDetail(config: NavidromeConfig, albumId: string): Promise<AlbumDetail> {
  const response = await navidromeRequest<{ album: AlbumDetail }>(config, "getAlbum", { id: albumId });
  return response.album;
}

async function fetchArtistDetail(config: NavidromeConfig, artistId: string): Promise<ArtistDetail> {
  const response = await navidromeRequest<{ artist: ArtistDetail }>(config, "getArtist", { id: artistId });
  return response.artist;
}

function formatDuration(seconds?: number) {
  if (!seconds) return "-:--";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getSnapshotLabel(snapshot: BrowserSnapshot | null) {
  if (!snapshot) return "";
  if (snapshot.detailSelection?.type === "artist") return snapshot.detailSelection.data.name;
  if (snapshot.detailSelection?.type === "album") return snapshot.detailSelection.data.name;
  if (snapshot.activeView === "overview") return "Library";
  return snapshot.activeView.charAt(0).toUpperCase() + snapshot.activeView.slice(1);
}

export function App() {
  const [activeView, setActiveView] = useState<View>("overview");
  const [config, setConfig] = useState<NavidromeConfig | null>(() => loadStoredConfig());
  const [form, setForm] = useState<NavidromeConfig>(() => loadStoredConfig() ?? emptyConfig);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Add a Navidrome server to start syncing.");
  const [libraryData, setLibraryData] = useState<LibraryData>({ albums: [], artists: [] });
  const [setupOpen, setSetupOpen] = useState(() => !loadStoredConfig());
  const [detailSelection, setDetailSelection] = useState<DetailSelection>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const [detailMessage, setDetailMessage] = useState("");
  const [backStack, setBackStack] = useState<BrowserSnapshot[]>([]);
  const [forwardStack, setForwardStack] = useState<BrowserSnapshot[]>([]);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const hasConfig = Boolean(config);
  const currentTrack = queue[currentIndex] ?? null;
  const libraryItems = useMemo(
    () => [
      { label: "Recently Added", value: `${libraryData.albums.length || "-"} albums` },
      { label: "Albums", value: hasConfig ? `${libraryData.albums.length} loaded` : "Needs server" },
      { label: "Artists", value: hasConfig ? `${libraryData.artists.length} loaded` : "Needs server" },
      { label: "Playlists", value: "Coming next" },
      { label: "Favorites", value: "Coming next" },
    ],
    [hasConfig, libraryData.albums.length, libraryData.artists.length],
  );

  async function refreshLibrary(nextConfig = config) {
    if (!nextConfig) return false;

    setStatus("checking");
    setStatusMessage("Checking Navidrome and loading library...");

    try {
      const resolvedConfig = await resolveNavidromeConfig(nextConfig);
      const nextLibrary = await fetchLibrary(resolvedConfig);
      setLibraryData(nextLibrary);
      setConfig(resolvedConfig);
      setForm(resolvedConfig);
      setStatus("connected");
      setStatusMessage(`Connected to ${resolvedConfig.serverUrl}.`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resolvedConfig));
      return true;
    } catch (error) {
      setStatus("error");
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

  async function openAlbum(album: Album) {
    if (!config) return;
    const origin = { activeView, detailSelection };

    setDetailStatus("loading");
    setDetailMessage(`Loading ${album.name}...`);
    setActiveView("albums");

    try {
      const albumDetail = await fetchAlbumDetail(config, album.id);
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

  async function openArtist(artist: Artist) {
    if (!config) return;
    const origin = { activeView, detailSelection };

    setDetailStatus("loading");
    setDetailMessage(`Loading ${artist.name}...`);
    setActiveView("artists");

    try {
      const artistDetail = await fetchArtistDetail(config, artist.id);
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

  function clearDetail() {
    setDetailSelection(null);
    setDetailStatus("idle");
    setDetailMessage("");
  }

  function selectView(view: View) {
    if (view === "overview" || view === "albums" || view === "artists" || view === "playlists") {
      clearDetail();
      setBackStack([]);
      setForwardStack([]);
    }

    setActiveView(view);
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

  function replaceQueue(songs: Song[], startIndex = 0) {
    if (!songs.length) return;
    setQueue(songs);
    setCurrentIndex(startIndex);
    setIsPlaying(true);
  }

  function appendToQueue(song: Song) {
    setQueue((currentQueue) => [...currentQueue, song]);
  }

  function playSong(song: Song) {
    const existingIndex = queue.findIndex((queuedSong) => queuedSong.id === song.id);

    if (existingIndex >= 0) {
      setCurrentIndex(existingIndex);
      setIsPlaying(true);
      return;
    }

    setQueue((currentQueue) => [...currentQueue, song]);
    setCurrentIndex(queue.length);
    setIsPlaying(true);
  }

  function playNext() {
    if (!queue.length) return;
    setCurrentIndex((index) => Math.min(index + 1, queue.length - 1));
    setIsPlaying(true);
  }

  function playPrevious() {
    if (!queue.length) return;
    setCurrentIndex((index) => Math.max(index - 1, 0));
    setIsPlaying(true);
  }

  function resetConnection() {
    localStorage.removeItem(STORAGE_KEY);
    setConfig(null);
    setForm(emptyConfig);
    setLibraryData({ albums: [], artists: [] });
    setDetailSelection(null);
    setBackStack([]);
    setForwardStack([]);
    setQueue([]);
    setCurrentIndex(0);
    setIsPlaying(false);
    setStatus("idle");
    setStatusMessage("Add a Navidrome server to start syncing.");
    setSetupOpen(true);
    setActiveView("settings");
  }

  useEffect(() => {
    if (config) {
      void refreshLibrary(config);
    }
  }, []);

  const statusTone = status === "connected" ? "good" : status === "error" ? "bad" : "neutral";
  const activeTitle =
    activeView === "overview"
      ? "Library"
      : activeView === "settings"
        ? "Settings"
        : activeView.charAt(0).toUpperCase() + activeView.slice(1);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <p className="eyebrow">Prism</p>
            <h1>Player</h1>
          </div>
        </div>

        <nav className="nav-list">
          <button
            className={`nav-item ${activeView === "overview" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("overview")}
          >
            <Library size={18} />
            Library
          </button>
          <button
            className={`nav-item ${activeView === "albums" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("albums")}
          >
            <Disc3 size={18} />
            Albums
          </button>
          <button
            className={`nav-item ${activeView === "artists" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("artists")}
          >
            <UserRound size={18} />
            Artists
          </button>
          <button
            className={`nav-item ${activeView === "playlists" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("playlists")}
          >
            <ListMusic size={18} />
            Playlists
          </button>
          <button
            className={`nav-item ${activeView === "radio" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("radio")}
          >
            <Radio size={18} />
            Radio
          </button>
          <button
            className={`nav-item ${activeView === "search" ? "active" : ""}`}
            type="button"
            onClick={() => selectView("search")}
          >
            <Search size={18} />
            Search
          </button>
          <button
            className={`nav-item ${activeView === "settings" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("settings")}
          >
            <Settings size={18} />
            Settings
          </button>
        </nav>

        <div className={`connection-pill ${statusTone}`}>
          {status === "checking" ? <Loader2 size={16} className="spin" /> : null}
          {status === "connected" ? <CheckCircle2 size={16} /> : null}
          {status === "error" ? <AlertCircle size={16} /> : null}
          {status === "idle" ? <Settings size={16} /> : null}
          <span>{status === "connected" ? "Server online" : status === "checking" ? "Checking" : "Setup needed"}</span>
        </div>
      </aside>

      <section className="workspace" aria-label="Music workspace">
        <header className="topbar">
          <div className="topbar-title">
            <BrowserNavigation
              canNavigateBack={backStack.length > 0}
              canNavigateForward={forwardStack.length > 0}
              backTarget={backStack[backStack.length - 1] ?? null}
              forwardTarget={forwardStack[0] ?? null}
              onNavigateBack={navigateBack}
              onNavigateForward={navigateForward}
            />
            <h2>{activeTitle}</h2>
          </div>
        </header>

        {activeView === "settings" ? (
          <SettingsView
            form={form}
            setForm={setForm}
            status={status}
            statusMessage={statusMessage}
            onSave={saveConnection}
            onReset={resetConnection}
          />
        ) : (
          <LibraryView
            activeView={activeView}
            config={config}
            libraryItems={libraryItems}
            albums={libraryData.albums}
            artists={libraryData.artists}
            onSelectLibraryView={selectView}
            detailSelection={detailSelection}
            detailStatus={detailStatus}
            detailMessage={detailMessage}
            currentTrack={currentTrack}
            onOpenAlbum={(album) => void openAlbum(album)}
            onOpenArtist={(artist) => void openArtist(artist)}
            onReplaceQueue={replaceQueue}
            onPlaySong={playSong}
            onQueueSong={appendToQueue}
          />
        )}
      </section>

      <footer className="player-bar" aria-label="Playback controls">
        <div>
          <p className="track-title">{currentTrack?.title ?? "Prism Player"}</p>
          <p className="track-meta">
            {currentTrack ? `${currentTrack.artist ?? "Unknown artist"} - ${currentTrack.album ?? "Unknown album"}` : hasConfig ? "Queue ready" : "Connect Navidrome"}
          </p>
        </div>
        <div className="transport">
          <button type="button" aria-label="Previous" onClick={playPrevious} disabled={!queue.length || currentIndex === 0}>
            <SkipBack size={18} />
          </button>
          <button
            className="play-button"
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={() => queue.length && setIsPlaying((playing) => !playing)}
            disabled={!queue.length}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button type="button" aria-label="Next" onClick={playNext} disabled={!queue.length || currentIndex >= queue.length - 1}>
            <SkipForward size={18} />
          </button>
        </div>
        <div className="progress">
          <span style={{ width: queue.length ? `${((currentIndex + 1) / queue.length) * 100}%` : "0%" }} />
        </div>
      </footer>

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
    </main>
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

function SettingsView({
  form,
  setForm,
  status,
  statusMessage,
  onSave,
  onReset,
}: {
  form: NavidromeConfig;
  setForm: (config: NavidromeConfig) => void;
  status: ConnectionStatus;
  statusMessage: string;
  onSave: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  onReset: () => void;
}) {
  return (
    <section className="settings-layout">
      <form className="settings-form" onSubmit={onSave}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Navidrome</p>
            <h3>Server connection</h3>
          </div>
          <ConnectionStatusBadge status={status} />
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
            Reset
          </button>
        </div>
      </form>

      <section className={`status-panel ${status === "error" ? "bad" : ""}`}>
        <div className="status-icon" aria-hidden="true">
          {status === "connected" ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
        </div>
        <div>
          <p className="eyebrow">Connection state</p>
          <h3>{status === "connected" ? "Server verified" : "Waiting for a valid server"}</h3>
          <p>{statusMessage}</p>
        </div>
      </section>
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

function LibraryView({
  activeView,
  config,
  libraryItems,
  albums,
  artists,
  onSelectLibraryView,
  detailSelection,
  detailStatus,
  detailMessage,
  currentTrack,
  onOpenAlbum,
  onOpenArtist,
  onReplaceQueue,
  onPlaySong,
  onQueueSong,
}: {
  activeView: View;
  config: NavidromeConfig | null;
  libraryItems: Array<{ label: string; value: string }>;
  albums: Album[];
  artists: Artist[];
  onSelectLibraryView: (view: View) => void;
  detailSelection: DetailSelection;
  detailStatus: "idle" | "loading" | "error";
  detailMessage: string;
  currentTrack: Song | null;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onReplaceQueue: (songs: Song[], startIndex?: number) => void;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
}) {
  if (activeView === "radio" || activeView === "search") {
    return (
      <section className="empty-view">
        <p className="eyebrow">{activeView}</p>
        <h3>{activeView === "radio" ? "Radio comes after library sync." : "Search comes after indexing."}</h3>
        <p>Navidrome connection and library browsing are the active lap.</p>
      </section>
    );
  }

  const panelTitle =
    activeView === "overview"
      ? "Library"
      : activeView.charAt(0).toUpperCase() + activeView.slice(1);

  return (
    <section className="browser-panel">
      {detailStatus !== "idle" || detailSelection ? (
        <DetailPanel
          config={config}
          detailSelection={detailSelection}
          detailStatus={detailStatus}
          detailMessage={detailMessage}
          currentTrack={currentTrack}
          onOpenAlbum={onOpenAlbum}
          onReplaceQueue={onReplaceQueue}
          onPlaySong={onPlaySong}
          onQueueSong={onQueueSong}
        />
      ) : (
        <>
          <div className="panel-heading browser-heading">
            <h3>{panelTitle}</h3>
            {activeView !== "overview" ? (
              <button className="detail-back" type="button" onClick={() => onSelectLibraryView("overview")}>
                <ChevronLeft size={16} />
                Overview
              </button>
            ) : null}
          </div>
          {activeView === "overview" ? (
            <div className="list">
              {libraryItems.map((item) => (
                <button
                  className="list-row"
                  type="button"
                  key={item.label}
                  onClick={() => {
                    if (item.label === "Albums") onSelectLibraryView("albums");
                    if (item.label === "Artists") onSelectLibraryView("artists");
                    if (item.label === "Playlists") onSelectLibraryView("playlists");
                  }}
                >
                  <span>{item.label}</span>
                  <span>{item.value}</span>
                </button>
              ))}
            </div>
          ) : null}
          {activeView === "albums" ? <AlbumGrid config={config} albums={albums} onOpenAlbum={onOpenAlbum} /> : null}
          {activeView === "artists" ? <ArtistList artists={artists} onOpenArtist={onOpenArtist} /> : null}
          {activeView === "playlists" ? (
            <EmptyPanel icon={<ListMusic size={20} />} text="Playlists come next after album and artist browsing." />
          ) : null}
        </>
      )}
    </section>
  );
}

function AlbumGrid({
  config,
  albums,
  onOpenAlbum,
}: {
  config: NavidromeConfig | null;
  albums: Album[];
  onOpenAlbum: (album: Album) => void;
}) {
  if (!albums.length) {
    return <EmptyPanel icon={<Disc3 size={20} />} text="Albums load after a successful Navidrome sync." />;
  }

  return (
    <div className="album-grid">
      {albums.slice(0, 24).map((album) => {
        const coverUrl = config ? buildCoverArtUrl(config, album.coverArt, "360") : null;

        return (
          <button className="album-tile" type="button" key={album.id} onClick={() => onOpenAlbum(album)}>
            <CoverArt src={coverUrl} label={album.name} className="album-cover" />
            <span>{album.name}</span>
            <small>{album.artist || `${album.songCount ?? 0} tracks`}</small>
          </button>
        );
      })}
    </div>
  );
}

function CoverArt({ src, label, className }: { src: string | null; label: string; className: string }) {
  if (!src) {
    return (
      <div className={`${className} cover-fallback`} aria-hidden="true">
        <Disc3 size={28} />
      </div>
    );
  }

  return <img className={className} src={src} alt={`${label} cover`} loading="lazy" />;
}

function ArtistList({ artists, onOpenArtist }: { artists: Artist[]; onOpenArtist: (artist: Artist) => void }) {
  if (!artists.length) {
    return <EmptyPanel icon={<UserRound size={20} />} text="Artists load after a successful Navidrome sync." />;
  }

  return (
    <div className="artist-list">
      {artists.slice(0, 18).map((artist) => (
        <button className="artist-row" type="button" key={artist.id} onClick={() => onOpenArtist(artist)}>
          <UserRound size={18} />
          <span>{artist.name}</span>
          <small>{artist.albumCount ?? 0} albums</small>
        </button>
      ))}
    </div>
  );
}

function DetailPanel({
  config,
  detailSelection,
  detailStatus,
  detailMessage,
  currentTrack,
  onOpenAlbum,
  onReplaceQueue,
  onPlaySong,
  onQueueSong,
}: {
  config: NavidromeConfig | null;
  detailSelection: DetailSelection;
  detailStatus: "idle" | "loading" | "error";
  detailMessage: string;
  currentTrack: Song | null;
  onOpenAlbum: (album: Album) => void;
  onReplaceQueue: (songs: Song[], startIndex?: number) => void;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
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
    const artistAlbums = artist.album ?? [];
    const firstCover = config ? buildCoverArtUrl(config, artistAlbums.find((album) => album.coverArt)?.coverArt, "420") : null;
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
          <CoverArt src={firstCover} label={artist.name} className="artist-cover" />
          <div>
            <p className="eyebrow">Artist</p>
            <h3>{artist.name}</h3>
            <div className="detail-stats">
              <span>{artist.albumCount ?? artistAlbums.length} albums</span>
              <span>{yearRange}</span>
            </div>
          </div>
        </div>
        <div className="section-label">
          <h4>Albums</h4>
        </div>
        <div className="album-grid artist-albums">
          {artistAlbums.map((album) => {
            const coverUrl = config ? buildCoverArtUrl(config, album.coverArt, "320") : null;

            return (
              <button className="album-tile" type="button" key={album.id} onClick={() => onOpenAlbum(album)}>
                <CoverArt src={coverUrl} label={album.name} className="album-cover" />
                <span>{album.name}</span>
                <small>{album.year ?? `${album.songCount ?? 0} tracks`}</small>
              </button>
            );
          })}
          {!artistAlbums.length ? <EmptyPanel icon={<Disc3 size={20} />} text="No albums returned for this artist." /> : null}
        </div>
      </section>
    );
  }

  const album = detailSelection.data;
  const songs = album.song ?? [];
  const albumCover = config ? buildCoverArtUrl(config, album.coverArt ?? songs.find((song) => song.coverArt)?.coverArt, "460") : null;

  return (
    <section className="detail-panel">
      <div className="panel-heading">
        <h3>{album.name}</h3>
        <span>{songs.length} tracks</span>
      </div>
      <div className="album-hero">
        <CoverArt src={albumCover} label={album.name} className="detail-cover" />
        <div>
          <div className="detail-title">
            <p className="eyebrow">{album.artist}</p>
            <h3>{album.name}</h3>
          </div>
          <div className="detail-stats">
            <span>{album.year ?? "Year unavailable"}</span>
            <span>{songs.length} tracks</span>
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
      <TrackList songs={songs} currentTrack={currentTrack} onPlaySong={onPlaySong} onQueueSong={onQueueSong} />
    </section>
  );
}

function TrackList({
  songs,
  currentTrack,
  onPlaySong,
  onQueueSong,
}: {
  songs: Song[];
  currentTrack: Song | null;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
}) {
  if (!songs.length) {
    return <EmptyPanel icon={<Music2 size={20} />} text="No tracks returned for this album." />;
  }

  return (
    <div className="track-list">
      {songs.map((song, index) => (
        <div
          className={`track-row ${currentTrack?.id === song.id ? "active" : ""}`}
          key={song.id}
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
