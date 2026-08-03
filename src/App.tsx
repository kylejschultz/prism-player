import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  ChevronLeft,
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

type View = "library" | "radio" | "search" | "settings";
type LibraryTab = "overview" | "albums" | "artists";
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

export function App() {
  const [activeView, setActiveView] = useState<View>("library");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("overview");
  const [config, setConfig] = useState<NavidromeConfig | null>(() => loadStoredConfig());
  const [form, setForm] = useState<NavidromeConfig>(() => loadStoredConfig() ?? emptyConfig);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Add a Navidrome server to start syncing.");
  const [libraryData, setLibraryData] = useState<LibraryData>({ albums: [], artists: [] });
  const [setupOpen, setSetupOpen] = useState(() => !loadStoredConfig());
  const [detailSelection, setDetailSelection] = useState<DetailSelection>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const [detailMessage, setDetailMessage] = useState("");
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
      setActiveView("library");
    }
  }

  async function openAlbum(album: Album) {
    if (!config) return;

    setDetailStatus("loading");
    setDetailMessage(`Loading ${album.name}...`);
    setLibraryTab("albums");

    try {
      const albumDetail = await fetchAlbumDetail(config, album.id);
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

    setDetailStatus("loading");
    setDetailMessage(`Loading ${artist.name}...`);
    setLibraryTab("artists");

    try {
      const artistDetail = await fetchArtistDetail(config, artist.id);
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
            className={`nav-item ${activeView === "library" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("library")}
          >
            <Library size={18} />
            Library
          </button>
          <button
            className={`nav-item ${activeView === "radio" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("radio")}
          >
            <Radio size={18} />
            Radio
          </button>
          <button
            className={`nav-item ${activeView === "search" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("search")}
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
          <div>
            <p className="eyebrow">{hasConfig ? "Navidrome connected" : "First run setup"}</p>
            <h2>{activeView === "settings" ? "Settings" : "Navidrome library"}</h2>
          </div>
          <button className="connect-button" type="button" onClick={() => setActiveView("settings")}>
            <Settings size={16} />
            Server Settings
          </button>
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
            libraryTab={libraryTab}
            setLibraryTab={setLibraryTab}
            libraryItems={libraryItems}
            albums={libraryData.albums}
            artists={libraryData.artists}
            status={status}
            statusMessage={statusMessage}
            onOpenSettings={() => setActiveView("settings")}
            onRefresh={() => void refreshLibrary()}
            detailSelection={detailSelection}
            detailStatus={detailStatus}
            detailMessage={detailMessage}
            queue={queue}
            currentTrack={currentTrack}
            onOpenAlbum={(album) => void openAlbum(album)}
            onOpenArtist={(artist) => void openArtist(artist)}
            onClearDetail={clearDetail}
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
  libraryTab,
  setLibraryTab,
  libraryItems,
  albums,
  artists,
  status,
  statusMessage,
  onOpenSettings,
  onRefresh,
  detailSelection,
  detailStatus,
  detailMessage,
  queue,
  currentTrack,
  onOpenAlbum,
  onOpenArtist,
  onClearDetail,
  onReplaceQueue,
  onPlaySong,
  onQueueSong,
}: {
  activeView: View;
  libraryTab: LibraryTab;
  setLibraryTab: (tab: LibraryTab) => void;
  libraryItems: Array<{ label: string; value: string }>;
  albums: Album[];
  artists: Artist[];
  status: ConnectionStatus;
  statusMessage: string;
  onOpenSettings: () => void;
  onRefresh: () => void;
  detailSelection: DetailSelection;
  detailStatus: "idle" | "loading" | "error";
  detailMessage: string;
  queue: Song[];
  currentTrack: Song | null;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onClearDetail: () => void;
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

  return (
    <>
      <section className="hero-panel">
        <div className="album-art" aria-hidden="true">
          <div className="album-glow" />
          <span>PR</span>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Library spine</p>
          <h3>{status === "connected" ? "Navidrome is live." : "Connect your server."}</h3>
          <p>{statusMessage}</p>
          <div className="hero-actions">
            <button className="connect-button" type="button" onClick={onRefresh} disabled={status === "checking"}>
              {status === "checking" ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
              Refresh
            </button>
            <button className="secondary-button" type="button" onClick={onOpenSettings}>
              <Settings size={16} />
              Settings
            </button>
          </div>
        </div>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Library</h3>
            <SegmentedTabs active={libraryTab} onChange={setLibraryTab} />
          </div>
          {libraryTab === "overview" ? (
            <div className="list">
              {libraryItems.map((item) => (
                <button className="list-row" type="button" key={item.label}>
                  <span>{item.label}</span>
                  <span>{item.value}</span>
                </button>
              ))}
            </div>
          ) : null}
          {libraryTab === "albums" ? <AlbumGrid albums={albums} onOpenAlbum={onOpenAlbum} /> : null}
          {libraryTab === "artists" ? <ArtistList artists={artists} onOpenArtist={onOpenArtist} /> : null}
        </section>

        <DetailPanel
          detailSelection={detailSelection}
          detailStatus={detailStatus}
          detailMessage={detailMessage}
          queue={queue}
          currentTrack={currentTrack}
          onClearDetail={onClearDetail}
          onOpenAlbum={onOpenAlbum}
          onReplaceQueue={onReplaceQueue}
          onPlaySong={onPlaySong}
          onQueueSong={onQueueSong}
        />
      </div>
    </>
  );
}

function SegmentedTabs({ active, onChange }: { active: LibraryTab; onChange: (tab: LibraryTab) => void }) {
  return (
    <div className="segmented-control" aria-label="Library view">
      {(["overview", "albums", "artists"] as LibraryTab[]).map((tab) => (
        <button
          key={tab}
          className={active === tab ? "active" : ""}
          type="button"
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function AlbumGrid({ albums, onOpenAlbum }: { albums: Album[]; onOpenAlbum: (album: Album) => void }) {
  if (!albums.length) {
    return <EmptyPanel icon={<Disc3 size={20} />} text="Albums load after a successful Navidrome sync." />;
  }

  return (
    <div className="album-grid">
      {albums.slice(0, 12).map((album) => (
        <button className="album-tile" type="button" key={album.id} onClick={() => onOpenAlbum(album)}>
          <div className="mini-cover" aria-hidden="true">
            <Disc3 size={22} />
          </div>
          <span>{album.name}</span>
          <small>{album.artist || `${album.songCount ?? 0} tracks`}</small>
        </button>
      ))}
    </div>
  );
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
  detailSelection,
  detailStatus,
  detailMessage,
  queue,
  currentTrack,
  onClearDetail,
  onOpenAlbum,
  onReplaceQueue,
  onPlaySong,
  onQueueSong,
}: {
  detailSelection: DetailSelection;
  detailStatus: "idle" | "loading" | "error";
  detailMessage: string;
  queue: Song[];
  currentTrack: Song | null;
  onClearDetail: () => void;
  onOpenAlbum: (album: Album) => void;
  onReplaceQueue: (songs: Song[], startIndex?: number) => void;
  onPlaySong: (song: Song) => void;
  onQueueSong: (song: Song) => void;
}) {
  if (detailStatus === "loading" || detailStatus === "error") {
    return (
      <section className={`panel detail-panel ${detailStatus === "error" ? "bad" : ""}`}>
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

  if (!detailSelection) {
    return (
      <section className="panel detail-panel">
        <div className="panel-heading">
          <h3>Now queued</h3>
          <span>{queue.length ? `${queue.length} tracks` : "Empty"}</span>
        </div>
        <QueueList queue={queue} currentTrack={currentTrack} onPlaySong={onPlaySong} />
      </section>
    );
  }

  if (detailSelection.type === "artist") {
    const artist = detailSelection.data;

    return (
      <section className="panel detail-panel">
        <div className="panel-heading">
          <button className="detail-back" type="button" onClick={onClearDetail}>
            <ChevronLeft size={16} />
            Artists
          </button>
          <span>{artist.album?.length ?? 0} albums</span>
        </div>
        <div className="detail-title">
          <p className="eyebrow">Artist</p>
          <h3>{artist.name}</h3>
        </div>
        <div className="album-stack">
          {(artist.album ?? []).map((album) => (
            <button className="album-row" type="button" key={album.id} onClick={() => onOpenAlbum(album)}>
              <Disc3 size={18} />
              <span>{album.name}</span>
              <small>{album.year ?? ""}</small>
            </button>
          ))}
          {!artist.album?.length ? <EmptyPanel icon={<Disc3 size={20} />} text="No albums returned for this artist." /> : null}
        </div>
      </section>
    );
  }

  const album = detailSelection.data;
  const songs = album.song ?? [];

  return (
    <section className="panel detail-panel">
      <div className="panel-heading">
        <button className="detail-back" type="button" onClick={onClearDetail}>
          <ChevronLeft size={16} />
          Albums
        </button>
        <span>{songs.length} tracks</span>
      </div>
      <div className="detail-title">
        <p className="eyebrow">{album.artist}</p>
        <h3>{album.name}</h3>
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
        <div className={`track-row ${currentTrack?.id === song.id ? "active" : ""}`} key={song.id}>
          <button className="track-play" type="button" aria-label={`Play ${song.title}`} onClick={() => onPlaySong(song)}>
            <Play size={14} fill="currentColor" />
          </button>
          <span className="track-number">{song.track ?? index + 1}</span>
          <span className="track-name">{song.title}</span>
          <span className="track-duration">{formatDuration(song.duration)}</span>
          <button className="track-queue" type="button" aria-label={`Queue ${song.title}`} onClick={() => onQueueSong(song)}>
            <Plus size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function QueueList({
  queue,
  currentTrack,
  onPlaySong,
}: {
  queue: Song[];
  currentTrack: Song | null;
  onPlaySong: (song: Song) => void;
}) {
  if (!queue.length) {
    return (
      <div className="detail-empty">
        <ListMusic size={22} />
        <p>Select an album track to start building the queue.</p>
      </div>
    );
  }

  return (
    <div className="queue-list">
      {queue.slice(0, 10).map((song, index) => (
        <button
          className={`queue-row ${currentTrack?.id === song.id ? "active" : ""}`}
          type="button"
          key={`${song.id}-${index}`}
          onClick={() => onPlaySong(song)}
        >
          <span>{index + 1}</span>
          <div>
            <strong>{song.title}</strong>
            <small>{song.artist ?? "Unknown artist"}</small>
          </div>
        </button>
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
