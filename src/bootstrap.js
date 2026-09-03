/**
 * Project Context OS — Context-Aware Smart Bootstrap (Phase 3)
 *
 * Provides a unified entry point for any incoming AI coding agent.
 * Synthesizes:
 *   - Hot Context (Project reality, active task, latest handoff, Git status)
 *   - Warm Context (Task-relevant ADRs, historical changes, candidate files)
 *   - Health & Freshness (Context Quality score, active collisions, consistency warnings)
 *   - Cold Context Pointers (Deep search and completed archive)
 */

import path from "node:path";
import { getContextSnapshot } from "./snapshot.js";
import { checkConsistency } from "./consistency.js";
import { readHandoffs, readFileSafe, getContextDir } from "./core.js";
import { assertNoSecrets } from "./security.js";
import { getRelevantContext } from "./relevance.js";
import { assessContextQuality } from "./quality.js";
import { checkWorkingAreaCollisions } from "./session.js";

/**
 * Generates the universal agent bootstrap package.
 * @param {string} rootDir
 * @param {object} [options={}]
 * @param {string} [options.agent] - Incoming agent name
 * @param {string} [options.task_id] - Target task ID to tailor warm context
 * @param {string} [options.query] - Optional query or topic
 * @param {string[]} [options.files] - Working files
 * @returns {object} Structured bootstrap object with hot and warm context
 */
