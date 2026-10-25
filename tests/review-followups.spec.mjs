/* global window, localStorage, indexedDB, HTMLMediaElement, Event, URL, getComputedStyle, document */
import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';

const artist = { id: 'artist', name: 'Brigham Young University Vocal Point', albumCount: 2 };
const baseAlbums = ['a', 'b'].map((id, index) => ({ id, name: `Album ${id}`, artist: artist.name, artistId: artist.id, songCount: 4, year: 2026 - index }));
const baseSongs = baseAlbums.flatMap(album => Array.from({ length: 4 }, (_, index) => ({ id: `${album.id}-${index}`, title: `${album.name} track ${index + 1}`, albumId: album.id, album: album.name, artist: artist.name, artistId: artist.id, duration: 120, track: index + 1 })));
const cachedSong = { ...baseSongs[0], id: 'removed', title: 'Previously indexed song', albumId: 'removed-album' };

async function fixture(page, { holdAlbums, failAlbums = false, empty = false, lyricsEnabled, lyricsResponse, lyricsStatus = 200, holdLyrics, localLyrics, localLyricsStatus = 200, holdLocalLyrics, legacyLyrics = "First lyric\nSecond lyric", realMedia = false, mediaType, largeLibrary = false, artwork = false } = {}) {
  const albums = largeLibrary ? Array.from({ length: 45 }, (_, i) => ({ id: `large-${i}`, name: `${i < 25 ? "A" : "Z"} Album ${String(i).padStart(2, '0')}`, artist: artist.name, artistId: artist.id, songCount: 4 })) : baseAlbums;
  const songs = largeLibrary ? albums.flatMap(album => Array.from({ length: 4 }, (_, i) => ({ id: `${album.id}-${i}`, title: `Track ${album.id}-${i}`, artist: artist.name, albumId: album.id, album: album.name, duration: 120 }))) : baseSongs;
  const artists = largeLibrary ? Array.from({ length: 45 }, (_, i) => ({ ...artist, id: `artist-${i}`, name: `${i < 25 ? "A" : "Z"} Artist ${String(i).padStart(2, '0')}` })) : [artist];
  const playlists = largeLibrary ? Array.from({ length: 40 }, (_, i) => ({ id: `playlist-${i}`, name: `Playlist ${i}`, songCount: 4 })) : [];
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ albums, songs, cachedSong, realMedia, artists, playlists }) => {
    localStorage.setItem('prism-player.navidrome', JSON.stringify({ serverUrl: 'https://music.fixture.invalid', username: 'fixture' }));
    localStorage.setItem('prism-player.settings', JSON.stringify({ analyticsPromptDismissed: true, lastSeenWhatsNewVersion: '1.0.0', radioStationUrl: 'https://radio.fixture.invalid', radioStationUrls: ['https://radio.fixture.invalid'] }));
    localStorage.setItem('prism-player.playbackState', JSON.stringify({ queue: songs, sourceQueue: songs, currentIndex: 0, position: 30, shuffleEnabled: false, repeatMode: 'off' }));
    const library = { albums: [albums[0]], recentAlbums: [], recentlyPlayedAlbums: [], frequentAlbums: [], artists, playlists, favorites: { artists: [], albums: [], songs: [] } };
    window.fixtureReady = new Promise(resolve => {
      const request = indexedDB.open('prism-player-library-catalog', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('catalogs', { keyPath: 'key' });
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction('catalogs', 'readwrite');
        transaction.objectStore('catalogs').put({ key: 'https://music.fixture.invalid::fixture', version: 1, savedAt: new Date().toISOString(), library, songs: [cachedSong], songsComplete: true, artistImages: {} });
        transaction.oncomplete = () => { db.close(); resolve(); };
      };
    });
    if (!realMedia) {
    const playing = new WeakSet();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { get() { return !playing.has(this); } });
    HTMLMediaElement.prototype.play = function () { playing.add(this); this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { playing.delete(this); this.dispatchEvent(new Event('pause')); };
    HTMLMediaElement.prototype.load = function () {};
    }
    window.__TAURI_INTERNALS__ = { transformCallback: () => 1, invoke: async command => {
      if (command === 'get_navidrome_password') { await window.fixtureReady; return 'fixture-only'; }
      if (command === 'get_native_architecture') return 'arm64';
      if (command === 'plugin:app|version') return '1.0.0';
      if (command === 'plugin:event|listen') return 1;
      return null;
    } };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  }, { artist, albums, songs: songs.map(song => ({ ...song, ...(artwork ? { coverArt: 'fixture-cover' } : {}), ...(mediaType ? { contentType: mediaType } : {}), ...(realMedia ? { duration: 6 } : {}) })), cachedSong, realMedia, artists, playlists });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:1421') return route.continue();
    if (route.request().resourceType() === 'media' || (url.hostname === 'music.fixture.invalid' && url.pathname.includes('/rest/stream'))) {
      const bytes = realMedia ? 96000 : 16000;
      const wav = Buffer.alloc(bytes + 44);
      wav.write('RIFF', 0); wav.writeUInt32LE(bytes + 36, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(bytes, 40);
      if (!realMedia) return route.fulfill({ contentType: 'audio/wav', body: wav });
      // Real seeking requires the same byte-range response contract as a raw file.
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', headers: {
        'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
      }, body: wav.subarray(start, end + 1) });
    }
    if (url.hostname === 'radio.fixture.invalid') {
      if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#304745"/></svg>' });
      if (url.pathname === '/api/lyrics/current') {
        requests.push(`radio-lyrics:${url.searchParams.get('songId')}`);
        await holdLyrics;
        return route.fulfill({ status: lyricsStatus, headers: lyricsStatus === 503 ? { 'Retry-After': '10' } : {}, json: lyricsResponse || {} });
      }
      return route.fulfill({ json: url.pathname === '/api/state' || url.pathname === '/api/now-playing' ? { lyrics: lyricsEnabled === undefined ? undefined : { enabled: lyricsEnabled }, station: { name: 'A station with a meaningful long name' }, nowPlaying: { title: 'On air', artist: 'Radio Artist', subsonic_id: 'heard', startedAt: Date.now() - 5000 }, upcoming: [{ title: 'Up next' }], history: [{ title: 'Previously played' }], streamOnline: true, listeners: 1 } : {} });
    }
    if (url.hostname !== 'music.fixture.invalid') return route.fulfill({ json: {} });
    const endpoint = url.pathname.split('/').at(-1).replace('.view', ''), id = url.searchParams.get('id');
    requests.push(endpoint);
    if (endpoint === 'getCoverArt' && artwork) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="300" height="600" fill="#59A99E"/><rect x="300" width="300" height="600" fill="#ADC8DE"/></svg>' });
    if (endpoint === 'getCoverArt' || endpoint === 'stream') return route.abort();
    if (url.pathname === '/auth/login') return route.fulfill({ json: { name: 'Fixture' } });
    if (endpoint === 'getLyricsBySongId') {
      await holdLocalLyrics;
      return route.fulfill({ status: localLyricsStatus, json: { 'subsonic-response': { status: 'ok', lyricsList: { structuredLyrics: localLyrics || [] } } } });
    }
    if (endpoint === 'getAlbum') {
      await holdAlbums;
      if (failAlbums) return route.fulfill({ status: 503, body: 'Fixture failure' });
      return route.fulfill({ json: { 'subsonic-response': { status: 'ok', album: { ...albums.find(album => album.id === id), song: songs.filter(song => song.albumId === id) } } } });
    }
    const payload = {
      getAlbumList2: { albumList2: { album: empty ? [] : albums } },
      getArtists: { artists: { index: [{ name: 'A', artist: artists }] } },
      getArtist: { artist: { ...artist, album: empty ? [] : albums } },
      getArtistInfo2: { artistInfo2: {} },
      getTopSongs: { topSongs: { song: [] } },
      getStarred2: { starred2: {} }, getPlaylists: { playlists: { playlist: playlists } },
      getScanStatus: { scanStatus: { scanning: false, lastScan: 2 } },
      getLyrics: { lyrics: { value: legacyLyrics } },
    }[endpoint] || {};
    return route.fulfill({ json: { 'subsonic-response': { status: 'ok', ...payload } } });
  });
  await page.goto('/');
  return { requests, errors };
}

