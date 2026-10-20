export function artistPlaceholder(name: string) {
  const words = name.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const firstWord = words[0] ?? "";
  const singleWordInitials = /^\p{N}+$/u.test(firstWord)
    ? firstWord
    : Array.from(firstWord).slice(0, 2).join("").toLocaleUpperCase("en-US");
  const initials = (words.length > 1
    ? words.map((word, index) => index === 0 && /^\p{N}+$/u.test(word) ? word : Array.from(word)[0]).join("")
    : singleWordInitials) || "?";
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

export function isKnownArtistPlaceholderUrl(value: string): boolean {
  try {
    const filename = new URL(value).pathname.split("/").pop() ?? "";
    return /^2a96cbd8b46e442fc41c2b86b821562f(?:\.[a-z0-9]+)?$/i.test(filename);
  } catch { return false; }
}

/** Navidrome's 300x300 gray star is served successfully, not as a missing image.
 * Its unchanged 546-byte WebP is present in Navidrome v0.55.0, v0.58.0 and later:
 * https://github.com/navidrome/navidrome/blob/v0.58.0/resources/artist-placeholder.webp
 * Compare exact bytes so real photos (including gray photos) are never rejected.
 */
export async function isNavidromeArtistPlaceholder(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "force-cache" });
    if (!response.ok || !response.body) return false;
    const reader = response.body.getReader();
    const bytes = new Uint8Array(546);
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > bytes.length) {
        await reader.cancel();
        return false;
      }
      bytes.set(value, length);
      length += value.length;
    }
    if (length !== bytes.length) return false;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return hash === "521259c652af6d43cb124876106258d93b6b6f7fbe7ad2c73e8345875afe4dcf";
  } catch { return false; } // CORS/network failures must not hide an unknown real photo.
  finally { clearTimeout(timeout); }
}
