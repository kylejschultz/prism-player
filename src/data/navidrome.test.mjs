import assert from "node:assert/strict";
import test from "node:test";
import { navidromeClient } from "./navidrome.ts";

const config = { serverUrl: "https://fixture.invalid", username: "fixture", password: "fixture-only" };

function clock(t) {
  let expire;
  let cleared = false;
  globalThis.window = {
    setTimeout(callback, delay) { assert.equal(delay, 10_000); expire = callback; return 1; },
    clearTimeout(id) { assert.equal(id, 1); cleared = true; },
  };
  t.after(() => { delete globalThis.window; });
  return { expire: () => expire(), cleared: () => cleared };
}

function untilAborted(signal) {
  return new Promise((_, reject) => {
    const abort = () => reject(new globalThis.DOMException("Aborted", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

test("profile name trims success and releases its timeout/caller listener", async (t) => {
  const timer = clock(t);
  const caller = new globalThis.AbortController();
  let requestSignal;
  t.mock.method(globalThis, "fetch", async (_, options) => {
    requestSignal = options.signal;
    return { ok: true, json: async () => ({ name: " Fixture Listener " }) };
  });
  assert.equal(await navidromeClient.profileName(config, caller.signal), "Fixture Listener");
  assert.ok(timer.cleared());
  caller.abort();
  assert.equal(requestSignal.aborted, false);
});

test("profile timeout also bounds a stalled response body", async (t) => {
  const timer = clock(t);
  t.mock.method(globalThis, "fetch", async (_, { signal }) => ({ ok: true, json: () => untilAborted(signal) }));
  const pending = navidromeClient.profileName(config);
  await Promise.resolve();
  timer.expire();
  await assert.rejects(pending, { name: "AbortError" });
  assert.ok(timer.cleared());
});

test("profile lookup cancels on caller abort, including an already-aborted caller", async (t) => {
  const timer = clock(t);
  t.mock.method(globalThis, "fetch", (_, { signal }) => untilAborted(signal));
  const caller = new globalThis.AbortController();
  const pending = navidromeClient.profileName(config, caller.signal);
  caller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(navidromeClient.profileName(config, caller.signal), { name: "AbortError" });
  assert.ok(timer.cleared());
});

test("profile errors clean up and a response without a name is harmless", async (t) => {
  const timer = clock(t);
  const mock = t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 503 }));
  await assert.rejects(navidromeClient.profileName(config), /503/);
  assert.ok(timer.cleared());
  mock.mock.mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
  assert.equal(await navidromeClient.profileName(config), "");
});