async function savedSongs(page) {
  return page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open('prism-player-library-catalog', 1);
    request.onsuccess = () => {
      const db = request.result, get = db.transaction('catalogs').objectStore('catalogs').get('https://music.fixture.invalid::fixture');
      get.onsuccess = () => { db.close(); resolve(get.result); };
    };
  }));
}

test('completed cache keeps songs usable until additions, edits and removals replace it', async ({ page }) => {
  let finish;
  const holdAlbums = new Promise(resolve => { finish = resolve; });
  const { requests, errors } = await fixture(page, { holdAlbums });
  await page.locator('.sidebar').getByRole('button', { name: 'Songs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Previously indexed song', exact: true })).toBeVisible();
  await expect.poll(() => requests.filter(name => name === 'getAlbum').length).toBe(2);
  finish();
  await expect(page.locator('.song-browser-row')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Play Previously indexed song', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await savedSongs(page))?.songs.length).toBe(8);
  expect((await savedSongs(page)).songsComplete).toBe(true);
  expect(errors).toEqual([]);
});

test('a failed background refresh preserves usable cached songs', async ({ page }) => {
  await fixture(page, { failAlbums: true });
  await page.locator('.sidebar').getByRole('button', { name: 'Songs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Previously indexed song', exact: true })).toBeVisible();
  await expect.poll(async () => (await savedSongs(page))?.songsComplete).toBe(false);
});

test('removing the last album persists an empty completed catalog', async ({ page }) => {
  await fixture(page, { empty: true });
  await expect.poll(async () => (await savedSongs(page))?.songs.length).toBe(0);
  expect((await savedSongs(page)).songsComplete).toBe(true);
});

