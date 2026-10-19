export function artistPlaceholder(name: string) {
  const words = name.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const first = Array.from(words[0] ?? "");
  const last = Array.from(words[words.length - 1] ?? "");
  const initials = (words.length > 1 ? `${first[0]}${last[0]}` : first.slice(0, 2).join("")).toLocaleUpperCase("en-US") || "?";
  let hash = 0;
  for (const character of name.normalize("NFC").trim().toLocaleLowerCase("en-US")) {
    hash = (Math.imul(hash, 31) + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return { initials, hue: hash % 360 };
}

export const ARTIST_IMAGE_REFRESH_MS = 5 * 60_000;
export type ArtistImageEntry = { url: string | null; checkedAt: number; errorCheckedAt?: number };
export type ArtistImageCache = Record<string, ArtistImageEntry>;

/** Old catalogs retain their visible URL, but must recheck metadata once. */
export function normalizeArtistImageCache(cache: Record<string, string | ArtistImageEntry> = {}): ArtistImageCache {
  return Object.fromEntries(Object.entries(cache).map(([id, value]) => [id,
    typeof value === "string" ? { url: value, checkedAt: 0 } : value,
  ]));
}

export function artistImageNeedsRefresh(entry: ArtistImageEntry | undefined, now: number): boolean {
  return !entry || entry.checkedAt <= 0 || now < entry.checkedAt || now - entry.checkedAt >= ARTIST_IMAGE_REFRESH_MS;
}

export function canRecheckFailedArtistImage(lastCheck: number | undefined, now: number): boolean {
  return lastCheck == null || now < lastCheck || now - lastCheck >= ARTIST_IMAGE_REFRESH_MS;
}
