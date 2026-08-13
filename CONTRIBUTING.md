# Contributing to Prism Player

Thanks for helping improve Prism. This guide covers local development and the repository workflow; the [README](README.md) is for people installing and using the app.

## Development setup

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

Run pre-release checks:

```sh
npm test
```

Build the macOS DMG:

```sh
python3 -m pip install dmgbuild
npm run tauri:build:installer
```

## Repository workflow

Development happens on short-lived branches and merges through pull requests into `dev`. The `dev` branch is the integration lane; `release` is the release branch.

1. Create a branch from `dev`.
2. Make small, reviewable commits using Conventional Commits.
3. Open a pull request into `dev`.
4. Wait for CI and security checks to pass.
5. Let feature branches settle together on `dev`.
6. When `dev` is ready to ship, open a release-candidate PR from `dev` into `release`.
7. release-please opens or updates the release PR after changes land on `release`.
8. Merging the release PR creates the tag and GitHub release.

The release packaging workflow builds and attaches the macOS DMG and Windows installer. Run it manually from Actions for an on-demand development artifact.

Recommended branch names:

- `feat/navidrome-auth`
- `fix/queue-persistence`
- `docs/public-readme`
- `chore/ci-security-release-flow`

PRs directly into `release` are intentionally blocked unless the source branch is `dev` or release-please automation.

## Commit style

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
