import assert from "node:assert/strict";
import test from "node:test";
import { advancePlaybackQueue, nextRepeatMode, removeSourceQueueOccurrence, toggleShuffleTraversal } from "./playbackQueue.ts";

const album = ["a", "b", "c", "d"].map((id) => ({ id }));
const reverse = (items) => [...items].reverse();
const ids = (items) => items.map((item) => item.id);

function state(overrides = {}) {
  return {
    queue: album,
    sourceQueue: album,
    currentIndex: 0,
    shuffleEnabled: false,
    repeatMode: "off",
    ...overrides,
  };
}

test("album repeat-all starts the complete album again after the final track", () => {
  const result = advancePlaybackQueue(state({ currentIndex: 3, repeatMode: "all" }), true, reverse);

  assert.equal(result.effect, "advance");
  assert.equal(result.currentIndex, 0);
  assert.deepEqual(ids(result.queue), ["a", "b", "c", "d"]);
});

test("repeat-off stops at the final album track without discarding its queue", () => {
  const result = advancePlaybackQueue(state({ currentIndex: 3 }), true, reverse);

  assert.equal(result.effect, "stop");
  assert.equal(result.currentIndex, 3);
  assert.deepEqual(ids(result.queue), ["a", "b", "c", "d"]);
});

test("shuffle traverses every album track exactly once", () => {
  const enabled = toggleShuffleTraversal(state({ currentIndex: 1 }), reverse, (track) => track.id);

  assert.equal(enabled.shuffleEnabled, true);
  assert.equal(enabled.queue[enabled.currentIndex]?.id, "b");
  assert.deepEqual([...ids(enabled.queue)].sort(), ["a", "b", "c", "d"]);
  assert.equal(new Set(ids(enabled.queue)).size, album.length);
});

test("shuffle plus repeat-all creates another complete shuffled cycle", () => {
  const shuffledCycle = [album[1], album[3], album[0], album[2]];
  const result = advancePlaybackQueue(
    state({ queue: shuffledCycle, currentIndex: 3, shuffleEnabled: true, repeatMode: "all" }),
    true,
    reverse,
  );

  assert.equal(result.effect, "advance");
  assert.equal(result.currentIndex, 0);
  assert.deepEqual(ids(result.queue), ["d", "c", "b", "a"]);
  assert.deepEqual([...ids(result.queue)].sort(), ["a", "b", "c", "d"]);
});

test("repeat-one restarts only for ended events and preserves the current track", () => {
  const ended = advancePlaybackQueue(state({ currentIndex: 2, repeatMode: "one" }), true, reverse);
  const manualNext = advancePlaybackQueue(state({ currentIndex: 2, repeatMode: "one" }), false, reverse);

  assert.equal(ended.effect, "restart");
  assert.equal(ended.currentIndex, 2);
  assert.equal(manualNext.effect, "advance");
  assert.equal(manualNext.currentIndex, 3);
});

test("shuffle toggle round-trip restores canonical album order at the current track", () => {
  const enabled = toggleShuffleTraversal(state({ currentIndex: 1 }), reverse, (track) => track.id);
  const currentIndex = enabled.queue.findIndex((track) => track.id === "d");
  const disabled = toggleShuffleTraversal(
    state({ queue: enabled.queue, currentIndex, shuffleEnabled: true }),
    reverse,
    (track) => track.id,
  );

  assert.equal(disabled.shuffleEnabled, false);
  assert.deepEqual(ids(disabled.queue), ["a", "b", "c", "d"]);
  assert.equal(disabled.queue[disabled.currentIndex]?.id, "d");
});

test("repeat toggle transitions remain deterministic", () => {
  assert.equal(nextRepeatMode("off"), "all");
  assert.equal(nextRepeatMode("all"), "one");
  assert.equal(nextRepeatMode("one"), "off");
});


test("removed restored tracks stay removed through shuffle restoration and repeat-all", () => {
  const restored = JSON.parse(JSON.stringify(state({ currentIndex: 1, shuffleEnabled: true })));
  const sourceQueue = removeSourceQueueOccurrence(restored.sourceQueue, restored.queue[0], (song) => song.id);
  const queue = restored.queue.slice(1);
  assert.deepEqual(ids(sourceQueue), ["b", "c", "d"]);
  const unshuffled = toggleShuffleTraversal({ ...restored, queue, sourceQueue, currentIndex: 0 }, reverse, (song) => song.id);
  assert.deepEqual(ids(unshuffled.queue), ["b", "c", "d"]);
  const repeated = advancePlaybackQueue({ ...restored, queue, sourceQueue, currentIndex: 2, repeatMode: "all", shuffleEnabled: false }, true, reverse);
  assert.deepEqual(ids(repeated.queue), ["b", "c", "d"]);
});

test("source removal preserves duplicate occurrences, order, and unmatched queues", () => {
  const queue = [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }];
  const once = removeSourceQueueOccurrence(queue, { id: "a" }, (song) => song.id);
  assert.deepEqual(ids(once), ["b", "a", "c"]);
  assert.deepEqual(ids(queue), ["a", "b", "a", "c"]);
  assert.strictEqual(removeSourceQueueOccurrence(queue, { id: "missing" }, (song) => song.id), queue);
  assert.deepEqual(removeSourceQueueOccurrence([{ id: "a" }], { id: "a" }, (song) => song.id), []);
});
