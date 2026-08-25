export type WhatsNewRelease = {
  version: string;
  title: string;
  highlights: string[];
};

// Add polished, user-facing release highlights here as each version is prepared.
// Keeping this curated means the in-app experience stays concise even when the
// full GitHub changelog includes maintenance and developer-facing changes.
export const WHATS_NEW_RELEASES: WhatsNewRelease[] = [];

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

  return WHATS_NEW_RELEASES
    .filter((release) => compareVersions(release.version, lastSeenVersion) > 0 && compareVersions(release.version, currentVersion) <= 0)
    .sort((left, right) => compareVersions(right.version, left.version));
}
