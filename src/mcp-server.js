/**
 * Project Context OS — Official Model Context Protocol (MCP) Server
 *
 * Implements the standard MCP protocol using the official @modelcontextprotocol/sdk.
 * Runs locally over STDIO JSON-RPC. Exposes 11 read tools and 7 controlled write tools
 * to any MCP-compliant coding agent (Antigravity, Claude, Codex, Cursor, etc.).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  readState,
  updateState,
  readActiveWork,
  updateActiveWork,
  readTasks,
  createTask,
  updateTask,
  readDecisions,
  recordDecision,
  readChangelog,
  recordChange,
  readHandoffs,
  createHandoff,
  searchProjectContext,
  readFileSafe,
  getContextDir,
} from "./core.js";
import { getGitStatus, getGitDiff } from "./git.js";
import { getContextSnapshot } from "./snapshot.js";
import { assertNoSecrets } from "./security.js";
import { getAgentBootstrap, formatBootstrapMarkdown } from "./bootstrap.js";
import { startSession, heartbeatSession, listSessions, checkWorkingAreaCollisions } from "./session.js";
import { checkConsistency } from "./consistency.js";
import { assistedSessionEnd, recoverSession } from "./lifecycle.js";
import { assessContextQuality } from "./quality.js";
import { getRelevantContext } from "./relevance.js";
import { checkContextDrift } from "./drift.js";
import { checkInvariants } from "./invariants.js";
import { resolveProjectRoot } from "./locator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRepoRoot = resolveProjectRoot(process.cwd(), path.resolve(__dirname, "../../.."));

/**
 * Creates and configures the official MCP server instance.
 * @param {string} [repoRoot]
 */
