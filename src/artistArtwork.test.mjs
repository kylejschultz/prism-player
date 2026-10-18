import assert from "node:assert/strict";
import test from "node:test";
import { artistPlaceholder } from "./artistArtwork.ts";

test("artist initials handle bands, single names, numbers and Unicode", () => {
  for (const [name, initials] of [["Angels & Airwaves", "AA"], ["Anberlin", "AN"], ["+44", "44"], ["30 Seconds to Mars", "3M"], ["Björk", "BJ"], ["宇多田 ヒカル", "宇ヒ"], ["", "?"], ["🎵", "?"]]) {
    assert.equal(artistPlaceholder(name).initials, initials);
  }
});

test("placeholder colors are stable across casing and Unicode normalization", () => {
  assert.equal(artistPlaceholder(" Björk ").hue, artistPlaceholder("BJO\u0308RK").hue);
  assert.notEqual(artistPlaceholder("+44").hue, artistPlaceholder("Angels & Airwaves").hue);
  assert.ok(artistPlaceholder("Artist").hue >= 0 && artistPlaceholder("Artist").hue < 360);
});
