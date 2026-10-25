import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import { canPlayOriginal } from "./localPlayback.ts";
import { navidromeClient } from "./data/navidrome.ts";

test("direct streaming requires this engine to advertise support for the original format", () => {
  assert.equal(canPlayOriginal({ contentType: "audio/flac" }, type => type === "audio/flac" ? "probably" : ""), true);
  assert.equal(canPlayOriginal({ suffix: "FLAC" }, type => type === "audio/flac" ? "maybe" : ""), true);
  assert.equal(canPlayOriginal({ suffix: "opus" }, type => type === 'audio/ogg; codecs="opus"' ? "probably" : ""), true);
  assert.equal(canPlayOriginal({ contentType: "audio/x-unsupported" }, () => ""), false);
  assert.equal(canPlayOriginal({}, () => "probably"), false);
});

test("raw requests disable implicit transcoding; default requests preserve server compatibility", () => {
  const config = { serverUrl: "https://fixture.invalid", username: "fixture", password: "fixture-only" };
  const raw = new URL(navidromeClient.buildStreamUrl(config, "song", true));
  assert.equal(raw.searchParams.get("format"), "raw");
  assert.equal(raw.searchParams.get("id"), "song");
  assert.equal(new URL(navidromeClient.buildStreamUrl(config, "song")).searchParams.has("format"), false);
});
