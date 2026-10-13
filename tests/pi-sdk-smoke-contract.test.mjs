import assert from "node:assert/strict";
import test from "node:test";
import {
  behaviorAssertions,
  parseJsonLines,
  redactLocalPaths,
  SDK_VERSIONS,
  VERIFICATION_CONTRACT,
  assertNoLocalWindowsPaths,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const status = { type: "extension_ui_request", method: "setStatus", statusKey: "roblox-docs", statusText: "roblox-docs: run roblox_sync" };
const inventory = { type: "response", id: "inventory", success: true, data: { commands: [{ name: "roblox:health" }, { name: "roblox:devforum" }] } };
const handledPrompt = { type: "response", id: "feature", success: true, data: { disposition: "handled" } };
const health = { type: "extension_ui_request", method: "notify", message: "ROBLOX DOCS HEALTH\nCache freshness: not synced\nRecommendation: run roblox_sync before searching." };
const warning = { type: "extension_ui_request", method: "notify", notifyType: "warning", message: "Usage: /roblox:devforum <query>" };
const observation = (rows = [inventory, status, handledPrompt, health], exit_code = 0) => ({ rows, exit_code });

test("SDK behavior contract and JSONL parser are explicit", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(SDK_VERSIONS, {
    "@earendil-works/pi-agent-core": "1.1.0",
    "@earendil-works/pi-ai": "1.1.0",
    "@earendil-works/pi-coding-agent": "1.1.0",
    "@earendil-works/pi-tui": "1.1.0",
  });
  assert.deepEqual(parseJsonLines(`not-json\r\n${JSON.stringify(inventory)}\n\n`), [inventory]);
});

test("report redaction covers nested JSON stdout and rejects local Windows paths", () => {
  const repo = String.raw`C:\Users\Keisu\workspace\pi-roblox-docs`;
  const temporary = String.raw`C:\Users\Keisu\AppData\Local\Temp`;
  const evidence = {
    invocation: `${repo}\\node_modules\\pi`,
    nodeExecutable: String.raw`C:\Program Files\nodejs\node.exe`,
    process: {
      stdout: `${JSON.stringify({ sourceInfo: { path: `${repo}\\extensions\\plugin.ts` } })}\\n`,
      responses: [{ cache: `${temporary}\\smoke\\cache` }],
    },
  };
  const reportText = JSON.stringify({ evidence: JSON.stringify(redactLocalPaths(evidence, [
    [repo, "<repo>"], [temporary, "<temp>"],
  ])) });

  assert.doesNotMatch(reportText, /[A-Z]:(?:\\{1,8})/i);
  assert.doesNotThrow(() => assertNoLocalWindowsPaths(reportText));
  assert.throws(() => assertNoLocalWindowsPaths(JSON.stringify({ evidence: String.raw`C:\Users\someone\repo` })));
});

test("extension registration requires the actual command inventory and session status", () => {
  assert.equal(behaviorAssertions("extension_load", observation())[0].passed, true);
  for (const rows of [[], [status], [inventory], [{ ...inventory, data: { commands: [] } }, status]]) {
    assert.equal(behaviorAssertions("extension_load", observation(rows))[0].passed, false);
  }
});

test("happy path requires handled feature response, health content, and no inference", () => {
  assert.equal(behaviorAssertions("happy_path", observation())[0].passed, true);
  for (const rows of [[], [handledPrompt], [inventory, status, { ...handledPrompt, success: false }, health],
    [inventory, status, handledPrompt, { ...health, message: "different feature output" }],
    [inventory, status, handledPrompt, health, { type: "agent_start" }]]) {
    assert.equal(behaviorAssertions("happy_path", observation(rows))[0].passed, false);
  }
});

test("error path requires an actual handled warning response", () => {
  assert.equal(behaviorAssertions("error_path", observation([handledPrompt, warning]))[0].passed, true);
  for (const rows of [[], [warning], [{ ...handledPrompt, data: { disposition: "queued" } }, warning],
    [handledPrompt, { ...warning, notifyType: "info" }], [handledPrompt, { ...warning, message: "" }]]) {
    assert.equal(behaviorAssertions("error_path", observation(rows))[0].passed, false);
  }
});

test("reload requires second-process registration and feature response, not exit zero alone", () => {
  const reloadFirst = { exit_code: 0, exit_observed: true };
  const good = behaviorAssertions("reload_cleanup", { ...observation(), reloadFirst, fullOutput: "" });
  assert.deepEqual(good.map((item) => item.id), ["reloaded_extension_registered", "reloaded_feature_response", "clean_shutdown"]);
  assert.ok(good.every((item) => item.passed));
  for (const rows of [[], [inventory, status], [inventory, handledPrompt, health], [inventory, status, health]]) {
    const bad = behaviorAssertions("reload_cleanup", { ...observation(rows), reloadFirst, fullOutput: "" });
    assert.ok(bad.some((item) => !item.passed));
  }
  assert.equal(behaviorAssertions("reload_cleanup", { ...observation(), reloadFirst: { exit_code: 1, exit_observed: true }, fullOutput: "" })[2].passed, false);
  for (const error of ["UnhandledPromiseRejection", "shutdown error", "Error loading extension"]) {
    assert.equal(behaviorAssertions("reload_cleanup", { ...observation(), reloadFirst, fullOutput: error })[2].passed, false);
  }
});

test("native shell checks exact local Pi version, exit, and stderr", () => {
  assert.equal(behaviorAssertions("host_shell", { exit_code: 0, shellStdout: "1.1.0\r\n", shellStderr: "" })[0].passed, true);
  for (const values of [
    { exit_code: 1, shellStdout: "1.1.0", shellStderr: "" },
    { exit_code: 0, shellStdout: "11.1.0", shellStderr: "" },
    { exit_code: 0, shellStdout: "1.1.0 but error", shellStderr: "" },
    { exit_code: 0, shellStdout: "1.1.0", shellStderr: "warning" },
  ]) {
    assert.equal(behaviorAssertions("host_shell", values)[0].passed, false);
  }
});
