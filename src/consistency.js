/**
 * Project Context OS — Git ↔ Context Consistency Checker
 *
 * Verifies that Git filesystem reality aligns with .project-context/ records:
 *   - Detects uncommitted changes when active work is marked COMPLETED
 *   - Identifies stale active-work sessions (>24h idle)
 *   - Flags significant code modifications lacking semantic changelog entries
 *   - Validates that completed tasks possess corresponding changelog records
 *   - Ensures handoffs reference valid task identifiers
 */

import { getGitStatus } from "./git.js";
import { readActiveWork, readTasks, readChangelog, readHandoffs } from "./core.js";
import { listSessions } from "./session.js";

/**
 * Runs a comprehensive consistency audit between Git reality and Context OS.
 * @param {string} rootDir
 * @param {object} [options={}]
 * @returns {{ isConsistent: boolean, issues: Array<{ severity: 'ERROR'|'WARNING'|'INFO', code: string, message: string, suggestion: string }> }}
 */
export function checkConsistency(rootDir, options = {}) {
  const issues = [];

  const gitStatus = getGitStatus(rootDir);
  const { tasks } = readTasks(rootDir);
  const { entries } = readChangelog(rootDir, 10);
  const { handoffs } = readHandoffs(rootDir, 5);
  const sessionInfo = listSessions(rootDir);

  const modifiedCount = (gitStatus.staged || []).length + (gitStatus.unstaged || []).length;
  const isGitDirty = !gitStatus.isClean && modifiedCount > 0;

  // 1. Check: Active Work marked COMPLETED while uncommitted changes remain
  for (const sess of sessionInfo.sessions) {
    if (sess.status === "COMPLETED" && isGitDirty) {
      issues.push({
        severity: "WARNING",
        code: "UNCOMMITTED_CHANGES_AFTER_COMPLETION",
        message: `Agent '${sess.agent}' marked active work as COMPLETED, but ${modifiedCount} uncommitted files remain in Git.`,
        suggestion: "Commit the changes with a meaningful Git message, or record an uncommitted handoff before concluding.",
      });
      break;
    }
  }

  // 2. Check: Stale active sessions
  for (const sess of sessionInfo.sessions) {
    if (sess.isStale) {
      issues.push({
        severity: "WARNING",
        code: "STALE_ACTIVE_SESSION",
        message: `Agent '${sess.agent}' has been IN_PROGRESS on '${sess.active_task}' with no activity for ${sess.idleDurationHours}h.`,
        suggestion: "Use 'project-context recover' or update the session status to IDLE/COMPLETED.",
      });
    }
  }

  // 3. Check: Significant code modifications without corresponding changelog entry
  if (modifiedCount >= 5) {
    const latestChange = entries[0];
    const latestChangeHasModifiedFiles = latestChange && Array.isArray(latestChange.files) && latestChange.files.length > 0;
    if (!latestChangeHasModifiedFiles) {
      issues.push({
        severity: "INFO",
        code: "SIGNIFICANT_MODIFICATIONS_UNRECORDED",
        message: `Working tree has ${modifiedCount} modified files, but recent CHANGELOG entries do not reflect current modifications.`,
        suggestion: "Record a semantic summary in .project-context/CHANGELOG.md upon completing this milestone.",
      });
    }
  }

  // 4. Check: Completed tasks have corresponding changelog entries
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");
  const changelogTaskIds = new Set(entries.map((e) => e.task_id).filter(Boolean));

  for (const t of completedTasks) {
    if (t.id !== "TASK-000" && !changelogTaskIds.has(t.id)) {
      issues.push({
        severity: "INFO",
        code: "COMPLETED_TASK_NO_CHANGELOG",
        message: `Task '${t.id}: ${t.title}' is marked COMPLETED, but has no corresponding entry in recent CHANGELOG.md.`,
        suggestion: `Add a changelog entry referencing ${t.id} to document what was changed and tested.`,
      });
    }
  }

  // 5. Check: Handoffs reference valid task IDs
  const knownTaskIds = new Set(tasks.map((t) => t.id));
  for (const h of handoffs) {
    if (h.task_id && h.task_id !== "TASK-XXX" && !knownTaskIds.has(h.task_id)) {
      issues.push({
        severity: "WARNING",
        code: "HANDOFF_INVALID_TASK_ID",
        message: `Handoff '${h.filename}' references task ID '${h.task_id}' which does not exist in TASKS.md.`,
        suggestion: `Register task '${h.task_id}' in .project-context/TASKS.md or correct the handoff metadata.`,
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "ERROR");
  const warnings = issues.filter((i) => i.severity === "WARNING");
  const info = issues.filter((i) => i.severity === "INFO");

  return {
    isConsistent: errors.length === 0 && warnings.length === 0,
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
    summary: {
      total_issues: issues.length,
      errors: errors.length,
      warnings: warnings.length,
      info: info.length,
    },
    issues,
  };
}