test('Space activates focused buttons and background Space retains playback shortcut', async ({ page }) => {
  await fixture(page);
  const queue = page.getByRole('button', { name: 'Open queue', exact: true });
  await queue.focus(); await page.keyboard.press('Space');
  await expect(page.locator('#playback-sidebar')).toBeVisible();
  await page.locator('#playback-sidebar').getByRole('button', { name: 'Close queue', exact: true }).focus();
  await page.keyboard.press('Space'); await expect(page.locator('#playback-sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open lyrics', exact: true }).focus(); await page.keyboard.press('Space');
  await expect(page.locator('#playback-sidebar')).toHaveAttribute('aria-label', 'Lyrics');
  await page.locator('#playback-sidebar').getByRole('button', { name: 'Close lyrics', exact: true }).click();
  await page.locator('body').click({ position: { x: 400, y: 750 } });
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('artist list has readable initials and a compact two-line discography', async ({ page }) => {
  await fixture(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Artists', exact: true }).click();
  await page.locator('.view-toggle').getByRole('button', { name: 'List', exact: true }).click();
  const initials = page.locator('.artist-row .artist-initials');
  await expect(initials).toHaveText('BYUVP');
  expect(await initials.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
  expect(await initials.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
  await page.locator('.artist-main').click();
  await page.locator('[aria-label="Artist album view"]').getByRole('button', { name: 'List', exact: true }).click();
  const row = page.locator('.artist-album-group .track-row').first();
  await expect(row).toBeVisible();
  const title = await row.locator('.track-name').boundingBox(), credit = await row.locator('.track-artist').boundingBox();
  expect(credit.y).toBeGreaterThanOrEqual(title.y + title.height);
  await page.locator('.workspace').evaluate(el => { for (const node of el.querySelectorAll('*')) node.scrollTop = 0; });
  await expect(page.locator('.artist-hero h3')).toBeInViewport();
  expect((await row.boundingBox()).y).toBeLessThan(600);
  await page.screenshot({ path: test.info().outputPath('artist-list.png') });
});

test('narrow radio workspace wraps summaries beside the timeline', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 900, height: 900 });
  await page.locator('.sidebar').getByRole('button', { name: 'Radio', exact: true }).click();
  await page.getByRole('button', { name: 'Tune In', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop radio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open timeline', exact: true }).click();
  const details = page.locator('.radio-broadcast-details');
  await expect(details).toBeVisible();
  expect(await details.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
  for (const text of await details.locator('strong,small').all()) {
    expect(await text.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('radio-narrow.png') });
  await page.getByRole('button', { name: 'Stop radio', exact: true }).click();
});

async function radioLyrics(page) {
  await page.locator('.sidebar').getByRole('button', { name: 'Radio', exact: true }).click();
  await page.getByRole('button', { name: 'Tune In', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop radio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open lyrics', exact: true }).click();
  return page.locator('#playback-sidebar');
}

for (const enabled of [undefined, false]) {
  test(`radio lyrics do not request older/disabled stations (${enabled})`, async ({ page }) => {
    const { requests } = await fixture(page, { lyricsEnabled: enabled });
    const sidebar = await radioLyrics(page);
    await expect(sidebar).toContainText(enabled === false ? 'switched off' : 'does not advertise');
    expect(requests.filter(request => request.startsWith('radio-lyrics:'))).toEqual([]);
    await expect(page.getByRole('button', { name: 'Stop radio', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop radio', exact: true }).click();
  });
}

async function expectCenteredLyric(lines) {
  await expect.poll(() => lines.evaluate(el => {
    const verse = el.querySelector('p.active').getBoundingClientRect();
    return Math.abs(verse.top + verse.height / 2 - el.getBoundingClientRect().top - el.clientHeight / 2);
  })).toBeLessThan(2);
}

test('radio lyrics use the heard track, played clock and station offset', async ({ page }) => {
  const { requests } = await fixture(page, { lyricsEnabled: true, lyricsResponse: { songId: 'heard', synced: true, offsetMs: 1500, lines: [{ text: 'Opening line', startMs: 0 }, { text: 'Current line', startMs: 6000 }, { text: 'Later line', startMs: 60000 }] } });
  const sidebar = await radioLyrics(page);
  await expect(sidebar.locator('.lyrics-lines p')).toHaveCount(3);
  await expect(sidebar.locator('.lyrics-lines p.active')).toHaveText('Current line');
  await expectCenteredLyric(sidebar.locator('.lyrics-lines'));
  expect(requests).toContain('radio-lyrics:heard');
  await page.screenshot({ path: test.info().outputPath('radio-lyrics.png') });
  await page.getByRole('button', { name: 'Stop radio', exact: true }).click();
});

for (const status of [401, 403, 404, 409, 501]) {
  test(`radio lyrics status ${status} stays optional without retries`, async ({ page }) => {
    const { requests } = await fixture(page, { lyricsEnabled: true, lyricsStatus: status });
    const sidebar = await radioLyrics(page);
    await expect(sidebar.locator('.empty-panel')).toBeVisible();
    await expect(sidebar.locator('.lyrics-lines p')).toHaveCount(0);
    expect(requests.filter(request => request.startsWith('radio-lyrics:'))).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Stop radio', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop radio', exact: true }).click();
  });
}

test('radio lyric responses cannot overwrite local lyrics after playback switches', async ({ page }) => {
  let finish;
  const holdLyrics = new Promise(resolve => { finish = resolve; });
  await fixture(page, { lyricsEnabled: true, holdLyrics, lyricsResponse: { songId: 'heard', synced: false, offsetMs: 0, lines: [{ text: 'Stale radio response', startMs: null }] } });
  const sidebar = await radioLyrics(page);
  await expect(sidebar).toContainText('Loading lyrics');
  await page.getByRole('button', { name: 'Stop radio', exact: true }).click();
  finish();
  await expect(sidebar).not.toContainText('Stale radio response');
});

test('radio outages respect Retry-After and stop retrying after four requests', async ({ page }) => {
  await page.clock.install();
  const { requests } = await fixture(page, { lyricsEnabled: true, lyricsStatus: 503 });
  const sidebar = await radioLyrics(page);
  await expect.poll(() => requests.filter(request => request.startsWith('radio-lyrics:')).length).toBe(1);
  for (const [milliseconds, count] of [[11_000, 2], [21_000, 3], [41_000, 4]]) {
    await page.clock.runFor(milliseconds);
    await expect.poll(() => requests.filter(request => request.startsWith('radio-lyrics:')).length).toBe(count);
  }
  await expect(sidebar).toContainText('temporarily unavailable');
  await page.clock.runFor(120_000);
  expect(requests.filter(request => request.startsWith('radio-lyrics:'))).toHaveLength(4);
  await page.getByRole('button', { name: 'Stop radio', exact: true }).click();
});

test('closing radio lyrics cancels a scheduled outage retry', async ({ page }) => {
  await page.clock.install();
  const { requests } = await fixture(page, { lyricsEnabled: true, lyricsStatus: 503 });
  const sidebar = await radioLyrics(page);
  await expect.poll(() => requests.filter(request => request.startsWith('radio-lyrics:')).length).toBe(1);
  await sidebar.getByRole('button', { name: 'Close lyrics', exact: true }).click();
  await page.clock.runFor(60_000);
  expect(requests.filter(request => request.startsWith('radio-lyrics:'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Stop radio', exact: true }).click();
});


test('local synced lyrics follow playback, pause, seeking and instrumental gaps', async ({ page }) => {
  // Match the fixture song duration; the tiny WAV only supplies a valid media response.
  await page.addInitScript(() => {
    const times = new WeakMap();
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get() { return 120; } });
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { get() { return times.get(this) || 0; }, set(time) { times.set(this, time); } });
  });
  const lines = Array.from({ length: 30 }, (_, index) => ({ start: index * 3000 + 500, value: `Library line ${index + 1}` }));
  lines.splice(12, 0, { start: 35000, value: '' });
  const { requests, errors } = await fixture(page, { localLyrics: [{ synced: true, offset: 500, line: lines }] });
  await page.getByRole('button', { name: 'Open lyrics', exact: true }).click();
  const sidebar = page.locator('#playback-sidebar');
  await expect(sidebar.locator('.lyrics-lines p')).toHaveCount(31);
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  await expect(seek).toHaveAttribute('max', '120');
  await seek.fill('18');
  await expect(sidebar.locator('.lyrics-lines p.active')).toHaveText('Library line 7');
  await expect(sidebar.locator('.lyrics-lines p.active')).toBeInViewport();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  // Deliver an actual media timeupdate to the playing audio slot.
  await page.locator('audio').evaluateAll(elements => {
    const audio = elements.find(audio => !audio.paused);
    audio.currentTime = 60;
    audio.dispatchEvent(new Event('timeupdate'));
  });
  await expect(sidebar.locator('.lyrics-lines p.active')).toHaveText('Library line 21');
  await expect(sidebar.locator('.lyrics-lines p.active')).toBeInViewport();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(sidebar.locator('.lyrics-lines p.active')).toHaveText('Library line 21');
  await seek.fill('3');
  await expect(sidebar.locator('.lyrics-lines p.active')).toHaveText('Library line 2');
  await seek.fill('35');
  await expect(sidebar.locator('.lyrics-lines p.active')).toHaveText('');
  await seek.fill('60');
  await expect(sidebar.locator('.lyrics-lines p.active')).toHaveText('Library line 21');
  await page.screenshot({ path: test.info().outputPath('local-synced-lyrics.png') });
  expect(requests.filter(request => request === 'getLyricsBySongId')).toHaveLength(1);
  expect(requests).not.toContain('getLyrics');
  expect(errors).toEqual([]);
});

for (const mode of ['structured plain', 'older server', 'no lyrics']) {
  test(`local lyrics handle ${mode} without disrupting playback`, async ({ page }) => {
    const { errors } = await fixture(page, {
      localLyricsStatus: mode === 'older server' ? 404 : 200,
      localLyrics: mode === 'structured plain' ? [{ synced: false, line: [{ start: 0, value: 'Untimed verse' }] }] : [],
      legacyLyrics: mode === 'no lyrics' ? '' : 'First lyric\nSecond lyric',
    });
    await page.getByRole('button', { name: 'Open lyrics', exact: true }).click();
    const sidebar = page.locator('#playback-sidebar');
    if (mode === 'no lyrics') await expect(sidebar).toContainText('No lyrics found');
    else await expect(sidebar.locator('.lyrics-lines p.plain')).toHaveCount(mode === 'structured plain' ? 1 : 2);
    await expect(sidebar.locator('.lyrics-lines p.active')).toHaveCount(0);
    if (mode !== 'no lyrics') {
      expect(await sidebar.locator('.lyrics-lines').evaluate(el => el.querySelector('p').getBoundingClientRect().top - el.getBoundingClientRect().top)).toBeLessThan(4);
      await expect(sidebar.locator('.lyrics-lines p').first()).toHaveCSS('filter', 'none');
    }
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('late local lyrics cannot overwrite radio lyrics after switching playback modes', async ({ page }) => {
  let finish;
  const holdLocalLyrics = new Promise(resolve => { finish = resolve; });
  await fixture(page, { holdLocalLyrics, localLyrics: [{ synced: true, line: [{ start: 0, value: 'Stale local verse' }] }], lyricsEnabled: true, lyricsResponse: { songId: 'heard', synced: true, offsetMs: 0, lines: [{ startMs: 0, text: 'Radio verse' }] } });
  await page.getByRole('button', { name: 'Open lyrics', exact: true }).click();
  const sidebar = page.locator('#playback-sidebar');
  await expect(sidebar).toContainText('Loading lyrics');
  await page.locator('.sidebar').getByRole('button', { name: 'Radio', exact: true }).click();
  await page.getByRole('button', { name: 'Tune In', exact: true }).click();
  await expect(sidebar).toContainText('Radio verse');
  finish();
  await expect(sidebar).not.toContainText('Stale local verse');
  await page.getByRole('button', { name: 'Stop radio', exact: true }).click();
});


test('lyrics fill the sidebar at every window size and emphasize the current verse', async ({ page }) => {
  await page.addInitScript(() => {
    const times = new WeakMap();
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get() { return 120; } });
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { get() { return times.get(this) || 0; }, set(time) { times.set(this, time); } });
  });
  const verses = ['Leave the porch light on', 'Let the evening settle in', 'We have time enough to listen', 'To the streets beneath the rain', 'Keep the melody beside you', 'Let the quiet find its way'];
  const { errors } = await fixture(page, { localLyrics: [{ synced: true, line: Array.from({ length: 48 }, (_, index) => ({ start: index * 3000, value: verses[index % verses.length] })) }] });
  await page.getByRole('button', { name: 'Open lyrics', exact: true }).click();
  const sidebar = page.locator('#playback-sidebar'), lines = sidebar.locator('.lyrics-lines');
  await expect(lines.locator('p')).toHaveCount(48);
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  await expect(seek).toHaveAttribute('max', '120');
  await seek.fill('42');
  await expect(lines.locator('p.active')).toHaveText('We have time enough to listen');
  for (const [width, height] of [[1440, 720], [1440, 1200], [900, 900]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(async () => lines.evaluate(el => {
      const sidebar = el.closest('.right-sidebar');
      return Math.abs(sidebar.getBoundingClientRect().bottom - parseFloat(getComputedStyle(sidebar).paddingBottom) - el.getBoundingClientRect().bottom);
    })).toBeLessThan(2);
    const metrics = await lines.evaluate(el => {
      const active = el.querySelector('p.active'), context = el.querySelector('p:not(.active)');
      const activeStyle = getComputedStyle(active), contextStyle = getComputedStyle(context);
      return { activeSize: parseFloat(activeStyle.fontSize), activeWeight: Number(activeStyle.fontWeight), contextSize: parseFloat(contextStyle.fontSize), contextWeight: Number(contextStyle.fontWeight), gap: parseFloat(getComputedStyle(el).rowGap), fitsWidth: [...el.querySelectorAll('p')].every(p => p.scrollWidth <= p.clientWidth), height: el.clientHeight };
    });
    expect(metrics.activeSize).toBeGreaterThanOrEqual(metrics.contextSize * 1.4);
    expect(metrics.activeWeight).toBeGreaterThanOrEqual(600);
    expect(metrics.activeWeight).toBeGreaterThan(metrics.contextWeight);
    expect(metrics.contextSize).toBeGreaterThanOrEqual(18);
    expect(metrics.gap).toBeLessThanOrEqual(4);
    expect(metrics.fitsWidth).toBe(true);
    expect(metrics.height).toBeGreaterThan(height - 240);
    await expect(lines.locator('p.active')).toHaveAttribute('aria-current', 'true');
    await expect(lines.locator('p.active')).toBeInViewport();
    await expectCenteredLyric(lines);
    const listBox = await lines.boundingBox(), footer = await page.locator('.player-bar').boundingBox();
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(footer.y);
    await page.screenshot({ path: test.info().outputPath(`lyrics-${width}-${height}.png`) });
  }
  await seek.fill('117');
  await expect(lines.locator('p.active')).toHaveText('To the streets beneath the rain');
  await expect(lines.locator('p.active')).toBeInViewport();
  expect(errors).toEqual([]);
});


for (const count of [1, 6]) {
  test(`synced lyrics center first and final wrapped verses through resizing (${count} lines)`, async ({ page }) => {
    await installTimingFixture(page, 120);
    const { errors } = await fixture(page, { localLyrics: [{ synced: true, line: Array.from({ length: count }, (_, i) => ({ start: i * 3000, value: `Verse ${i}: keep the melody beside you, through the streets beneath the rain, until the evening settles in` })) }] });
    await page.getByRole('button', { name: 'Open lyrics', exact: true }).click();
    const lines = page.locator('#playback-sidebar .lyrics-lines');
    const seek = page.getByRole('slider', { name: 'Seek', exact: true });
    await expect(lines.locator('p')).toHaveCount(count);
    for (const time of [0, Math.floor(count / 2) * 3, (count - 1) * 3]) {
      await seek.fill(String(time));
      await expect(lines.locator('p.active')).toContainText(`Verse ${time / 3}:`);
      for (const [width, height] of [[1440, 900], [900, 650]]) {
        await page.setViewportSize({ width, height });
        await expectCenteredLyric(lines);
        await page.getByRole('separator', { name: 'Resize right sidebar', exact: true }).press('End');
        await expectCenteredLyric(lines);
        await page.getByRole('separator', { name: 'Resize right sidebar', exact: true }).press('Home');
        await expectCenteredLyric(lines);
      }
      if (count === 6) await page.screenshot({ path: test.info().outputPath(`lyrics-centered-${time}.png`) });
    }
    expect(errors).toEqual([]);
  });
}

test('synced lyric focus blurs distant lines in both directions and follows seeking', async ({ page }) => {
  await installTimingFixture(page, 120);
  const { errors } = await fixture(page, { localLyrics: [{ synced: true, line: Array.from({ length: 20 }, (_, i) => ({ start: i * 3000, value: `Verse ${i}: leave the porch light on` })) }] });
  await page.getByRole('button', { name: 'Open lyrics', exact: true }).click();
  // Avoid hovering a verse while measuring its resting blur.
  await page.mouse.move(0, 0);
  const lines = page.locator('#playback-sidebar .lyrics-lines'), rows = lines.locator('p');
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  for (const current of [6, 10, 0, 19]) {
    await seek.fill(String(current * 3));
    await expect(lines.locator('p.active')).toContainText(`Verse ${current}:`);
    await expectCenteredLyric(lines);
    for (const offset of [-3, -2, -1, 0, 1, 2, 3]) {
      const index = current + offset;
      if (index < 0 || index >= 20) continue;
      await expect(rows.nth(index)).toHaveAttribute('data-distance', String(Math.min(3, Math.abs(offset))));
      await expect(rows.nth(index)).toHaveCSS('filter', Math.abs(offset) < 2 ? 'none' : Math.abs(offset) === 2 ? 'blur(0.65px)' : 'blur(1.3px)');
    }
  }
  await seek.fill('30');
  await expectCenteredLyric(lines);
  await page.screenshot({ path: test.info().outputPath('lyrics-distance-focus.png') });
  const distant = rows.nth(12);
  await distant.hover();
  await expect(distant).toHaveCSS('filter', 'none');
  expect(errors).toEqual([]);
});

async function installTimingFixture(page, duration) {
  await page.addInitScript(duration => {
    window.timingFixture = { duration };
    const times = new WeakMap();
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get() { return window.timingFixture.duration; } });
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { get() { return times.get(this) || 0; }, set(time) { times.set(this, time); } });
  }, duration);
}

test('library progress reaches fractional endpoints and follows the active media duration', async ({ page }) => {
  await installTimingFixture(page, 183.75);
  const { errors } = await fixture(page);
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  await expect(seek).toHaveAttribute('max', '183.75');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.locator('audio').evaluateAll(elements => {
    const audio = elements.find(audio => !audio.paused);
    audio.currentTime = 183.25; audio.dispatchEvent(new Event('timeupdate'));
  });
  await expect(seek).toHaveValue('183.25');
  await expect(page.locator('.seek-row span')).toHaveText(['3:03', '3:04']);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await seek.press('End');
  await expect(seek).toHaveValue('183.75');
  await page.locator('audio').evaluateAll(elements => {
    window.timingFixture.duration = 200.5;
    const audio = elements.find(audio => !audio.paused);
    audio.currentTime = 190.25; audio.dispatchEvent(new Event('timeupdate'));
  });
  await expect(seek).toHaveAttribute('max', '200.5');
  await expect(seek).toHaveValue('190.25');
  await expect(page.locator('.seek-row span')).toHaveText(['3:10', '3:21']);
  // Standby events must not overwrite the active track's timing.
  await page.locator('audio').evaluateAll(elements => {
    const standby = elements.slice(0, 2).find(audio => audio.paused);
    Object.defineProperty(standby, 'duration', { configurable: true, value: 999 });
    standby.dispatchEvent(new Event('durationchange'));
    standby.currentTime = 900; standby.dispatchEvent(new Event('timeupdate'));
    delete standby.duration;
  });
  await expect(seek).toHaveAttribute('max', '200.5');
  await expect(seek).toHaveValue('190.25');
  await page.screenshot({ path: test.info().outputPath('media-duration-after.png') });
  // Changing tracks replaces the preceding duration instead of retaining its endpoint.
  await page.evaluate(() => { window.timingFixture.duration = 61.4; });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.player-bar .now-playing-copy .track-title')).toHaveText('Album a track 2');
  await page.locator('audio').evaluateAll(elements => {
    const audio = elements.find(audio => !audio.paused); audio.dispatchEvent(new Event('loadedmetadata'));
  });
  await expect(seek).toHaveAttribute('max', '61.4');
  await expect(page.locator('.seek-row span').last()).toHaveText('1:02');
  expect(errors).toEqual([]);
});

test('library progress uses a finite catalog fallback until media duration is available', async ({ page }) => {
  await installTimingFixture(page, null);
  // Infinity represents media metadata whose duration is not yet known.
  await page.addInitScript(() => { window.timingFixture.duration = Infinity; });
  await fixture(page);
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  await expect(seek).toHaveAttribute('max', '120');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.locator('audio').evaluateAll(elements => {
    window.timingFixture.duration = 125.5;
    const audio = elements.find(audio => !audio.paused); audio.currentTime = 124.5; audio.dispatchEvent(new Event('timeupdate'));
  });
  await expect(seek).toHaveAttribute('max', '125.5');
  await expect(seek).toHaveValue('124.5');
  await expect(page.locator('.seek-row span')).toHaveText(['2:04', '2:06']);
});

test('Instrument Sans loads locally across the app and its full license is readable', async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (/\.woff2/.test(request.url())) requests.push(request.url()); });
  await fixture(page, { localLyrics: [{ synced: true, line: [{ start: 0, value: 'Leave the porch light on' }] }] });
  await page.getByRole('button', { name: 'Open lyrics', exact: true }).click();
  const active = page.locator('.lyrics-lines p.active');
  await expect(active).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.lyrics-lines p.active' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  expect(fonts.some(font => font.isCustomFont && font.familyName === 'Instrument Sans' && font.glyphCount > 0)).toBe(true);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(url => new URL(url).origin === 'http://127.0.0.1:1421')).toBe(true);
  const family = await page.locator('.sidebar').getByRole('button', { name: 'Artists', exact: true }).evaluate(el => getComputedStyle(el).fontFamily);
  expect(family).toContain('Instrument Sans');
  await expect(active).toHaveCSS('font-weight', '600');
  await page.screenshot({ path: test.info().outputPath('instrument-sans-app.png') });
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Typography & licenses', { exact: true }).click();
  const license = page.locator('.about-font-license pre');
  await expect(license).toBeVisible();
  await expect(license).toContainText('Copyright 2022 The Instrument Sans Project Authors');
  await expect(license).toContainText('SIL OPEN FONT LICENSE Version 1.1');
  expect((await license.textContent()).length).toBeGreaterThan(4000);
  await page.screenshot({ path: test.info().outputPath('font-license.png') });
});


test('library seek waits for the media engine to confirm the actual position', async ({ page }) => {
  await installTimingFixture(page, 120);
  await fixture(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.locator('audio').first().evaluate(audio => {
    audio.currentTime = 30;
    audio.dispatchEvent(new Event('timeupdate'));
    Object.defineProperty(audio, 'seeking', { configurable: true, value: true });
  });
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  await seek.fill('110');
  await expect(page.locator('.seek-row span').first()).toHaveText('0:30');
  await page.locator('audio').first().evaluate(audio => {
    // An engine can land somewhere other than the requested target.
    audio.currentTime = 104.25;
    Object.defineProperty(audio, 'seeking', { configurable: true, value: false });
    audio.dispatchEvent(new Event('seeked'));
  });
  await expect(seek).toHaveValue('104.25');
  await expect(page.locator('.seek-row span').first()).toHaveText('1:44');
});

test('supported originals use raw streams and decoding failure falls back only once', async ({ page }) => {
  await page.addInitScript(() => { HTMLMediaElement.prototype.canPlayType = () => 'probably'; });
  const { errors } = await fixture(page, { mediaType: 'audio/flac' });
  await expect.poll(() => page.locator('audio').first().evaluate(a => new URL(a.src).searchParams.get('format'))).toBe('raw');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.locator('audio').first().dispatchEvent('error');
  await expect.poll(() => page.locator('audio').first().evaluate(a => new URL(a.src).searchParams.has('format'))).toBe(false);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.locator('audio').first().dispatchEvent('error');
  await expect(page.locator('.player-error')).toHaveText('Track stream failed.');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('real media clock and completed seeks drive progress through a real track end', async ({ page }) => {
  await page.addInitScript(() => {
    window.mediaEvents = [];
    for (const name of ['loadedmetadata','durationchange','seeking','seeked','timeupdate','play','pause','ended','error']) {
      document.addEventListener(name, event => {
        const a = event.target;
        if (a instanceof HTMLMediaElement) window.mediaEvents.push({ event: name, time: a.currentTime, duration: a.duration, paused: a.paused, seeking: a.seeking, slot: Array.from(document.querySelectorAll('audio')).indexOf(a) });
      }, true);
    }
  });
  const { errors } = await fixture(page, { realMedia: true, mediaType: 'audio/wav' });
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  await expect(seek).toHaveAttribute('max', '6');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await seek.fill('2');
  await expect.poll(() => page.locator('audio').first().evaluate(a => !a.seeking && a.currentTime >= 2)).toBe(true);
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.locator('audio').first().evaluate(a => a.currentTime)).toBeGreaterThan(2.2);
  const comparison = await page.locator('audio').first().evaluate(a => ({ time: a.currentTime, display: Number(document.querySelector('input[aria-label="Seek"]').value) }));
  expect(Math.abs(comparison.time - comparison.display)).toBeLessThan(0.5);
  await seek.fill('5');
  try {
    await expect(page.locator('.player-bar .now-playing-copy .track-title')).toHaveText('Album a track 2', { timeout: 5000 });
  } finally {
    await test.info().attach('real-media-events', { body: JSON.stringify(await page.evaluate(() => ({ events: window.mediaEvents, final: Array.from(document.querySelectorAll('audio')).map(a => ({ time: a.currentTime, duration: a.duration, paused: a.paused, seeking: a.seeking, ended: a.ended, readyState: a.readyState })) })), null, 2), contentType: 'application/json' });
  }
  expect(errors).toEqual([]);
});

test('Facet is the default with a vector brand, readable state colors and retained alternative themes', async ({ page }) => {
  await fixture(page, { localLyrics: [{ synced: true, line: [{ start: 0, value: 'A clear current lyric' }] }] });
  await expect(page.locator('.app-shell')).toHaveClass(/theme-prism/);
  await expect(page.locator('.brand-mark')).toHaveAttribute('src', /facet.*svg/);
  const colors = await page.locator('.app-shell').evaluate(el => {
    const css = getComputedStyle(el);
    return { accent: css.getPropertyValue('--prism-accent').trim(), highlight: css.getPropertyValue('--prism-highlight').trim(), background: css.backgroundColor };
  });
  expect(colors).toEqual({ accent: '#adc8de', highlight: '#59a99e', background: 'rgb(19, 22, 25)' });
  await page.getByRole('button', { name: 'Open lyrics', exact: true }).click();
  await expect(page.locator('.lyrics-lines p.active')).toHaveCSS('border-left-color', 'rgb(89, 169, 158)');
  for (const width of [1440, 1100, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.locator('.app-shell').evaluate(el => el.getBoundingClientRect().height)).toBe(1000);
    await page.waitForTimeout(250);
    const resume = await page.locator('.home-resume-card').boundingBox();
    const radio = await page.locator('.home-dashboard-lead .home-radio-card').boundingBox();
    expect(radio.y >= resume.y + resume.height || radio.x >= resume.x + resume.width).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`facet-lyrics-${width}.png`) });
  }
  let snapshot = (await page.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  snapshot = snapshot.replaceAll('/src/assets/brand/facet.svg', 'data:image/svg+xml;base64,' + readFileSync(new URL('../src/assets/brand/facet.svg', import.meta.url)).toString('base64'));
  snapshot = snapshot.replaceAll('/src/assets/fonts/InstrumentSans-variable.woff2', 'data:font/woff2;base64,' + readFileSync(new URL('../src/assets/fonts/InstrumentSans-variable.woff2', import.meta.url)).toString('base64'));
  writeFileSync(test.info().outputPath('facet-fixture.html'), snapshot);
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
  const facet = page.getByRole('button', { name: /Facet Teal, pale blue and periwinkle/ });
  await expect(facet).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Ocean Blue and sea-glass/ }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/theme-ocean/);
  await facet.click();
  await expect(page.locator('.app-shell')).toHaveClass(/theme-prism/);
});


test('Library expands accessibly, remembers collapse, and Recently added replaces Discover', async ({ page }) => {
  const { errors } = await fixture(page);
  const nav = page.getByRole('complementary', { name: 'Primary navigation' });
  const library = nav.getByRole('button', { name: 'Library', exact: true });
  await expect(library).toHaveAttribute('aria-expanded', 'true');
  await library.focus(); await page.keyboard.press('Space');
  await expect(library).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('button', { name: 'Artists', exact: true })).toBeHidden();
  await page.reload();
  await expect(library).toHaveAttribute('aria-expanded', 'false');
  await library.click();
  await nav.getByRole('button', { name: 'Albums', exact: true }).click();
  await expect(page.locator('.library-view-switcher').getByRole('button', { name: 'Albums', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('button', { name: 'Discover', exact: true })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Recently added', exact: true }).click();
  await expect(page.locator('.browser-heading h3')).toHaveText('Recently added');
  expect(errors).toEqual([]);
});

test('Library title and section controls stay below Search while all four sections scroll', async ({ page }) => {
  await fixture(page, { largeLibrary: true, artwork: true });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.cover-wash-backdrop')).toBeVisible();
  await page.getByRole('button', { name: 'Open lyrics', exact: true }).click();
  for (const width of [1440, 980]) {
    await page.setViewportSize({ width, height: 800 });
    for (const section of ['Artists', 'Albums', 'Songs', 'Playlists']) {
      await page.locator('.sidebar').getByRole('button', { name: section, exact: true }).click();
      const panel = page.locator(`.view-${section.toLowerCase()}`), header = panel.locator('.library-browser-heading');
      await expect(header).toBeVisible();
      const surface = await header.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, blur: getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter }));
      expect(surface.background).toBe('rgba(0, 0, 0, 0)');
      expect(surface.blur).toBe('none');
      const scroller = panel.locator('.library-browser-content');
      await expect.poll(() => scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      expect((await scroller.boundingBox()).y).toBeGreaterThanOrEqual((await header.boundingBox()).y + (await header.boundingBox()).height);
      const before = await header.boundingBox(), search = await page.locator('.topbar').boundingBox();
      expect(before.y - search.y - search.height).toBeLessThan(20);
      await scroller.evaluate(el => { el.scrollTop = el.scrollHeight / 2; });
      if (section === 'Songs') await expect.poll(() => panel.locator('.song-browser-row').first().getAttribute('aria-posinset').then(Number)).toBeGreaterThan(1);
      await expect.poll(async () => Math.abs((await header.boundingBox()).y - before.y)).toBeLessThan(2);
      await expect(header.getByRole('button', { name: section, exact: true })).toBeInViewport();
      if (section === 'Artists' || section === 'Albums') {
        await panel.getByRole('button', { name: 'Jump to Z', exact: true }).click();
        const target = panel.locator('[id$="-Z"]');
        await expect(target).toBeInViewport();
        await expect.poll(async () => (await target.boundingBox()).y - (await header.boundingBox()).y - (await header.boundingBox()).height).toBeLessThan(24);
        await expect.poll(async () => (await target.boundingBox()).y - (await header.boundingBox()).y - (await header.boundingBox()).height).toBeGreaterThanOrEqual(0);
      }
      if (width === 1440) await header.screenshot({ path: test.info().outputPath(`library-wash-${section}.png`) });
      if (section === 'Playlists') await page.screenshot({ path: test.info().outputPath(`library-sticky-${width}.png`) });
    }
  }
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: /Low performance mode/ }).check();
  await page.locator('.sidebar').getByRole('button', { name: 'Songs', exact: true }).click();
  await expect(page.locator('.cover-wash-backdrop')).toHaveCount(0);
  await expect(page.locator('.library-browser-heading')).toBeVisible();
});

