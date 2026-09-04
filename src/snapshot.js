import path from "node:path";
/**
 * Project Context OS â€” Deterministic Project Scanner & Hot/Cold Snapshot Generator
 *
 * Synthesizes a compact, token-efficient snapshot of Hot Context for incoming AI agents.
 * Includes pointers to Cold Context rather than dumping complete historical archives.
 * Zero external LLM calls; pure deterministic local aggregation.
 */

import { readState, readActiveWork, readTasks, readDecisions, readChangelog, readHandoffs } from "./core.js";
import { getGitStatus, getGitRecentCommits } from "./git.js";
import { assertNoSecrets } from "./security.js";
import { inspectGraphifyStatus, GRAPHIFY_STATES } from "./graphify.js";

/**
 * Generates an AI-optimized context snapshot.
 * Compact by default to minimize context window consumption.
 *
 * @param {string} rootDir
 * @param {object} [options]
 * @param {number} [options.limit=5] - Number of recent items to include
 * @param {boolean} [options.include_git=true] - Whether to include working tree git status
 * @param {boolean} [options.include_handoffs=true] - Whether to include the latest handoff
 * @param {boolean} [options.include_decisions=true] - Whether to include recent ADRs
 */
export function getContextSnapshot(rootDir, options = {}) {
  const limit = options.limit || 5;
  const includeGit = options.include_git !== false;
  const includeHandoffs = options.include_handoffs !== false;
  const includeDecisions = options.include_decisions !== false;

  // 1. Hot State
  const stateObj = readState(rootDir);
  const stateMeta = stateObj.meta || {};

  // 2. Active Agents / Work
  const activeWorkObj = readActiveWork(rootDir);

  // 3. Active Tasks (IN_PROGRESS, READY, BLOCKED)
  const allTasks = readTasks(rootDir).tasks || [];
  const activeTasks = allTasks.filter((t) => ["IN_PROGRESS", "READY", "BLOCKED"].includes(t.status));
  const completedCount = allTasks.filter((t) => t.status === "COMPLETED").length;

  // 4. Latest Handoff
  const handoffsObj = includeHandoffs ? readHandoffs(rootDir, 1) : { handoffs: [] };
  const latestHandoff = handoffsObj.handoffs?.[0] || null;

  // 5. Recent Semantic Changes
  const changelogObj = readChangelog(rootDir, limit);

  // 6. Recent Decisions
  const decisionsObj = includeDecisions ? readDecisions(rootDir) : { decisions: [] };
  const recentDecisions = (decisionsObj.decisions || []).slice(-limit).reverse();

  // 7. Git Working Tree
  const gitStatus = includeGit ? getGitStatus(rootDir) : null;
  const recentCommits = includeGit ? getGitRecentCommits(rootDir, 3) : [];

  const snapshot = {
    _type: "HotContextSnapshot",
    version: "1.0.0",
    generated_at: new Date().toISOString(),

    // Section 1: Project Identity & Current State
    project: {
      name: stateMeta.project_name || path.basename(path.resolve(rootDir)) || "Project",
      phase: stateMeta.current_phase || "Phase 1",
      status: stateMeta.current_status || "IN_PROGRESS",
      objective: stateMeta.current_objective || "Active Development",
      last_context_update: stateMeta.last_context_update || "",
      last_agent: stateMeta.last_agent || "unknown",
      current_agent: stateMeta.current_agent || null,
    },

    // Section 2: Active Agents & Concurrency
    active_agents: activeWorkObj.agents.map((a) => ({
      agent: a.agent,
      interface: a.interface,
      router: a.router,
      model: a.model,
      task_id: a.active_task,
      task_title: a.task_title,
      status: a.status,
      updated_at: a.updated_at,
    })),

    // Section 3: Priority Tasks
    active_tasks: activeTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      owner: t.owner,
      description: t.description,
    })),

    // Section 4: Latest Handoff (Incoming Context)
    latest_handoff: latestHandoff
      ? {
          filename: latestHandoff.filename,
          timestamp: latestHandoff.timestamp,
          from_agent: latestHandoff.from_agent,
          to_agent: latestHandoff.to_agent,
          task_id: latestHandoff.task_id,
          task_title: latestHandoff.task_title,
        }
      : null,

    // Section 5: Recent Semantic Changes
    recent_changes: (changelogObj.entries || []).slice(0, limit),

    // Section 6: Key Architectural Decisions
    recent_decisions: recentDecisions.map((d) => ({
      id: d.id,
      date: d.date,
      status: d.status,
      decision: d.decision,
    })),

    // Section 7: Git Ground Truth (WHAT is uncommitted)
    git: gitStatus
      ? {
          branch: gitStatus.branch,
          is_clean: gitStatus.isClean,
          staged_count: gitStatus.staged.length,
          unstaged_count: gitStatus.unstaged.length,
          untracked_count: gitStatus.untracked.length,
          uncommitted_files: [
            ...gitStatus.staged.map((s) => `[staged] ${s.path}`),
            ...gitStatus.unstaged.map((u) => `[unstaged] ${u.path}`),
          ].slice(0, 15),
          recent_commits: recentCommits,
        }
      : null,

    // Section 8: Cold Context Pointers & Structural Availability
    cold_context_pointers: {
      total_completed_tasks: completedCount,
      tasks_archive: ".project-context/TASKS.md",
      decisions_archive: ".project-context/DECISIONS.md",
      changelog_archive: ".project-context/CHANGELOG.md",
      handoffs_archive: ".project-context/handoffs/",
      retrieval_tool: "Use search_project_context(query) or 'npm run context:search <query>' to inspect cold context.",
      graphify: (() => {
        try {
          const g = inspectGraphifyStatus(rootDir);
          return {
            state: g.state,
            is_stale: Boolean(g.isStale),
            nodes_count: g.nodeCount || 0,
            edges_count: g.edgeCount || 0,
          };
        } catch {
          return {
            state: GRAPHIFY_STATES.MISSING,
            is_stale: false,
            nodes_count: 0,
            edges_count: 0,
          };
        }
      })(),
    },
  };

  // Ensure zero credentials in snapshot
  assertNoSecrets(snapshot, "getContextSnapshot");

  return snapshot;
}

