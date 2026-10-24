/* global window, localStorage, indexedDB, HTMLMediaElement, Event, URL, getComputedStyle, document */
import { test, expect } from '@playwright/test';

const artist = { id: 'artist', name: 'Brigham Young University Vocal Point', albumCount: 2 };
const albums = ['a', 'b'].map((id, index) => ({ id, name: `Album ${id}`, artist: artist.name, artistId: artist.id, songCount: 4, year: 2026 - index }));
const songs = albums.flatMap(album => Array.from({ length: 4 }, (_, index) => ({ id: `${album.id}-${index}`, title: `${album.name} track ${index + 1}`, albumId: album.id, album: album.name, artist: artist.name, artistId: artist.id, duration: 120, track: index + 1 })));
const cachedSong = { ...songs[0], id: 'removed', title: 'Previously indexed song', albumId: 'removed-album' };

async function fixture(page, { holdAlbums, failAlbums = false, empty = false } = {}) {
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
    if (url.hostname === 'radio.fixture.invalid') {
      return route.fulfill({ json: url.pathname === '/api/state' || url.pathname === '/api/now-playing' ? { station: { name: 'A station with a meaningful long name' }, nowPlaying: { title: 'On air', artist: 'Radio Artist' }, upcoming: [{ title: 'Up next' }], history: [{ title: 'Previously played' }], streamOnline: true, listeners: 1 } : {} });
    }
    if (url.hostname !== 'music.fixture.invalid') return route.fulfill({ json: {} });
    const endpoint = url.pathname.split('/').at(-1).replace('.view', ''), id = url.searchParams.get('id');
    requests.push(endpoint);
    if (endpoint === 'getCoverArt' || endpoint === 'stream') return route.abort();
    if (url.pathname === '/auth/login') return route.fulfill({ json: { name: 'Fixture' } });
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
      getLyrics: { lyrics: { value: 'First lyric\nSecond lyric' } },
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
  await page.locator('.workspace-viewport').evaluate(el => { el.scrollTop = 0; });
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