test('Home recently played See all opens albums instead of individual listening history', async ({ page }) => {
  await fixture(page);
  const shelf = page.locator('.home-album-shelf').filter({ has: page.getByRole('heading', { name: 'Keep It Going', exact: true }) });
  await expect(shelf).toBeVisible();
  await shelf.getByRole('button', { name: 'See all', exact: false }).click();
  await expect(page.locator('.browser-heading h3')).toHaveText('Recently played albums');
  await expect(page.locator('.album-list-row')).toHaveCount(2);
  await expect(page.locator('.history-track-row')).toHaveCount(0);
});

for (const ready of [true, false]) {
  test(`ended track selects the next song during a pending play (preloaded: ${ready})`, async ({ page }) => {
    await installTimingFixture(page, 120);
    const { errors } = await fixture(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.evaluate(ready => {
      const originalPlay = HTMLMediaElement.prototype.play;
      let pending;
      HTMLMediaElement.prototype.play = function () {
        if (new URL(this.src).searchParams.get('id') === 'a-1') {
          pending ||= new Promise(resolve => { window.finishNextPlay = () => originalPlay.call(this).then(resolve); });
          return pending;
        }
        return originalPlay.call(this);
      };
      const [current, standby] = document.querySelectorAll('audio');
      Object.defineProperty(standby, 'readyState', { configurable: true, value: ready ? 4 : 0 });
      Object.defineProperty(current, 'ended', { configurable: true, value: true });
      current.currentTime = 120; current.dispatchEvent(new Event('ended'));
    }, ready);
    await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
    await expect(page.locator('.player-loading')).toHaveText('Loading…');
    await page.evaluate(() => window.finishNextPlay());
    await expect(page.locator('.player-loading')).toHaveCount(0);
    await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
    // Handoff completion must re-arm preloading for the following song.
    await expect.poll(() => page.locator('audio').nth(ready ? 0 : 1).evaluate(a => new URL(a.src).searchParams.get('id'))).toBe('a-2');
    expect(errors).toEqual([]);
  });
}

test('a completed endpoint seek advances immediately and repeat one restarts the same song', async ({ page }) => {
  await installTimingFixture(page, 120);
  await fixture(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.locator('audio').first().evaluate(audio => { audio.currentTime = 120; audio.dispatchEvent(new Event('seeked')); });
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
  await page.getByRole('button', { name: 'Enable repeat all', exact: true }).click();
  await page.getByRole('button', { name: 'Enable repeat one', exact: true }).click();
  await page.locator('audio').evaluateAll(elements => {
    const audio = elements.slice(0, 2).find(a => !a.paused);
    audio.currentTime = 120; audio.dispatchEvent(new Event('seeked'));
  });
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
  await expect(page.getByRole('slider', { name: 'Seek', exact: true })).toHaveValue('0');
});


test('an old pending handoff cannot replace or pause a later Next selection', async ({ page }) => {
  await installTimingFixture(page, 120);
  await fixture(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let pending;
    HTMLMediaElement.prototype.play = function () {
      if (new URL(this.src).searchParams.get('id') === 'a-1') {
        pending ||= new Promise(resolve => { window.finishOldHandoff = () => originalPlay.call(this).then(resolve); });
        return pending;
      }
      return originalPlay.call(this);
    };
    const [current, standby] = document.querySelectorAll('audio');
    Object.defineProperty(standby, 'readyState', { configurable: true, value: 4 });
    current.currentTime = 120; current.dispatchEvent(new Event('seeked'));
  });
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 3');
  await page.evaluate(() => window.finishOldHandoff());
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 3');
  expect(await page.locator('audio').nth(1).evaluate(a => a.paused)).toBe(false);
});

test('crossfade retains its volume ramp and Pause cancels both audio slots', async ({ page }) => {
  await installTimingFixture(page, 120);
  await fixture(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Enable crossfade', exact: true }).check();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const configuredVolume = await page.locator('audio').first().evaluate(a => a.volume);
  await page.locator('audio').evaluateAll(elements => {
    Object.defineProperty(elements[1], 'readyState', { configurable: true, value: 4 });
    elements[0].currentTime = 116; elements[0].dispatchEvent(new Event('timeupdate'));
  });
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
  await expect.poll(() => page.locator('audio').nth(1).evaluate(a => a.volume)).toBeGreaterThan(0);
  const volumes = await page.locator('audio').evaluateAll(elements => elements.slice(0, 2).map(a => a.volume));
  expect(volumes[0]).toBeLessThan(configuredVolume);
  expect(volumes[1]).toBeLessThan(configuredVolume);
  expect(volumes[0] + volumes[1]).toBeCloseTo(configuredVolume, 4);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await page.locator('audio').evaluateAll(elements => elements.slice(0, 2).every(a => a.paused))).toBe(true);
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
});


test('seeking to the end while paused stays paused with crossfade enabled', async ({ page }) => {
  await installTimingFixture(page, 120);
  await fixture(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Enable crossfade', exact: true }).check();
  await page.locator('audio').evaluateAll(elements => {
    Object.defineProperty(elements[1], 'readyState', { configurable: true, value: 4 });
    elements[0].currentTime = 120; elements[0].dispatchEvent(new Event('seeked'));
    Object.defineProperty(elements[0], 'ended', { configurable: true, value: true });
    elements[0].dispatchEvent(new Event('ended'));
  });
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 1');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect(await page.locator('audio').evaluateAll(elements => elements.slice(0, 2).every(a => a.paused))).toBe(true);
});


test('MP3 playback with FLAC mode enabled has no compatibility warning or recorder', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window.navigator, 'platform', { configurable: true, get: () => 'MacIntel' }));
  await fixture(page, { realMedia: true, mediaType: 'audio/mpeg' });
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Prepare FLAC tracks for accurate seeking', exact: true }).check();
  await expect(page.getByRole('heading', { name: 'Playback diagnostics', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('audio').first().evaluate(a => !a.paused && !a.src.startsWith('blob:'))).toBe(true);
  await expect(page.getByText(/Compatibility unavailable/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});

async function flacFixture(page, { holdFirst, failPreparation = false, samplePath } = {}) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'platform', { configurable: true, get: () => 'MacIntel' });
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    window.flacCreated = []; window.flacRevoked = [];
    URL.createObjectURL = blob => { const url = create(blob); window.flacCreated.push(url); return url; };
    URL.revokeObjectURL = url => { window.flacRevoked.push(url); revoke(url); };
  });
  const { errors } = await fixture(page, { realMedia: true, mediaType: 'audio/flac' });
  const bytes = readFileSync(samplePath || new URL('./fixtures/clock-24bit.flac', import.meta.url));
  const preparationRequests = [];
  await page.route('**/rest/stream*', async route => {
    const request = route.request(), id = new URL(request.url()).searchParams.get('id');
    if (request.resourceType() === 'fetch') {
      preparationRequests.push(id);
      if (id === 'a-0') await holdFirst;
      if (failPreparation) return route.fulfill({ status: 503, body: 'Fixture preparation unavailable' });
    }
    const range = /bytes=(\d+)-(\d*)/.exec(request.headers().range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    try {
      await route.fulfill({ status: range ? 206 : 200, contentType: 'audio/flac', headers: { 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) }, body: bytes.subarray(start, end + 1) });
    } catch { /* A cancelled preparation can finish after its request was aborted. */ }
  });
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
  const toggle = page.getByRole('checkbox', { name: 'Prepare FLAC tracks for accurate seeking', exact: true });
  await expect(toggle).not.toBeChecked();
  expect(preparationRequests).toEqual([]);
  return { toggle, errors, preparationRequests };
}

