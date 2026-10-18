import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile("src/App.tsx", "utf8");
const styles = await readFile("src/styles.css", "utf8");
const playerArtwork = app.match(/<div className={`now-playing[\s\S]*?<div className="now-playing-copy">/)?.[0];

test("bottom-player artwork opens Radio for radio and the album for local playback", () => {
  assert.ok(playerArtwork, "expected the bottom-player artwork controls");
  assert.match(playerArtwork, /isRadioPresentation[\s\S]*?onClick=\{\(\) => selectView\("radio"\)\}[\s\S]*?aria-label="Open Radio"/);
  assert.match(playerArtwork, /footerTrack\.albumId \? void openAlbumById\(footerTrack\.albumId, footerTrack\.album \?\? footerTrack\.title\) : selectView\("nowPlaying"\)/);
  assert.match(styles, /\.player-now-playing-trigger > svg\s*\{/);
  assert.doesNotMatch(styles, /\.player-now-playing-trigger svg\s*\{/);
});
