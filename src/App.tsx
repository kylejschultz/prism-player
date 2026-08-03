import { Library, Play, Radio, Search, Settings, SkipBack, SkipForward } from "lucide-react";

const libraryItems = ["Recently Added", "Albums", "Artists", "Playlists", "Favorites"];

export function App() {
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
          <button className="nav-item active" type="button">
            <Library size={18} />
            Library
          </button>
          <button className="nav-item" type="button">
            <Radio size={18} />
            Radio
          </button>
          <button className="nav-item" type="button">
            <Search size={18} />
            Search
          </button>
          <button className="nav-item" type="button">
            <Settings size={18} />
            Settings
          </button>
        </nav>
      </aside>

      <section className="workspace" aria-label="Music workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Native preview</p>
            <h2>Navidrome library shell</h2>
          </div>
          <button className="connect-button" type="button">Connect Server</button>
        </header>

        <section className="hero-panel">
          <div className="album-art" aria-hidden="true">
            <div className="album-glow" />
            <span>PR</span>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">Now playing concept</p>
            <h3>Build loop is live.</h3>
            <p>
              First artifact proves the app shell, macOS packaging, and GitHub build pipeline before wiring in music.
            </p>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel">
            <div className="panel-heading">
              <h3>Library</h3>
              <span>Navidrome-ready</span>
            </div>
            <div className="list">
              {libraryItems.map((item) => (
                <button className="list-row" type="button" key={item}>
                  <span>{item}</span>
                  <span>Coming next</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel lyrics-panel">
            <div className="panel-heading">
              <h3>Lyrics</h3>
              <span>Synced later</span>
            </div>
            <div className="lyrics-lines" aria-label="Lyrics preview">
              <p>Waiting for a track...</p>
              <p className="muted">Synced lyric highlighting lands after playback.</p>
            </div>
          </section>
        </div>
      </section>

      <footer className="player-bar" aria-label="Playback controls">
        <div>
          <p className="track-title">Prism Player</p>
          <p className="track-meta">Base app artifact</p>
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
    </main>
  );
}
