/* global window, localStorage, HTMLMediaElement, Event, URL */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const artist = { id: 'chronicle', name: 'The Daybreak Archive' };
const releases = [
  { id: 'new', name: 'Afterlight', year: 2024 },
  { id: 'old', name: 'First Light', year: 2001 },
  { id: 'guest', name: 'Shared Horizon', year: 2010, artistId: 'joint', artist: 'The Daybreak Archive & Other Ensemble', albumArtists:[artist,{id:'other',name:'Other Ensemble'}] },
  { id: 'appearance', name: 'Other Horizons', year: 2030, artistId:'other',artist:'Other Ensemble',albumArtists:[{id:'other',name:'Other Ensemble'}] },
  { id: 'compilation', name: 'Collected Voices', year: 1990, artistId:'various',artist:'Various Artists',albumArtists:[{id:'various',name:'Various Artists'}] },
  { id: 'unknown', name: 'Undated Sessions' },
].map(a => ({artistId: artist.id, artist: artist.name, songCount: 3, ...a}));
const tracks = album => ['appearance','compilation'].includes(album.id) ? [
  {id:album.id+'-unrelated',title:album.name+' Solo',albumId:album.id,artistId:'other',artist:'Other Ensemble',artists:[{id:'other',name:'Other Ensemble'}],duration:120,track:1},
  {id:album.id+'-feature',title:album.name+' Feature',albumId:album.id,artistId:'other',artist:'Other Ensemble',artists:[{id:'other',name:'Other Ensemble'},artist],duration:120,track:2},
] : [
  {id: album.id + '-3', title: album.name + ' Finale', discNumber: 2, track: 1},
  {id: 'shared-recording', title: album.name + ' Return', discNumber: 1, track: 2},
  {id: album.id + '-1', title: album.name + ' Opening', discNumber: 1, track: 1},
].map(s => ({artist: artist.name, artistId: artist.id, albumId: album.id, album: album.name, duration: 120, ...s}));
const sentinel = {id: 'sentinel', title: 'Existing listening', duration: 120};

async function fixture(page, {large = false, appearancesOnly = false} = {}) {
  const albums = large ? Array.from({length: 55}, (_, i) => ({id: 'release-' + i, name: 'Release ' + String(i).padStart(2, '0'), year: 1950 + i, songCount: 3, artist: artist.name, artistId: artist.id})) : appearancesOnly ? releases.filter(album => ['appearance','compilation'].includes(album.id)) : releases;
  const state = { fail: false, hold: null, requests: [], errors: [] };
  page.on('pageerror', e => state.errors.push(e.message));
  await page.addInitScript(({version, sentinel}) => {
    if (!localStorage.getItem('prism-player.navidrome')) {
      localStorage.setItem('prism-player.navidrome', JSON.stringify({serverUrl: 'https://discography.fixture.invalid', username: 'fixture'}));
      localStorage.setItem('prism-player.settings', JSON.stringify({analyticsPromptDismissed: true, lastSeenWhatsNewVersion: version}));
      localStorage.setItem('prism-player.playbackState', JSON.stringify({queue: [sentinel], sourceQueue: [sentinel], currentIndex: 0, position: 0, shuffleEnabled: false, repeatMode: 'off'}));
    }
    const playing = new WeakSet();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {get() {return !playing.has(this);}});
    HTMLMediaElement.prototype.play = function() {playing.add(this); this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')); return Promise.resolve();};
    HTMLMediaElement.prototype.pause = function() {playing.delete(this); this.dispatchEvent(new Event('pause'));};
    HTMLMediaElement.prototype.load = function() {};
    window.__TAURI_INTERNALS__ = {transformCallback: () => 1, invoke: async command => command === 'get_navidrome_password' ? 'fixture-only' : command === 'plugin:app|version' ? version : command === 'plugin:event|listen' ? 1 : null};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener() {}};
  }, {version, sentinel});
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:1421') return route.continue();
    if (url.hostname !== 'discography.fixture.invalid') return route.fulfill({json: {}});
    const endpoint = url.pathname.split('/').at(-1).replace('.view', '');
    if (endpoint === 'stream' || endpoint === 'getCoverArt') return route.abort();
    if (endpoint === 'getAlbum') {
      const id = url.searchParams.get('id'); state.requests.push(id);
      const failed = state.fail;
      await state.hold;
      if (failed) return route.fulfill({status: 503, body: 'fixture unavailable'});
      const album = albums.find(a => a.id === id);
      return route.fulfill({json: {'subsonic-response': {status: 'ok', album: {...album, song: tracks(album)}}}});
    }
    const payload = {
      getAlbumList2: {albumList2: {album: []}}, // no optional full-library songs
      getArtists: {artists: {index: [{name: 'T', artist: [artist, {id: 'other', name: 'Other Ensemble'}]}]}},
      getArtist: {artist: {...artist, id: url.searchParams.get('id'), album: albums}},
      getArtistInfo2: {artistInfo2: {}}, getTopSongs: {topSongs: {song: []}},
      getPlaylists: {playlists: {}}, getStarred2: {starred2: {}},
      getScanStatus: {scanStatus: {scanning: false, lastScan: 1}},
    }[endpoint] || {};
    return route.fulfill({json: {'subsonic-response': {status: 'ok', ...payload}}});
  });
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', {name: 'Artists', exact: true}).click();
  await page.locator('.artist-card-main, .artist-main').filter({hasText: artist.name}).first().click();
  await expect(page.getByRole('combobox', {name: 'Release order'})).toBeVisible();
  return {state, albums};
}
// Flush through the app's unload handler: normal position snapshots are throttled
// when the same recording remains selected across different queue orders.
async function snapshot(page) {return page.evaluate(() => {
  window.dispatchEvent(new Event('beforeunload'));
  return JSON.parse(localStorage.getItem('prism-player.playbackState'));
});}
async function listMode(page) {await page.locator('[aria-label="Artist album view"]').getByRole('button', {name: 'List', exact: true}).click();}
async function playArtist(page) {await page.locator('.artist-hero .detail-actions').getByRole('button', {name: 'Play', exact: true}).click();}

