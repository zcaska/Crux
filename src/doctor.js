/**
 * Project Context OS — Diagnostic & Doctor Engine
 *
 * Runs comprehensive environmental and integrity diagnostics to verify that
 * Project Context OS is correctly installed, configured, and operational in any repository.
 */

import fs from "node:fs";
import path from "node:path";
import { getContextDir, readFileSafe } from "./core.js";
import { readProjectConfig } from "./config.js";
import { validateContext } from "./validator.js";
import { assessContextQuality } from "./quality.js";
import { checkInvariants } from "./invariants.js";
import { getGitStatus } from "./git.js";

/**
 * Runs complete Project Context OS diagnostics.
 * @param {string} rootDir
 * @returns {{ healthy: boolean, score: number, checks: Array<{ name: string, passed: boolean, message: string, suggestion?: string }> }}
 */
export function runDoctor(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const contextDir = getContextDir(resolvedRoot);
  const checks = [];

  // 1. Root Directory Accessibility
  try {
    fs.accessSync(resolvedRoot, fs.constants.R_OK | fs.constants.W_OK);
    checks.push({
      name: "Project Root Access",
      passed: true,
      message: `Root directory accessible and writable: '${resolvedRoot}'`,
    });
  } catch (e) {
    checks.push({
      name: "Project Root Access",
      passed: false,
      message: `Cannot write to root directory '${resolvedRoot}': ${e.message}`,
      suggestion: "Check filesystem permissions for the repository root.",
    });
  }

  // 2. Context Directory Check
  const hasContextDir = fs.existsSync(contextDir) && fs.statSync(contextDir).isDirectory();
  checks.push({
    name: "Context Directory (.project-context)",
    passed: hasContextDir,
    message: hasContextDir
      ? "Context directory exists and is accessible."
      : "Context directory (.project-context) is missing.",
    suggestion: hasContextDir ? undefined : "Run 'project-context init' to scaffold the context store.",
  });

  // 3. Project Identity & Configuration
  const cfg = readProjectConfig(resolvedRoot);
  const hasValidConfig = Boolean(cfg && cfg.project_name && cfg.schema_version);
  checks.push({
    name: "Project Identity & Config",
    passed: hasValidConfig,
    message: hasValidConfig
      ? `Project '${cfg.project_name}' configured (Schema v${cfg.schema_version})`
      : "config.json is missing or corrupted.",
    suggestion: hasValidConfig ? undefined : "Run 'project-context init' to generate config.json.",
  });

  // 4. Git Repository Integration
  const gitDir = path.join(resolvedRoot, ".git");
  const hasGit = fs.existsSync(gitDir);
  let gitWorking = false;
  if (hasGit) {
    try {
      const gitStat = getGitStatus(resolvedRoot);
      gitWorking = Array.isArray(gitStat.staged);
    } catch {
      gitWorking = false;
    }
  }
  checks.push({
    name: "Git Integration",
    passed: hasGit ? gitWorking : true, // Non-fatal if git is not initialized yet
    message: hasGit
      ? (gitWorking ? "Git repository active and working tree is readable." : "Git repository working tree is unreadable.")
      : "Git not initialized (Non-fatal, optional for bare directories).",
    suggestion: hasGit ? undefined : "Initialize git via 'git init' to enable Git-aware drift detection.",
  });

  // 5. MCP Discovery Configuration
  const mcpJson = path.join(resolvedRoot, ".vscode", "mcp.json");
  const hasMcpConfig = fs.existsSync(mcpJson);
  checks.push({
    name: "MCP Client Discovery",
    passed: hasMcpConfig,
    message: hasMcpConfig
      ? "MCP configuration found in .vscode/mcp.json."
      : "No MCP discovery file found in .vscode/mcp.json.",
    suggestion: hasMcpConfig ? undefined : "Run 'project-context init' to create .vscode/mcp.json.",
  });

  // 6. Context Integrity & Secret Audit
  const validation = validateContext(resolvedRoot);
  checks.push({
    name: "Context Schema & Security Audit",
    passed: validation.valid,
    message: validation.valid
      ? "All canonical schemas valid and zero secrets detected."
      : `Found ${validation.errors.length} validation errors.`,
    suggestion: validation.valid ? undefined : validation.errors.join("; "),
  });

  // 7. Architectural Invariants
  const invariants = checkInvariants(resolvedRoot);
  checks.push({
    name: "Architectural Invariants",
    passed: invariants.passed,
    message: invariants.passed
      ? "All core and project architectural invariants passed."
      : `Found ${invariants.violations.length} invariant violations.`,
    suggestion: invariants.passed ? undefined : invariants.violations.map((v) => v.message).join("; "),
  });

  // 8. Overall Context Quality
  const quality = assessContextQuality(resolvedRoot);
  checks.push({
    name: "Context Health Score",
    passed: quality.health_score >= 80,
    message: `Context Health: ${quality.health_score}% (Grade: ${quality.grade})`,
    suggestion: quality.health_score >= 80 ? undefined : "Review high-priority attention items via 'project-context attention'.",
  });

  const allPassed = checks.every((c) => c.passed);

  return {
    healthy: allPassed,
    score: quality.health_score,
    grade: quality.grade,
    project: {
      name: cfg.project_name,
      root: resolvedRoot,
    },
    checks,
  };
}