test('a pending non-crossfade handoff cannot allow the old player to restart', async ({ page }) => {
  await installTimingFixture(page, 120);
  const { errors } = await fixture(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play;
    let pending;
    HTMLMediaElement.prototype.play = function () {
      const started = play.call(this);
      if (new URL(this.src, window.location.href).searchParams.get('id') === 'a-1') {
        pending ||= new Promise(resolve => { window.finishNextPlay = resolve; });
        return pending;
      }
      return started;
    };
    const [current, standby] = document.querySelectorAll('audio');
    Object.defineProperty(standby, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(current, 'ended', { configurable: true, value: true });
    current.currentTime = 120; current.dispatchEvent(new Event('ended'));
  });
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
  await expect.poll(() => page.locator('audio').nth(1).evaluate(a => !a.paused)).toBe(true);
  await expect(page.locator('audio').first()).not.toHaveAttribute('src');
  await page.locator('audio').first().evaluate(a => a.play());
  await expect.poll(() => page.locator('audio').first().evaluate(a => a.paused)).toBe(true);
  expect(await page.locator('audio').nth(1).evaluate(a => a.paused)).toBe(false);
  await page.evaluate(() => window.finishNextPlay());
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(errors).toEqual([]);
});

test('a delayed standby playback start cannot overlap the current FLAC outside a crossfade', async ({ page }) => {
  const { toggle, errors } = await flacFixture(page);
  await toggle.check();
  await expect.poll(() => page.locator('audio').nth(1).evaluate(a => a.src.startsWith('blob:') && a.readyState >= 3)).toBe(true);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('audio').first().evaluate(a => !a.paused)).toBe(true);
  const source = await page.locator('audio').first().evaluate(a => a.src);
  // Emulate a late engine/play request on the preloaded, inactive player.
  await page.locator('audio').nth(1).evaluate(a => a.play().catch(() => undefined));
  await expect.poll(() => page.locator('audio').nth(1).evaluate(a => a.paused)).toBe(true);
  expect(await page.locator('audio').first().evaluate(a => ({ src: a.src, paused: a.paused }))).toEqual({ src: source, paused: false });
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 1');
  // Repeat after a natural handoff, when the other slot owns current playback.
  await page.getByRole('slider', { name: 'Seek', exact: true }).fill('5');
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
  await expect.poll(() => page.locator('audio').first().evaluate(a => a.src.startsWith('blob:') && a.readyState >= 3)).toBe(true);
  await page.locator('audio').first().evaluate(a => a.play().catch(() => undefined));
  await expect.poll(() => page.locator('audio').first().evaluate(a => a.paused)).toBe(true);
  expect(await page.locator('audio').nth(1).evaluate(a => a.paused)).toBe(false);
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(errors).toEqual([]);
});

