import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { WHATS_NEW_RELEASES, getCurrentReleaseNotes, getUnreadReleaseNotes } from "../src/whatsNew.ts";
import { checkReleaseSource, readReleaseVersion, validateReleaseContent, renderReleaseDrafts } from "./release-content.mjs";

const future = { version: "1.2.0", introduction: "Choose how you browse and listen to your music.", highlights: ["Control the queue and lyrics independently."], additionalChanges: ["Listen through an artist’s albums in release order."] };
function fixture(t, version = "1.2.0") {
  const root = mkdtempSync(resolve(tmpdir(), "prism-release-content-"));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  mkdirSync(resolve(root,"src-tauri"));
  const write = (path, value) => writeFileSync(resolve(root,path), JSON.stringify(value));
  write("package.json", {version}); write("package-lock.json", {version,packages:{"":{version}}});
  write("src-tauri/tauri.conf.json", {version}); write(".release-please-manifest.json", {".":version});
  return {root,write};
}

test("a simulated next-version source fails without matching notes and passes with reviewed content", t => {
  const {root} = fixture(t);
  assert.throws(() => checkReleaseSource(root,WHATS_NEW_RELEASES.filter(entry => entry.version !== "1.2.0")), /Missing curated release content for 1.2.0.*src\/whatsNew.ts/);
  assert.equal(checkReleaseSource(root,[...WHATS_NEW_RELEASES.filter(entry => entry.version !== "1.2.0"),future]).version,"1.2.0");
  assert.equal(checkReleaseSource(root,[future],"v1.2.0").version,"1.2.0");
  assert.throws(() => checkReleaseSource(root,[future,{...future,version:"1.3.0"}],"v1.3.0"), /does not match source metadata/);
});

test("missing, empty, placeholder, duplicate and preview-only content cannot satisfy the guard", () => {
  for (const introduction of ["", "  ", "TODO: write the notes", "Coming soon"]) {
    assert.throws(() => validateReleaseContent([{...future,introduction}],"1.2.0"), /introduction.*non-placeholder/);
  }
  for (const highlights of [[],[""],["TBD"],"Not a list"]) {
    assert.throws(() => validateReleaseContent([{...future,highlights}],"1.2.0"), /highlights/);
  }
  assert.throws(() => validateReleaseContent([{...future,additionalChanges:["FIXME"]}],"1.2.0"), /additionalChanges/);
  assert.throws(() => validateReleaseContent([{...future,additionalChanges:"wrong"}],"1.2.0"), /additionalChanges/);
  assert.throws(() => validateReleaseContent([future,future],"1.2.0"), /Duplicate/);
  assert.throws(() => validateReleaseContent([{...future,previewForVersion:"1.3.0"}],"1.2.0"), /Missing/);
  assert.throws(() => validateReleaseContent([future],"latest"), /Invalid release version/);
});

test("all version sources must agree including the lockfile root and release manifest", t => {
  const {root,write} = fixture(t);
  assert.equal(readReleaseVersion(root),"1.2.0");
  for (const [path,bad,good] of [
    ["package-lock.json",{version:"1.2.0",packages:{"":{version:"1.1.0"}}},{version:"1.2.0",packages:{"":{version:"1.2.0"}}}],
    ["package-lock.json",{version:"1.1.0",packages:{"":{version:"1.2.0"}}},{version:"1.2.0",packages:{"":{version:"1.2.0"}}}],
    ["src-tauri/tauri.conf.json",{version:"1.1.0"},{version:"1.2.0"}],
    [".release-please-manifest.json",{".":"1.1.0"},{".":"1.2.0"}],
  ]) {
    write(path,bad); assert.throws(() => checkReleaseSource(root,[future]), /Release version mismatch/); write(path,good);
  }
});

test("drafts use the same facts with channel-specific detail and full release links", () => {
  const drafts = renderReleaseDrafts(future);
  for (const text of Object.values(drafts)) {
    assert.ok(text.includes(future.introduction));
    assert.ok(text.includes(future.highlights[0]));
    assert.ok(text.includes("https://github.com/kylejschultz/prism-player/releases/tag/v1.2.0"));
  }
  assert.ok(drafts["github.md"].includes(future.additionalChanges[0]));
  assert.ok(drafts["unraid.md"].includes(future.additionalChanges[0]));
  assert.ok(drafts["unraid.md"].includes("<details>"));
  assert.ok(!drafts["discord.md"].includes(future.additionalChanges[0]));
  assert.ok(drafts["discord.md"].length < drafts["github.md"].length);
});

test("historical introduction, highlights, version selection and dismissal retain their behavior", () => {
  const current = getCurrentReleaseNotes("1.1.0");
  assert.equal(current.introduction,"A new look, lyrics that follow along, and more room for your music. Welcome to Prism 1.1!");
  assert.equal(current.highlights.length,3); assert.equal(current.additionalChanges.length,8);
  assert.equal(getCurrentReleaseNotes("1.0.0").highlights.length,5);
  assert.equal(getCurrentReleaseNotes("0.5.0").previewForVersion,"1.0.0");
  assert.deepEqual(getUnreadReleaseNotes("1.1.0",""),[current]);
  assert.deepEqual(getUnreadReleaseNotes("1.1.0","1.0.0"),[current]);
  assert.deepEqual(getUnreadReleaseNotes("1.1.0","1.1.0"),[]);
  assert.deepEqual(getUnreadReleaseNotes("1.1.0","0.4.0").map(entry=>entry.version),["1.1.0","1.0.0"]);
});

test("CLI guards the actual version and writes only the three requested local drafts", t => {
  const script = fileURLToPath(new URL("./release-content.mjs",import.meta.url));
  const run = args => spawnSync(process.execPath,["--experimental-strip-types",script,...args],{encoding:"utf8"});
  assert.equal(run(["check"]).status,0);
  const missing = run(["check","--version","99.0.0"]);
  assert.equal(missing.status,1); assert.match(missing.stderr,/Missing curated release content for 99.0.0/);
  const {root} = fixture(t,"1.1.0");
  const output = resolve(root,"drafts");
  const drafts = run(["drafts","--version","1.1.0","--out",output]);
  assert.equal(drafts.status,0,drafts.stderr); assert.match(drafts.stdout,/Nothing was posted/);
  assert.deepEqual(readdirSync(output).sort(),["discord.md","github.md","unraid.md"]);
  assert.match(readFileSync(resolve(output,"github.md"),"utf8"),/Also in this update/);
  assert.equal(run(["drafts"]).status,1);
  assert.equal(run(["check","--out",output]).status,1);
  assert.equal(run(["check","--version","1.1.0","--version","1.1.0"]).status,1);
});
