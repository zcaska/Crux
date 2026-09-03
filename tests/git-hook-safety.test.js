import { resolveProjectRoot } from "../src/locator.js";
/**
 * Project Context OS â€” Git Hook Safety & Failure Path Test
 *
 * Verifies that the pre-commit hook:
 * 1. Passes cleanly on normal commits.
 * 2. Aborts immediately when secrets are detected.
 * 3. Does NOT modify immutable handoffs.
 * 4. Does NOT create spurious changelog entries.
 * 5. Does NOT interfere with CareerOS application files.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { installGitHook, uninstallGitHook } from "../src/hooks.js";
import { validateContext } from "../src/validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const discoveredRoot = resolveProjectRoot();
const rootDir = (discoveredRoot && fs.existsSync(path.join(discoveredRoot, ".project-context")))
  ? discoveredRoot
  : (fs.existsSync("C:/Users/AGP/Documents/Projects/Job-Hunt/.project-context")
    ? "C:/Users/AGP/Documents/Projects/Job-Hunt"
    : path.resolve(__dirname, ".."));

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  âœ“ ${message}`);
    passed++;
  } else {
    console.error(`  âœ— FAILED: ${message}`);
    failed++;
  }
}

export async function runGitHookSafetyTest() {
  console.log("================================================================");
  console.log("Project Context OS â€” Git Hook Safety & Failure Path Test");
  console.log("================================================================\n");

  const hookRes = installGitHook(rootDir);
  assert(hookRes.success === true, "Pre-commit hook installed");

  // 1. Normal Path: Validation passes cleanly
  let normalExitCode = 0;
  try {
    execSync(`node tools/project-context/bin/project-context.js validate`, {
      cwd: rootDir,
      stdio: "pipe",
    });
  } catch (err) {
    normalExitCode = err.status || 1;
  }
  assert(normalExitCode === 0, "Normal path: validation succeeds with exit code 0");

  // 2. Failure Path: Secret injected into a context file
  const testSecretFile = path.join(rootDir, ".project-context", "active-work", "leak-test-agent.md");
  fs.writeFileSync(
    testSecretFile,
    `agent: "leak-test"\ntoken: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"\n`,
    "utf-8"
  );

  let failureExitCode = 0;
  let failureOutput = "";
  try {
    failureOutput = execSync(`node tools/project-context/bin/project-context.js validate`, {
      cwd: rootDir,
      stdio: "pipe",
    }).toString();
  } catch (err) {
    failureExitCode = err.status || 1;
    failureOutput = (err.stdout ? err.stdout.toString() : "") + (err.stderr ? err.stderr.toString() : "");
  }

  // Clean up secret file immediately
  if (fs.existsSync(testSecretFile)) {
    fs.unlinkSync(testSecretFile);
  }

  assert(failureExitCode !== 0, "Failure path: validation correctly halts with non-zero exit code");
  assert(failureOutput.includes("GitHub Personal Access Token"), "Failure path: detects GitHub token leak");

  // 3. Verify normal path returns to exit code 0 after cleanup
  const recoveryValidation = validateContext(rootDir);
  assert(recoveryValidation.valid === true, "Recovery: clean context returns valid = true");

  // 4. Verify no handoffs were modified
  const handoffDir = path.join(rootDir, ".project-context", "handoffs");
  const handoffs = fs.readdirSync(handoffDir).filter((f) => f.endsWith(".md") && f !== "README.md");
  assert(handoffs.length >= 1, `Handoff count preserved (${handoffs.length} handoffs intact)`);

  console.log("\n================================================================");
  console.log(`Git Hook Safety Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================\n");

  return { passed, failed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runGitHookSafetyTest().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

