# Release Plan

Prism Player uses pull requests, Conventional Commits, and release-please to keep releases predictable without hand-editing version numbers.

## Branches

- `dev` is the integration branch for active work.
- `release` is the protected release branch.
- Feature, fix, documentation, and maintenance work should happen on short-lived branches from `dev`.
- Normal pull requests target `dev` and must pass CI and security checks before merge.
- Pull requests into `release` should only come from `dev` for a release candidate, or from release-please automation.

## Required Checks

The `CI` workflow should be required by branch protection on `dev` and `release`. It installs dependencies with `npm ci`, runs ESLint, runs TypeScript type checking, builds the frontend, and checks the Tauri Rust crate with `cargo check` and `cargo clippy`.

The `Security` workflow should also be required for pull requests. It runs GitHub dependency review, npm production dependency audit, Rust dependency audit, CodeQL, and Gitleaks secret scanning.

The `Enforce release PR source` workflow should be required on `release`. It blocks direct feature PRs into `release`, while allowing `dev -> release` release-candidate PRs and release-please PRs.

The packaging workflow is intentionally separate from pull request CI because Tauri bundling is slower and produces release artifacts. Run it manually from Actions when a development build is needed; published releases automatically build and attach the macOS DMG, Windows NSIS installer, Linux AppImage/DEB packages and checksum manifest.

After the release packages and checksums are attached, the same workflow posts the generated changelog to the configured `#releases` Discord webhook. It never pings a role; product announcements are posted separately in the announcement channel. Set the `DISCORD_RELEASE_WEBHOOK_URL` and `RELEASE_PLEASE_TOKEN` repository secrets before publishing. Set `DISABLE_DISCORD_RELEASE_ANNOUNCEMENT=true` to suppress changelog posts temporarily.

## GitHub test builds

Push the candidate branch and open its PR into `dev`, then run `Build` manually from Actions using the workflow on that branch. Set `source_ref` to the exact pushed commit and `platform` to `all`. Leave `ref` empty and `announce_only` false. This produces downloadable workflow artifacts without attaching public release assets or sending a release announcement. Test artifacts are retained for 14 days.

Check CI/security on the PR head and confirm all three packaging jobs and checksums complete successfully. Build success does not establish Windows/Linux playback or installation acceptance; smoke-test the installers before promoting the release.

For 1.1.0, the obsolete one-off `release-as: 1.0.0` override has been removed. Feature commits since 1.0.0 should select the next minor version, 1.1.0. Review the generated release PR to confirm that version before merging. Keep package/app versions and the release manifest under release-please control; test builds keep the existing version until that release PR updates it. Curated 1.1 highlights are staged in `src/whatsNew.ts`.

## Commit Convention

Use Conventional Commits for commit messages and pull request titles:

- `feat:` triggers a minor release.
- `fix:` triggers a patch release.
- `perf:` triggers a patch release.
- `docs:`, `chore:`, `ci:`, `style:`, `refactor:`, `test:`, and `build:` are tracked but do not necessarily produce a user-facing release unless included with releasable changes.
- `feat!:` or a `BREAKING CHANGE:` footer triggers a major release.

## Release Flow

1. Work merges to `dev` through feature, fix, docs, chore, build, test, and CI pull requests.
2. Several branches can be tested together on `dev` before anything reaches users.
3. When `dev` is ready to ship, open a `dev -> release` release-candidate PR.
4. Merge the release-candidate PR after checks pass and the combined changes look right.
5. The `Release Please` workflow evaluates Conventional Commits on `release`.
6. release-please opens or updates a release PR.
7. The release PR contains:
   - `CHANGELOG.md` updates
   - `package.json` version bump
   - `package-lock.json` version bump
   - `src-tauri/tauri.conf.json` version bump
   - A curated entry for the new version in `src/whatsNew.ts`, with the user-facing highlights shown after update
8. Merge the release PR when the changelog and version look right.
9. release-please creates the Git tag and GitHub release.
10. The `Build` workflow runs on the published release, builds the macOS DMG, Windows NSIS installer and Linux AppImage/DEB packages, stores them as workflow artifacts, and uploads them to the GitHub release. The DMG is named `Prism-player-vX.Y.Z.dmg`.

## Versioning

Prism Player follows SemVer from `1.0.0` onward:

- major: incompatible changes
- minor: backward-compatible features
- patch: backward-compatible fixes

## Human Review Points

Before merging a release PR, check:

- Changelog entries are understandable to users.
- Version bump matches the impact of the changes.
- `src/whatsNew.ts` has concise, reviewed copy for the new app version.
- The app builds locally or CI is green.
- Any new privacy, signing, platform, or server-API behavior is documented.

Before merging a `dev -> release` release-candidate PR, check:

- All intended feature branches for the release are already merged into `dev`.
- CI and security checks are green.
- The combined app behavior has been smoke-tested.
- PR titles since the previous release follow Conventional Commits closely enough for release-please to produce useful notes.
