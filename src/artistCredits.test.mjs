import assert from "node:assert/strict";
import test from "node:test";
import { matchesArtist, getArtistAlbums } from "./artistCredits.ts";
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

test("artist discography merges server albums with matching release/song credits once", () => {
  const solo = { id: "solo", name: "Bunnies", artist: oliver.name };
  const joint = { id: "joint", name: "Ballad", artist: "Oliver Richman & Joy Woods" };
  const compilation = { id: "comp", name: "Compilation", artist: "Various Artists" };
  const unrelated = { id: "other", name: "Other", artist: "Someone Else" };
  const result = getArtistAlbums({ ...oliver, album: [solo] }, [solo, joint, compilation, unrelated], [
    { id: "song", title: "Guest song", albumId: "comp", artists: [oliver] },
  ]);
  assert.deepEqual(result.map((album) => album.id), ["solo", "joint", "comp"]);
});


test("a structured combined artist credit still includes its primary artist", () => {
  const combined = { id: "combined-credit", name: "Oliver Richman & Joy Woods" };
  const album = { id: "ballad", name: "The Ballad of Phil and Phyllis", artist: combined.name, artistId: combined.id, artists: [combined], albumArtists: [combined] };
  assert.equal(matchesArtist(album, oliver), true);
  assert.deepEqual(getArtistAlbums({ ...oliver, album: [] }, [album], []).map(a => a.id), ["ballad"]);
  assert.equal(matchesArtist({ artists: [{ id: "other", name: "Oliver Richman Jr. & Joy Woods" }] }, oliver), false);
});
