import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRadioLyrics } from './radioLyrics.ts';

const station = 'https://station.fixture.invalid';
const payload = { songId: 'heard', synced: true, offsetMs: -1500, lines: [{ text: ' First line ', startMs: 0 }, { text: 'Second line', startMs: 2000 }] };
const signal = () => new globalThis.AbortController().signal;

test('requests the heard track and retains played timestamps and station offset', async t => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url.pathname, '/api/lyrics/current');
    assert.equal(url.searchParams.get('songId'), 'heard');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers, undefined);
    return globalThis.Response.json(payload);
  });
  assert.deepEqual(await fetchRadioLyrics(station, 'heard', signal()), {
    state: 'ready', offsetMs: -1500, lines: [{ text: 'First line', startMs: 0 }, { text: 'Second line', startMs: 2000 }],
  });
});

test('plain lyrics never acquire a timed highlight, and empty lyrics remain empty', async t => {
  t.mock.method(globalThis, 'fetch', async () => globalThis.Response.json({ ...payload, synced: false }));
  const plain = await fetchRadioLyrics(station, 'heard', signal());
  assert.equal(plain.state, 'ready');
  assert.ok(plain.lines.every(line => line.startMs === null));
  t.mock.method(globalThis, 'fetch', async () => globalThis.Response.json({ ...payload, lines: [] }));
  assert.deepEqual(await fetchRadioLyrics(station, 'heard', signal()), { state: 'ready', offsetMs: -1500, lines: [] });
});

test('older, disabled, private and stale endpoints are quiet non-retry results', async t => {
  for (const [status, state] of [[404, 'unsupported'], [501, 'unsupported'], [403, 'disabled'], [401, 'locked'], [409, 'stale']]) {
    t.mock.method(globalThis, 'fetch', async () => new globalThis.Response('', { status }));
    assert.deepEqual(await fetchRadioLyrics(station, 'heard', signal()), { state });
  }
});

test('503 retry delay respects numeric/date Retry-After and a safe missing-header default', async t => {
  for (const [header, minimum] of [['30', 30000], [new Date(Date.now() + 60000).toUTCString(), 58000], [null, 10000]]) {
    t.mock.method(globalThis, 'fetch', async () => new globalThis.Response('', { status: 503, headers: header ? { 'Retry-After': header } : {} }));
    const result = await fetchRadioLyrics(station, 'heard', signal());
    assert.equal(result.state, 'unavailable');
    assert.ok(result.retryAfterMs >= minimum);
  }
});

test('mismatched track responses and malformed payloads are never rendered', async t => {
  t.mock.method(globalThis, 'fetch', async () => globalThis.Response.json({ ...payload, songId: 'previous' }));
  assert.deepEqual(await fetchRadioLyrics(station, 'heard', signal()), { state: 'stale' });
  for (const bad of [{ ...payload, offsetMs: 40000 }, { ...payload, lines: [{ text: 'bad', startMs: '2' }] }, { ...payload, lines: {} }]) {
    t.mock.method(globalThis, 'fetch', async () => globalThis.Response.json(bad));
    assert.deepEqual(await fetchRadioLyrics(station, 'heard', signal()), { state: 'unavailable' });
  }
});

test('caller cancellation aborts in-flight fetches and network failures stay optional', async t => {
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  const controller = new globalThis.AbortController();
  const pending = fetchRadioLyrics(station, 'heard', controller.signal);
  controller.abort();
  assert.deepEqual(await pending, { state: 'unavailable' });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network'); });
  assert.deepEqual(await fetchRadioLyrics(station, 'heard', signal()), { state: 'unavailable' });
});
