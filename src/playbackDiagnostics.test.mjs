import assert from "node:assert/strict";
import test from "node:test";
import { PlaybackDiagnostics } from "./playbackDiagnostics.ts";
const ranges = { length: 1, start: () => 0, end: () => 112.92 };
const media = { currentTime: 109.92, duration: 112.92, paused: false, ended: false, seeking: false, readyState: 4, networkState: 1, playbackRate: 1, error: null, buffered: ranges, seekable: ranges };
const context = { slot: 0, active: true, localPlayback: true, queuePosition: 1, catalogDuration: 112, sourceFormat: "audio/flac", requestedStreamMode: "raw", serverFallback: false, playIntent: true, transitioning: false, displayedPosition: 109, displayedDuration: 112.92, repeatMode: "off", crossfadeSeconds: 0 };
const report = recorder => JSON.parse(recorder.exportJSON());

test("diagnostics start disabled, preserve a stopped recording, and clear on restart", () => {
  let time = 100;
  const recorder = new PlaybackDiagnostics(() => time);
  recorder.record("sample", media, context);
  assert.equal(report(recorder).state, "idle"); assert.deepEqual(report(recorder).events, []);
  recorder.start(); time += 250; recorder.record("seek-request", media, context, 112.92);
  assert.equal(report(recorder).events[0].elapsedMs, 250);
  assert.equal(report(recorder).events[0].requestedTime, 112.92);
  recorder.stop(); recorder.record("sample", media, context);
  assert.equal(report(recorder).state, "stopped"); assert.equal(report(recorder).events.length, 1);
  recorder.start(); assert.deepEqual(report(recorder).events, []);
  recorder.clear(); assert.equal(report(recorder).state, "idle");
});

test("exports allowlisted measurements and exclude URLs, identifiers, messages and arbitrary input fields", () => {
  const recorder = new PlaybackDiagnostics(() => 0); recorder.start();
  recorder.record("error", { ...media, src: "https://private.invalid/stream?id=secret&t=token", error: { code: 3, message: "private stream URL" }, title: "Private title" }, { ...context, username: "private user", id: "private-id", title: "Private title" });
  const output = recorder.exportJSON();
  for (const secret of ["private", "token", "username", "title", "src", "message"]) assert.equal(output.includes(secret), false);
  const event = report(recorder).events[0];
  assert.equal(event.errorCode, 3); assert.equal(event.requestedStreamMode, "raw");
  assert.deepEqual(event.seekable, [[0, 112.92]]);
  recorder.record("sample", media, { ...context, sourceFormat: "https://private.invalid", requestedStreamMode: "private", repeatMode: "private" });
  assert.equal(report(recorder).events[1].sourceFormat, "unknown");
  recorder.record("https://private.invalid", media, context); assert.equal(report(recorder).events.length, 2);
});

test("records duration drift, missing end-event state, standby/fallback and nonfinite clocks without rewriting media", () => {
  const recorder = new PlaybackDiagnostics(() => 0); recorder.start();
  recorder.record("sample", { ...media, currentTime: 112.953469, duration: 112.953469, ended: true }, context);
  recorder.record("server-fallback", { ...media, duration: Infinity, currentTime: NaN }, { ...context, slot: 1, active: false, requestedStreamMode: "server-selected", serverFallback: true });
  const [end, fallback] = report(recorder).events;
  assert.equal(end.ended, true); assert.equal(end.duration, 112.953); assert.equal(end.seekable[0][1], 112.92);
  assert.equal(fallback.duration, null); assert.equal(fallback.currentTime, null); assert.equal(fallback.active, false); assert.equal(fallback.serverFallback, true);
  assert.equal(media.currentTime, 109.92);
});

test("keeps a bounded recent buffer and tolerates ranges changing during capture", () => {
  const recorder = new PlaybackDiagnostics(() => 0); recorder.start();
  for (let i = 0; i < 2005; i++) recorder.record("sample", { ...media, currentTime: i }, context);
  assert.equal(report(recorder).events.length, 2000); assert.equal(report(recorder).droppedRecords, 5);
  assert.equal(report(recorder).events[0].currentTime, 5);
  recorder.record("sample", { ...media, seekable: { length: 1, start() { throw new Error("range changed"); } } }, context);
  assert.deepEqual(report(recorder).events.at(-1).seekable, []);
});