test('both release orders build the displayed full queue and select a clicked occurrence across albums', async ({page}) => {
  const {state} = await fixture(page);
  await listMode(page);
  expect(await page.locator('.artist-discography-list').first().locator('.artist-album-group').evaluateAll(nodes => nodes.map(n => n.dataset.contextId))).toEqual(['new','guest','old','unknown']);
  await page.getByRole('combobox', {name: 'Release order'}).selectOption('oldest');
  expect(await page.locator('.artist-discography-list').first().locator('.artist-album-group').evaluateAll(nodes => nodes.map(n => n.dataset.contextId))).toEqual(['old','guest','new','unknown']);
  await expect(page.locator('.artist-latest-release')).toContainText('Afterlight');
  const group = page.locator('[data-context-id="old"].artist-album-group');
  await group.getByRole('button', {name: 'Play First Light Finale', exact: true}).click();
  await expect.poll(async () => (await snapshot(page)).queue.length).toBe(12);
  let saved = await snapshot(page);
  expect(saved.queue.map(s => s.albumId)).toEqual(['old','old','old','guest','guest','guest','new','new','new','unknown','unknown','unknown']);
  expect(saved.currentIndex).toBe(2);
  await page.getByRole('button', {name:'Next', exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).currentIndex).toBe(3);
  await page.getByRole('button', {name:'Previous', exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).currentIndex).toBe(2);
  // Same recording ID on a separate release selects that release's occurrence.
  await page.locator('[data-context-id="new"].artist-album-group').getByRole('button', {name: 'Play Afterlight Return', exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).currentIndex).toBe(7);
  await page.getByRole('combobox', {name: 'Release order'}).selectOption('newest');
  expect((await snapshot(page)).currentIndex).toBe(7);
  await playArtist(page);
  await expect.poll(async () => (await snapshot(page)).queue[0].albumId).toBe('new');
  await page.screenshot({path: test.info().outputPath('artist-discography-list.png')});
  expect(state.errors).toEqual([]);
});