test('FLAC compatibility is opt-in and real prepared audio seeks, advances and releases old data', async ({ page }) => {
  const { toggle, errors, preparationRequests } = await flacFixture(page);
  await toggle.check();
  await expect.poll(() => page.locator('audio').nth(1).evaluate(a => a.src.startsWith('blob:') && a.readyState >= 3)).toBe(true);
  await expect(page.getByRole('slider', { name: 'Seek', exact: true })).toHaveAttribute('max', '6');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('slider', { name: 'Seek', exact: true }).fill('5');
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2', { timeout: 5000 });
  await expect.poll(() => page.evaluate(() => window.flacRevoked.length)).toBeGreaterThan(0);
  expect(preparationRequests.slice(0, 2)).toEqual(['a-0', 'a-1']);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(errors).toEqual([]);
  await page.getByRole('region', { name: 'FLAC compatibility', exact: true }).screenshot({ path: test.info().outputPath('flac-compatibility.png') });
});

test('Pause during FLAC preparation stays paused and disabling the mode resumes the same position', async ({ page }) => {
  let finish; const holdFirst = new Promise(resolve => { finish = resolve; });
  const { toggle, errors } = await flacFixture(page, { holdFirst });
  await toggle.check(); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.player-loading')).toHaveText('Preparing lossless audio…');
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); finish();
  await expect.poll(() => page.locator('audio').first().evaluate(a => a.src.startsWith('blob:') && a.readyState >= 3)).toBe(true);
  expect(await page.locator('audio').first().evaluate(a => a.paused)).toBe(true);
  await page.getByRole('slider', { name: 'Seek', exact: true }).fill('1');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('audio').first().evaluate(a => a.currentTime)).toBeGreaterThan(1.2);
  await toggle.uncheck();
  await expect.poll(() => page.locator('audio').first().evaluate(a => !a.src.startsWith('blob:') && !a.paused && a.currentTime >= 1)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.flacRevoked.length)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); expect(errors).toEqual([]);
});

