import { setTimeout } from 'node:timers';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortArtistAlbums, loadArtistDiscography } from './artistDiscography.ts';

const albums = [
  { id: 'b', name: 'Same', year: 2000, changed: '2099' },
  { id: 'z', name: 'Unknown' }, { id: 'a', name: 'Same', year: 2000 },
  { id: 'c', name: 'New', year: 2024 }, { id: 'd', name: 'Alpha', year: 2000 },
];
test('chronology uses years, names and IDs, with unknown dates last in both directions', () => {
  assert.deepEqual(sortArtistAlbums(albums).map(a => a.id), ['c', 'd', 'a', 'b', 'z']);
  assert.deepEqual(sortArtistAlbums(albums, 'oldest').map(a => a.id), ['d', 'a', 'b', 'c', 'z']);
  assert.deepEqual(sortArtistAlbums([...albums, albums[0]]).map(a => a.id), ['c', 'd', 'a', 'b', 'z']);
});
test('loads beyond 50 albums with bounded concurrency, album order and disc/track order', async () => {
  const large = Array.from({length: 57}, (_, i) => ({id: String(i), name: String(i)}));
  let active = 0, maximum = 0;
  const result = await loadArtistDiscography(large, async id => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, Number(id) % 3));
    active--;
    return { song: [{id: 'repeat', title: id + ' disc2', discNumber: 2, track: 1}, {id: id + '2', title: 'Second', discNumber: 1, track: 2}, {id: id + '1', title: 'First', discNumber: 1, track: 1}] };
  }, () => true, {albumId: '56', songId: 'repeat', trackIndex: 2});
  assert.equal(maximum, 4);
  assert.equal(result.songs.length, 171);
  assert.equal(result.startIndex, 170);
  assert.deepEqual(result.songs.slice(0, 3).map(s => s.id), ['01', '02', 'repeat']);
  assert.equal(result.songs.filter(s => s.id === 'repeat').length, 57);
});
test('a failed album rejects the whole result; superseded loading stops after its current batch', async () => {
  await assert.rejects(loadArtistDiscography(albums, async id => {
    if (id === 'a') throw new Error('unavailable');
    return {song: [{id, title: id}]};
  }, () => true), /unavailable/);
  let current = true, loaded = 0;
  assert.equal(await loadArtistDiscography(albums, async () => {
    loaded++; current = false; return {song: []};
  }, () => current), null);
  assert.equal(loaded, 4);
});
test('missing or changed clicked occurrence and empty discography fail instead of starting elsewhere', async () => {
  const load = async () => ({song: [{id: 's', title: 'Song'}]});
  await assert.rejects(loadArtistDiscography(albums, load, () => true, {albumId: 'missing', songId: 's', trackIndex: 0}), /no longer available/);
  await assert.rejects(loadArtistDiscography(albums, load, () => true, {albumId: 'a', songId: 'other', trackIndex: 0}), /album changed/);
  await assert.rejects(loadArtistDiscography([], load, () => true), /No tracks/);
});