test('sort is remembered across views/reload; explicit album playback stays album-only', async ({page}) => {
  await fixture(page);
  await page.getByRole('combobox', {name:'Release order'}).selectOption('oldest');
  await listMode(page);
  await page.locator('[data-context-id="old"].artist-album-group').getByRole('button', {name:'Play First Light',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).queue.length).toBe(3);
  await page.reload();
  await page.locator('.sidebar').getByRole('button', {name:'Artists',exact:true}).click();
  await page.locator('.artist-card-main, .artist-main').filter({hasText:artist.name}).first().click();
  await expect(page.getByRole('combobox', {name:'Release order'})).toHaveValue('oldest');
  await page.screenshot({path:test.info().outputPath('artist-discography-art.png')});
});

test('failed loading leaves playback intact and retry builds a complete queue', async ({page}) => {
  const {state} = await fixture(page);
  state.fail = true;
  await playArtist(page);
  await expect(page.getByText('Playback could not start', {exact:true})).toBeVisible();
  expect((await snapshot(page)).queue.map(s => s.id)).toEqual(['sentinel']);
  state.fail = false;
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).queue.length).toBe(12);
});

for (const intent of ['cancel', 'artist', 'track', 'sort', 'disconnect']) test(`slow preparation cannot override newer ${intent} intent`, async ({page}) => {
  const {state} = await fixture(page);
  let release; state.hold = new Promise(resolve => {release = resolve;});
  await playArtist(page);
  await expect(page.getByText('Preparing playback',{exact:true})).toBeVisible();
  await expect.poll(() => state.requests.filter(id => !['appearance','compilation'].includes(id)).length).toBe(4);
  if (intent === 'cancel') await page.getByRole('button',{name:'Cancel',exact:true}).click();
  if (intent === 'artist') {
    await page.locator('.sidebar').getByRole('button',{name:'Artists',exact:true}).click();
    await page.locator('.artist-card-main, .artist-main').filter({hasText:'Other Ensemble'}).first().click();
  }
  if (intent === 'track') await page.locator('.transport').getByRole('button',{name:'Play',exact:true}).click();
  if (intent === 'disconnect') {
    await page.locator('.sidebar').getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Reset Connection',exact:true}).click();
  }
  if (intent === 'sort') await page.getByRole('combobox',{name:'Release order'}).selectOption('oldest');
  const response = page.waitForResponse(r => r.url().includes('/getAlbum.view'));
  release();
  await response;
  await expect(page.getByText('Preparing playback',{exact:true})).toHaveCount(0);
  // Barrier: wait for all held album responses, then allow their promise continuations.
  await page.waitForTimeout(100);
  if (intent === 'disconnect') expect(await snapshot(page)).toBeNull();
  else expect((await snapshot(page)).queue.map(s => s.id)).toEqual(['sentinel']);
});

test('artist play and shuffle include more than fifty releases outside the viewport', async ({page}) => {
  const {state} = await fixture(page, {large:true});
  expect(state.requests.length).toBe(0);
  await playArtist(page);
  await expect.poll(async () => (await snapshot(page)).queue.length).toBe(165);
  expect(new Set((await snapshot(page)).queue.map(s => s.albumId)).size).toBe(55);
  await page.locator('.artist-hero .detail-actions').getByRole('button',{name:'Shuffle',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).queue.length).toBe(165);
  expect(new Set((await snapshot(page)).queue.map(s => s.albumId)).size).toBe(55);
  expect(state.errors).toEqual([]);
});

test('preparation feedback stays visible after starting from a scrolled list row', async ({page}) => {
  const {state} = await fixture(page, {large:true});
  await listMode(page);
  const group = page.locator('.artist-album-group').first();
  const play = group.getByRole('button', {name:'Play Release 54 Opening', exact:true});
  await expect(play).toBeVisible();
  await group.evaluate(el => el.scrollIntoView({block:'start'}));
  let release; state.hold = new Promise(resolve => {release = resolve;});
  await play.click();
  const notice = page.getByRole('status').filter({hasText:'Preparing playback'});
  await expect(notice).toBeVisible();
  const bounds = await notice.boundingBox(), panel = await page.locator('.browser-panel').boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(panel.y - 1);
  expect(bounds.y + bounds.height).toBeLessThan(panel.y + panel.height);
  await page.screenshot({path:test.info().outputPath('scrolled-preparation.png')});
  await notice.getByRole('button',{name:'Cancel',exact:true}).click();
  release();
  expect((await snapshot(page)).queue.map(s => s.id)).toEqual(['sentinel']);
});


