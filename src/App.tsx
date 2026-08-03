import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Disc3,
  Library,
  Loader2,
  Music2,
  Play,
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

export function App() {
  const [activeView, setActiveView] = useState<View>("library");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("overview");
  const [config, setConfig] = useState<NavidromeConfig | null>(() => loadStoredConfig());
  const [form, setForm] = useState<NavidromeConfig>(() => loadStoredConfig() ?? emptyConfig);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Add a Navidrome server to start syncing.");
  const [libraryData, setLibraryData] = useState<LibraryData>({ albums: [], artists: [] });
  const [setupOpen, setSetupOpen] = useState(() => !loadStoredConfig());

  const hasConfig = Boolean(config);
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
    if (!nextConfig) return;

    setStatus("checking");
    setStatusMessage("Checking Navidrome and loading library...");

    try {
      await navidromeRequest(nextConfig, "ping");
      const nextLibrary = await fetchLibrary(nextConfig);
      setLibraryData(nextLibrary);
      setStatus("connected");
      setStatusMessage(`Connected to ${normalizeServerUrl(nextConfig.serverUrl)}.`);
    } catch (error) {
      setStatus("error");
      setStatusMessage(getErrorMessage(error));
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

    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
    setConfig(nextConfig);
    setSetupOpen(false);
    setActiveView("library");
    await refreshLibrary(nextConfig);
  }

  function resetConnection() {
    localStorage.removeItem(STORAGE_KEY);
    setConfig(null);
    setForm(emptyConfig);
    setLibraryData({ albums: [], artists: [] });
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
          />
        )}
      </section>

      <footer className="player-bar" aria-label="Playback controls">
        <div>
          <p className="track-title">Prism Player</p>
          <p className="track-meta">{hasConfig ? "Ready for playback wiring" : "Connect Navidrome"}</p>
        </div>
        <div className="transport">
          <button type="button" aria-label="Previous">
            <SkipBack size={18} />
          </button>
          <button className="play-button" type="button" aria-label="Play">
            <Play size={20} fill="currentColor" />
          </button>
          <button type="button" aria-label="Next">
            <SkipForward size={18} />
          </button>
        </div>
        <div className="progress">
          <span />
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
          {libraryTab === "albums" ? <AlbumGrid albums={albums} /> : null}
          {libraryTab === "artists" ? <ArtistList artists={artists} /> : null}
        </section>

        <section className="panel lyrics-panel">
          <div className="panel-heading">
            <h3>Now queued</h3>
            <span>{albums.length ? `${albums.length} recent albums` : "Waiting"}</span>
          </div>
          <div className="lyrics-lines" aria-label="Library preview">
            {albums.slice(0, 4).map((album) => (
              <p key={album.id}>{album.name}</p>
            ))}
            {!albums.length ? (
              <>
                <p>Waiting for a server...</p>
                <p className="muted">Recent albums will appear here once the API probe passes.</p>
              </>
            ) : null}
          </div>
        </section>
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

function AlbumGrid({ albums }: { albums: Album[] }) {
  if (!albums.length) {
    return <EmptyPanel icon={<Disc3 size={20} />} text="Albums load after a successful Navidrome sync." />;
  }

  return (
    <div className="album-grid">
      {albums.slice(0, 12).map((album) => (
        <button className="album-tile" type="button" key={album.id}>
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

function ArtistList({ artists }: { artists: Artist[] }) {
  if (!artists.length) {
    return <EmptyPanel icon={<UserRound size={20} />} text="Artists load after a successful Navidrome sync." />;
  }

  return (
    <div className="artist-list">
      {artists.slice(0, 18).map((artist) => (
        <button className="artist-row" type="button" key={artist.id}>
          <UserRound size={18} />
          <span>{artist.name}</span>
          <small>{artist.albumCount ?? 0} albums</small>
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
