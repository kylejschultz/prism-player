/* global window, localStorage, indexedDB, HTMLMediaElement, Event, URL, getComputedStyle, document */
import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const artist = { id: 'artist', name: 'Brigham Young University Vocal Point', albumCount: 2 };
const albums = ['a', 'b'].map((id, index) => ({ id, name: `Album ${id}`, artist: artist.name, artistId: artist.id, songCount: 4, year: 2026 - index }));
const songs = albums.flatMap(album => Array.from({ length: 4 }, (_, index) => ({ id: `${album.id}-${index}`, title: `${album.name} track ${index + 1}`, albumId: album.id, album: album.name, artist: artist.name, artistId: artist.id, duration: 120, track: index + 1 })));
const cachedSong = { ...songs[0], id: 'removed', title: 'Previously indexed song', albumId: 'removed-album' };

async function fixture(page, { holdAlbums, failAlbums = false, empty = false, lyricsEnabled, lyricsResponse, lyricsStatus = 200, holdLyrics, localLyrics, localLyricsStatus = 200, holdLocalLyrics, legacyLyrics = "First lyric\nSecond lyric" } = {}) {
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ artist, albums, songs, cachedSong }) => {
    localStorage.setItem('prism-player.navidrome', JSON.stringify({ serverUrl: 'https://music.fixture.invalid', username: 'fixture' }));
    localStorage.setItem('prism-player.settings', JSON.stringify({ analyticsPromptDismissed: true, lastSeenWhatsNewVersion: '1.0.0', radioStationUrl: 'https://radio.fixture.invalid', radioStationUrls: ['https://radio.fixture.invalid'] }));
    localStorage.setItem('prism-player.playbackState', JSON.stringify({ queue: songs, sourceQueue: songs, currentIndex: 0, position: 30, shuffleEnabled: false, repeatMode: 'off' }));
    const library = { albums: [albums[0]], recentAlbums: [], recentlyPlayedAlbums: [], frequentAlbums: [], artists: [artist], playlists: [], favorites: { artists: [], albums: [], songs: [] } };
    window.fixtureReady = new Promise(resolve => {
      const request = indexedDB.open('prism-player-library-catalog', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('catalogs', { keyPath: 'key' });
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction('catalogs', 'readwrite');
        transaction.objectStore('catalogs').put({ key: 'https://music.fixture.invalid::fixture', version: 1, savedAt: new Date().toISOString(), library, songs: [cachedSong], songsComplete: true, artistImages: {} });
        transaction.oncomplete = () => { db.close(); resolve(); };
      };
    });
    const playing = new WeakSet();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { get() { return !playing.has(this); } });
    HTMLMediaElement.prototype.play = function () { playing.add(this); this.dispatchEvent(new Event('play')); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { playing.delete(this); this.dispatchEvent(new Event('pause')); };
    HTMLMediaElement.prototype.load = function () {};
    window.__TAURI_INTERNALS__ = { transformCallback: () => 1, invoke: async command => {
      if (command === 'get_navidrome_password') { await window.fixtureReady; return 'fixture-only'; }
      if (command === 'get_native_architecture') return 'arm64';
      if (command === 'plugin:app|version') return '1.0.0';
      if (command === 'plugin:event|listen') return 1;
      return null;
    } };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  }, { artist, albums, songs, cachedSong });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:1421') return route.continue();
    if (route.request().resourceType() === 'media') {
      const wav = Buffer.alloc(16044);
      wav.write('RIFF', 0); wav.writeUInt32LE(16036, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
      return route.fulfill({ contentType: 'audio/wav', body: wav });
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
      getArtists: { artists: { index: [{ name: 'B', artist: [artist] }] } },
      getArtist: { artist: { ...artist, album: empty ? [] : albums } },
      getArtistInfo2: { artistInfo2: {} },
      getTopSongs: { topSongs: { song: [] } },
      getStarred2: { starred2: {} }, getPlaylists: { playlists: { playlist: [] } },
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

test('radio lyrics use the heard track, played clock and station offset', async ({ page }) => {
  const { requests } = await fixture(page, { lyricsEnabled: true, lyricsResponse: { songId: 'heard', synced: true, offsetMs: 1500, lines: [{ text: 'Opening line', startMs: 0 }, { text: 'Current line', startMs: 6000 }, { text: 'Later line', startMs: 60000 }] } });
  const sidebar = await radioLyrics(page);
  await expect(sidebar.locator('.lyrics-lines p')).toHaveCount(3);
  await expect(sidebar.locator('.lyrics-lines p.active')).toHaveText('Current line');
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
      return { activeSize: parseFloat(activeStyle.fontSize), activeWeight: Number(activeStyle.fontWeight), contextSize: parseFloat(contextStyle.fontSize), gap: parseFloat(getComputedStyle(el).rowGap), fitsWidth: [...el.querySelectorAll('p')].every(p => p.scrollWidth <= p.clientWidth), height: el.clientHeight };
    });
    expect(metrics.activeSize).toBeGreaterThanOrEqual(metrics.contextSize * 1.4);
    expect(metrics.activeWeight).toBeGreaterThanOrEqual(700);
    expect(metrics.contextSize).toBeGreaterThanOrEqual(18);
    expect(metrics.gap).toBeLessThanOrEqual(4);
    expect(metrics.fitsWidth).toBe(true);
    expect(metrics.height).toBeGreaterThan(height - 240);
    await expect(lines.locator('p.active')).toHaveAttribute('aria-current', 'true');
    await expect(lines.locator('p.active')).toBeInViewport();
    const listBox = await lines.boundingBox(), footer = await page.locator('.player-bar').boundingBox();
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(footer.y);
    await page.screenshot({ path: test.info().outputPath(`lyrics-${width}-${height}.png`) });
  }
  await seek.fill('117');
  await expect(lines.locator('p.active')).toHaveText('To the streets beneath the rain');
  await expect(lines.locator('p.active')).toBeInViewport();
  expect(errors).toEqual([]);
});