/**
 * Formats snapshot as a human- and agent-readable Markdown text block.
 * @param {object} snapshot
 */
export function formatSnapshotMarkdown(snapshot) {
  const p = snapshot.project;
  const g = snapshot.git;
  const agents = snapshot.active_agents || [];
  const tasks = snapshot.active_tasks || [];

  let md = `# Project Context Snapshot â€” ${p.name}
*Generated: ${snapshot.generated_at}*

## 1. Project Reality
* **Phase**: ${p.phase}
* **Status**: \`${p.status}\`
* **Objective**: ${p.objective}
* **Last Updated**: ${p.last_context_update} by **${p.last_agent}**

## 2. Active Agents (${agents.length})
`;

  if (agents.length === 0) {
    md += "*No active agents registered in `.project-context/active-work/`*\n";
  } else {
    for (const a of agents) {
      md += `* **${a.agent}** (${a.interface}/${a.model}): \`${a.task_id}\` â€” ${a.task_title} [\`${a.status}\`]\n`;
    }
  }

  md += `\n## 3. Active Tasks (${tasks.length})\n`;
  if (tasks.length === 0) {
    md += "*No active tasks in progress or ready.*\n";
  } else {
    for (const t of tasks) {
      md += `* **${t.id}** [${t.status} | ${t.priority}]: ${t.title} (${t.owner})\n`;
    }
  }

  if (snapshot.latest_handoff) {
    const h = snapshot.latest_handoff;
    md += `\n## 4. Latest Handoff
* **File**: \`${h.filename}\`
* **From**: ${typeof h.from_agent === "object" ? h.from_agent.agent : h.from_agent} -> **To**: ${h.to_agent}
* **Task**: ${h.task_title || h.task_id}
`;
  }

  if (snapshot.recent_changes && snapshot.recent_changes.length > 0) {
    md += `\n## 5. Recent Semantic Changes\n`;
    for (const c of snapshot.recent_changes) {
      md += `* \`${c.date}\` [${c.task_id}]: ${c.summary}\n`;
    }
  }

  if (snapshot.recent_decisions && snapshot.recent_decisions.length > 0) {
    md += `\n## 6. Recent Decisions\n`;
    for (const d of snapshot.recent_decisions) {
      md += `* **${d.id}**: ${d.decision}\n`;
    }
  }

  if (g) {
    md += `\n## 7. Git Status
* **Branch**: \`${g.branch}\` | **Clean**: ${g.is_clean ? "Yes" : "No"}
* **Modified Files**: ${g.unstaged_count + g.staged_count} (${g.staged_count} staged, ${g.unstaged_count} unstaged, ${g.untracked_count} untracked)
`;
    if (g.uncommitted_files.length > 0) {
      md += g.uncommitted_files.map((f) => `  - ${f}`).join("\n") + "\n";
    }
  }

  md += `\n## 8. Cold Context Pointers
* Completed Tasks: ${snapshot.cold_context_pointers.total_completed_tasks} (see \`.project-context/TASKS.md\`)
* Full History: see \`.project-context/CHANGELOG.md\`, \`.project-context/handoffs/\`
* Search Command: \`npm run context:search <term>\` or MCP \`search_project_context\`
`;

  return md;
}