test('Next during FLAC preparation ignores the cancelled result and fallback stays playable', async ({ page }) => {
  let finish; const holdFirst = new Promise(resolve => { finish = resolve; });
  const { toggle, errors, preparationRequests } = await flacFixture(page, { holdFirst });
  await toggle.check(); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => preparationRequests.includes('a-0')).toBe(true);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
  await expect.poll(() => page.locator('audio').first().evaluate(a => a.src.startsWith('blob:') && !a.paused)).toBe(true);
  finish(); await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2');
  await page.locator('audio').first().dispatchEvent('error');
  await expect(page.getByText(/Compatibility unavailable/)).toHaveCount(0);
  await expect.poll(() => page.locator('audio').first().evaluate(a => !a.src.startsWith('blob:') && !a.paused)).toBe(true);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); expect(errors).toEqual([]);
});

test('failed FLAC preparation quietly uses original-stream fallback without an automatic retry loop', async ({ page }) => {
  const { toggle, errors, preparationRequests } = await flacFixture(page, { failPreparation: true });
  await toggle.check();
  await expect(page.getByText(/Compatibility unavailable/)).toHaveCount(0);
  await expect.poll(() => page.locator('audio').first().evaluate(a => a.readyState >= 3)).toBe(true);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('audio').first().evaluate(a => !a.paused && !a.src.startsWith('blob:'))).toBe(true);
  expect(preparationRequests.filter(id => id === 'a-0')).toHaveLength(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); expect(errors).toEqual([]);
});

