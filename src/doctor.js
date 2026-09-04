/**
 * Project Context OS — Diagnostic & Doctor Engine
 *
 * Runs comprehensive environmental and integrity diagnostics to verify that
 * Project Context OS is correctly installed, configured, and operational in any repository.
 */

import fs from "node:fs";
import path from "node:path";
import { getContextDir, readFileSafe } from "./core.js";
import { readProjectConfig, getProjectIdentity } from "./config.js";
import { validateContext } from "./validator.js";
import { assessContextQuality } from "./quality.js";
import { checkInvariants } from "./invariants.js";
import { getGitStatus, getGitRecentCommits } from "./git.js";
import { getGraphifyStatus } from "./graphify.js";
import { checkConsistency } from "./consistency.js";
import { assertWithinProject } from "./locator.js";
import { assertNoSecrets } from "./security.js";
import { listSessions, checkWorkingAreaCollisions } from "./session.js";
import { inspectContextLifecycle } from "./init.js";

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

  // 9. Graphify Structural Source of Truth (Optional External Integration)
  const graphifyStatus = getGraphifyStatus(resolvedRoot);
  const isGraphifyHealthy = graphifyStatus.state !== "INVALID";
  checks.push({
    name: "Graphify Structural Integration",
    passed: isGraphifyHealthy,
    message: `Graphify State: ${graphifyStatus.state}${graphifyStatus.state === "AVAILABLE" ? ` (${graphifyStatus.nodesCount} nodes, ${graphifyStatus.edgesCount} edges)` : ""}${graphifyStatus.error ? `: ${graphifyStatus.error}` : ""}`,
    suggestion: graphifyStatus.state === "INVALID"
      ? "graphify-out/graph.json is corrupted. Re-run 'graphify update .' or remove corrupted files."
      : graphifyStatus.state === "STALE"
        ? "Graphify is stale relative to recent commits. Run 'graphify update .' to refresh code relationships."
        : undefined,
  });

  // 10. Context Consistency Audit (Git <-> Semantic <-> Structural Alignment)
  const consistency = checkConsistency(resolvedRoot);
  checks.push({
    name: "Context Consistency Audit",
    passed: !consistency.hasErrors,
    message: consistency.isConsistent
      ? "Zero consistency conflicts between Git, semantic context, and structural state."
      : `Found ${consistency.summary.errors} errors, ${consistency.summary.warnings} warnings, and ${consistency.summary.info} notes.`,
    suggestion: consistency.hasErrors || consistency.hasWarnings
      ? consistency.issues.map((i) => `[${i.severity}] ${i.message}`).slice(0, 3).join("; ")
      : undefined,
  });

  const allPassed = checks.every((c) => c.passed);

  return {
    healthy: allPassed,
    score: quality.health_score,
    grade: quality.grade,
    graphifyState: graphifyStatus.state,
    project: {
      name: cfg.project_name,
      root: resolvedRoot,
    },
    checks,
  };
}

/**
 * Returns a unified, consolidated, machine-readable operational diagnostic record
 * for the project repository adhering to the Phase 5F specification.
 *
 * @param {string} rootDir - Project repository root
 * @param {object} [options={}]
 * @returns {object} ProjectDiagnosticsRecord
 */
export function getProjectDiagnostics(rootDir, options = {}) {
  const resolvedRoot = assertWithinProject(path.resolve(rootDir), path.resolve(rootDir));
  const identity = getProjectIdentity(resolvedRoot);
  const lifecycle = inspectContextLifecycle(resolvedRoot);
  const quality = assessContextQuality(resolvedRoot);
  const sessionInfo = listSessions(resolvedRoot);
  const collisionsInfo = checkWorkingAreaCollisions(resolvedRoot);
  const structuralStatus = getGraphifyStatus(resolvedRoot);
  const gitStatus = getGitStatus(resolvedRoot);
  const recentCommits = getGitRecentCommits(resolvedRoot, 1);
  const consistencyInfo = checkConsistency(resolvedRoot);

  // Determine reconciliation necessity
  const reconcileReasons = [];
  if (lifecycle.state !== "EXISTING") {
    reconcileReasons.push(`Context store lifecycle state is '${lifecycle.state}'`);
  }
  if (lifecycle.missingCanonicalFiles && lifecycle.missingCanonicalFiles.length > 0) {
    reconcileReasons.push(`Missing canonical files: ${lifecycle.missingCanonicalFiles.join(", ")}`);
  }
  if (consistencyInfo.hasErrors) {
    reconcileReasons.push(`Context consistency audit found ${consistencyInfo.summary.errors} error-level violations`);
  }

  // Bounded collections to prevent unbounded serialization
  const boundedIssues = (consistencyInfo.issues || []).slice(0, 25).map((iss) => ({
    code: iss.code,
    severity: iss.severity,
    message: iss.message,
    suggestion: iss.suggestion,
  }));

  const boundedCollisions = (collisionsInfo.collisions || []).slice(0, 20);

  const record = {
    _type: "ProjectDiagnosticsRecord",
    schema_version: "1.0.0",
    timestamp: new Date().toISOString(),
    project: {
      id: identity.id,
      name: identity.name,
      root: resolvedRoot,
    },
    lifecycle: {
      state: lifecycle.state,
      is_valid: lifecycle.state === "EXISTING",
      missing_files: (lifecycle.missingCanonicalFiles || []).slice(0, 15),
      missing_directories: (lifecycle.missingDirectories || []).slice(0, 10),
    },
    health: {
      score: quality.health_score,
      grade: quality.grade,
      healthy: quality.health_score >= 80,
      pillars: {
        freshness: quality.pillars?.freshness?.score ?? 100,
        completeness: quality.pillars?.completeness?.score ?? 100,
        consistency: quality.pillars?.consistency?.score ?? 100,
        integrity: quality.pillars?.integrity?.score ?? 100,
        recoverability: quality.pillars?.recoverability?.score ?? 100,
      },
    },
    sessions: {
      total: sessionInfo.total,
      active_count: sessionInfo.active_count,
      stale_count: sessionInfo.stale_count,
      completed_count: sessionInfo.completed_count,
      collisions: {
        has_collisions: collisionsInfo.hasCollisions,
        count: collisionsInfo.count,
        items: boundedCollisions,
      },
    },
    structural: {
      source: "graphify",
      state: structuralStatus.state,
      is_stale: structuralStatus.isStale || structuralStatus.state === "STALE",
      nodes_count: structuralStatus.nodesCount || 0,
      edges_count: structuralStatus.edgesCount || 0,
      communities_count: structuralStatus.communitiesCount || 0,
    },
    git: {
      branch: gitStatus.branch || "unknown",
      is_clean: Boolean(gitStatus.isClean),
      staged_count: (gitStatus.staged || []).length,
      unstaged_count: (gitStatus.unstaged || []).length,
      untracked_count: (gitStatus.untracked || []).length,
      recent_commit: recentCommits.length > 0 ? recentCommits[0].hash : undefined,
    },
    consistency: {
      is_consistent: consistencyInfo.isConsistent,
      errors_count: consistencyInfo.summary?.errors ?? 0,
      warnings_count: consistencyInfo.summary?.warnings ?? 0,
      info_count: consistencyInfo.summary?.info ?? 0,
      issues: boundedIssues,
    },
    reconciliation: {
      reconcile_recommended: reconcileReasons.length > 0,
      reasons: reconcileReasons,
    },
  };

  // Enforce anti-credential security audit
  assertNoSecrets(record, "getProjectDiagnostics");

  return record;
}
