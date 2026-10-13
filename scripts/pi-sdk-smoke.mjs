import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  behaviorAssertions,
  EXTENSION_LOAD_ERROR_PATTERN,
  SDK_NAMES,
  SDK_VERSIONS,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = process.argv.includes("--update-curated-report")
  ? resolve(root, "docs/verification/pi-sdk-smoke.json")
  : resolve(root, ".tmp/pi-sdk-smoke.json");
const outputLimit = 1024 * 1024;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));

for (const name of SDK_NAMES) {
  const installedVersion = readJson(resolve(root, "node_modules", name, "package.json")).version;
  if (manifest.devDependencies?.[name] !== SDK_VERSIONS[name] || installedVersion !== SDK_VERSIONS[name]) {
    throw new Error(`Smoke requires exact Pi SDK ${name}@${SDK_VERSIONS[name]}; manifest=${manifest.devDependencies?.[name]}, installed=${installedVersion}`);
  }
}

const piPackagePath = resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json");
const piPackage = readJson(piPackagePath);
const piBin = typeof piPackage.bin === "string" ? piPackage.bin : piPackage.bin?.pi;
if (!piBin) throw new Error("The pinned Pi SDK package does not declare its pi CLI executable.");
const piCli = resolve(dirname(piPackagePath), piBin);
const rpcArgs = ["--offline", "--no-session", "--no-tools", "--no-extensions", "--no-skills",
  "--no-context-files", "--no-prompt-templates", "--no-mcp", "-e", root, "--mode", "rpc"];

