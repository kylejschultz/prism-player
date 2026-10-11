import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile("src/styles.css", "utf8");

test("track artist links shrink to their visible text instead of filling the grid area", () => {
  const rule = styles.match(/\.track-artist\.artist-name-link\s*\{([^}]*)\}/)?.[1];

  assert.ok(rule, "expected a dedicated track artist link rule");
  assert.match(rule, /justify-self:\s*start\s*;/);
  assert.match(rule, /max-width:\s*100%\s*;/);
  assert.match(rule, /width:\s*fit-content\s*;/);
});
