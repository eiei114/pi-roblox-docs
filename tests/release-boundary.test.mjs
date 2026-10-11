import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = (name) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");

// Deliberately narrow regression contract, not a general YAML/security parser.
// Unknown trigger syntax fails instead of being interpreted as an empty set.
function triggerBlock(text) {
  assert.equal([...text.matchAll(/^on:/gm)].length, 1, "expected exactly one on declaration");
  const match = /^on:\s*\r?\n([\s\S]*?)(?=^[a-zA-Z][\w-]*:|$(?![\s\S]))/m.exec(text);
  assert.ok(match, "expected a block-form top-level on declaration");
  return match[1];
}

function triggerEvents(text) {
  return triggerBlock(text).split(/\r?\n/)
    .filter((line) => /^  \S/.test(line) && !/^  #/.test(line))
    .map((line) => {
      const match = /^  ([a-z_]+):\s*(?:#.*)?$/.exec(line);
      assert.ok(match, "unknown or inline event declaration");
      return match[1];
    });
}

function assertReleaseBoundary(text) {
  const events = triggerEvents(text);
  assert.deepEqual(events, ["workflow_dispatch"], "release creation must have only an explicit manual trigger");
  assert.match(text, /^    if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\s*$/m,
    "release job must run only on explicitly dispatched main");
  assert.match(text, /gh release create/);
  assert.match(text, /gh workflow run publish\.yml --ref "\$TAG" -f ref="\$TAG"/);
}

test("ordinary main merge cannot create a release or dispatch npm publication", () => {
  assertReleaseBoundary(workflow("auto-release.yml"));
});

test("a restored main-push release path fails the regression contract", () => {
  const current = workflow("auto-release.yml");
  assert.throws(() => assertReleaseBoundary(current.replace("  workflow_dispatch:", "  push:\n    branches: [main]")));
  assert.throws(() => assertReleaseBoundary(current.replace("  workflow_dispatch:", "  workflow_run:")));
  assert.throws(() => assertReleaseBoundary(current.replace("  workflow_dispatch:", "  workflow_dispatch:\n  push: {branches: [main]}")));
  assert.throws(() => assertReleaseBoundary(current.replace(/^on:\r?\n/m, "on: [push]\n")));
});

test("missing main/manual job guard fails even with a manual trigger", () => {
  const current = workflow("auto-release.yml");
  assert.throws(() => assertReleaseBoundary(current.replace(/^    if:.*\r?\n/m, "")));
  assert.throws(() => assertReleaseBoundary(current.replace("github.ref == 'refs/heads/main'", "github.ref != ''")));
});

test("protected explicit publication triggers and trusted publishing remain intact", () => {
  const publish = workflow("publish.yml");
  const events = triggerEvents(publish);
  assert.deepEqual(events, ["push", "release", "workflow_dispatch"]);
  assert.match(triggerBlock(publish), /    tags:\s*\r?\n      - 'v\*\.\*\.\*'/);
  assert.doesNotMatch(triggerBlock(publish), /branches:|workflow_run:|pull_request:/);
  assert.match(publish, /^  id-token: write\s*$/m);
  assert.match(publish, /steps\.published\.outputs\.skip != 'true'/);
});
