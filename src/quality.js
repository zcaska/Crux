/**
 * Project Context OS — Context Quality & Freshness Assessment
 *
 * Deterministically evaluates context health across 6 pillars:
 *   1. Freshness (Heartbeat latency, task staleness)
 *   2. Completeness (Acceptance criteria, required metadata)
 *   3. Consistency (Status alignment between tasks, state, and Git)
 *   4. Referential Integrity (Valid task IDs, existing file pointers)
 *   5. Activity (Abandoned sessions, idle duration)
 *   6. Recoverability (Immutable handoff completeness, next action presence)
 */

import fs from "node:fs";
import path from "node:path";
import { readState, readTasks, readChangelog, readHandoffs, getContextDir, readFileSafe } from "./core.js";
import { listSessions } from "./session.js";
import { getGitStatus } from "./git.js";
import { checkInvariants } from "./invariants.js";

/**
 * Assesses overall Project Context OS health and quality.
 * @param {string} rootDir
 * @returns {{
 *   health_score: number,
 *   grade: 'A'|'B'|'C'|'F',
 *   summary: { freshness: number, completeness: number, consistency: number, integrity: number, activity: number, recoverability: number },
 *   issues: Array<{ pillar: string, severity: 'ERROR'|'WARNING'|'INFO', code: string, message: string, suggestion: string }>,
 *   metrics: object
 * }}
 */