function captureProcess(executable, args, { env, parseRpc = false, onRow, initialInput } = {}) {
  return new Promise((resolveResult) => {
    const child = spawn(executable, args, {
      cwd: root,
      env,
      stdio: [initialInput === undefined && !onRow ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let outputBytes = 0;
    let failure = null;
    let exitObserved = false;
    let inputEnded = false;
    let settled = false;
    const rows = [];
    let deadlineTimer;
    let killTimer;
    let graceTimer;

    const fail = (message) => { failure ??= message; };
    const endInput = () => {
      if (inputEnded || !child.stdin || child.stdin.destroyed) return;
      inputEnded = true;
      child.stdin.end();
    };
    const writeInput = (value) => {
      if (!child.stdin || child.stdin.destroyed || inputEnded) {
        fail("Pi RPC input stream was not writable.");
        return;
      }
      child.stdin.write(value);
    };
    const finish = (code, signal, observed) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      clearTimeout(killTimer);
      clearTimeout(graceTimer);
      resolveResult({
        exit_code: Number.isInteger(code) ? code : 1,
        exit_observed: observed,
        signal: signal ?? null,
        failure,
        stdout,
        stderr,
        rows,
      });
    };

    child.on("error", (error) => fail(`Unable to start child process: ${error.message}`));
    child.stdin?.on("error", (error) => fail(`Pi stdin error: ${error.message}`));
    child.stdout.on("data", (block) => {
      outputBytes += block.length;
      if (outputBytes > outputLimit) {
        fail(`Pi smoke output exceeded ${outputLimit} bytes.`);
        child.kill();
        return;
      }
      const text = block.toString("utf8");
      stdout += text;
      if (!parseRpc) return;
      stdoutBuffer += text;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let row;
        try {
          row = JSON.parse(line);
        } catch {
          fail(`Pi RPC emitted a non-JSON stdout line: ${line.slice(0, 300)}`);
          continue;
        }
        rows.push(row);
        try {
          onRow?.(row, { writeInput, endInput, fail });
        } catch (error) {
          fail(`Pi RPC response handler failed: ${error instanceof Error ? error.message : String(error)}`);
          endInput();
        }
      }
    });
    child.stderr.on("data", (block) => {
      outputBytes += block.length;
      if (outputBytes > outputLimit) {
        fail(`Pi smoke output exceeded ${outputLimit} bytes.`);
        child.kill();
        return;
      }
      stderr += block.toString("utf8");
    });
    child.on("close", (code, signal) => {
      exitObserved = code !== null;
      if (stdoutBuffer.trim()) {
        fail(`Pi RPC ended with an incomplete stdout line: ${stdoutBuffer.slice(0, 300)}`);
      }
      finish(code, signal, exitObserved);
    });

    deadlineTimer = setTimeout(() => {
      fail("Pi smoke child exceeded the 15000ms process deadline.");
      child.kill();
      killTimer = setTimeout(() => child.kill("SIGKILL"), 250);
      graceTimer = setTimeout(() => {
        child.stdin?.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        finish(null, "unconfirmed after cleanup grace", false);
      }, 1000);
    }, 15000);

    if (initialInput !== undefined) writeInput(initialInput);
  });
}

function isolatedEnv(directory) {
  return {
    ...process.env,
    PI_CODING_AGENT_DIR: join(directory, "agent"),
    PI_ROBLOX_DOCS_CACHE_DIR: join(directory, "roblox-cache"),
  };
}

async function runPiProcess({ promptMessage = null, commandName = null, env }) {
  return captureProcess(process.execPath, [piCli, ...rpcArgs], {
    env,
    parseRpc: true,
    initialInput: `${JSON.stringify({ type: "get_commands", id: "inventory" })}\n`,
    onRow(row, { writeInput, endInput, fail }) {
      if (row.id === "inventory") {
        if (row.success !== true || !Array.isArray(row.data?.commands)) {
          fail("The actual Pi host did not return a successful command inventory.");
          endInput();
          return;
        }
        if (promptMessage === null) {
          endInput();
          return;
        }
        const commandNames = row.data.commands.map((command) => command.name);
        if (!commandNames.includes(commandName)) {
          fail(`The actual Pi host did not register ${commandName}.`);
          endInput();
          return;
        }
        writeInput(`${JSON.stringify({ type: "prompt", id: "feature", message: promptMessage })}\n`);
      } else if (row.id === "feature" && row.type === "response") {
        endInput();
      }
    },
  });
}

function compactProcessEvidence(processResult) {
  return {
    exit_code: processResult.exit_code,
    exit_observed: processResult.exit_observed,
    signal: processResult.signal,
    failure: processResult.failure,
    responses: processResult.rows,
    stdout: processResult.stdout,
    stderr: processResult.stderr,
  };
}

function redactLocalPaths(value) {
  return value.replaceAll(root, "<repo>").replaceAll(tmpdir(), "<temp>");
}

function makeCase(name, result, evidence, extra = {}) {
  const output = evidence.fullOutput ?? `${evidence.stdout ?? ""}${evidence.stderr ?? ""}`;
  const { fullOutput: _fullOutput, ...capturedEvidence } = evidence;
  const hasUnhandledError = UNHANDLED_ERROR_PATTERN.test(output);
  const hasLoadError = EXTENSION_LOAD_ERROR_PATTERN.test(output);
  const processResults = extra.processResults ?? [result];
  const processHealthy = processResults.every((processResult) => processResult.exit_observed
    && processResult.exit_code === 0 && !processResult.failure);
  const assertions = behaviorAssertions(name, {
    rows: result.rows,
    fullOutput: output,
    exit_code: result.exit_code,
    expectedVersion: SDK_VERSIONS["@earendil-works/pi-coding-agent"],
    reloadFirst: extra.reloadFirst ?? null,
    shellStdout: extra.shellStdout ?? "",
    shellStderr: extra.shellStderr ?? "",
  });
  const registrationAssertions = assertions.filter((item) => ["extension_registered", "reloaded_extension_registered"].includes(item.id));
  const extensionLoadFailure = hasLoadError || registrationAssertions.some((item) => !item.passed);
  return {
    name,
    command: "npm run smoke:pi",
    exit_code: result.exit_code,
    passed: processHealthy && !hasUnhandledError && !hasLoadError && assertions.every((item) => item.passed),
    evidence: redactLocalPaths(JSON.stringify(capturedEvidence)),
    assertions: assertions.map((item) => ({ ...item, observed: redactLocalPaths(item.observed) })),
    hasUnhandledError,
    extensionLoadFailure,
  };
}

async function runRpcCase(name, promptMessage, commandName) {
  const directory = mkdtempSync(join(tmpdir(), "pi-roblox-sdk-smoke-"));
  const env = isolatedEnv(directory);
  try {
    const processResult = await runPiProcess({ promptMessage, commandName, env });
    const command = `${process.execPath} ${piCli} ${rpcArgs.join(" ")}`;
    const evidence = {
      invocation: command,
      request: promptMessage === null ? { type: "get_commands", id: "inventory" }
        : [{ type: "get_commands", id: "inventory" }, { type: "prompt", id: "feature", message: promptMessage }],
      process: compactProcessEvidence(processResult),
    };
    return makeCase(name, processResult, { ...evidence, fullOutput: `${processResult.stdout}${processResult.stderr}` });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function runReloadCase() {
  const directory = mkdtempSync(join(tmpdir(), "pi-roblox-sdk-reload-"));
  const env = isolatedEnv(directory);
  try {
    const first = await runPiProcess({ env });
    const second = await runPiProcess({
      promptMessage: "/roblox:health",
      commandName: "roblox:health",
      env,
    });
    const fullOutput = `${first.stdout}${first.stderr}${second.stdout}${second.stderr}`;
    const result = { ...second, failure: second.failure ?? first.failure };
    const evidence = {
      invocation: `${process.execPath} ${piCli} ${rpcArgs.join(" ")} (two sequential fresh Pi processes)`,
      request: { first: { type: "get_commands", id: "inventory" }, second: [
        { type: "get_commands", id: "inventory" },
        { type: "prompt", id: "feature", message: "/roblox:health" },
      ] },
      firstProcess: compactProcessEvidence(first),
      secondProcess: compactProcessEvidence(second),
      fullOutput,
    };
    return makeCase("reload_cleanup", result, evidence, { reloadFirst: first, processResults: [first, second] });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function runHostShellCase() {
  const directory = mkdtempSync(join(tmpdir(), "pi-roblox-sdk-shell-"));
  const env = isolatedEnv(directory);
  try {
    let shell;
    let args;
    if (process.platform === "win32") {
      shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
      const quote = (value) => `'${value.replaceAll("'", "''")}'`;
      const command = `& ${quote(process.execPath)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`;
      args = ["-NoProfile", "-NonInteractive", "-Command", command];
    } else {
      shell = "/bin/sh";
      args = ["-c", '"$1" "$2" --no-extensions --version', "pi-host-shell", process.execPath, piCli];
    }
    const result = await captureProcess(shell, args, { env });
    const evidence = {
      invocation: [shell, ...args].join(" "),
      stdout: result.stdout,
      stderr: result.stderr,
      exit_observed: result.exit_observed,
      failure: result.failure,
      fullOutput: `${result.stdout}${result.stderr}`,
    };
    return makeCase("host_shell", result, evidence, {
      processResults: [result],
      shellStdout: result.stdout,
      shellStderr: result.stderr,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const cases = [];
cases.push(await runRpcCase("extension_load", null, null));
cases.push(await runRpcCase("happy_path", "/roblox:health", "roblox:health"));
cases.push(await runRpcCase("error_path", "/roblox:devforum", "roblox:devforum"));
cases.push(await runReloadCase());
cases.push(await runHostShellCase());

const report = {
  schema_version: 1,
  verification_contract: VERIFICATION_CONTRACT,
  sdk_versions: SDK_VERSIONS,
  platform: process.platform,
  model_inference: "none; actual Pi RPC extension commands on an isolated offline host",
  evidence_redactions: "Checkout and OS temporary-directory prefixes are replaced with <repo> and <temp> in captured output.",
  unhandled_errors: cases.filter((item) => item.hasUnhandledError).length,
  extension_load_errors: cases.filter((item) => item.extensionLoadFailure).length,
  cases: cases.map(({ hasUnhandledError, extensionLoadFailure, ...item }) => item),
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ verification_contract: VERIFICATION_CONTRACT, platform: process.platform,
  cases: cases.map(({ name, passed, exit_code }) => ({ name, passed, exit_code })) }));
if (cases.some((item) => !item.passed)) process.exitCode = 1;
