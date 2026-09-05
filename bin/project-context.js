#!/usr/bin/env node
/**
 * Project Context OS — Local CLI Runner (Phase 2)
 *
 * Vendor-neutral, offline-first command line interface for querying, updating,
 * and automating the repository's persistent context and agent sessions.
 *
 * Usage:
 *   project-context bootstrap [--agent <name>] [--json]
 *   project-context state [--json]
 *   project-context active-work [--json]
 *   project-context session-start --agent <name> [--task <id>] [--objective <obj>]
 *   project-context session-heartbeat --agent <name> [--progress <text>]
 *   project-context session-end --agent <name> [--to <agent>] [--next <action>]
 *   project-context sessions [--json]
 *   project-context check-consistency [--json]
 *   project-context recover [--agent <name>] [--new-agent <name>] [--action <INSPECT|ADOPT|ARCHIVE>]
 *   project-context install-hooks
 *   project-context uninstall-hooks
 *   project-context init-client [kilo|claude|cursor|all]
 *   project-context tasks [status] [--json]
 *   project-context decisions [--json]
 *   project-context changes [limit] [--json]
 *   project-context handoffs [limit] [--json]
 *   project-context recent [--json]
 *   project-context search <query> [--json]
 *   project-context git-status [--json]
 *   project-context git-diff [--staged]
 *   project-context snapshot [--json]
 *   project-context validate [--json]
 *   project-context handoff [--to <agent>] [--task <task>] [--next <action>]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readState,
  readActiveWork,
  readTasks,
  readDecisions,
  readChangelog,
  recordChange,
  readHandoffs,
  createHandoff,
  searchProjectContext,
  recompileActiveWork,
} from "../src/core.js";
import { getGitStatus, getGitDiff, getGitRecentCommits } from "../src/git.js";
import { getContextSnapshot, formatSnapshotMarkdown } from "../src/snapshot.js";
import { validateContext } from "../src/validator.js";
import { startSession, heartbeatSession, listSessions, checkWorkingAreaCollisions } from "../src/session.js";
import { checkConsistency } from "../src/consistency.js";
import { assistedSessionEnd, recoverSession } from "../src/lifecycle.js";
import { getAgentBootstrap, formatBootstrapMarkdown } from "../src/bootstrap.js";
import { installGitHook, uninstallGitHook } from "../src/hooks.js";
import { assessContextQuality } from "../src/quality.js";
import { getRelevantContext } from "../src/relevance.js";
import { checkContextDrift } from "../src/drift.js";
import { checkInvariants } from "../src/invariants.js";
import { resolveProjectRoot, assertWithinProject } from "../src/locator.js";
import { initProjectContext } from "../src/init.js";
import { runDoctor, getProjectDiagnostics } from "../src/doctor.js";
import { syncProjectContext, getLocalSyncState, assembleRemoteContextPayload } from "../src/sync.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRoot = path.resolve(__dirname, "../../..");

// Helper to parse CLI flags
function parseArgs(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags[arg.slice(2)] = args[++i];
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      flags._.push(arg);
    }
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));
const command = flags._[0] || "help";
const isJson = Boolean(flags.json);

// Dynamically resolve repository root using flags.root, env var, or upward discovery
const rootDir = resolveProjectRoot(process.cwd(), flags.root || null);

function output(data, textFallback) {
  if (isJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(typeof textFallback === "function" ? textFallback() : textFallback);
  }
}

async function run() {
  try {
    switch (command) {
      // ───────────────────────────────────────────────────────────────────────
      // PHASE 6 REMOTE SYNCHRONIZATION COMMANDS
      // ───────────────────────────────────────────────────────────────────────

      case "sync": {
        const force = Boolean(flags.force);
        const dryRun = Boolean(flags["dry-run"] || flags.dryRun);
        const accountId = flags.account || flags["account-id"] || process.env.CRUX_ACCOUNT_ID;
        const res = await syncProjectContext(rootDir, { force, dryRun, accountId });
        output(res, () => {
          let out = `=== Project Context OS Remote Synchronization ===\n`;
          out += `Project: ${res.project_id} (Version: ${res.sync_version ? res.sync_version.slice(0, 8) : "none"})\n`;
          out += `Status: ${res.status}\n`;
          out += `Message: ${res.message}\n`;
          if (res.synchronized_at) {
            out += `Timestamp: ${res.synchronized_at}\n`;
          }
          if (res.error) {
            out += `Error: ${res.error}\n`;
          }
          return out;
        });
        if (res.status === "FAILED") {
          process.exitCode = 1;
        }
        break;
      }

      case "sync-status": {
        const status = getLocalSyncState(rootDir);
        output(status, () => {
          let out = `=== Project Context OS Sync Status ===\n`;
          out += `Status: ${status.status}\n`;
          out += `Sync Version: ${status.sync_version ? status.sync_version.slice(0, 8) : "none"}\n`;
          out += `Last Synced: ${status.last_synced_at || "never"}\n`;
          if (status.error) {
            out += `Last Error: ${status.error}\n`;
          }
          return out;
        });
        break;
      }

      // ───────────────────────────────────────────────────────────────────────
      // PHASE 4 UNIVERSALIZATION & LIFECYCLE COMMANDS
      // ───────────────────────────────────────────────────────────────────────

      case "init": {
        const name = flags.name || flags._[1];
        const desc = flags.description;
        const mode = flags.mode || (flags.adopt ? "adopt" : (flags.create ? "create" : "auto"));
        const res = initProjectContext(rootDir, { name, description: desc, force: Boolean(flags.force), mode });
        output(res, () => {
          let out = `=== Project Context OS Initialization ===\n`;
          out += `Project: ${res.project.name} (${res.project.id})\nRoot: ${res.project.root}\n`;
          out += `Lifecycle State: ${res.lifecycleState} (Mode: ${res.modeRequested})\n\n`;
          if (res.createdFiles.length > 0) {
            out += `Created ${res.createdFiles.length} file(s):\n`;
            res.createdFiles.forEach((f) => { out += `  + ${f}\n`; });
            out += "\n";
          }
          if (res.preservedFiles.length > 0) {
            out += `Preserved ${res.preservedFiles.length} existing file(s) (Idempotent):\n`;
            res.preservedFiles.forEach((f) => { out += `  = ${f}\n`; });
            out += "\n";
          }
          out += `✓ Initialization complete. Context is ready.\n`;
          return out;
        });
        break;
      }

      case "doctor": {
        const doc = runDoctor(rootDir);
        output(doc, () => {
          let out = `=== Project Context OS Doctor Diagnostics ===\n`;
          out += `Project: ${doc.project.name} | Health Score: ${doc.score}% (Grade: ${doc.grade})\n\n`;
          for (const chk of doc.checks) {
            const mark = chk.passed ? "✓" : "✗";
            out += `${mark} [${chk.name}]: ${chk.message}\n`;
            if (!chk.passed && chk.suggestion) {
              out += `  -> Suggestion: ${chk.suggestion}\n`;
            }
          }
          out += doc.healthy
            ? `\n✓ All diagnostic checks PASSED. Context OS is fully healthy.\n`
            : `\n✗ Some diagnostic checks failed. Address the suggestions above.\n`;
          return out;
        });
        if (!doc.healthy) process.exitCode = 1;
        break;
      }

      case "diagnostics": {
        const diag = getProjectDiagnostics(rootDir);
        const outputPath = flags.output;
        if (outputPath) {
          const resolvedOut = path.resolve(rootDir, outputPath);
          assertWithinProject(resolvedOut, rootDir);
          if (fs.existsSync(resolvedOut) && !flags.force) {
            throw new Error(`Output file already exists at '${resolvedOut}'. Use --force to overwrite.`);
          }
          fs.writeFileSync(resolvedOut, JSON.stringify(diag, null, 2) + "\n", "utf-8");
        }

        output(diag, () => {
          let out = `=== Project Context OS — Unified Diagnostics ===\n`;
          out += `Project: ${diag.project.name} (${diag.project.id})\n`;
          out += `Root: ${diag.project.root}\n`;
          out += `Lifecycle: ${diag.lifecycle.state} (Valid: ${diag.lifecycle.is_valid})\n`;
          out += `Health: ${diag.health.score}% [Grade: ${diag.health.grade}] (Healthy: ${diag.health.healthy})\n`;
          out += `Sessions: ${diag.sessions.total} total (${diag.sessions.active_count} active, ${diag.sessions.stale_count} stale, ${diag.sessions.completed_count} completed)\n`;
          out += `Collisions: ${diag.sessions.collisions.count} detected (Has collisions: ${diag.sessions.collisions.has_collisions})\n`;
          out += `Structural (Graphify): ${diag.structural.state} (${diag.structural.nodes_count} nodes, ${diag.structural.edges_count} edges, stale: ${diag.structural.is_stale})\n`;
          out += `Git: ${diag.git.branch} (Clean: ${diag.git.is_clean}, ${diag.git.staged_count} staged, ${diag.git.unstaged_count} unstaged, ${diag.git.untracked_count} untracked)\n`;
          out += `Consistency: ${diag.consistency.is_consistent ? "CONSISTENT" : "INCONSISTENT"} (${diag.consistency.errors_count} errors, ${diag.consistency.warnings_count} warnings, ${diag.consistency.info_count} info)\n`;
          out += `Reconciliation Recommended: ${diag.reconciliation.reconcile_recommended ? "YES" : "NO"}\n`;
          if (diag.reconciliation.reasons.length > 0) {
            out += `  Reasons:\n`;
            diag.reconciliation.reasons.forEach((r) => { out += `    - ${r}\n`; });
          }
          if (outputPath) {
            out += `\n✓ Diagnostics written to '${outputPath}'\n`;
          }
          return out;
        });
        break;
      }

      case "init-client": {
        const clientType = flags._[1] || "vscode";
        const res = initProjectContext(rootDir, {});
        output({ client: clientType, mcpConfigPath: path.join(rootDir, ".vscode", "mcp.json") }, () => {
          return `✓ Client configuration initialized for '${clientType}' in .vscode/mcp.json\n`;
        });
        break;
      }

      case "mcp": {
        const { createProjectContextMcpServer } = await import("../src/mcp-server.js");
        const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
        const server = createProjectContextMcpServer(rootDir);
        const transport = new StdioServerTransport();
        await server.connect(transport);
        break;
      }

      // ───────────────────────────────────────────────────────────────────────
      // PHASE 2 COMMANDS
      // ───────────────────────────────────────────────────────────────────────

      case "bootstrap": {
        const agent = flags.agent || flags._[1] || "unspecified";
        const taskId = flags.task || flags.task_id;
        const query = flags.query;
        const bootstrap = getAgentBootstrap(rootDir, { agent, task_id: taskId, query });
        output(bootstrap, () => formatBootstrapMarkdown(bootstrap));
        break;
      }

      // ───────────────────────────────────────────────────────────────────────
      // PHASE 3 COMMANDS
      // ───────────────────────────────────────────────────────────────────────

      case "health": {
        const health = assessContextQuality(rootDir);
        output(health, () => {
          let out = `=== Project Context OS Quality & Health Assessment ===\n`;
          out += `Overall Health Score: ${health.health_score}% (Grade: ${health.grade})\n\n`;
          out += `Pillar Breakdown:\n`;
          out += `  - Freshness:     ${health.summary.freshness}%\n`;
          out += `  - Completeness:  ${health.summary.completeness}%\n`;
          out += `  - Consistency:   ${health.summary.consistency}%\n`;
          out += `  - Integrity:     ${health.summary.integrity}%\n`;
          out += `  - Activity:      ${health.summary.activity}%\n`;
          out += `  - Recoverability: ${health.summary.recoverability}%\n\n`;
          out += `Active Sessions: ${health.metrics.active_sessions} | Tasks: ${health.metrics.total_tasks} | Git Modified: ${health.metrics.git_modified_files}\n`;
          if (health.issues.length > 0) {
            out += `\nIdentified Issues (${health.issues.length}):\n`;
            for (const iss of health.issues) {
              out += `  [${iss.severity}] (${iss.pillar}) ${iss.code}: ${iss.message}\n`;
              out += `    -> Suggestion: ${iss.suggestion}\n`;
            }
          } else {
            out += `\n✓ Zero quality issues detected. All context pillars optimal.\n`;
          }
          return out;
        });
        break;
      }

      case "drift": {
        const drift = checkContextDrift(rootDir);
        output(drift, () => {
          let out = `=== Git ↔ Context Semantic Drift Audit ===\n`;
          out += `Has Drift: ${drift.hasDrift ? "YES (Discrepancies detected)" : "NO (Clean alignment)"}\n\n`;
          if (drift.untracked_modifications.length > 0) {
            out += `Untracked Working Tree Modifications (${drift.untracked_modifications.length}):\n`;
            for (const mod of drift.untracked_modifications) {
              out += `  - ${mod.path} ${mod.staged ? "[staged]" : "[unstaged]"}${mod.suggested_task ? ` -> Suggested Task: ${mod.suggested_task}` : ""}\n`;
            }
            out += "\n";
          }
          if (drift.stale_completed_tasks.length > 0) {
            out += `Completed Tasks with Lingering Modifications:\n`;
            for (const st of drift.stale_completed_tasks) {
              out += `  - ${st.id} (${st.title}): ${st.lingering_files.join(", ")}\n`;
            }
            out += "\n";
          }
          if (drift.missing_context_files.length > 0) {
            out += `Context Pointers Missing on Disk:\n`;
            for (const mf of drift.missing_context_files) {
              out += `  - ${mf.referenced_path} (from ${mf.context_source})\n`;
            }
            out += "\n";
          }
          if (drift.drift_items.length > 0) {
            out += `Actionable Drift Warnings:\n`;
            for (const di of drift.drift_items) {
              out += `  [${di.severity}] ${di.code}: ${di.message}\n    -> ${di.suggestion}\n`;
            }
          }
          return out;
        });
        break;
      }

      case "relevance": {
        const target = flags.task || flags.task_id || flags._[1] || "";
        const isTaskId = /^TASK-\d+$/i.test(target);
        const rel = getRelevantContext(rootDir, {
          task_id: isTaskId ? target.toUpperCase() : undefined,
          query: !isTaskId ? target : undefined,
        });
        output(rel, () => {
          let out = `=== Deterministic Context Relevance Analysis ===\n`;
          out += `Query Context: ${JSON.stringify(rel.query_context)}\n\n`;
          if (rel.suggested_files.length > 0) {
            out += `Candidate Files to Touch / Inspect:\n`;
            for (const f of rel.suggested_files) {
              out += `  - ${f}\n`;
            }
            out += "\n";
          }
          if (rel.relevant_decisions.length > 0) {
            out += `Relevant Architectural Decisions (ADRs):\n`;
            for (const d of rel.relevant_decisions) {
              out += `  - [Score: ${d.score}] ${d.id}: ${d.title} (${d.reason})\n`;
            }
            out += "\n";
          }
          if (rel.relevant_changes.length > 0) {
            out += `Relevant Past Changes:\n`;
            for (const c of rel.relevant_changes) {
              out += `  - [Score: ${c.score}] ${c.date} (${c.task_id}): ${c.summary}\n`;
            }
            out += "\n";
          }
          return out;
        });
        break;
      }

      case "attention": {
        const quality = assessContextQuality(rootDir);
        const drift = checkContextDrift(rootDir);
        const collisions = checkWorkingAreaCollisions(rootDir);
        const invariants = checkInvariants(rootDir);

        const urgent = [];
        for (const v of invariants.violations) {
          urgent.push({ type: "INVARIANT", severity: v.severity, title: v.rule, message: v.message, action: v.suggestion });
        }
        for (const c of collisions.collisions) {
          urgent.push({ type: "COLLISION", severity: "WARNING", title: `Collision: ${c.agent_a} & ${c.agent_b}`, message: `Share path '${c.area_a}'`, action: "Coordinate task boundaries" });
        }
        for (const i of quality.issues.filter((iss) => iss.severity !== "INFO")) {
          urgent.push({ type: "QUALITY", severity: i.severity, title: i.code, message: i.message, action: i.suggestion });
        }
        for (const d of drift.drift_items.filter((di) => di.severity !== "INFO")) {
          urgent.push({ type: "DRIFT", severity: d.severity, title: d.code, message: d.message, action: d.suggestion });
        }

        output({ total: urgent.length, items: urgent }, () => {
          let out = `=== High-Priority Attention Items (${urgent.length}) ===\n`;
          if (urgent.length === 0) {
            out += `✓ No urgent issues, collisions, or invariant violations detected. Repository is in optimal health.\n`;
          } else {
            for (const item of urgent) {
              out += `[${item.severity}] (${item.type}) ${item.title}: ${item.message}\n  -> Action: ${item.action}\n\n`;
            }
          }
          return out;
        });
        break;
      }

      case "session-start": {
        const agent = flags.agent || flags._[1];
        if (!agent) {
          throw new Error("Missing required flag: --agent <name>");
        }
        const session = startSession(rootDir, {
          agent,
          interface: flags.interface || "kilo-code",
          router: flags.router || "omniroute",
          model: flags.model || "unknown",
          active_task: flags.task || flags.task_id || "NONE",
          task_title: flags.title || flags.task_title || "Active Session",
          objective: flags.objective || "Active development session.",
          working_area: flags.area ? flags.area.split(",") : [],
          next_action: flags.next || "Commence development.",
        });
        output(session, () => `✓ Session started for agent '${session.agent}' on task '${session.session.active_task}'`);
        break;
      }

      case "session-heartbeat": {
        const agent = flags.agent || flags._[1];
        if (!agent) {
          throw new Error("Missing required flag: --agent <name>");
        }
        const res = heartbeatSession(rootDir, agent, {
          progress: flags.progress,
          next_action: flags.next,
          status: flags.status,
        });
        output(res, () => `✓ Heartbeat recorded for agent '${agent}' (${res.last_activity})`);
        break;
      }

      case "session-end": {
        const agent = flags.agent || flags._[1];
        if (!agent) {
          throw new Error("Missing required flag: --agent <name>");
        }
        const res = assistedSessionEnd(rootDir, {
          agent,
          to_agent: flags.to || "any",
          task_id: flags.task,
          task_title: flags.title,
          completed_work: flags.completed ? flags.completed.split(";") : undefined,
          tests: flags.tests ? flags.tests.split(";") : undefined,
          unresolved: flags.unresolved || flags.blockers,
          next_action: flags.next || "Review handoff and continue task.",
          mark_task_completed: Boolean(flags["mark-completed"] || flags.complete),
        });
        output(res, () => `✓ Session concluded for '${agent}'. Immutable handoff created: ${res.handoff.filename}`);
        break;
      }

      case "sessions": {
        const sessions = listSessions(rootDir);
        output(sessions, () => {
          let out = `Registered Agent Sessions (${sessions.total}):\n`;
          for (const s of sessions.sessions) {
            const staleTag = s.isStale ? " [STALE]" : "";
            out += `  - ${s.agent} [${s.status}]${staleTag}: Task ${s.active_task} (${s.idleDurationHours}h idle)\n`;
          }
          return out;
        });
        break;
      }

      case "check-consistency": {
        const result = checkConsistency(rootDir);
        output(result, () => {
          let out = "=== Git ↔ Context Consistency Audit ===\n";
          if (result.isConsistent) {
            out += "✓ Git working tree reality matches Project Context OS records perfectly.\n";
          } else {
            out += `! Found ${result.summary.total_issues} consistency item(s):\n`;
            for (const issue of result.issues) {
              out += `  [${issue.severity}] ${issue.code}: ${issue.message}\n    Suggestion: ${issue.suggestion}\n`;
            }
          }
          return out;
        });
        break;
      }

      case "recover": {
        const res = recoverSession(rootDir, {
          agent: flags.agent,
          new_agent: flags["new-agent"] || flags.newAgent,
          action: flags.action || "INSPECT",
        });
        output(res, () => {
          if (res.action === "INSPECT") {
            return `Found ${res.candidate_count} session candidate(s) for recovery. Use --action ADOPT or --action ARCHIVE.`;
          }
          return `✓ Successfully recovered ${res.recovered_count} session(s) via ${res.action}.`;
        });
        break;
      }

      case "install-hooks": {
        const res = installGitHook(rootDir);
        output(res, () => `✓ ${res.message} (${res.hookPath || ""})`);
        break;
      }

      case "uninstall-hooks": {
        const res = uninstallGitHook(rootDir);
        output(res, () => `✓ ${res.message}`);
        break;
      }

      case "init-client": {
        const target = flags._[1] || "all";
        const templatesDir = path.join(__dirname, "../templates");
        const templates = {
          kilo: path.join(templatesDir, "kilo-mcp.json"),
          claude: path.join(templatesDir, "claude-desktop-mcp.json"),
          cursor: path.join(templatesDir, "cursor-mcp.json"),
        };

        if (target === "all") {
          console.log("=== MCP Client Configuration Templates ===");
          for (const [name, p] of Object.entries(templates)) {
            console.log(`\n--- ${name.toUpperCase()} Config (${p}) ---`);
            if (fs.existsSync(p)) {
              console.log(fs.readFileSync(p, "utf-8").trim());
            }
          }
        } else if (templates[target]) {
          console.log(fs.readFileSync(templates[target], "utf-8").trim());
        } else {
          console.error(`Unknown client target: ${target}. Choose from: kilo, claude, cursor, all.`);
          process.exit(1);
        }
        break;
      }

      // ───────────────────────────────────────────────────────────────────────
      // PHASE 1 COMPATIBILITY COMMANDS
      // ───────────────────────────────────────────────────────────────────────

      case "state": {
        const state = readState(rootDir);
        output(state, () => state.raw || "No STATE.md found.");
        break;
      }

      case "active-work": {
        recompileActiveWork(rootDir);
        const active = readActiveWork(rootDir);
        output(active, () => active.aggregateRaw || "No active work records found.");
        break;
      }

      case "tasks": {
        const status = flags._[1] || flags.status;
        const res = readTasks(rootDir, status);
        output(res.tasks, () => {
          if (res.tasks.length === 0) return `No tasks found${status ? ` with status ${status}` : ""}.`;
          let out = `Project Tasks (${res.tasks.length}):\n`;
          for (const t of res.tasks) {
            out += `  [${t.status}] ${t.id}: ${t.title} (${t.owner}) - Priority: ${t.priority}\n`;
          }
          return out;
        });
        break;
      }

      case "decisions": {
        const res = readDecisions(rootDir);
        output(res.decisions, () => {
          if (res.decisions.length === 0) return "No decisions recorded in DECISIONS.md.";
          let out = `Architectural Decisions (${res.decisions.length}):\n`;
          for (const d of res.decisions) {
            out += `  [${d.status}] ${d.id}: ${d.decision} (${d.date})\n`;
          }
          return out;
        });
        break;
      }

      case "changes": {
        const limit = parseInt(flags._[1] || flags.limit || "10", 10);
        const res = readChangelog(rootDir, limit);
        output(res.entries, () => {
          if (res.entries.length === 0) return "No changelog entries found.";
          let out = `Semantic Changes (last ${res.entries.length}):\n`;
          for (const e of res.entries) {
            out += `  ${e.date} [${e.task_id}]: ${e.summary}\n`;
          }
          return out;
        });
        break;
      }

      case "record-change":
      case "change": {
        const taskId = flags.task || flags["task-id"] || "TASK-GENERAL";
        const summary = flags.summary || flags._[1];
        if (!summary) {
          console.error("Error: --summary or text argument is required.");
          process.exit(1);
        }
        const files = flags.files ? flags.files.split(",").map((f) => f.trim()) : [];
        const impact = flags.impact || "Standard change.";
        const tests = flags.tests ? flags.tests.split(",").map((t) => t.trim()) : ["Manual review"];
        const agent = flags.agent || "antigravity";
        const iface = flags.interface || "kilo-code";
        const router = flags.router || "omniroute";
        const model = flags.model || "unknown";

        const res = recordChange(rootDir, {
          task_id: taskId,
          summary,
          files,
          impact,
          tests,
          agent,
          interface: iface,
          router,
          model,
        });
        output(res, () => `✓ Recorded semantic change for ${taskId}: ${summary}`);
        break;
      }

      case "handoffs": {
        const limit = parseInt(flags._[1] || flags.limit || "5", 10);
        const res = readHandoffs(rootDir, limit);
        output(res.handoffs, () => {
          if (res.handoffs.length === 0) return "No handoffs archived.";
          let out = `Archived Handoffs (${res.handoffs.length}):\n`;
          for (const h of res.handoffs) {
            out += `  ${h.timestamp} [${h.from_agent} -> ${h.to_agent}] (${h.task_id}) - ${h.filename}\n`;
          }
          return out;
        });
        break;
      }

      case "recent": {
        const gitCommits = getGitRecentCommits(rootDir, 5);
        const changelog = readChangelog(rootDir, 5);
        const data = { git_commits: gitCommits, changelog_entries: changelog.entries };
        output(data, () => {
          let out = "=== Recent Activity ===\nGit Commits:\n";
          gitCommits.forEach((c) => (out += `  ${c.hash} - ${c.message} (${c.author}, ${c.date})\n`));
          out += "\nSemantic Changes:\n";
          changelog.entries.forEach((e) => (out += `  ${e.date} [${e.task_id}]: ${e.summary}\n`));
          return out;
        });
        break;
      }

      case "search": {
        const query = flags._.slice(1).join(" ") || flags.query;
        if (!query) {
          throw new Error("Search query required: project-context search <query>");
        }
        const matches = searchProjectContext(rootDir, query);
        output(matches, () => {
          if (matches.length === 0) return `No matches found for "${query}".`;
          let out = `Search Matches (${matches.length}) for "${query}":\n`;
          for (const m of matches) {
            out += `  ${m.file}:${m.line} - ${m.preview}\n`;
          }
          return out;
        });
        break;
      }

      case "git-status": {
        const status = getGitStatus(rootDir);
        output(status, () => {
          let out = `Git Status (Branch: ${status.branch}, Clean: ${status.isClean ? "Yes" : "No"})\n`;
          if (status.staged.length > 0) {
            out += "Staged changes:\n" + status.staged.map((s) => `  ${s.status} ${s.path}`).join("\n") + "\n";
          }
          if (status.unstaged.length > 0) {
            out += "Unstaged changes:\n" + status.unstaged.map((u) => `  ${u.status} ${u.path}`).join("\n") + "\n";
          }
          if (status.untracked.length > 0) {
            out += "Untracked files:\n" + status.untracked.slice(0, 10).map((u) => `  ? ${u}`).join("\n") + "\n";
          }
          return out;
        });
        break;
      }

      case "git-diff": {
        const staged = Boolean(flags.staged);
        const filePath = flags._[1] || flags.file || "";
        const diff = getGitDiff(rootDir, staged, filePath);
        console.log(diff || "(No diff detected)");
        break;
      }

      case "snapshot": {
        const snapshot = getContextSnapshot(rootDir, {
          limit: parseInt(flags.limit || "5", 10),
        });
        output(snapshot, () => formatSnapshotMarkdown(snapshot));
        break;
      }

      case "validate": {
        const result = validateContext(rootDir);
        if (isJson) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("=== Project Context OS Integrity Validation ===");
          if (result.valid) {
            console.log("✓ All canonical files, schemas, task statuses, and secret audits PASSED.");
          } else {
            console.error(`✗ Validation FAILED with ${result.errors.length} error(s):`);
            result.errors.forEach((e) => console.error(`  - ${e}`));
          }
          if (result.warnings.length > 0) {
            console.warn(`! Warnings (${result.warnings.length}):`);
            result.warnings.forEach((w) => console.warn(`  - ${w}`));
          }
        }
        if (!result.valid) {
          process.exit(1);
        }
        break;
      }

      case "handoff": {
        const git = getGitStatus(rootDir);
        const active = readActiveWork(rootDir).agents[0] || {};
        const changedFiles = [
          ...git.staged.map((s) => s.path),
          ...git.unstaged.map((u) => u.path),
        ];

        const toAgent = flags.to || "chatgpt";
        const task = flags.task || active.task_title || "Session work";
        const nextAction = flags.next || flags.next_action || "Review changes and proceed with next task.";

        const result = createHandoff(rootDir, {
          from_agent: active.agent || "antigravity",
          interface: active.interface || "kilo-code",
          router: active.router || "omniroute",
          model: active.model || "unknown",
          to_agent: toAgent,
          task_id: active.active_task || "TASK-UNKNOWN",
          task,
          completed_work: [`Modified ${changedFiles.length} file(s) in repository`],
          files_changed: changedFiles,
          next_action: nextAction,
        });

        output(result, () => `✓ Immutable handoff created: ${result.filename} (${result.filePath})`);
        break;
      }

      case "help":
      default: {
        console.log(`
Project Context OS CLI (Phase 6 Universal)
=========================================
Remote Synchronization (Phase 6):
  sync [--force] [--dry-run] [--json]  Synchronize Crux semantic context to remote store
  sync-status [--json]                 Inspect local context synchronization status

Universalization & Lifecycle Commands:
  init [--name <name>] [--root <dir>]  Scaffold .project-context/ and client configs
  doctor [--root <dir>] [--json]       Run complete installation & health diagnostics
  mcp [--root <dir>]                   Start official Model Context Protocol (MCP) server
  init-client [vscode|cursor|claude]   Scaffold client MCP discovery config

Context Intelligence & Observability (Phase 3):
  diagnostics [--output <f>] [--json]  Unified machine-readable operational diagnostics export
  health [--json]                      Assess 6-pillar Context Health & freshness
  drift [--json]                       Audit Git ↔ Context OS semantic drift
  relevance <query/task> [--json]      Calculate task-tailored Warm Context rankings
  attention [--json]                   Surface high-priority items, collisions, alerts

Multi-Agent Lifecycle & Coordination (Phase 2):
  bootstrap [--agent <name>]           Universal agent bootstrap briefing
  session-start --agent <name>         Register and start an agent session
  session-heartbeat --agent <>         Update active session heartbeat & progress
  session-end --agent <name>           Conclude session with automated immutable handoff
  sessions [--json]                    List active and stale agent sessions
  check-consistency [--json]           Audit Git ↔ Context OS consistency
  recover [--agent <name>]             Recover orphaned, crashed, or stale sessions
  install-hooks                        Install automated safety pre-commit Git hook
  uninstall-hooks                      Uninstall safety Git hook

Core Context Commands:
  state [--json]                       Authoritative project snapshot
  active-work [--json]                 Aggregated active work across agents
  tasks [status] [--json]              Task board (e.g. tasks IN_PROGRESS)
  decisions [--json]                   Architectural Decision Records (ADRs)
  changes [limit] [--json]             Semantic changelog entries
  handoffs [limit] [--json]            Archived agent handoffs
  recent [--json]                      Recent Git commits & semantic changes
  search <query> [--json]              Full-text search in .project-context/
  git-status [--json]                  Working tree status
  git-diff [--staged]                  Git diff output
  snapshot [--json]                    Synthesized Hot Context bootstrap snapshot
  validate [--json]                    Integrity validator & secret scanner
  handoff [--to <agent>]               Create immutable draft handoff

Global Flags:
  --root <path>                        Target project repository root
  --json                               Output formatted JSON
`);
        break;
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

run();
