import assert from "node:assert/strict";
import test from "node:test";
import { isKnownArtistPlaceholderUrl, isNavidromeArtistPlaceholder, artistPlaceholder, normalizeArtistImageCache, artistImageNeedsRefresh, canRecheckFailedArtistImage, ARTIST_IMAGE_REFRESH_MS } from "./artistArtwork.ts";

test("artist initials handle bands, single names, numbers and Unicode", () => {
  for (const [name, initials] of [["Angels & Airwaves", "AA"], ["Anberlin", "AN"], ["+44", "44"], ["30 Seconds to Mars", "30StM"], ["Brigham Young University Vocal Point", "BYUVP"], ["123 Artist Name", "123AN"], ["Björk", "BJ"], ["宇多田 ヒカル", "宇ヒ"], ["", "?"], ["🎵", "?"]]) {
    assert.equal(artistPlaceholder(name).initials, initials);
  }
});

test("placeholder colors are stable across casing and Unicode normalization", () => {
  assert.equal(artistPlaceholder(" Björk ").hue, artistPlaceholder("BJO\u0308RK").hue);
  assert.notEqual(artistPlaceholder("+44").hue, artistPlaceholder("Angels & Airwaves").hue);
  assert.ok(artistPlaceholder("Artist").hue >= 0 && artistPlaceholder("Artist").hue < 360);
});


test("old catalog URLs stay available but are stale until metadata is checked", () => {
  const result = normalizeArtistImageCache({ a: "https://fixture.invalid/old.jpg", b: { url: null, checkedAt: 100 } });
  assert.deepEqual(result.a, { url: "https://fixture.invalid/old.jpg", checkedAt: 0 });
  assert.equal(artistImageNeedsRefresh(result.a, 100), true);
  assert.equal(artistImageNeedsRefresh(result.b, 100), false);
});

test("portrait and absent-image metadata expire after five minutes, including clock rollback", () => {
  for (const url of ["https://fixture.invalid/art.jpg", null]) {
    const entry = { url, checkedAt: 1000 };
    assert.equal(artistImageNeedsRefresh(entry, 1000 + ARTIST_IMAGE_REFRESH_MS - 1), false);
    assert.equal(artistImageNeedsRefresh(entry, 1000 + ARTIST_IMAGE_REFRESH_MS), true);
    assert.equal(artistImageNeedsRefresh(entry, 999), true);
  }
  assert.equal(artistImageNeedsRefresh(undefined, 1000), true);
});

test("failed portrait rechecks have a five minute cooldown, even across persisted cache migration", () => {
  assert.equal(canRecheckFailedArtistImage(undefined, 1000), true);
  const cache = normalizeArtistImageCache({ a: { url: null, checkedAt: 1000, errorCheckedAt: 1000 } });
  assert.equal(canRecheckFailedArtistImage(cache.a.errorCheckedAt, 1001), false);
  assert.equal(canRecheckFailedArtistImage(cache.a.errorCheckedAt, 1000 + ARTIST_IMAGE_REFRESH_MS), true);
});


test("recognizes the known Last.fm placeholder filename without hiding real URLs", () => {
  assert.equal(isKnownArtistPlaceholderUrl("https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png"), true);
  assert.equal(isKnownArtistPlaceholderUrl("https://images.fixture.invalid/portrait.png"), false);
  assert.equal(isKnownArtistPlaceholderUrl("not a URL"), false);
});

test("placeholder probe cancels images larger than the exact known asset", async (t) => {
  let cancelled = false;
  const body = new globalThis.ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1024)); },
    cancel() { cancelled = true; },
  });
  t.mock.method(globalThis, "fetch", async () => new globalThis.Response(body));
  assert.equal(await isNavidromeArtistPlaceholder("https://fixture.invalid/real-photo"), false);
  assert.equal(cancelled, true);
});

test("unknown image bytes and CORS/network failures preserve the existing image", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new globalThis.Response(new Uint8Array(546)));
  assert.equal(await isNavidromeArtistPlaceholder("https://fixture.invalid/not-the-star"), false);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("CORS blocked"); });
  assert.equal(await isNavidromeArtistPlaceholder("https://fixture.invalid/restricted-photo"), false);
});
