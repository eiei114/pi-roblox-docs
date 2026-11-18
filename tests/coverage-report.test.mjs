import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const scriptPath = fileURLToPath(new URL("../scripts/coverage-report.mjs", import.meta.url));
const sampleFixture = fileURLToPath(new URL("./fixtures/api-dump-sample.json", import.meta.url));
const mismatchFixture = fileURLToPath(new URL("./fixtures/api-dump-mismatch.json", import.meta.url));
const invalidFixture = fileURLToPath(new URL("./fixtures/api-dump-invalid.json", import.meta.url));
const emptyFixture = fileURLToPath(new URL("./fixtures/api-dump-empty.json", import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
  });
}

const tempDir = mkdtempSync(join(tmpdir(), "coverage-report-"));
after(() => rmSync(tempDir, { recursive: true, force: true }));

let tempCounter = 0;
function runJson(json) {
  const file = join(tempDir, `dump-${tempCounter++}.json`);
  writeFileSync(file, json, "utf8");
  return run([file]);
}

test("coverage report prints class, member, deprecated and enum totals and exits 0", () => {
  const result = run([sampleFixture]);
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stderr}`);
  const stdout = result.stdout;
  assert.match(stdout, /classes: 2 vs 2/);
  assert.match(stdout, /total members: 6 vs 6/);
  assert.match(stdout, /Property: 3 vs 3/);
  assert.match(stdout, /Function: 1 vs 1/);
  assert.match(stdout, /Event: 1 vs 1/);
  assert.match(stdout, /Callback: 1 vs 1/);
  assert.match(stdout, /deprecated members: 1 vs 1/);
  assert.match(stdout, /enums: 1 vs 1/);
  assert.match(stdout, /enum items: 2 vs 2/);
  assert.match(stdout, /match: yes/);
});

test("--json prints a stable JSON object with dump and indexed totals", () => {
  const result = run([sampleFixture, "--json"]);
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.match, true);
  assert.equal(report.dump.classes, 2);
  assert.equal(report.dump.totalMembers, 6);
  assert.deepEqual(report.dump.membersByKind, {
    Property: 3,
    Function: 1,
    Event: 1,
    Callback: 1,
  });
  assert.equal(report.dump.deprecatedMembers, 1);
  assert.equal(report.dump.enums, 1);
  assert.equal(report.dump.enumItems, 2);
  assert.deepEqual(report.indexed, report.dump);
});

test("a dump whose indexed totals differ from the raw totals exits non-zero", () => {
  const result = run([mismatchFixture]);
  assert.notEqual(result.status, 0, "expected non-zero exit when dump and indexed totals differ");
  assert.match(result.stdout, /match: no/);
});

test("an unreadable dump path exits non-zero with an error message", () => {
  const result = run(["tests/fixtures/does-not-exist.json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Failed to read API dump/);
});

test("an error-payload dump with no Classes/Enums exits 2 without reporting a match", () => {
  const result = run([invalidFixture]);
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}: ${result.stdout}`);
  assert.match(result.stderr, /Invalid API dump/);
  assert.doesNotMatch(result.stdout, /classes:/);
  assert.doesNotMatch(result.stdout, /match:/);
});

test("--json does not emit a report for an invalid dump", () => {
  const result = run([invalidFixture, "--json"]);
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}: ${result.stdout}`);
  assert.match(result.stderr, /Invalid API dump/);
  assert.equal(result.stdout.trim(), "");
});

test("other invalid top-level shapes exit 2", () => {
  for (const json of ["null", "[]", '"a string"', "42", '{"Classes":[]}', '{"Enums":[]}']) {
    const result = runJson(json);
    assert.equal(result.status, 2, `expected exit 2 for ${json}, got ${result.status}: ${result.stdout}`);
    assert.match(result.stderr, /Invalid API dump/);
  }
});

test("valid empty Classes/Enums arrays still report zero totals and match", () => {
  const result = run([emptyFixture, "--json"]);
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.match, true);
  assert.equal(report.dump.classes, 0);
  assert.equal(report.dump.totalMembers, 0);
  assert.deepEqual(report.dump.membersByKind, { Property: 0, Function: 0, Event: 0, Callback: 0 });
  assert.equal(report.dump.deprecatedMembers, 0);
  assert.equal(report.dump.enums, 0);
  assert.equal(report.dump.enumItems, 0);
  assert.deepEqual(report.indexed, report.dump);
});