export function getAgentBootstrap(rootDir, options = {}) {
  const snapshot = getContextSnapshot(rootDir, { limit: 5 });
  const consistency = checkConsistency(rootDir);
  const quality = assessContextQuality(rootDir);
  const collisions = checkWorkingAreaCollisions(rootDir);

  // Determine active or specified task ID
  const targetTaskId = options.task_id || (snapshot.active_tasks?.[0]?.id) || undefined;

  // Retrieve full details of latest handoff if available
  let latestHandoffDetails = null;
  if (snapshot.latest_handoff && snapshot.latest_handoff.filename) {
    const handoffPath = path.join(getContextDir(rootDir), "handoffs", snapshot.latest_handoff.filename);
    const handoffContent = readFileSafe(handoffPath);
    if (handoffContent) {
      const nextActionMatch = handoffContent.match(/## (?:Exact )?Recommended Next Step[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
      const blockersMatch = handoffContent.match(/## Known Problems & Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
      const completedMatch = handoffContent.match(/## Work Completed\s*\n([\s\S]*?)(?=\n##|$)/i);
      const filesMatch = handoffContent.match(/## Files Changed\s*\n([\s\S]*?)(?=\n##|$)/i);

      const filesChanged = filesMatch
        ? filesMatch[1]
            .split("\n")
            .map((line) => line.replace(/^[-*]\s*/, "").replace(/^`|`$/g, "").trim())
            .filter(Boolean)
        : [];

      latestHandoffDetails = {
        ...snapshot.latest_handoff,
        from_agent: typeof snapshot.latest_handoff.from_agent === "object" ? snapshot.latest_handoff.from_agent.agent : snapshot.latest_handoff.from_agent,
        to_agent: typeof snapshot.latest_handoff.to_agent === "object" ? snapshot.latest_handoff.to_agent.agent : snapshot.latest_handoff.to_agent,
        next_action: nextActionMatch ? nextActionMatch[1].trim() : "Review project tasks and proceed.",
        blockers: blockersMatch ? blockersMatch[1].trim() : "None.",
        work_completed: completedMatch ? completedMatch[1].trim() : "Completed previous milestone.",
        files_changed: filesChanged,
      };
    }
  }

  // Compute Task-Aware Warm Context
  const relevant = getRelevantContext(rootDir, {
    task_id: targetTaskId,
    query: options.query,
    files: options.files || latestHandoffDetails?.files_changed || [],
    limit: 4,
  });

  const bootstrap = {
    _type: "UniversalAgentBootstrap",
    version: "3.0.0",
    generated_at: new Date().toISOString(),
    incoming_agent: options.agent || "unspecified",
    target_task_id: targetTaskId || null,
    suggested_files: relevant.suggested_files || [],

    // Section 1: Project Identity & Health
    project: snapshot.project,
    context_health: {
      score: quality.health_score,
      grade: quality.grade,
      summary: quality.summary,
    },

    // Section 2: Active Agents & Work
    active_agents: snapshot.active_agents,
    concurrency: {
      has_collisions: collisions.hasCollisions,
      collisions: collisions.collisions,
    },

    // Section 3: High Priority Tasks
    active_tasks: snapshot.active_tasks,

    // Section 4: Incoming Handoff & Next Immediate Step
    latest_handoff: latestHandoffDetails || snapshot.latest_handoff,

    // Section 5: Task-Tailored Warm Context
    relevant_context: {
      task_id: targetTaskId,
      suggested_files: relevant.suggested_files,
      relevant_decisions: relevant.relevant_decisions,
      relevant_changes: relevant.relevant_changes,
      relevant_completed_tasks: relevant.relevant_completed_tasks,
    },

    // Section 6: Key Architectural Invariants
    recent_decisions: snapshot.recent_decisions,

    // Section 7: Recent Semantic Changes
    recent_changes: snapshot.recent_changes,

    // Section 8: Git Ground Truth
    git: snapshot.git,

    // Section 9: Warnings & Action Items
    warnings: [
      ...consistency.issues.filter((i) => i.severity === "ERROR" || i.severity === "WARNING"),
      ...quality.issues.filter((i) => i.severity === "ERROR" || i.severity === "WARNING"),
    ],

    // Section 10: Pointers to Cold Context
    cold_context_pointers: snapshot.cold_context_pointers,
  };

  assertNoSecrets(bootstrap, "getAgentBootstrap");

  return bootstrap;
}

/**
 * Formats the universal agent bootstrap as a high-density, actionable Markdown briefing.
 * @param {object} bootstrap
 * @returns {string}
 */
export function formatBootstrapMarkdown(bootstrap) {
  const p = bootstrap.project;
  const h = bootstrap.latest_handoff;
  const g = bootstrap.git;
  const agents = bootstrap.active_agents || [];
  const tasks = bootstrap.active_tasks || [];
  const decisions = bootstrap.recent_decisions || [];
  const warnings = bootstrap.warnings || [];
  const rel = bootstrap.relevant_context;
  const health = bootstrap.context_health;

  let md = `# Project Context OS — Agent Bootstrap Briefing
*Generated: ${bootstrap.generated_at} | Target Agent: ${bootstrap.incoming_agent}*

## 1. Project Reality
* **Project**: **${p.name}**
* **Current Phase**: ${p.phase}
* **Status**: \`${p.status}\`
* **Health Score**: **${health ? `${health.score}% (Grade: ${health.grade})` : "N/A"}**
* **Objective**: ${p.objective}
* **Last Updated**: ${p.last_context_update || "N/A"} by **${p.last_agent || "unknown"}**

## 2. Active Collaborating Agents (${agents.length})
`;

  if (agents.length === 0) {
    md += "*No other active agents currently registered. You have sole execution ownership.*\n\n";
  } else {
    for (const a of agents) {
      md += `* **${a.agent}** (\`${a.interface}\`/\`${a.model}\`): Task \`${a.task_id}\` — ${a.task_title} [\`${a.status}\`]\n`;
    }
    md += "\n";
  }

  if (bootstrap.concurrency && bootstrap.concurrency.has_collisions) {
    md += `> [!WARNING]\n> **WORKING AREA COLLISION DETECTED**:\n`;
    for (const c of bootstrap.concurrency.collisions) {
      md += `> - Agent **${c.agent_a}** and **${c.agent_b}** share path \`${c.area_a}\` (${c.type})\n`;
    }
    md += "\n";
  }

  md += `## 3. High Priority Tasks (${tasks.length})\n`;
  if (tasks.length === 0) {
    md += "*No active tasks in progress. Check .project-context/TASKS.md for Ready/Backlog items.*\n\n";
  } else {
    for (const t of tasks) {
      md += `* **${t.id}** [${t.status} | Priority: ${t.priority}]: **${t.title}** (Owner: ${t.owner})\n`;
      if (t.description) md += `  - *Scope*: ${t.description.slice(0, 140)}...\n`;
    }
    md += "\n";
  }

  md += "## 4. Latest Incoming Handoff\n";
  if (!h) {
    md += "*No prior agent handoff found. You are establishing the baseline session.*\n\n";
  } else {
    const fromName = typeof h.from_agent === "object" ? h.from_agent.agent : h.from_agent;
    const toName = typeof h.to_agent === "object" ? h.to_agent.agent : h.to_agent;
    md += `* **From**: **${fromName}** -> **To**: **${toName}** (\`${h.filename}\`)\n`;
    md += `* **Task Handed Off**: \`${h.task_id}\` — ${h.task_title || h.task || "N/A"}\n`;
    if (h.work_completed) {
      md += `* **Work Accomplished**:\n  ${h.work_completed.split("\n").slice(0, 4).join("\n  ")}\n`;
    }
    if (h.blockers && h.blockers !== "None.") {
      md += `* **Known Blockers**: ${h.blockers}\n`;
    }
    md += `* **>>> EXACT RECOMMENDED NEXT STEP <<<**:\n  **${h.next_action || "Bootstrap session and begin assigned task."}**\n\n`;
  }

  // Warm Context Section
  if (rel && (rel.suggested_files?.length > 0 || rel.relevant_decisions?.length > 0)) {
    md += `## 5. Task-Tailored Warm Context ${rel.task_id ? `(\`${rel.task_id}\`)` : ""}\n`;
    if (rel.suggested_files?.length > 0) {
      md += `* **Candidate Files to Inspect / Modify**:\n`;
      for (const f of rel.suggested_files) {
        md += `  - \`${f}\`\n`;
      }
    }
    if (rel.relevant_decisions?.length > 0) {
      md += `* **Directly Relevant ADRs**:\n`;
      for (const d of rel.relevant_decisions) {
        md += `  - **${d.id}**: ${d.title} (Relevance Score: ${d.score})\n`;
      }
    }
    md += "\n";
  }

  if (warnings.length > 0) {
    md += `## 6. Active Consistency & Quality Warnings (${warnings.length})\n`;
    for (const w of warnings.slice(0, 6)) {
      md += `* [${w.severity}] **${w.code}**: ${w.message}\n  - *Action*: ${w.suggestion}\n`;
    }
    if (warnings.length > 6) {
      md += `* ...and ${warnings.length - 6} more (Run \`npm run context:validate\` for full list)\n`;
    }
    md += "\n";
  }

  md += "## 7. Git Ground Truth\n";
  if (!g) {
    md += "*Git status unavailable.*\n\n";
  } else {
    md += `* **Branch**: \`${g.branch}\` | **Clean Tree**: ${g.is_clean ? "Yes ✓" : "No (Modifications Detected)"}\n`;
    if (!g.is_clean) {
      md += `* **Uncommitted Modifications**: ${g.uncommitted_files.length} file(s)\n`;
      for (const f of g.uncommitted_files.slice(0, 6)) {
        md += `  - ${f}\n`;
      }
      if (g.uncommitted_files.length > 6) {
        md += `  - ...and ${g.uncommitted_files.length - 6} more\n`;
      }
    }
    md += "\n";
  }

  md += "## 8. Key Architectural Invariants (ADRs)\n";
  for (const d of decisions.slice(0, 4)) {
    md += `* **${d.id}**: ${d.decision}\n`;
  }
  md += "\n";

  md += "## 9. Cold Context Retrieval\n";
  md += `* Completed Tasks: ${bootstrap.cold_context_pointers?.total_completed_tasks || 0} in \`.project-context/TASKS.md\`\n`;
  md += "* Deep Search: Run `npm run context:search <query>` or invoke MCP `search_project_context(query)`\n";

  return md;
}
