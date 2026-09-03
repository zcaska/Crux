/**
 * Project Context OS — Git ↔ Context Drift & Synchronization Engine
 *
 * Identifies semantic drift between Git physical filesystem reality and
 * Project Context OS records:
 *   - Modified files with no registered active session
 *   - Modified files outside an active agent's declared working area
 *   - Tasks marked COMPLETED whose files remain modified in the working tree
 *   - Context pointers referencing nonexistent files on disk
 *   - Automated task-correlation suggestions for modified files
 */

import fs from "node:fs";
import path from "node:path";
import { getGitStatus, getGitDiff } from "./git.js";
import { readTasks, readActiveWork, readChangelog } from "./core.js";
import { listSessions } from "./session.js";

/**
 * Checks if a target file matches a working area spec (file path, dir prefix, or glob).
 * @param {string} filePath
 * @param {string} areaSpec
 * @returns {boolean}
 */
function matchesArea(filePath, areaSpec) {
  const normFile = filePath.replace(/\\/g, "/").toLowerCase();
  const normArea = areaSpec.replace(/\\/g, "/").toLowerCase();
  if (normArea.endsWith("/*") || normArea.endsWith("/**")) {
    const prefix = normArea.replace(/\/\*+$/, "");
    return normFile.startsWith(prefix);
  }
  return normFile === normArea || normFile.startsWith(normArea + "/");
}

/**
 * Detects semantic drift between Git reality and Context OS.
 * @param {string} rootDir
 * @returns {{
 *   hasDrift: boolean,
 *   untracked_modifications: Array<{ path: string, staged: boolean, suggested_task?: string }>,
 *   stale_completed_tasks: Array<{ id: string, title: string, lingering_files: string[] }>,
 *   missing_context_files: Array<{ context_source: string, referenced_path: string }>,
 *   drift_items: Array<{ severity: 'ERROR'|'WARNING'|'INFO', code: string, message: string, suggestion: string }>
 * }}
 */
export function checkContextDrift(rootDir) {
  const driftItems = [];
  const gitStatus = getGitStatus(rootDir);
  const { tasks } = readTasks(rootDir);
  const sessionInfo = listSessions(rootDir);

  const activeSessions = sessionInfo.sessions.filter((s) => s.status === "IN_PROGRESS");
  const allModified = [
    ...(gitStatus.staged || []).map((f) => ({ path: f.path, staged: true })),
    ...(gitStatus.unstaged || []).map((f) => ({ path: f.path, staged: false })),
  ];

  // 1. Detect modifications with no active session or outside declared working areas
  const untrackedModifications = [];
  for (const mod of allModified) {
    // Exclude git metadata and internal context updates
    if (mod.path.startsWith(".git") || mod.path.startsWith(".project-context/active-work")) {
      continue;
    }

    let coveredBySession = false;
    for (const sess of activeSessions) {
      const areas = sess.working_area || sess.files || [];
      if (areas.some((area) => matchesArea(mod.path, area))) {
        coveredBySession = true;
        break;
      }
    }

    if (!coveredBySession) {
      // Suggest candidate task based on generic path segment token overlap
      let suggestedTask = null;
      const pathSegments = mod.path
        .toLowerCase()
        .split(/[\/\\\.\-_]+/)
        .filter((tok) => tok.length > 3 && !["index", "test", "spec", "main"].includes(tok));

      for (const t of tasks) {
        if (t.status === "READY" || t.status === "IN_PROGRESS") {
          const tText = `${t.id} ${t.title} ${t.description || ""}`.toLowerCase();
          if (pathSegments.some((tok) => tText.includes(tok))) {
            suggestedTask = t.id;
            break;
          }
        }
      }

      untrackedModifications.push({
        path: mod.path,
        staged: mod.staged,
        suggested_task: suggestedTask || undefined,
      });
    }
  }

  if (untrackedModifications.length > 0 && activeSessions.length === 0) {
    driftItems.push({
      severity: "INFO",
      code: "UNTRACKED_GIT_MODIFICATIONS",
      message: `${untrackedModifications.length} files are modified in Git, but no active agent session is registered.`,
      suggestion: "Start a session with 'project-context session-start' to declare active work and working areas.",
    });
  }

  // 2. Check for completed tasks with lingering modified files
  const staleCompletedTasks = [];
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");
  for (const ct of completedTasks) {
    // If task mentions specific files in description or criteria
    const lingeringFiles = [];
    for (const mod of allModified) {
      const ctDesc = `${ct.title} ${ct.description || ""}`;
      if (ctDesc.includes(path.basename(mod.path))) {
        lingeringFiles.push(mod.path);
      }
    }
    if (lingeringFiles.length > 0) {
      staleCompletedTasks.push({
        id: ct.id,
        title: ct.title,
        lingering_files: lingeringFiles,
      });
      driftItems.push({
        severity: "WARNING",
        code: "COMPLETED_TASK_LINGERING_MODS",
        message: `Task '${ct.id}: ${ct.title}' is marked COMPLETED, but related files (${lingeringFiles.join(", ")}) remain modified in Git.`,
        suggestion: `Commit lingering modifications or revert task '${ct.id}' to IN_PROGRESS.`,
      });
    }
  }

  // 3. Detect context references to nonexistent files on disk
  const missingContextFiles = [];
  const { entries: changelog } = readChangelog(rootDir, 10);
  for (const entry of changelog) {
    for (const file of entry.files || []) {
      // Ignore glob patterns
      if (file.includes("*") || file.startsWith(".project-context/scratch")) continue;
      const fullPath = path.join(rootDir, file);
      if (!fs.existsSync(fullPath)) {
        missingContextFiles.push({
          context_source: `CHANGELOG (${entry.date} - ${entry.task_id})`,
          referenced_path: file,
        });
      }
    }
  }

  if (missingContextFiles.length > 0) {
    driftItems.push({
      severity: "WARNING",
      code: "CONTEXT_MISSING_DISK_FILES",
      message: `Context records reference ${missingContextFiles.length} files that do not exist on disk.`,
      suggestion: "Verify if referenced files were moved, renamed, or deleted.",
    });
  }

  return {
    hasDrift: driftItems.length > 0,
    untracked_modifications: untrackedModifications,
    stale_completed_tasks: staleCompletedTasks,
    missing_context_files: missingContextFiles,
    drift_items: driftItems,
  };
}
