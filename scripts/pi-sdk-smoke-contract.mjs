export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_VERSIONS = Object.freeze({
  "@earendil-works/pi-agent-core": "1.1.0",
  "@earendil-works/pi-ai": "1.1.0",
  "@earendil-works/pi-coding-agent": "1.1.0",
  "@earendil-works/pi-tui": "1.1.0",
});
export const SDK_NAMES = Object.keys(SDK_VERSIONS);
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;
const LOCAL_WINDOWS_PATH_PATTERN = /[A-Z]:(?:\\{1,8})/i;
const LOCAL_WINDOWS_PATH_REDACTION_PATTERN = /\b[A-Z]:(?:\\{1,8})[^ \t\r\n"'<>|,;)}\]]+/gi;

export function redactLocalPaths(value, prefixes) {
  if (typeof value === "string") {
    const redactedPrefixes = prefixes.reduce((redacted, [prefix, replacement]) => {
      const jsonEscapedPrefix = JSON.stringify(prefix).slice(1, -1);
      return redacted.replaceAll(prefix, replacement).replaceAll(jsonEscapedPrefix, replacement);
    }, value);
    return redactedPrefixes.replace(LOCAL_WINDOWS_PATH_REDACTION_PATTERN, "<local-path>");
  }
  if (Array.isArray(value)) return value.map((item) => redactLocalPaths(item, prefixes));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      redactLocalPaths(key, prefixes), redactLocalPaths(item, prefixes),
    ]));
  }
  return value;
}

export function assertNoLocalWindowsPaths(serializedReport) {
  const match = LOCAL_WINDOWS_PATH_PATTERN.exec(serializedReport);
  if (match) {
    throw new Error("Generated Pi SDK smoke report contains a local Windows path prefix.");
  }
}

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function registrationObservation(rows) {
  const inventory = rows.find((row) => row?.id === "inventory" && row?.type === "response");
  const commandNames = inventory?.data?.commands?.map((command) => command.name) ?? [];
  const status = rows.find((row) => row?.type === "extension_ui_request"
    && row.method === "setStatus" && row.statusKey === "roblox-docs");
  return { commandNames, status: status ?? null };
}

function featureObservation(rows) {
  const prompt = rows.find((row) => row?.type === "response" && row.id === "feature");
  const health = rows.find((row) => row?.type === "extension_ui_request" && row.method === "notify"
    && typeof row.message === "string" && row.message.includes("Cache freshness: not synced"));
  return { prompt: prompt ?? null, health: health ?? null };
}

function noInference(rows) {
  return !rows.some((row) => ["agent_start", "message_start", "tool_execution_start"].includes(row?.type));
}

export function behaviorAssertions(name, {
  rows = [],
  fullOutput = "",
  exit_code = 1,
  expectedVersion = "1.1.0",
  reloadFirst = null,
  shellStdout = "",
  shellStderr = "",
}) {
  const registration = registrationObservation(rows);
  const registered = registration.commandNames.includes("roblox:health")
    && typeof registration.status?.statusText === "string";
  const feature = featureObservation(rows);
  const handledFeature = feature.prompt?.success === true
    && feature.prompt.data?.disposition === "handled"
    && feature.health !== null
    && noInference(rows);

  if (name === "extension_load") {
    return [assertion("extension_registered",
      "The actual Pi RPC inventory contains roblox:health and the extension emits its session status",
      registration, registered)];
  }

  if (name === "happy_path") {
    return [assertion("feature_response",
      "The actual Pi host handles /roblox:health and reports the isolated empty-cache state without model inference",
      { ...feature, noInference: noInference(rows) }, handledFeature)];
  }

  if (name === "error_path") {
    const prompt = rows.find((row) => row?.type === "response" && row.id === "feature");
    const warning = rows.find((row) => row?.type === "extension_ui_request" && row.method === "notify"
      && row.notifyType === "warning" && row.message === "Usage: /roblox:devforum <query>");
    const handled = prompt?.success === true && prompt.data?.disposition === "handled" && warning !== undefined;
    return [assertion("handled_error",
      "An empty /roblox:devforum query is handled by the extension and returns its explicit usage warning",
      { prompt: prompt ?? null, warning: warning ?? null }, handled)];
  }

  if (name === "reload_cleanup") {
    const firstClean = reloadFirst?.exit_code === 0 && reloadFirst?.exit_observed === true;
    const secondClean = exit_code === 0;
    const noErrors = !UNHANDLED_ERROR_PATTERN.test(fullOutput)
      && !EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput);
    return [
      assertion("reloaded_extension_registered",
        "The second fresh Pi process registers roblox:health and emits the extension session status",
        registration, registered),
      assertion("reloaded_feature_response",
        "The second process handles the Roblox health command with its real feature response and no model inference",
        { ...feature, noInference: noInference(rows) }, handledFeature),
      assertion("clean_shutdown",
        "Both actual Pi processes exit zero without unhandled, extension-load, or shutdown errors",
        { firstExit: reloadFirst?.exit_code ?? null, firstExitObserved: reloadFirst?.exit_observed ?? false,
          secondExit: exit_code, noRuntimeErrors: noErrors }, firstClean && secondClean && noErrors),
    ];
  }

  if (name === "host_shell") {
    return [assertion("native_shell_boundary",
      "The native host shell launches the locally pinned Pi CLI and returns exactly its SDK version",
      { exit_code, stdout: shellStdout.trim(), stderr: shellStderr.trim(), expectedVersion },
      exit_code === 0 && shellStdout.trim() === expectedVersion && shellStderr.trim() === "")];
  }

  throw new Error(`Unknown Pi SDK smoke case: ${name}`);
}