export function createProjectContextMcpServer(repoRoot = defaultRepoRoot) {
  const server = new McpServer(
    {
      name: "project-context-os",
      version: "4.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Helper to format success tool responses
  const successResponse = (data) => ({
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  });

  // Helper to format error tool responses
  const errorResponse = (err) => ({
    isError: true,
    content: [
      {
        type: "text",
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
  });

  // ─────────────────────────────────────────────────────────────────────────
  // READ TOOLS (11)
  // ─────────────────────────────────────────────────────────────────────────

  // 1. get_project_state
  server.tool(
    "get_project_state",
    "Returns the authoritative project status snapshot from .project-context/STATE.md",
    {},
    async () => {
      try {
        const state = readState(repoRoot);
        return successResponse({
          meta: state.meta,
          raw: state.raw,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 2. get_active_work
  server.tool(
    "get_active_work",
    "Returns active agents, their isolated descriptors, and the aggregated active work summary",
    {},
    async () => {
      try {
        const active = readActiveWork(repoRoot);
        return successResponse({
          active_agents: active.agents,
          aggregate_summary: active.aggregateRaw,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 3. get_tasks
  server.tool(
    "get_tasks",
    "Returns project tasks, optionally filtered by status (BACKLOG, READY, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED)",
    {
      status: z
        .enum(["BACKLOG", "READY", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"])
        .optional()
        .describe("Optional status filter"),
    },
    async (args) => {
      try {
        const res = readTasks(repoRoot, args.status);
        return successResponse({
          count: res.tasks.length,
          tasks: res.tasks,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 4. get_recent_changes
  server.tool(
    "get_recent_changes",
    "Returns recent semantic changelog entries from .project-context/CHANGELOG.md",
    {
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of entries to return"),
    },
    async (args) => {
      try {
        const res = readChangelog(repoRoot, args.limit);
        return successResponse(res.entries);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 5. get_recent_handoffs
  server.tool(
    "get_recent_handoffs",
    "Returns recent immutable agent handoffs from .project-context/handoffs/",
    {
      limit: z.number().int().min(1).max(20).default(5).describe("Maximum number of handoffs to list"),
    },
    async (args) => {
      try {
        const res = readHandoffs(repoRoot, args.limit);
        return successResponse(res.handoffs);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 6. get_architecture
  server.tool(
    "get_architecture",
    "Returns the system architecture specification, system boundaries, and architectural invariants from ARCHITECTURE.md",
    {},
    async () => {
      try {
        const archPath = path.join(getContextDir(repoRoot), "ARCHITECTURE.md");
        const raw = readFileSafe(archPath) || "ARCHITECTURE.md not found.";
        return successResponse(raw);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 7. get_decisions
  server.tool(
    "get_decisions",
    "Returns Architectural Decision Records (ADRs) from .project-context/DECISIONS.md",
    {},
    async () => {
      try {
        const res = readDecisions(repoRoot);
        return successResponse(res.decisions);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 8. search_project_context
  server.tool(
    "search_project_context",
    "Searches across all .project-context/ files for keywords, concepts, or historical records",
    {
      query: z.string().min(1).describe("Keyword or phrase to search for"),
    },
    async (args) => {
      try {
        const results = searchProjectContext(repoRoot, args.query);
        return successResponse({
          query: args.query,
          match_count: results.length,
          matches: results,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 9. get_git_status
  server.tool(
    "get_git_status",
    "Returns Git working tree status: current branch, staged, unstaged, and untracked files",
    {},
    async () => {
      try {
        const status = getGitStatus(repoRoot);
        return successResponse(status);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 10. get_git_diff
  server.tool(
    "get_git_diff",
    "Returns Git diff output for unstaged or staged modifications",
    {
      staged: z.boolean().default(false).describe("If true, returns staged diff (--cached)"),
      file_path: z.string().optional().describe("Optional specific relative file path"),
    },
    async (args) => {
      try {
        const diff = getGitDiff(repoRoot, args.staged, args.file_path);
        // Assert no credentials before returning diff
        assertNoSecrets(diff, "get_git_diff");
        return successResponse(diff || "(No diff detected)");
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 11. get_context_snapshot (Primary Agent Bootstrap Tool)
  server.tool(
    "get_context_snapshot",
    "Primary agent bootstrap tool. Returns compact Hot Context snapshot (state, active agents, current tasks, recent changes, latest handoff, git status, and pointers to cold context)",
    {
      limit: z.number().int().min(1).max(20).default(5).describe("Max items for recent lists"),
      include_git: z.boolean().default(true).describe("Include current Git working tree status"),
      include_handoffs: z.boolean().default(true).describe("Include latest relevant handoff"),
      include_decisions: z.boolean().default(true).describe("Include recent architectural decisions"),
    },
    async (args) => {
      try {
        const snapshot = getContextSnapshot(repoRoot, args);
        return successResponse(snapshot);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // WRITE TOOLS (7)
  // ─────────────────────────────────────────────────────────────────────────

  // 1. update_project_state
  server.tool(
    "update_project_state",
    "Updates the high-level project state in .project-context/STATE.md. Enforces credential scanning and audit trails.",
    {
      current_phase: z.string().optional().describe("Updated development phase"),
      current_status: z.string().optional().describe("Status e.g. IN_PROGRESS, VERIFIED"),
      current_objective: z.string().optional().describe("Active milestone or operational objective"),
      active_work_summary: z.string().optional().describe("One-line summary of current active task"),
      agent_identity: z
        .object({
          agent: z.string(),
          interface: z.string().default("kilo-code"),
          router: z.string().default("omniroute"),
          model: z.string().default("unknown"),
        })
        .optional()
        .describe("Identity of calling agent"),
    },
    async (args) => {
      try {
        assertNoSecrets(args, "update_project_state");
        const updates = { ...args };
        delete updates.agent_identity;
        const res = updateState(repoRoot, updates, args.agent_identity);
        return successResponse({
          success: true,
          message: "Project state updated successfully.",
          timestamp: res.timestamp,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 2. update_active_work
  server.tool(
    "update_active_work",
    "Updates an individual agent's active-work descriptor in .project-context/active-work/<agent>.md and recompiles ACTIVE-WORK.md",
    {
      agent: z.string().describe("Agent name (e.g. antigravity, claude, codex)"),
      interface: z.string().default("kilo-code").describe("Interface (e.g. kilo-code, vscode, terminal)"),
      router: z.string().default("omniroute").describe("Model router used"),
      model: z.string().default("unknown").describe("Actual LLM model used"),
      active_task: z.string().describe("Task ID (e.g. TASK-001) or NONE"),
      task_title: z.string().describe("Task title"),
      status: z.enum(["READY", "IN_PROGRESS", "BLOCKED", "COMPLETED"]).default("IN_PROGRESS"),
      objective: z.string().optional().describe("Current objective of active task"),
      progress: z.string().optional().describe("Current progress description"),
      files: z.array(z.string()).optional().describe("List of files currently being modified"),
      tests: z.array(z.string()).optional().describe("List of test suites being run"),
      blockers: z.string().optional().describe("Any current blockers"),
      next_action: z.string().optional().describe("Next immediate action"),
    },
    async (args) => {
      try {
        assertNoSecrets(args, "update_active_work");
        const res = updateActiveWork(repoRoot, args);
        return successResponse({
          success: true,
          message: `Active work for agent '${args.agent}' updated and ACTIVE-WORK.md recompiled.`,
          filePath: res.filePath,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 3. create_task
  server.tool(
    "create_task",
    "Creates a new task in .project-context/TASKS.md. Auto-assigns the next TASK-XXX identifier.",
    {
      title: z.string().min(1).describe("Task title"),
      description: z.string().optional().describe("Detailed task description"),
      status: z.enum(["BACKLOG", "READY", "IN_PROGRESS", "BLOCKED"]).default("READY"),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
      owner: z.string().default("unassigned").describe("Agent or human owner"),
      dependencies: z.string().optional().describe("Comma-separated task dependencies"),
    },
    async (args) => {
      try {
        assertNoSecrets(args, "create_task");
        const res = createTask(repoRoot, args);
        return successResponse({
          success: true,
          task_id: res.id,
          title: res.title,
          status: res.status,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 4. update_task
  server.tool(
    "update_task",
    "Updates an existing task in .project-context/TASKS.md (e.g. status transition to COMPLETED)",
    {
      id: z.string().regex(/^TASK-\d+$/).describe("Task identifier e.g. TASK-001"),
      status: z.enum(["BACKLOG", "READY", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]).optional(),
    },
    async (args) => {
      try {
        assertNoSecrets(args, "update_task");
        const res = updateTask(repoRoot, args.id, { status: args.status });
        return successResponse({
          success: true,
          task_id: args.id,
          updates: res.updates,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 5. record_decision
  server.tool(
    "record_decision",
    "Appends an Architectural Decision Record (ADR) to .project-context/DECISIONS.md. Decisions are append-only.",
    {
      title: z.string().min(1).describe("Decision headline"),
      decision: z.string().min(1).describe("One-line statement of the decision"),
      context: z.string().optional().describe("Context and background situation"),
      reason: z.string().optional().describe("Rationale for this decision over alternatives"),
      alternatives: z.array(z.string()).optional().describe("Alternative options considered"),
      consequences: z.string().optional().describe("Trade-offs and architectural consequences"),
      status: z.enum(["ACCEPTED", "SUPERSEDED", "DEPRECATED"]).default("ACCEPTED"),
    },
    async (args) => {
      try {
        assertNoSecrets(args, "record_decision");
        const res = recordDecision(repoRoot, args);
        return successResponse({
          success: true,
          decision_id: res.id,
          title: res.title,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 6. record_change
  server.tool(
    "record_change",
    "Records a meaningful semantic change in .project-context/CHANGELOG.md. Do not log trivial edits.",
    {
      task_id: z.string().describe("Task ID associated with change"),
      summary: z.string().min(1).describe("Semantic description of change"),
      title: z.string().optional().describe("Short headline"),
      agent: z.string().default("antigravity").describe("Acting agent name"),
      interface: z.string().default("kilo-code"),
      router: z.string().default("omniroute"),
      model: z.string().default("unknown"),
      files: z.array(z.string()).optional().describe("Key files affected"),
      impact: z.array(z.string()).optional().describe("Architectural / behavioral impact"),
      tests: z.array(z.string()).optional().describe("Test suites executed"),
      unresolved: z.string().optional().describe("Any unresolved items"),
    },
    async (args) => {
      try {
        assertNoSecrets(args, "record_change");
        const res = recordChange(repoRoot, args);
        return successResponse({
          success: true,
          date: res.date,
          summary: res.summary,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 7. create_handoff
  server.tool(
    "create_handoff",
    "Creates a permanent, immutable agent handoff record in .project-context/handoffs/.",
    {
      from_agent: z.string().default("antigravity").describe("Source agent name"),
      interface: z.string().default("kilo-code"),
      router: z.string().default("omniroute"),
      model: z.string().default("unknown"),
      to_agent: z.string().default("any").describe("Destination agent name"),
      task_id: z.string().describe("Task identifier e.g. TASK-001"),
      task: z.string().describe("Task title / description"),
      objective: z.string().optional().describe("Session objective"),
      completed_work: z.array(z.string()).optional().describe("List of accomplished work items"),
      files_changed: z.array(z.string()).optional().describe("List of created/modified files"),
      decisions: z.array(z.string()).optional().describe("Key decisions made"),
      tests: z.array(z.string()).optional().describe("Tests run and status"),
      blockers: z.string().optional().describe("Known blockers or defects"),
      unfinished_work: z.array(z.string()).optional().describe("Remaining tasks"),
      next_action: z.string().min(1).describe("Actionable instruction for the incoming agent"),
    },
    async (args) => {
      try {
        assertNoSecrets(args, "create_handoff");
        const res = createHandoff(repoRoot, args);
        return successResponse({
          success: true,
          filename: res.filename,
          filePath: res.filePath,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // PHASE 2 TOOLS
  // ───────────────────────────────────────────────────────────────────────────

  server.tool(
    "bootstrap_context",
    "Synthesizes Hot Context, active tasks, latest handoff, Git reality, and consistency warnings into an actionable agent briefing.",
    {
      agent: z.string().optional().describe("Incoming agent name"),
    },
    async (args) => {
      try {
        const bootstrap = getAgentBootstrap(repoRoot, { agent: args.agent });
        const markdown = formatBootstrapMarkdown(bootstrap);
        return successResponse({
          bootstrap,
          briefing_markdown: markdown,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  server.tool(
    "start_agent_session",
    "Registers an active coding session for an agent, establishing isolated task descriptors and updating aggregate state.",
    {
      agent: z.string().describe("Agent name (e.g. antigravity, claude, codex)"),
      interface: z.string().default("kilo-code").describe("Editor / IDE interface"),
      router: z.string().default("omniroute").describe("Model routing layer"),
      model: z.string().default("unknown").describe("Model name e.g. gemini-3.8-flash"),
      task_id: z.string().optional().describe("Active task ID (e.g. TASK-003)"),
      task_title: z.string().optional().describe("Task title"),
      objective: z.string().optional().describe("Session goal"),
      working_area: z.array(z.string()).optional().describe("Relevant paths or file globs"),
      next_action: z.string().optional().describe("Immediate next step"),
    },
    async (args) => {
      try {
        assertNoSecrets(args, "start_agent_session");
        const res = startSession(repoRoot, args);
        return successResponse(res);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  server.tool(
    "heartbeat_session",
    "Updates an active agent session heartbeat and current progress.",
    {
      agent: z.string().describe("Agent name"),
      progress: z.string().optional().describe("Summary of recent progress"),
      next_action: z.string().optional().describe("Current next action"),
      status: z.enum(["IN_PROGRESS", "BLOCKED", "COMPLETED", "IDLE"]).optional(),
    },
    async (args) => {
      try {
        assertNoSecrets(args, "heartbeat_session");
        const res = heartbeatSession(repoRoot, args.agent, args);
        return successResponse(res);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  server.tool(
    "end_agent_session",
    "Concludes an active agent session in an assisted manner, auto-detecting Git modifications and generating an immutable handoff.",
    {
      agent: z.string().describe("Agent concluding session"),
      to_agent: z.string().default("any").describe("Recipient agent name"),
      task_id: z.string().optional().describe("Active task ID"),
      task_title: z.string().optional().describe("Task title"),
      completed_work: z.array(z.string()).optional().describe("Accomplished items"),
      files_changed: z.array(z.string()).optional().describe("Changed files (auto-detected if empty)"),
      tests: z.array(z.string()).optional().describe("Tests run and results"),
      unresolved: z.string().optional().describe("Known defects or blockers"),
      next_action: z.string().min(1).describe("Actionable instruction for the incoming agent"),
      mark_task_completed: z.boolean().default(false).describe("Whether to transition task to COMPLETED"),
    },
    async (args) => {
      try {
        assertNoSecrets(args, "end_agent_session");
        const res = assistedSessionEnd(repoRoot, args);
        return successResponse(res);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  server.tool(
    "check_context_consistency",
    "Audits consistency between Git reality (staged/unstaged files) and Project Context OS records.",
    {},
    async () => {
      try {
        const res = checkConsistency(repoRoot);
        return successResponse(res);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  server.tool(
    "recover_stale_sessions",
    "Safely recovers, adopts, or archives stale, interrupted, or crashed agent sessions without destroying context.",
    {
      agent: z.string().optional().describe("Specific stale agent to recover"),
      new_agent: z.string().optional().describe("Incoming agent claiming the task"),
      action: z.enum(["INSPECT", "ADOPT", "ARCHIVE"]).default("INSPECT").describe("Recovery strategy"),
    },
    async (args) => {
      try {
        const res = recoverSession(repoRoot, args);
        return successResponse(res);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  server.tool(
    "list_agent_sessions",
    "Lists all registered agent sessions, idle durations, and staleness status.",
    {},
    async () => {
      try {
        const res = listSessions(repoRoot);
        return successResponse(res);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // PHASE 3 TOOLS (4)
  // ───────────────────────────────────────────────────────────────────────────

  // 1. get_context_health
  server.tool(
    "get_context_health",
    "Returns multi-dimensional context quality assessment: overall score, grade (A/B/C/F), 6-pillar breakdown, and itemized issues.",
    {},
    async () => {
      try {
        const res = assessContextQuality(repoRoot);
        return successResponse(res);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 2. get_relevant_context
  server.tool(
    "get_relevant_context",
    "Computes deterministic, ranked Warm Context for a specific task or topic: relevant ADRs, past changes, completed tasks, and candidate files.",
    {
      task_id: z.string().optional().describe("Task identifier e.g. TASK-002"),
      query: z.string().optional().describe("Query topic or component name"),
      files: z.array(z.string()).optional().describe("Relevant file paths being inspected"),
      limit: z.number().int().min(1).max(20).default(5).describe("Maximum items per category"),
    },
    async (args) => {
      try {
        const res = getRelevantContext(repoRoot, args);
        return successResponse(res);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 3. check_context_drift
  server.tool(
    "check_context_drift",
    "Audits semantic drift between Git working tree reality and Project Context OS: unrecorded modifications, lingering files from completed tasks, and missing disk files.",
    {},
    async () => {
      try {
        const res = checkContextDrift(repoRoot);
        return successResponse(res);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // 4. get_attention_items
  server.tool(
    "get_attention_items",
    "Returns high-priority action items requiring developer or agent attention: invariant violations, working area collisions, severe drift, and stale work.",
    {},
    async () => {
      try {
        const quality = assessContextQuality(repoRoot);
        const drift = checkContextDrift(repoRoot);
        const collisions = checkWorkingAreaCollisions(repoRoot);
        const invariants = checkInvariants(repoRoot);

        const urgent = [];

        // Invariant violations
        for (const v of invariants.violations) {
          urgent.push({
            type: "INVARIANT_VIOLATION",
            severity: v.severity,
            title: v.rule,
            description: v.message,
            action: v.suggestion,
          });
        }

        // Concurrency collisions
        for (const c of collisions.collisions) {
          urgent.push({
            type: "CONCURRENCY_COLLISION",
            severity: "WARNING",
            title: `Collision: ${c.agent_a} & ${c.agent_b}`,
            description: `Both agents declare working area on '${c.area_a}' (${c.type})`,
            action: "Coordinate task boundaries to prevent conflicting file edits.",
          });
        }

        // Severe quality issues
        for (const issue of quality.issues.filter((i) => i.severity === "ERROR" || i.severity === "WARNING")) {
          urgent.push({
            type: `QUALITY_${issue.pillar.toUpperCase()}`,
            severity: issue.severity,
            title: issue.code,
            description: issue.message,
            action: issue.suggestion,
          });
        }

        // Severe drift items
        for (const item of drift.drift_items.filter((i) => i.severity === "ERROR" || i.severity === "WARNING")) {
          urgent.push({
            type: "SEMANTIC_DRIFT",
            severity: item.severity,
            title: item.code,
            description: item.message,
            action: item.suggestion,
          });
        }

        return successResponse({
          total_attention_items: urgent.length,
          has_errors: urgent.some((u) => u.severity === "ERROR"),
          has_warnings: urgent.some((u) => u.severity === "WARNING"),
          health_score: quality.health_score,
          grade: quality.grade,
          items: urgent,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  return server;
}

/**
 * CLI entry point when running as a standalone STDIO MCP server.
 */
async function main() {
  const rootIdx = process.argv.indexOf("--root");
  const explicitRoot = (rootIdx !== -1 && process.argv[rootIdx + 1]) ? process.argv[rootIdx + 1] : null;
  const activeRoot = resolveProjectRoot(process.cwd(), explicitRoot);

  const server = createProjectContextMcpServer(activeRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("Fatal MCP Server Error:", err);
    process.exit(1);
  });
}
