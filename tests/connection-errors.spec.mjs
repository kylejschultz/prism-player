/* global window, localStorage, URL */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const appVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

test('native credential failure stays visible and retry preserves first-run form', async ({ page }) => {
  await page.addInitScript(appVersion => {
    localStorage.setItem('prism-player.settings', JSON.stringify({ analyticsPromptDismissed: true, lastSeenWhatsNewVersion: appVersion }));
    let saves = 0;
    window.__TAURI_INTERNALS__ = { transformCallback: () => 1, invoke: async command => {
      if (command === 'get_navidrome_password') return null;
      if (command === 'get_native_architecture') return 'x64';
      if (command === 'set_navidrome_password' && ++saves === 1) {
        throw 'Password storage setup was cancelled. Connect again and complete the system keyring dialog.';
      }
      return null;
    } };
  }, appVersion);
  await page.route('https://music.fixture.invalid/**', route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').pop()?.replace('.view', '');
    const payload = {
      getAlbumList2: { albumList2: { album: [] } },
      getArtists: { artists: { index: [] } },
      getPlaylists: { playlists: { playlist: [] } },
      getStarred2: { starred2: {} },
      getScanStatus: { scanStatus: { scanning: false } },
    }[endpoint] || {};
    return route.fulfill({ json: { 'subsonic-response': { status: 'ok', ...payload } } });
  });
  await page.goto('/');
  const setup = page.getByRole('dialog', { name: 'Connect Prism to Navidrome' });
  await setup.getByPlaceholder('https://music.example.com').fill('music.fixture.invalid');
  await setup.getByPlaceholder('Username', { exact: true }).fill('fixture');
  await setup.getByPlaceholder('Password', { exact: true }).fill('synthetic-only');
  await setup.getByRole('button', { name: 'Connect Library' }).click();
  await expect(setup.getByText('Password storage setup was cancelled.', { exact: false })).toBeVisible();
  await expect(setup.getByPlaceholder('Password', { exact: true })).toHaveValue('synthetic-only');
  expect(await page.evaluate(() => localStorage.getItem('prism-player.navidrome'))).toBeNull();
  await setup.getByRole('button', { name: 'Connect Library' }).click();
  await expect(setup).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('prism-player.navidrome')))).toEqual({ serverUrl: 'https://music.fixture.invalid', username: 'fixture' });
});
