import assert from "node:assert/strict";
import test from "node:test";
import { matchesArtist, matchesAlbumArtist, matchesTrackArtist, getArtistAlbums, getArtistAppearances } from "./artistCredits.ts";
const oliver = { id: "oliver", name: "Oliver Richman" };

test("structured song and album credits include collaborators by stable ID", () => {
  assert.equal(matchesArtist({ artistId: "joint", artist: "Oliver Richman & Joy Woods", artists: [oliver, { id: "joy", name: "Joy Woods" }] }, oliver), true);
  assert.equal(matchesArtist({ albumArtists: [oliver] }, oliver), true);
  assert.equal(matchesArtist({ artists: [{ name: " oliver richman " }] }, oliver), true);
  assert.equal(matchesArtist({ artist: oliver.name, artists: [{ id: "other", name: oliver.name }] }, oliver), false);
});

test("legacy combined credits include the primary artist without substring matches", () => {
  for (const artist of ["Oliver Richman & Joy Woods", "Oliver Richman feat. Joy Woods", "Oliver Richman featuring Joy Woods", "Oliver Richman ft. Joy Woods"]) {
    assert.equal(matchesArtist({ artistId: "joint", artist }, oliver), true);
  }
  assert.equal(matchesArtist({ artist: "Oliver Richman Jr. & Joy Woods" }, oliver), false);
  assert.equal(matchesArtist({ artist: "Earth, Wind & Fire" }, { id: "wind", name: "Wind" }), false);
  assert.equal(matchesArtist({ artist: "AC/DC" }, { id: "ac", name: "AC" }), false);
});

test("artist albums exclude song-only appearances while discovery keeps them separate", () => {
  const solo = { id: "solo", name: "Bunnies", artist: oliver.name };
  const joint = { id: "joint", name: "Ballad", artist: "Oliver Richman & Joy Woods" };
  const compilation = { id: "comp", name: "Compilation", artist: "Various Artists" };
  const unrelated = { id: "other", name: "Other", artist: "Someone Else" };
  const result = getArtistAlbums({ ...oliver, album: [solo] }, [solo, joint, compilation, unrelated]);
  assert.deepEqual(result.map((album) => album.id), ["solo", "joint"]);
  assert.deepEqual(getArtistAppearances({ ...oliver, album: [solo] }, [solo, joint, compilation, unrelated], [
    { id: "song", title: "Guest song", albumId: "comp", artists: [oliver] },
  ]).map(album => album.id), ["comp"]);
});


test("a structured combined artist credit still includes its primary artist", () => {
  const combined = { id: "combined-credit", name: "Oliver Richman & Joy Woods" };
  const album = { id: "ballad", name: "The Ballad of Phil and Phyllis", artist: combined.name, artistId: combined.id, artists: [combined], albumArtists: [combined] };
  assert.equal(matchesArtist(album, oliver), true);
  assert.deepEqual(getArtistAlbums({ ...oliver, album: [] }, [album]).map(a => a.id), ["ballad"]);
  assert.equal(matchesArtist({ artists: [{ id: "other", name: "Oliver Richman Jr. & Joy Woods" }] }, oliver), false);
});


test("explicit album artists override contributors, primary fields and server membership", () => {
  const lead = { id: "lead", name: "Lead Singer" };
  const guestAlbum = { id: "guest-album", name: "Another Artist's Album", artistId: lead.id, artist: lead.name, artists: [lead, oliver], albumArtists: [lead] };
  const guest = { id: "featured", title: "Featured Song", albumId: guestAlbum.id, artistId: lead.id, artists: [lead, oliver] };
  assert.equal(matchesAlbumArtist(guestAlbum, oliver), false);
  assert.deepEqual(getArtistAlbums({...oliver, album:[guestAlbum]}, [guestAlbum]), []);
  assert.deepEqual(getArtistAppearances({...oliver, album:[guestAlbum]}, [guestAlbum], []).map(a => a.id), ['guest-album']);
  assert.equal(matchesTrackArtist(guest, oliver), true);
  assert.equal(matchesTrackArtist({title:'Unrelated', artistId:lead.id, artists:[lead], albumArtists:[oliver]}, oliver), false);
  assert.equal(matchesAlbumArtist({...guestAlbum, albumArtists:[lead, oliver]}, oliver), true);
  assert.equal(matchesAlbumArtist({...guestAlbum, albumArtists:[oliver], artistId:'wrong', artist:'Wrong'}, oliver), true);
  assert.equal(matchesAlbumArtist({...guestAlbum, albumArtists:[{id:'different',name:oliver.name}]}, oliver), false);
});

test("legacy and sparse metadata do not promote track guests; richer server credits win", () => {
  const legacy = {id:'legacy', name:'Legacy', artist:'Someone Else', albumArtist:oliver.name};
  assert.equal(matchesAlbumArtist(legacy, oliver), true);
  assert.equal(matchesAlbumArtist({...legacy, albumArtist:'Someone Else', artists:[oliver]}, oliver), false);
  assert.equal(matchesAlbumArtist({id:'sparse',name:'Sparse'}, oliver), false);
  assert.equal(matchesAlbumArtist({id:'names',name:'Names',artists:[{name:oliver.name}]}, oliver), true);
  const server = {...legacy, albumArtists:[oliver]};
  assert.deepEqual(getArtistAlbums({...oliver, album:[server]}, [{...server,albumArtists:[{id:'other',name:'Other'}]}]), [server]);
  assert.equal(getArtistAlbums({...oliver, album:[{id:server.id,name:server.name,artist:'Unknown'}]}, [server])[0].albumArtists[0].id, oliver.id);
  assert.deepEqual(getArtistAppearances({...oliver,album:[server]}, [server], [{id:'s',title:'Track',albumId:server.id,artists:[oliver]}]), []);
});