test('guest-only releases stay separate and never enter main artist Play or Shuffle', async ({page}) => {
  const {state} = await fixture(page);
  await expect(page.locator('.artist-hero .detail-stats')).toContainText('4 albums');
  await expect(page.locator('.artist-hero .detail-stats')).toContainText('2001-2024');
  await expect(page.locator('.artist-latest-release')).toContainText('Afterlight');
  const appearances = page.locator('.artist-appearances');
  await expect(appearances.getByRole('heading',{name:'Appears on',exact:true})).toBeVisible();
  // Only credited tracks appear even though complete guest albums are returned.
  await appearances.locator('[data-context-id="appearance"]').scrollIntoViewIfNeeded();
  await expect(appearances.getByRole('button',{name:'Play Other Horizons Feature',exact:true})).toBeVisible();
  await expect(appearances.getByRole('button',{name:'Play Other Horizons Solo',exact:true})).toHaveCount(0);
  for (const order of ['newest','oldest']) {
    await page.getByRole('combobox',{name:'Release order'}).selectOption(order);
    await playArtist(page);
    await expect.poll(async () => (await snapshot(page)).queue.length).toBe(12);
    expect((await snapshot(page)).queue.some(song => ['appearance','compilation'].includes(song.albumId))).toBe(false);
    await page.locator('.artist-hero .detail-actions').getByRole('button',{name:'Shuffle',exact:true}).click();
    await expect.poll(async () => (await snapshot(page)).queue.length).toBe(12);
    expect((await snapshot(page)).queue.some(song => ['appearance','compilation'].includes(song.albumId))).toBe(false);
  }
  await listMode(page);
  const main = page.locator('.artist-discography-list').first();
  expect(await main.locator('.artist-album-group').evaluateAll(nodes=>nodes.map(n=>n.dataset.contextId))).toEqual(['old','guest','new','unknown']);
  await page.getByRole('combobox',{name:'Release order'}).selectOption('newest');
  await appearances.getByRole('button',{name:'Play appearances',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).queue.map(s=>s.id)).toEqual(['appearance-feature','compilation-feature']);
  await appearances.getByRole('button',{name:'Play Collected Voices Feature',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).currentIndex).toBe(1);
  await appearances.getByRole('button',{name:'Shuffle appearances',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).queue.length).toBe(2);
  expect((await snapshot(page)).queue.map(s=>s.id).sort()).toEqual(['appearance-feature','compilation-feature']);
  await page.getByRole('combobox',{name:'Release order'}).selectOption('oldest');
  await appearances.getByRole('button',{name:'Play appearances',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).queue.map(s=>s.id)).toEqual(['compilation-feature','appearance-feature']);
  await appearances.getByRole('button',{name:'Play appearances from Other Horizons',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).queue.map(s=>s.id)).toEqual(['appearance-feature']);
  await appearances.screenshot({path:test.info().outputPath('appears-on.png')});
  await appearances.getByRole('button',{name:/Other Horizons.*featured track/}).click();
  await page.locator('.album-detail-page .detail-actions').getByRole('button',{name:'Play',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).queue.length).toBe(2);
  expect((await snapshot(page)).queue.map(s=>s.id)).toEqual(['appearance-unrelated','appearance-feature']);
  expect(state.errors).toEqual([]);
});


test('an artist with only appearances cannot start main playback but can play featured tracks', async ({page}) => {
  await fixture(page,{appearancesOnly:true});
  await expect(page.locator('.artist-hero .detail-stats')).toContainText('0 albums');
  await expect(page.locator('.artist-hero .detail-actions').getByRole('button',{name:'Play',exact:true})).toBeDisabled();
  await expect(page.locator('.artist-hero .detail-actions').getByRole('button',{name:'Shuffle',exact:true})).toBeDisabled();
  await expect(page.locator('.artist-hero .cover-play-button')).toBeDisabled();
  await expect(page.locator('.artist-latest-release')).toHaveCount(0);
  await page.getByRole('button',{name:'Play appearances',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).queue.map(s=>s.id)).toEqual(['appearance-feature','compilation-feature']);
});
