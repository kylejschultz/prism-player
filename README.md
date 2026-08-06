# Prism Player

Prism Player is a focused desktop music player for Navidrome and other Subsonic-compatible libraries. It is built for people who want a fast native-feeling library browser, a proper queue, and a clean listening surface without turning their music server into a web tab.

The app is currently in early active development. The first target platform is macOS, with the codebase set up around Tauri, React, TypeScript, and Vite.

## What It Does

- Connects to Navidrome/Subsonic servers with a local saved connection.
- Browses artists, albums, playlists, favorites, recently added, and recently played music.
- Supports grid and list modes for large album and artist libraries.
- Plays tracks directly from the server with shuffle, repeat, seeking, volume, and queue persistence.
- Provides global search across artists, albums, songs, and playlists.
- Opens album, artist, and playlist detail views with cover art, metadata, and track lists.
- Creates playlists, edits playlist details, reorders playlist tracks, and removes playlist entries.
- Stars and unstars songs, albums, and artists through the server API.
- Shows queue, now-playing details, and lyrics in a collapsible right sidebar.
- Keeps local preferences for view modes, sidebar state, volume, queue, and analytics consent.

## Status

Prism is pre-1.0 software. The core Navidrome library and playback loop is in place, but packaging, signing, auto-update, and broader platform support are still being shaped.

Current release target:

- macOS DMG builds from GitHub Actions.
- Conventional commits for change history.
- release-please for version bumps, changelog entries, tags, and GitHub releases.

## Development

Requirements:

- Node.js 22
- npm
- Rust stable
- macOS 13+ for the current bundled desktop target

Install dependencies:

```sh
npm ci
```

Run the web preview:

```sh
npm run dev
```

Run the Tauri desktop app:

```sh
npm run tauri:dev
```

Build the frontend:

```sh
npm run build
```

Build the macOS DMG:

```sh
npm run tauri:build
```

## Repository Workflow

Development should happen on short-lived branches and merge through pull requests into `main`.

1. Create a branch from `main`.
2. Make small, reviewable commits using Conventional Commits.
3. Open a pull request.
4. Wait for CI to pass.
5. Squash or merge using a Conventional Commit-style title.
6. release-please opens or updates the release PR after changes land on `main`.
7. Merging the release PR creates the tag and GitHub release.
8. The release packaging workflow builds and attaches the macOS DMG.

Recommended branch names:

- `feat/navidrome-auth`
- `fix/queue-persistence`
- `docs/public-readme`
- `chore/release-please`

## Commit Style

Prism uses Conventional Commits so release notes and semantic versions can be generated automatically.

Common commit types:

- `feat:` for user-facing features
- `fix:` for bug fixes
- `docs:` for documentation-only changes
- `style:` for formatting-only changes
- `refactor:` for code changes that do not alter behavior
- `test:` for tests
- `build:` for packaging, dependencies, or build system changes
- `ci:` for GitHub Actions and automation
- `chore:` for maintenance

Examples:

```text
feat: add playlist detail editing
fix: preserve queue after refresh
docs: document release workflow
ci: add release-please automation
```

Breaking changes should use `!` or a `BREAKING CHANGE:` footer:

```text
feat!: require Navidrome token auth
```

## Releases

Release automation is documented in [docs/RELEASE.md](docs/RELEASE.md).

At a high level:

- Normal feature and fix PRs merge to `main`.
- release-please maintains a release PR based on Conventional Commit history.
- The release PR updates `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, and `CHANGELOG.md`.
- Merging the release PR creates a GitHub release.
- The packaging workflow builds the macOS DMG and uploads it to the release.

## Privacy

Prism stores your server connection and local playback preferences in browser/app local storage. Optional anonymous analytics are opt-in and limited to install-level app metadata such as app version, install ID, platform, channel, and whether the build is a development or release build. Library, account, and playback data are not sent.

## License

License details are not set yet.
