import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { WHATS_NEW_RELEASES } from "../src/whatsNew.ts";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const placeholder = /\b(?:TODO|TBD|FIXME|lorem ipsum)\b|^(?:placeholder|coming soon|release notes go here|add release notes)\b/i;

function normalizedVersion(version) {
  if (typeof version !== "string" || !versionPattern.test(version.replace(/^v/, ""))) {
    throw new Error(`Invalid release version: ${String(version)}.`);
  }
  return version.replace(/^v/, "");
}

export function validateReleaseContent(releases, requestedVersion) {
  const version = normalizedVersion(requestedVersion);
  if (!Array.isArray(releases)) throw new Error("Curated release content must be a list in src/whatsNew.ts.");
  const matches = releases.filter(release => release.version === version && !release.previewForVersion);
  if (matches.length !== 1) {
    throw new Error(matches.length ? `Duplicate curated entries for ${version} in src/whatsNew.ts.`
      : `Missing curated release content for ${version}. Add its introduction, highlights and optional additionalChanges to src/whatsNew.ts, then rerun npm run release:check.`);
  }
  const release = matches[0];
  const checkText = (text, field) => {
    if (typeof text !== "string" || !text.trim() || placeholder.test(text)) {
      throw new Error(`${version}: ${field} must contain reviewed, non-placeholder text in src/whatsNew.ts.`);
    }
  };
  checkText(release.introduction, "introduction");
  if (!Array.isArray(release.highlights) || !release.highlights.length) throw new Error(`${version}: highlights must contain at least one reviewed item.`);
  release.highlights.forEach((text, index) => checkText(text, `highlights[${index}]`));
  if (release.additionalChanges !== undefined) {
    if (!Array.isArray(release.additionalChanges)) throw new Error(`${version}: additionalChanges must be a list.`);
    release.additionalChanges.forEach((text, index) => checkText(text, `additionalChanges[${index}]`));
  }
  return release;
}

export function readReleaseVersion(root = sourceRoot) {
  const read = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const pkg = read("package.json"), lock = read("package-lock.json");
  const versions = {
    "package.json": pkg.version,
    "package-lock.json": lock.version,
    "package-lock.json packages[\"\"]": lock.packages?.[""]?.version,
    "src-tauri/tauri.conf.json": read("src-tauri/tauri.conf.json").version,
    ".release-please-manifest.json": read(".release-please-manifest.json")["."],
  };
  const version = normalizedVersion(pkg.version);
  for (const [path, value] of Object.entries(versions)) {
    if (value !== version) throw new Error(`Release version mismatch: ${path} is ${String(value)}; package.json is ${version}. Keep version changes under Release Please control.`);
  }
  return version;
}

export function checkReleaseSource(root = sourceRoot, releases = WHATS_NEW_RELEASES, expectedVersion) {
  const version = readReleaseVersion(root);
  const target = expectedVersion ? normalizedVersion(expectedVersion) : version;
  const release = validateReleaseContent(releases, target);
  if (target !== version) throw new Error(`Release tag/version ${target} does not match source metadata ${version}. Validate the exact release source.`);
  return release;
}

export function renderReleaseDrafts(release) {
  validateReleaseContent([release], release.version);
  const heading = `Prism ${release.displayVersion ?? release.version}`;
  const url = `https://github.com/kylejschultz/prism-player/releases/tag/v${release.version}`;
  const bullets = items => items.map(text => `- ${text.trim()}`).join("\n");
  const highlights = bullets(release.highlights);
  const changes = release.additionalChanges?.length ? bullets(release.additionalChanges) : "";
  return {
    "github.md": `# ${heading}\n\n${release.introduction.trim()}\n\n## Highlights\n\n${highlights}${changes ? `\n\n## Also in this update\n\n${changes}` : ""}\n\n[Release and downloads](${url})\n`,
    "discord.md": `**${heading}**\n\n${release.introduction.trim()}\n\n${highlights}\n\n[Full notes and downloads](${url})\n`,
    "unraid.md": `## ${heading}\n\n${release.introduction.trim()}\n\n**What’s new**\n\n${highlights}${changes ? `\n\n<details>\n<summary>Other changes</summary>\n\n${changes}\n\n</details>` : ""}\n\n[Read the release notes and download Prism](${url})\n`,
  };
}

export function runReleaseContent(args) {
  const [command, ...flags] = args;
  if (!command || command === "--help") {
    process.stdout.write("Usage: release-content.mjs check [--version VERSION] | drafts [--version VERSION] --out DIRECTORY\n");
    return;
  }
  if (!["check", "drafts"].includes(command)) throw new Error(`Unknown release-content command: ${command}`);
  const options = {};
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index], value = flags[index + 1];
    if (!["--version", "--out"].includes(flag) || !value || value.startsWith("--") || options[flag]) throw new Error(`Invalid or duplicate argument: ${flag}`);
    options[flag] = value;
  }
  if (command === "check") {
    if (options["--out"]) throw new Error("--out is only supported by drafts.");
    const release = checkReleaseSource(sourceRoot, WHATS_NEW_RELEASES, options["--version"]);
    process.stdout.write(`Curated release content and source versions match ${release.version}.\n`);
    return;
  }
  if (!options["--out"]) throw new Error("drafts requires --out DIRECTORY; it writes local Markdown files and sends nothing.");
  const release = validateReleaseContent(WHATS_NEW_RELEASES, options["--version"] ?? readReleaseVersion());
  const output = resolve(options["--out"]);
  mkdirSync(output, { recursive: true });
  for (const [name, content] of Object.entries(renderReleaseDrafts(release))) writeFileSync(resolve(output, name), content);
  process.stdout.write(`Wrote ${release.version} drafts to ${output}. Nothing was posted.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runReleaseContent(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`Release content: ${error.message}\n`); process.exitCode = 1; }
}
