import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { FlacPreparationQueue, isFlac, readFlacInfo, readFlacResponse, pcmWave, MAX_FLAC_DOWNLOAD_BYTES, MAX_PCM_BYTES } from "./flacCompatibility.ts";
function header({ rate = 44100, channels = 2, bits = 24, samples = 4979772 } = {}) {
  const bytes = new Uint8Array(42); bytes.set([102, 76, 97, 67, 128, 0, 0, 34]);
  new DataView(bytes.buffer).setBigUint64(18, BigInt(rate) << 44n | BigInt(channels - 1) << 41n | BigInt(bits - 1) << 36n | BigInt(samples)); return bytes;
}
async function settled(check) { for (let i = 0; i < 30; i++) { if (check()) return; await setImmediate(); } assert.fail("Preparation did not settle"); }

test("FLAC metadata preserves source rate/count and rejects unsupported or excessive decoded formats", () => {
  assert.equal(isFlac({ suffix: "FLAC" }), true); assert.equal(isFlac({ contentType: "audio/x-flac" }), true); assert.equal(isFlac({ contentType: "audio/mpeg" }), false);
  assert.deepEqual(readFlacInfo(header()), { sampleRate: 44100, channels: 2, samples: 4979772 });
  for (const info of [{ channels: 6 }, { bits: 32 }, { samples: 0 }, { rate: 1000 }, { samples: MAX_PCM_BYTES }]) assert.throws(() => readFlacInfo(header(info)));
  assert.throws(() => readFlacInfo(new Uint8Array(42)));
});

test("bounded reader validates split headers, rejects excessive input and observes cancellation", async () => {
  const original = header(); const signal = new globalThis.AbortController().signal;
  const response = new globalThis.Response(new globalThis.ReadableStream({ start(controller) { controller.enqueue(original.subarray(0, 7)); controller.enqueue(original.subarray(7)); controller.close(); } }));
  assert.deepEqual(new Uint8Array(await readFlacResponse(response, signal)), original);
  await assert.rejects(readFlacResponse(new globalThis.Response(original, { headers: { 'Content-Length': String(MAX_FLAC_DOWNLOAD_BYTES + 1) } }), signal));
  const controller = new globalThis.AbortController(); controller.abort();
  await assert.rejects(readFlacResponse(new globalThis.Response(original), controller.signal));
  await assert.rejects(readFlacResponse(new globalThis.Response(new Uint8Array(MAX_FLAC_DOWNLOAD_BYTES + 1)), signal));
});

test("PCM WAV retains exact sample values, channel order and sample rate", async () => {
  const channels = [new Float32Array([-1, -1 / 8388608, 0.5]), new Float32Array([1 / 8388608, 0, 1 - 1 / 8388608])];
  const wav = pcmWave({ length: 3, numberOfChannels: 2, sampleRate: 44100, getChannelData: channel => channels[channel] }, { samples: 3, channels: 2, sampleRate: 44100 });
  const view = new DataView(await wav.arrayBuffer());
  assert.equal(view.getUint16(20, true), 3); assert.equal(view.getUint32(24, true), 44100);
  for (let i = 0; i < 3; i++) for (let channel = 0; channel < 2; channel++) assert.equal(view.getFloat32(44 + (i * 2 + channel) * 4, true), channels[channel][i]);
  assert.throws(() => pcmWave({ length: 3, numberOfChannels: 2, sampleRate: 48000 }, { samples: 3, channels: 2, sampleRate: 44100 }));
});

test("queue prepares serially, preserves the preloaded next track and releases removed blobs", async () => {
  const started = [], revoked = []; const finish = new Map();
  const queue = new FlacPreparationQueue((source, signal) => new Promise(resolve => { started.push(source); finish.set(source, () => resolve('blob:' + source)); assert.equal(signal.aborted, false); }), url => revoked.push(url));
  queue.select('a', 'b', null, () => {}); assert.deepEqual(started, ['a']);
  finish.get('a')(); await settled(() => started.includes('b')); finish.get('b')(); await settled(() => queue.resolve('b').url === 'blob:b');
  queue.select('b', 'c', 'blob:a', () => {}); assert.equal(started.includes('c'), false); assert.equal(queue.resolve('b').url, 'blob:b');
  queue.select('b', 'c', null, () => {}); await settled(() => started.includes('c')); assert.deepEqual(revoked, ['blob:a']);
  finish.get('c')(); await settled(() => queue.resolve('c').url === 'blob:c'); queue.clear();
  assert.deepEqual(revoked.sort(), ['blob:a', 'blob:b', 'blob:c']);
});

test("rapid selection aborts stale preparation and discards any late result", async () => {
  const pending = new Map(), signals = new Map(), revoked = [];
  const queue = new FlacPreparationQueue((source, signal) => { signals.set(source, signal); return new Promise(resolve => pending.set(source, resolve)); }, url => revoked.push(url));
  queue.select('old', null, null, () => {}); queue.select('new', null, null, () => {});
  assert.equal(signals.get('old').aborted, true); await settled(() => pending.has('new'));
  pending.get('old')('blob:old'); pending.get('new')('blob:new');
  await settled(() => queue.resolve('new').url === 'blob:new'); assert.deepEqual(revoked, ['blob:old']);
  queue.clear(); assert.equal(signals.get('new').aborted, true);
});

test("download/decode failure and prepared-media error fall back to the original without repeated preparation", async () => {
  let calls = 0; const revoked = [];
  const queue = new FlacPreparationQueue(async source => { calls++; if (source === 'bad') throw new Error('fixture'); return 'blob:' + source; }, url => revoked.push(url));
  queue.select('bad', 'good', null, () => {}); await settled(() => queue.resolve('good').url === 'blob:good');
  assert.equal(queue.resolve('bad').url, 'bad'); assert.equal(queue.resolve('bad').fallback, true);
  queue.select('bad', 'good', null, () => {}); assert.equal(calls, 2);
  assert.equal(queue.reject('good', 'blob:stale'), false); assert.equal(queue.reject('good', 'blob:good'), true);
  assert.equal(queue.reject('good', 'blob:good'), true); assert.equal(queue.resolve('good').url, 'good'); assert.deepEqual(revoked, ['blob:good']); queue.clear();
});


test("a preparation timeout returns to original streaming instead of waiting forever", async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const queue = new FlacPreparationQueue((_source, nextSignal) => { signal = nextSignal; return new Promise(() => {}); });
  queue.select('slow', null, null, () => {}); context.mock.timers.tick(60001);
  await settled(() => queue.resolve('slow').fallback);
  assert.equal(signal.aborted, true); assert.equal(queue.resolve('slow').url, 'slow'); queue.clear();
});
