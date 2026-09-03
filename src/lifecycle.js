/**
 * Project Context OS — Assisted Session-End & Crash Recovery
 *
 * Provides:
 *   1. assistedSessionEnd: Gathers Git diffs/status, compiles tests, and creates
 *      an immutable handoff while cleanly concluding the active session.
 *   2. recoverSession: Safely recovers from interrupted, orphaned, or crashed
 *      agent sessions without destroying historical context.
 */

import fs from "node:fs";
import path from "node:path";
import { getGitStatus } from "./git.js";
import {
  readActiveWork,
  updateActiveWork,
  recompileActiveWork,
  createHandoff,
  readTasks,
  updateTask,
  recordChange,
  getContextDir,
  parseFrontmatter,
} from "./core.js";
import { listSessions, startSession } from "./session.js";
import { assertNoSecrets } from "./security.js";

/**
 * Concludes an active agent session in an assisted manner.
 * Automatically inspects Git reality for modified files and creates an immutable handoff.
 *
 * @param {string} rootDir
 * @param {object} input
 * @param {string} input.agent - Agent concluding session (required)
 * @param {string} [input.to_agent="any"] - Intended recipient agent
 * @param {string} [input.task_id] - Specific task ID (defaults to agent's current active task)
 * @param {string} [input.task_title] - Task title
 * @param {string[]} [input.completed_work] - List of accomplished items
 * @param {string[]} [input.files_changed] - List of files changed (auto-detected from Git if omitted)
 * @param {string[]} [input.tests] - Tests run during session
 * @param {string} [input.unresolved] - Known blockers or defects
 * @param {string} [input.next_action] - Recommended next action for incoming agent (required)
 * @param {boolean} [input.mark_task_completed=false] - Whether to mark task COMPLETED in TASKS.md
 */
export function assistedSessionEnd(rootDir, input) {
  assertNoSecrets(input, "assistedSessionEnd");

  const agentName = (input.agent || "").trim().toLowerCase();
  if (!agentName) {
    throw new Error("Agent name is required for session end.");
  }

  // 1. Read existing active work for this agent
  const contextDir = getContextDir(rootDir);
  const activeFilePath = path.join(contextDir, "active-work", `${agentName}.md`);
  let existingMeta = {};
  if (fs.existsSync(activeFilePath)) {
    const raw = fs.readFileSync(activeFilePath, "utf-8");
    existingMeta = parseFrontmatter(raw).meta;
  }

  const taskId = input.task_id || existingMeta.active_task || "NONE";
  const taskTitle = input.task_title || existingMeta.task_title || "Session Concluded";
  const nextAction = input.next_action || "Bootstrap context and continue task execution.";

  // 2. Auto-detect changed files from Git if not explicitly provided
  let filesChanged = input.files_changed || [];
  if (filesChanged.length === 0) {
    const gitStatus = getGitStatus(rootDir);
    filesChanged = [
      ...(gitStatus.staged || []).map((s) => s.path),
      ...(gitStatus.unstaged || []).map((u) => u.path),
    ];
    if (filesChanged.length === 0 && Array.isArray(existingMeta.files)) {
      filesChanged = existingMeta.files;
    }
  }

  // 3. Create immutable handoff
  const handoffData = {
    from_agent: agentName,
    interface: input.interface || existingMeta.interface || "kilo-code",
    router: input.router || existingMeta.router || "omniroute",
    model: input.model || existingMeta.model || "unknown",
    to_agent: input.to_agent || "any",
    task_id: taskId,
    task: taskTitle,
    objective: existingMeta.objective || "Session conclusion.",
    completed_work: input.completed_work || ["Concluded active session."],
    files_changed: filesChanged,
    tests: input.tests || existingMeta.tests || [],
    blockers: input.unresolved || existingMeta.blockers || "None.",
    next_action: nextAction,
  };

  const handoffRes = createHandoff(rootDir, handoffData);

  // 4. Update agent active-work descriptor to COMPLETED
  updateActiveWork(rootDir, {
    agent: agentName,
    interface: handoffData.interface,
    router: handoffData.router,
    model: handoffData.model,
    active_task: taskId,
    task_title: taskTitle,
    status: "COMPLETED",
    objective: "Session completed.",
    progress: "Session concluded with immutable handoff.",
    files: filesChanged,
    tests: handoffData.tests,
    blockers: "None.",
    next_action: `Handoff created: ${handoffRes.filename}`,
  });

  // 5. Optionally mark task completed in TASKS.md
  if (input.mark_task_completed && taskId !== "NONE" && taskId.startsWith("TASK-")) {
    try {
      updateTask(rootDir, taskId, { status: "COMPLETED" });
    } catch {
      // Ignore if task update fails
    }
  }

  return {
    success: true,
    agent: agentName,
    status: "COMPLETED",
    handoff: handoffRes,
    files_detected: filesChanged.length,
  };
}