test('prepared FLAC rejection preserves play intent through the original-stream retry', async ({ page }) => {
  const { toggle, errors } = await flacFixture(page);
  await toggle.check(); await expect.poll(() => page.locator('audio').first().evaluate(a => a.src.startsWith('blob:') && a.readyState >= 3)).toBe(true);
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.startsWith('blob:') && !window.failedPreparedPlay) {
        window.failedPreparedPlay = true;
        Object.defineProperty(this, 'error', { configurable: true, value: { code: 3 } });
        this.dispatchEvent(new Event('error'));
        return Promise.reject(new Error('Fixture prepared decode failure'));
      }
      return play.call(this);
    };
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('audio').first().evaluate(a => !a.src.startsWith('blob:') && !a.paused)).toBe(true);
  await expect(page.getByText(/Compatibility unavailable/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); expect(errors).toEqual([]);
});

test('prepared FLAC repeat one restarts and crossfade retains outgoing audio until Pause', async ({ page }) => {
  const { toggle, errors } = await flacFixture(page);
  await toggle.check(); await expect.poll(() => page.locator('audio').nth(1).evaluate(a => a.src.startsWith('blob:') && a.readyState >= 3)).toBe(true);
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  await seek.fill('0');
  await page.getByRole('button', { name: 'Enable repeat all', exact: true }).click();
  await page.getByRole('button', { name: 'Enable repeat one', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click(); await seek.fill('6');
  await expect.poll(() => page.locator('audio').first().evaluate(a => !a.paused && a.currentTime < 2)).toBe(true);
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Turn repeat off', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Enable crossfade', exact: true }).check(); await seek.fill('0');
  const outgoing = await page.locator('audio').first().evaluate(a => a.src);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2', { timeout: 4000 });
  expect(await page.evaluate(url => window.flacRevoked.includes(url), outgoing)).toBe(false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluateAll(audios => audios.slice(0, 2).every(a => a.paused))).toBe(true);
  await expect.poll(() => page.evaluate(url => window.flacRevoked.includes(url), outgoing)).toBe(true);
  expect(errors).toEqual([]);
});

test('Radio keeps prepared local audio cached and paused, and the FLAC setting is stored', async ({ page }) => {
  const { toggle, errors } = await flacFixture(page);
  await toggle.check(); await expect.poll(() => page.locator('audio').first().evaluate(a => a.src.startsWith('blob:') && a.readyState >= 3)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('prism-player.settings')).flacCompatibility)).toBe(true);
  await page.getByRole('slider', { name: 'Seek', exact: true }).fill('1');
  const source = await page.locator('audio').first().evaluate(a => a.src);
  await page.locator('.sidebar').getByRole('button', { name: 'Radio', exact: true }).click();
  await page.getByRole('button', { name: 'Tune In', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop radio', exact: true })).toBeVisible();
  expect(await page.locator('audio').first().evaluate(a => ({ src: a.src, paused: a.paused, time: a.currentTime }))).toEqual({ src: source, paused: true, time: 0 });
  await page.getByRole('button', { name: 'Stop radio', exact: true }).click(); expect(errors).toEqual([]);
});

test.describe('optional supplied FLAC in WebKit', () => {
  test('prepared original FLAC reaches its real endpoint and hands off without the captured overrun', async ({ playwright }) => {
    test.skip(!process.env.PRISM_FLAC_SAMPLE, 'Provide a local sample path to run this private-media check.');
    test.setTimeout(45000);
    const browser = await playwright.webkit.launch({ channel: undefined });
    try {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:1421' });
    const page = await context.newPage();
    const { toggle, errors } = await flacFixture(page, { samplePath: process.env.PRISM_FLAC_SAMPLE });
    await toggle.check();
    await expect.poll(() => page.locator('audio').nth(1).evaluate(a => a.src.startsWith('blob:') && a.readyState >= 3), { timeout: 15000 }).toBe(true);
    await expect(page.getByRole('slider', { name: 'Seek', exact: true })).toHaveAttribute('max', '112.92');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const started = Date.now();
    await page.getByRole('slider', { name: 'Seek', exact: true }).fill('105.759');
    await expect(page.locator('.player-bar .track-title')).toHaveText('Album a track 2', { timeout: 11000 });
    expect(Date.now() - started).toBeLessThan(11000);
    expect(await page.locator('audio').nth(1).evaluate(a => a.duration)).toBe(112.92);
    await page.getByRole('button', { name: 'Pause', exact: true }).click(); expect(errors).toEqual([]);
    } finally { await browser.close(); }
  });
});
