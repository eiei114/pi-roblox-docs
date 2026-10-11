import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url));
const extension = fileURLToPath(new URL("../extensions/roblox-docs.ts", import.meta.url));

async function realHealth(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "--offline", "--no-session", "--no-tools",
      "--no-extensions", "--no-skills", "--no-context-files", "--no-prompt-templates",
      "-e", extension, "--mode", "rpc"],
    { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let tail = "", bytes = 0, stderr = "", failure = null, promptSent = false, ended = false;
    let cleanup;
    const rows = [];
    const stop = (message) => {
      if (failure) return;
      failure = message;
      child.kill();
      cleanup = setTimeout(() => {
        child.kill("SIGKILL");
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
        child.unref(); reject(new Error(message));
      }, 1000);
    };
    const deadline = setTimeout(() => stop("actual Pi health probe timeout"), 15000);
    child.on("error", () => { clearTimeout(deadline); reject(new Error("actual Pi spawn failed")); });
    child.stdin.on("error", () => stop("actual Pi stdin failure"));
    child.stderr.on("data", (block) => {
      bytes += block.length;
      if (bytes > 1024 * 1024) stop("actual Pi output over budget");
      else stderr += block.toString("utf8");
    });
    child.stdout.on("data", (block) => {
      bytes += block.length;
      if (bytes > 1024 * 1024) { stop("actual Pi output over budget"); return; }
      tail += block.toString("utf8");
      const lines = tail.split(/\r?\n/); tail = lines.pop();
      for (const line of lines.filter((value) => value.trim())) {
        let row;
        try { row = JSON.parse(line); } catch { stop("non-JSON actual Pi response"); return; }
        rows.push(row);
        if (!promptSent && row.id === "inventory" && row.success === true
            && row.data?.commands?.some((command) => command.name === "roblox:health")) {
          promptSent = true;
          child.stdin.write(JSON.stringify({ type: "prompt", id: "health", message: "/roblox:health" }) + "\n");
        }
        const prompt = rows.find((value) => value.id === "health" && value.type === "response");
        const notify = rows.find((value) => value.type === "extension_ui_request" && value.method === "notify"
          && value.message?.includes("Cache freshness: not synced"));
        if (prompt && prompt.success !== true) { stop("actual Pi health rejected"); return; }
        if (!ended && prompt?.success === true && prompt.data?.disposition === "handled" && notify) {
          ended = true; child.stdin.end();
        }
      }
    });
    child.on("close", (code) => {
      clearTimeout(deadline); clearTimeout(cleanup);
      if (failure || code !== 0 || stderr.trim() || tail.trim() || !ended) {
        reject(new Error(failure || `actual Pi incomplete/nonzero response: exit=${code}, stderr=${stderr.slice(-500)}`));
      } else resolve(rows);
    });
    child.stdin.write(JSON.stringify({ type: "get_commands", id: "inventory" }) + "\n");
  });
}

test("actual installed Pi handles missing-cache health and clean reload without inference", { timeout: 35000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "pi-roblox-health-"));
  const env = { ...process.env, PI_CODING_AGENT_DIR: join(temp, "agent"), PI_ROBLOX_DOCS_CACHE_DIR: join(temp, "cache") };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const rows = await realHealth(env);
      const notification = rows.find((row) => row.method === "notify" && row.message?.includes("Cache freshness: not synced"));
      assert.equal(notification.notifyType, "warning");
      assert.match(notification.message, /Recommendation: run roblox_sync before searching\./);
      assert.ok(rows.some((row) => row.id === "health" && row.success && row.data?.disposition === "handled"));
      assert.ok(!rows.some((row) => ["agent_start", "message_start", "tool_execution_start"].includes(row.type)),
        "health must be handled by the actual extension without model/tool execution");
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