/**
 * Recovers an interrupted, crashed, or stale agent session.
 * Never destroys existing files; safely adopts or archives orphaned state.
 *
 * @param {string} rootDir
 * @param {object} options
 * @param {string} [options.agent] - Stale agent to recover
 * @param {string} [options.new_agent] - Incoming agent claiming the task
 * @param {'INSPECT'|'ADOPT'|'ARCHIVE'} [options.action='INSPECT'] - Recovery strategy
 * @param {number} [options.staleThresholdHours=24] - Hours before considered stale
 */
export function recoverSession(rootDir, options = {}) {
  const action = options.action || "INSPECT";
  const staleThresholdMs = (options.staleThresholdHours || 24) * 60 * 60 * 1000;
  const sessionsInfo = listSessions(rootDir, { staleThresholdMs });

  // Find candidate stale sessions
  let candidates = sessionsInfo.sessions.filter((s) => s.isStale || s.status === "IN_PROGRESS");
  if (options.agent) {
    candidates = candidates.filter((s) => s.agent.toLowerCase() === options.agent.toLowerCase());
  }

  if (action === "INSPECT") {
    return {
      status: "INSPECT_ONLY",
      candidate_count: candidates.length,
      stale_sessions: candidates,
    };
  }

  if (candidates.length === 0) {
    return {
      success: true,
      message: "No stale or orphaned sessions found to recover.",
      recovered_count: 0,
    };
  }

  const results = [];

  for (const stale of candidates) {
    if (action === "ADOPT") {
      const newAgent = (options.new_agent || "antigravity").trim().toLowerCase();

      // 1. Mark stale agent's file as ADOPTED without deleting it
      updateActiveWork(rootDir, {
        agent: stale.agent,
        interface: stale.interface,
        router: stale.router,
        model: stale.model,
        active_task: stale.active_task,
        task_title: stale.task_title,
        status: "COMPLETED",
        progress: `Task adopted by incoming agent '${newAgent}'.`,
        next_action: `Work continued under agent '${newAgent}'.`,
      });

      // 2. Start session for new agent inheriting the task
      const newSession = startSession(rootDir, {
        agent: newAgent,
        interface: options.interface || "kilo-code",
        router: options.router || "omniroute",
        model: options.model || "unknown",
        active_task: stale.active_task,
        task_title: stale.task_title,
        objective: `Adopted task '${stale.active_task}' from interrupted agent '${stale.agent}'.`,
        progress: "Session restored via crash recovery.",
        next_action: "Resume task execution.",
      });

      // 3. Record audit entry in CHANGELOG.md
      try {
        recordChange(rootDir, {
          task_id: stale.active_task !== "NONE" ? stale.active_task : "TASK-001",
          summary: `Session Recovery: Agent '${newAgent}' safely adopted task '${stale.active_task}' from interrupted agent '${stale.agent}'.`,
          agent: newAgent,
        });
      } catch {
        // Continue if changelog record fails
      }

      results.push({
        stale_agent: stale.agent,
        adopted_by: newAgent,
        task_id: stale.active_task,
        status: "ADOPTED",
        new_session: newSession,
      });
    } else if (action === "ARCHIVE") {
      // Safely archive stale active work to COMPLETED
      updateActiveWork(rootDir, {
        agent: stale.agent,
        interface: stale.interface,
        router: stale.router,
        model: stale.model,
        active_task: stale.active_task,
        task_title: stale.task_title,
        status: "COMPLETED",
        progress: "Session archived due to inactivity.",
        next_action: "None. Session closed.",
      });

      results.push({
        stale_agent: stale.agent,
        task_id: stale.active_task,
        status: "ARCHIVED",
      });
    }
  }

  recompileActiveWork(rootDir);

  return {
    success: true,
    action,
    recovered_count: results.length,
    recoveries: results,
  };
}
