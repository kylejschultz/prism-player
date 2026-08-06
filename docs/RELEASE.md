# Release Plan

Prism Player uses pull requests, Conventional Commits, and release-please to keep releases predictable without hand-editing version numbers.

## Branches

- `main` is the protected release branch.
- Feature, fix, documentation, and maintenance work should happen on short-lived branches.
- Pull requests into `main` must pass CI before merge.

## Required Checks

The `CI` workflow should be required by branch protection. It installs dependencies with `npm ci` and runs the production frontend build with `npm run build`.

The macOS packaging workflow is intentionally separate from pull request CI because Tauri bundling is slower and produces release artifacts.

## Commit Convention

Use Conventional Commits for commit messages and pull request titles:

- `feat:` triggers a minor release.
- `fix:` triggers a patch release.
- `perf:` triggers a patch release.
- `docs:`, `chore:`, `ci:`, `style:`, `refactor:`, `test:`, and `build:` are tracked but do not necessarily produce a user-facing release unless included with releasable changes.
- `feat!:` or a `BREAKING CHANGE:` footer triggers a major release once the project is beyond the initial pre-1.0 phase.

## Release Flow

1. Work merges to `main` through pull requests.
2. The `Release Please` workflow evaluates Conventional Commits on `main`.
3. release-please opens or updates a release PR.
4. The release PR contains:
   - `CHANGELOG.md` updates
   - `package.json` version bump
   - `package-lock.json` version bump
   - `src-tauri/tauri.conf.json` version bump
5. Merge the release PR when the changelog and version look right.
6. release-please creates the Git tag and GitHub release.
7. The `Build` workflow runs on the published release, builds the macOS DMG, stores it as a workflow artifact, and uploads it to the GitHub release.

## Versioning

The project starts at `0.1.0`.

Before `1.0.0`, minor versions can still include larger product changes while patch versions should stay focused on fixes. Once Prism reaches a stable public contract, follow SemVer more strictly:

- major: incompatible changes
- minor: backward-compatible features
- patch: backward-compatible fixes

## Human Review Points

Before merging a release PR, check:

- Changelog entries are understandable to users.
- Version bump matches the impact of the changes.
- The app builds locally or CI is green.
- Any new privacy, signing, platform, or server-API behavior is documented.