export function assessContextQuality(rootDir) {
  const issues = [];
  const now = Date.now();

  const state = readState(rootDir);
  const stateMeta = state.meta || state.data || {};
  const { tasks } = readTasks(rootDir);
  const { entries: changelog } = readChangelog(rootDir, 20);
  const { handoffs } = readHandoffs(rootDir, 10);
  const sessionInfo = listSessions(rootDir);
  const gitStatus = getGitStatus(rootDir);
  const invariantCheck = checkInvariants(rootDir);

  // Pillar scores initialized at 100
  let freshnessScore = 100;
  let completenessScore = 100;
  let consistencyScore = 100;
  let integrityScore = 100;
  let activityScore = 100;
  let recoverabilityScore = 100;

  // ───────────────────────────────────────────────────────────────────────────
  // 1. FRESHNESS & ACTIVITY
  // ───────────────────────────────────────────────────────────────────────────
  for (const sess of sessionInfo.sessions) {
    if (sess.status === "IN_PROGRESS") {
      const idleHours = sess.idleDurationHours || 0;
      if (idleHours > 24) {
        freshnessScore -= 25;
        activityScore -= 25;
        issues.push({
          pillar: "Activity",
          severity: "WARNING",
          code: "SESSION_ABANDONED_24H",
          message: `Agent '${sess.agent}' has been idle for ${idleHours} hours on '${sess.active_task}'.`,
          suggestion: "Use 'project-context recover' to adopt or archive this session.",
        });
      } else if (idleHours > 12) {
        freshnessScore -= 10;
        activityScore -= 10;
        issues.push({
          pillar: "Freshness",
          severity: "INFO",
          code: "SESSION_STALE_HEARTBEAT_12H",
          message: `Agent '${sess.agent}' has not recorded a heartbeat in ${idleHours} hours.`,
          suggestion: "Send heartbeat via MCP 'heartbeat_session' or CLI 'project-context session-heartbeat'.",
        });
      }
    }
  }

  // Check state update freshness
  if (stateMeta.last_context_update) {
    const updateTime = new Date(stateMeta.last_context_update).getTime();
    const daysSinceUpdate = (now - updateTime) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 7) {
      freshnessScore -= 15;
      issues.push({
        pillar: "Freshness",
        severity: "WARNING",
        code: "STATE_UNTENDED_7_DAYS",
        message: `Project STATE.md has not been updated in ${Math.round(daysSinceUpdate)} days.`,
        suggestion: "Update STATE.md to reflect current phase and verified status.",
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. COMPLETENESS
  // ───────────────────────────────────────────────────────────────────────────
  if (!stateMeta.current_objective || stateMeta.current_objective.trim().length < 5) {
    completenessScore -= 15;
    issues.push({
      pillar: "Completeness",
      severity: "WARNING",
      code: "STATE_MISSING_OBJECTIVE",
      message: "STATE.md lacks a defined current_objective.",
      suggestion: "Define a clear milestone objective in STATE.md.",
    });
  }

  for (const t of tasks) {
    if (!t.acceptance_criteria || t.acceptance_criteria.length === 0) {
      completenessScore -= 5;
      issues.push({
        pillar: "Completeness",
        severity: "INFO",
        code: "TASK_NO_ACCEPTANCE_CRITERIA",
        message: `Task '${t.id}: ${t.title}' has no documented acceptance criteria.`,
        suggestion: `Add explicit acceptance criteria checklists to task '${t.id}'.`,
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. CONSISTENCY
  // ───────────────────────────────────────────────────────────────────────────
  const activeTaskIds = new Set(
    sessionInfo.sessions.filter((s) => s.status === "IN_PROGRESS").map((s) => s.active_task)
  );

  for (const t of tasks) {
    if (t.status === "IN_PROGRESS" && !activeTaskIds.has(t.id)) {
      consistencyScore -= 10;
      issues.push({
        pillar: "Consistency",
        severity: "WARNING",
        code: "ORPHANED_IN_PROGRESS_TASK",
        message: `Task '${t.id}' is marked IN_PROGRESS in TASKS.md but no active agent session claims it.`,
        suggestion: `Register an active session or change task '${t.id}' status to READY.`,
      });
    }
  }

  // Git uncommitted changes vs completed state
  const modifiedCount = (gitStatus.staged || []).length + (gitStatus.unstaged || []).length;
  if (modifiedCount > 0 && (sessionInfo.active_count ?? 0) === 0 && stateMeta.current_status === "VERIFIED") {
    consistencyScore -= 15;
    issues.push({
      pillar: "Consistency",
      severity: "INFO",
      code: "UNCOMMITTED_FILES_WHEN_VERIFIED",
      message: `State is marked VERIFIED with no active sessions, but ${modifiedCount} uncommitted files exist in Git.`,
      suggestion: "Commit the modifications or register an active session.",
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. REFERENTIAL INTEGRITY
  // ───────────────────────────────────────────────────────────────────────────
  const knownTaskIds = new Set(tasks.map((t) => t.id));
  for (const h of handoffs) {
    if (h.task_id && h.task_id !== "TASK-XXX" && !knownTaskIds.has(h.task_id)) {
      integrityScore -= 10;
      issues.push({
        pillar: "Referential Integrity",
        severity: "WARNING",
        code: "HANDOFF_DANGLING_TASK_REF",
        message: `Handoff '${h.filename}' references task '${h.task_id}' which is not registered in TASKS.md.`,
        suggestion: `Register task '${h.task_id}' in TASKS.md or correct the handoff metadata.`,
      });
    }
  }

  // Invariant violations hit integrity directly
  if (!invariantCheck.passed) {
    integrityScore -= 30;
    for (const v of invariantCheck.violations) {
      issues.push({
        pillar: "Referential Integrity",
        severity: v.severity,
        code: v.rule,
        message: v.message,
        suggestion: v.suggestion,
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. RECOVERABILITY
  // ───────────────────────────────────────────────────────────────────────────
  if (handoffs.length === 0) {
    recoverabilityScore -= 20;
    issues.push({
      pillar: "Recoverability",
      severity: "INFO",
      code: "NO_HISTORICAL_HANDOFFS",
      message: "No handoffs found in .project-context/handoffs/.",
      suggestion: "Generate handoffs using 'project-context session-end' upon concluding agent sessions.",
    });
  } else {
    const latestHandoff = handoffs[0];
    const handoffPath = path.join(getContextDir(rootDir), "handoffs", latestHandoff.filename);
    const content = readFileSafe(handoffPath);
    if (!content || !content.includes("## Exact Recommended Next Step") && !content.includes("## Recommended Next Step")) {
      recoverabilityScore -= 15;
      issues.push({
        pillar: "Recoverability",
        severity: "WARNING",
        code: "LATEST_HANDOFF_MISSING_NEXT_STEP",
        message: `Latest handoff '${latestHandoff.filename}' lacks an explicit 'Recommended Next Step' section.`,
        suggestion: "Ensure all handoffs declare unambiguous next actions for incoming agents.",
      });
    }
  }

  // Normalize scores between 0 and 100
  const clamp = (val) => Math.max(0, Math.min(100, Math.round(val)));
  const summary = {
    freshness: clamp(freshnessScore),
    completeness: clamp(completenessScore),
    consistency: clamp(consistencyScore),
    integrity: clamp(integrityScore),
    activity: clamp(activityScore),
    recoverability: clamp(recoverabilityScore),
  };

  const overallScore = Math.round(
    summary.freshness * 0.2 +
    summary.completeness * 0.15 +
    summary.consistency * 0.2 +
    summary.integrity * 0.2 +
    summary.activity * 0.15 +
    summary.recoverability * 0.1
  );

  let grade = "F";
  if (overallScore >= 90) grade = "A";
  else if (overallScore >= 75) grade = "B";
  else if (overallScore >= 60) grade = "C";

  return {
    health_score: overallScore,
    grade,
    summary,
    issues,
    metrics: {
      active_sessions: sessionInfo.active_count ?? 0,
      total_tasks: tasks.length,
      completed_tasks: tasks.filter((t) => t.status === "COMPLETED").length,
      total_handoffs: handoffs.length,
      git_modified_files: modifiedCount,
    },
  };
}
