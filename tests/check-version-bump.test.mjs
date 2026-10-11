import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const checkerPath = fileURLToPath(new URL("../scripts/check-version-bump.mjs", import.meta.url));

async function createFixtureRepo(t) {
  const cwd = await mkdtemp(join(tmpdir(), "check-version-bump-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  const packageJson = {
    name: "fixture",
    version: "0.3.18",
    files: ["extensions/"],
    devDependencies: { "test-tool": "^1.0.0" },
  };

  git("init", "--quiet");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Version guard test");
  await writeFile(join(cwd, "package.json"), JSON.stringify(packageJson, null, 2));
  await writeFile(join(cwd, "package-lock.json"), JSON.stringify({ packages: { "": packageJson } }));
  git("add", "package.json", "package-lock.json");
  git("commit", "--quiet", "-m", "base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  return { cwd, git, packageJson };
}

function runVersionCheck(cwd) {
  return spawnSync(process.execPath, [checkerPath], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, BASE_REF: "origin/main" },
  });
}

test("devDependency-only package changes do not require a package release", async (t) => {
  const { cwd, git, packageJson } = await createFixtureRepo(t);
  packageJson.devDependencies["test-tool"] = "^1.1.0";
  await writeFile(join(cwd, "package.json"), JSON.stringify(packageJson, null, 2));
  await writeFile(
    join(cwd, "package-lock.json"),
    JSON.stringify({ packages: { "": packageJson } }),
  );
  git("add", "package.json", "package-lock.json");
  git("commit", "--quiet", "-m", "dev dependency update");

  const result = runVersionCheck(cwd);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /no publishable paths changed/);
});

test("runtime package changes still require a version bump", async (t) => {
  const { cwd, git } = await createFixtureRepo(t);
  await mkdir(join(cwd, "extensions"));
  await writeFile(join(cwd, "extensions", "feature.js"), "export {};\n");
  git("add", "extensions/feature.js");
  git("commit", "--quiet", "-m", "runtime change");

  const result = runVersionCheck(cwd);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /package\.json version did not increase/);
});
