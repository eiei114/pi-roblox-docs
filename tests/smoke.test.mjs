import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const extensionSource = await readFile(new URL("../extensions/roblox-docs.ts", import.meta.url), "utf8");
const autoReleaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
const ciWorkflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

function extractRegisteredTools(source) {
  return [...source.matchAll(/pi\.registerTool\(\{\s*\n\s*name:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function extractRegisteredCommands(source) {
  return [...source.matchAll(/pi\.registerCommand\("([^"]+)"/g)].map((match) => match[1]);
}

function extractDocumentedTools(readmeText) {
  return [...new Set([...readmeText.matchAll(/`(roblox_[a-z_]+)`/g)].map((match) => match[1]))];
}

function extractDocumentedCommands(readmeText) {
  return [...new Set([...readmeText.matchAll(/`(\/roblox:[a-z-]+)/g)].map((match) => match[1]))];
}

test("package declares pi extensions", () => {
  assert.deepEqual(packageJson.pi.extensions, ["./extensions"]);
});

test("package is discoverable as a Pi package", () => {
  assert.ok(packageJson.keywords.includes("pi-package"));
});

test("package uses public publish config", () => {
  assert.equal(packageJson.publishConfig.access, "public");
});

test("ci workflow validates pull requests and main", () => {
  assert.match(ciWorkflow, /pull_request:/);
  assert.match(ciWorkflow, /branches:\s*\[main\]/);
  assert.match(ciWorkflow, /npm run check/);
  assert.match(ciWorkflow, /npm run version:check/);
});

test("release workflow hands off to npm publish", () => {
  assert.match(autoReleaseWorkflow, /actions:\s*write/);
  assert.match(autoReleaseWorkflow, /contents:\s*write/);
  assert.match(autoReleaseWorkflow, /gh workflow run publish\.yml/);
  assert.match(publishWorkflow, /id-token:\s*write/);
  assert.match(publishWorkflow, /workflow_dispatch:/);
  assert.match(publishWorkflow, /npm publish --access public/);
});

const pinnedCheckout = "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5";
const pinnedSetupNode = "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020";

for (const [name, workflow] of [
  ["ci", ciWorkflow],
  ["auto-release", autoReleaseWorkflow],
  ["publish", publishWorkflow],
]) {
  test(`${name} workflow pins actions/checkout to the same commit as CI`, () => {
    assert.match(workflow, new RegExp(pinnedCheckout));
    assert.doesNotMatch(workflow, /actions\/checkout@v\d+/);
  });
}

test("publish workflow pins actions/setup-node to the same commit as CI", () => {
  assert.match(publishWorkflow, new RegExp(pinnedSetupNode));
  assert.doesNotMatch(publishWorkflow, /actions\/setup-node@v\d+/);
});

test("README documents every registered Roblox tool", () => {
  const registeredTools = extractRegisteredTools(extensionSource);
  const documentedTools = extractDocumentedTools(readme);

  assert.deepEqual(
    documentedTools.sort(),
    registeredTools.sort(),
    "README tool names must match pi.registerTool registrations",
  );
});

test("README documents every registered Roblox slash command", () => {
  const registeredCommands = extractRegisteredCommands(extensionSource);
  const documentedCommands = extractDocumentedCommands(readme);

  for (const command of registeredCommands) {
    assert.ok(
      documentedCommands.includes(`/${command}`),
      `README must document /${command}`,
    );
  }
});

test("CHANGELOG documents the package.json version", () => {
  assert.match(
    changelog,
    new RegExp(`## \\[${packageJson.version}\\]`),
    `CHANGELOG must include a [${packageJson.version}] release section`,
  );
});

const expectedPackManifest = JSON.parse(
  await readFile(new URL("./fixtures/npm-pack-manifest.json", import.meta.url), "utf8"),
);

function readPackManifestPaths() {
  const output = execSync("npm pack --dry-run --json", { encoding: "utf8" });
  const [packResult] = JSON.parse(output);
  return packResult.files.map((entry) => entry.path).sort();
}

test("npm pack manifest matches the expected publishable file list", () => {
  const actualPaths = readPackManifestPaths();

  assert.deepEqual(
    actualPaths,
    expectedPackManifest.sort(),
    "npm pack contents drifted from tests/fixtures/npm-pack-manifest.json; update package.json files or the fixture intentionally",
  );
});

test("notSyncedMessage helper defines shared missing-cache guidance", () => {
  assert.match(extensionSource, /function notSyncedMessage\(\): string/);
  assert.match(extensionSource, /Roblox docs cache is missing\. Call roblox_sync first\./);
});
