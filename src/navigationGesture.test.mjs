import assert from "node:assert/strict";
import test from "node:test";
import {
  armedHistorySwipeDirection,
  completeHistorySwipe,
  createHistorySwipeState,
  HISTORY_SWIPE_IDLE_MS,
  recordHistorySwipe,
  shouldIgnoreHistorySwipeTarget,
} from "./navigationGesture.ts";

const available = { back: true, forward: true };

function record(samples, initial = createHistorySwipeState()) {
  return samples.reduce((state, [deltaX, deltaY, eventAt]) => recordHistorySwipe(state, deltaX, deltaY, eventAt), initial);
}

test("dominant completed swipes map macOS directions to history", () => {
  const rightSwipe = record([[-70, 4, 0], [-65, 3, 20]]);
  const leftSwipe = record([[64, 2, 0], [68, 4, 20]]);

  assert.equal(completeHistorySwipe(rightSwipe, 200, available).direction, "back");
  assert.equal(completeHistorySwipe(leftSwipe, 200, available).direction, "forward");
});

test("short, vertical, and diagonal gestures do not navigate", () => {
  const shortSwipe = record([[-55, 2, 0], [-40, 1, 20]]);
  const verticalScroll = record([[8, 70, 0], [10, 80, 20]]);
  const diagonalScroll = record([[-70, 58, 0], [-70, 56, 20]]);

  assert.equal(completeHistorySwipe(shortSwipe, 200, available).direction, null);
  assert.equal(completeHistorySwipe(verticalScroll, 200, available).direction, null);
  assert.equal(completeHistorySwipe(diagonalScroll, 200, available).direction, null);
});

test("unavailable history directions never navigate", () => {
  const rightSwipe = record([[-130, 0, 0]]);
  const leftSwipe = record([[130, 0, 0]]);

  assert.equal(completeHistorySwipe(rightSwipe, 200, { back: false, forward: true }).direction, null);
  assert.equal(completeHistorySwipe(leftSwipe, 200, { back: true, forward: false }).direction, null);
});

test("feedback arms only after a dominant threshold crossing in an available direction", () => {
  const belowThreshold = record([[-119, 0, 0]]);
  const backSwipe = record([[-70, 4, 0], [-65, 3, 20]]);
  const verticalSwipe = record([[-130, 100, 0]]);

  assert.equal(armedHistorySwipeDirection(belowThreshold, available), null);
  assert.equal(armedHistorySwipeDirection(backSwipe, available), "back");
  assert.equal(armedHistorySwipeDirection(backSwipe, { back: false, forward: true }), null);
  assert.equal(armedHistorySwipeDirection(verticalSwipe, available), null);
});

test("completed gestures use the 100 ms idle window", () => {
  assert.equal(HISTORY_SWIPE_IDLE_MS, 100);
});

test("completion applies one cooldown across momentum tails", () => {
  const gesture = record([[-130, 0, 0]]);
  const completed = completeHistorySwipe(gesture, 200, available);
  const momentumTail = recordHistorySwipe(completed.state, -180, 0, 400);
  const nextGesture = recordHistorySwipe(momentumTail, -130, 0, 850);

  assert.equal(completed.direction, "back");
  assert.equal(momentumTail.active, false);
  assert.equal(completeHistorySwipe(momentumTail, 500, available).direction, null);
  assert.equal(completeHistorySwipe(nextGesture, 1_000, available).direction, "back");
});

test("controls and horizontal scrollers are excluded", () => {
  assert.equal(shouldIgnoreHistorySwipeTarget({ isControl: true, hasHorizontalScroll: false }), true);
  assert.equal(shouldIgnoreHistorySwipeTarget({ isControl: false, hasHorizontalScroll: true }), true);
  assert.equal(shouldIgnoreHistorySwipeTarget({ isControl: false, hasHorizontalScroll: false }), false);
});
