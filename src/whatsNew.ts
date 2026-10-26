export type WhatsNewRelease = {
  version: string;
  displayVersion?: string;
  previewForVersion?: string;
  title: string;
  highlights: string[];
};

// Add polished, user-facing release highlights here as each version is prepared.
// Keeping this curated means the in-app experience stays concise even when the
// full GitHub changelog includes maintenance and developer-facing changes.
const prismOneHighlights = [
  "Library & Radio: Faster large-library browsing, incremental song loading, a persistent local catalog, automatic refresh after Navidrome scans, and steadier radio playback and metadata.",
  "Customization: Curated color themes, album-art background wash, centered artwork controls, and a mute toggle.",
  "Gapless & Crossfade: Preload the next queued track for smoother album sequencing, or enable a 1–12 second crossfade in Settings.",
  "Navigation & Discovery: Native trackpad back/forward gestures, better click-through navigation across your library, and more meaningful recent listening on Home.",
  "Desktop Polish: Secure credential storage, restored window and playback state, richer Discord activity, plus signed Windows and notarized macOS builds.",
];

export const WHATS_NEW_RELEASES: WhatsNewRelease[] = [
  {
    version: "1.1.0",
    title: "What’s New in Prism 1.1",
    highlights: [
      "A fresh Prism: The Facet icon, teal and periwinkle theme, Instrument Sans typography, and integrated macOS title bar bring a cleaner look with more room for your music.",
      "Your library, closer: Expand Library in the sidebar, keep section controls in view, browse Recently added, and open recently played albums from Home.",
      "Artists and artwork: Collaboration credits appear under the primary artist, discographies load in list view, and missing portraits use readable initials.",
      "Queue and lyrics together: A single sidebar keeps queue or radio timeline above lyrics, with an adjustable divider that remembers your preferred split.",
      "Lyrics in time: Supported library and radio lyrics follow playback, center the current line, and soften distant lines. Plain lyrics and stations without lyric support still work.",
      "Playback refinements: Queue removals stay removed, optional profile requests no longer hold up the library, and track handoffs show the incoming song while it loads. An optional macOS FLAC mode prepares tracks before playback for more accurate seeking, using extra startup time and memory.",
    ],
  },
  // The manual dev build still identifies as 0.5.0. Keeping this preview entry
  // lets the final cross-platform smoke test exercise the exact 1.0 copy.
  { version: "0.5.0", displayVersion: "1.0", previewForVersion: "1.0.0", title: "What’s New in Prism 1.0", highlights: prismOneHighlights },
  { version: "1.0.0", title: "What’s New in Prism 1.0", highlights: prismOneHighlights },
];

function versionParts(version: string) {
  return version.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(left: string, right: string) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

export function getCurrentReleaseNotes(currentVersion: string) {
  return WHATS_NEW_RELEASES.find((release) => compareVersions(release.version, currentVersion) === 0) ?? null;
}

export function getUnreadReleaseNotes(currentVersion: string, lastSeenVersion: string) {
  if (!lastSeenVersion) return getCurrentReleaseNotes(currentVersion) ? [getCurrentReleaseNotes(currentVersion)!] : [];

  const unreadReleases = WHATS_NEW_RELEASES
    .filter((release) => compareVersions(release.version, lastSeenVersion) > 0 && compareVersions(release.version, currentVersion) <= 0)
    .filter((release) => !release.previewForVersion || !WHATS_NEW_RELEASES.some((candidate) => candidate.version === release.previewForVersion && compareVersions(candidate.version, currentVersion) <= 0));

  return unreadReleases.sort((left, right) => compareVersions(right.version, left.version));
}
