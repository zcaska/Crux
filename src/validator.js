/**
 * Project Context OS — Integrity Validator
 *
 * Validates document structures, metadata schema adherence, task statuses,
 * active-agent records, handoff formats, and anti-credential safety.
 * Returns structured actionable errors and warnings.
 */

import fs from "node:fs";
import path from "node:path";
import { getContextDir, readFileSafe, parseYamlFrontmatter, readTasks, readActiveWork, readHandoffs } from "./core.js";
import { scanForSecrets } from "./security.js";
import { checkInvariants } from "./invariants.js";

const VALID_TASK_STATUSES = ["BACKLOG", "READY", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"];
const VALID_TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Validates the entire .project-context/ store.
 * @param {string} rootDir
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateContext(rootDir) {
  const errors = [];
  const warnings = [];
  const contextDir = getContextDir(rootDir);

  // 1. Directory Structure Checks
  if (!fs.existsSync(contextDir)) {
    errors.push(`Critical: Directory .project-context/ does not exist at ${contextDir}`);
    return { valid: false, errors, warnings };
  }

  const requiredDirs = ["active-work", "handoffs", "schemas"];
  for (const d of requiredDirs) {
    const fullPath = path.join(contextDir, d);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Missing required directory: .project-context/${d}/`);
    }
  }

  // 2. Required Canonical Files Check
  const requiredFiles = [
    "MANIFEST.md",
    "STATE.md",
    "ARCHITECTURE.md",
    "DECISIONS.md",
    "ACTIVE-WORK.md",
    "CHANGELOG.md",
    "TASKS.md",
    "active-work/README.md",
    "handoffs/README.md",
    "schemas/context-schema.md",
  ];

  for (const f of requiredFiles) {
    const filePath = path.join(contextDir, f);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing required canonical file: .project-context/${f}`);
    }
  }

  // 3. Credential & Secret Audit across all context files
  function scanDirSecrets(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scanDirSecrets(full);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        const text = readFileSafe(full) || "";
        const relPath = path.relative(rootDir, full).replace(/\\/g, "/");
        const violations = scanForSecrets(text, relPath);
        for (const v of violations) {
          errors.push(`Security violation in ${relPath}: credential pattern detected (${v.patternName})`);
        }
      }
    }
  }
  scanDirSecrets(contextDir);

  // 4. STATE.md Integrity
  const statePath = path.join(contextDir, "STATE.md");
  if (fs.existsSync(statePath)) {
    const rawState = readFileSafe(statePath) || "";
    const stateMeta = parseYamlFrontmatter(rawState);

    if (!stateMeta.project_name) {
      errors.push("STATE.md is missing required field: project_name");
    }
    if (!stateMeta.current_phase) {
      errors.push("STATE.md is missing required field: current_phase");
    }
    if (!stateMeta.current_status) {
      errors.push("STATE.md is missing required field: current_status");
    }
    if (!stateMeta.last_context_update) {
      warnings.push("STATE.md is missing last_context_update timestamp");
    }
  }

  // 5. Active Work Validation & Concurrency Check
  const activeWorkDir = path.join(contextDir, "active-work");
  const registeredAgents = new Set();

  if (fs.existsSync(activeWorkDir)) {
    const activeFiles = fs
      .readdirSync(activeWorkDir)
      .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");

    for (const af of activeFiles) {
      const fullPath = path.join(activeWorkDir, af);
      const raw = readFileSafe(fullPath) || "";
      const meta = parseYamlFrontmatter(raw);

      const agentName = meta.agent || path.basename(af, ".md");
      if (registeredAgents.has(agentName.toLowerCase())) {
        errors.push(`Duplicate active-agent record detected for: "${agentName}"`);
      }
      registeredAgents.add(agentName.toLowerCase());

      if (!meta.active_task) {
        errors.push(`active-work/${af} is missing required field: active_task`);
      }
      if (!meta.status) {
        errors.push(`active-work/${af} is missing required field: status`);
      }
      if (!raw.includes("## Objective")) {
        warnings.push(`active-work/${af} is missing '## Objective' section`);
      }
      if (!raw.includes("## Next Action")) {
        warnings.push(`active-work/${af} is missing '## Next Action' section`);
      }
    }
  }

  // 6. TASKS.md Validation
  const { tasks } = readTasks(rootDir);
  const taskIds = new Set();

  for (const t of tasks) {
    taskIds.add(t.id);
    if (!VALID_TASK_STATUSES.includes(t.status)) {
      errors.push(`Invalid task status "${t.status}" on task ${t.id}. Allowed: ${VALID_TASK_STATUSES.join(", ")}`);
    }
    if (!VALID_TASK_PRIORITIES.includes(t.priority)) {
      warnings.push(`Non-standard task priority "${t.priority}" on task ${t.id}. Expected: ${VALID_TASK_PRIORITIES.join(", ")}`);
    }
  }

  // 7. Check Active Task References
  const { agents } = readActiveWork(rootDir);
  for (const a of agents) {
    if (a.active_task && a.active_task !== "NONE") {
      if (!taskIds.has(a.active_task)) {
        warnings.push(
          `Agent "${a.agent}" active-work references task "${a.active_task}", but it is not defined in TASKS.md`
        );
      }
    }
  }

  // 8. Handoffs Archive Validation & Immutability Check
  const handoffDir = path.join(contextDir, "handoffs");
  if (fs.existsSync(handoffDir)) {
    const handoffFiles = fs
      .readdirSync(handoffDir)
      .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");

    for (const hf of handoffFiles) {
      // Validate filename convention: YYYY-MM-DDTHH-mm-ssZ_<from>_to_<to>.md
      const nameMatch = hf.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z_[a-zA-Z0-9_\-]+_to_[a-zA-Z0-9_\-]+\.md$/);
      if (!nameMatch) {
        warnings.push(
          `Handoff file "${hf}" does not strictly match convention: YYYY-MM-DDTHH-mm-ssZ_<from>_to_<to>.md`
        );
      }

      const fullPath = path.join(handoffDir, hf);
      const raw = readFileSafe(fullPath) || "";
      const meta = parseYamlFrontmatter(raw);

      if (!meta.timestamp) {
        errors.push(`Handoff "${hf}" is missing required timestamp in frontmatter`);
      }
      if (!raw.includes("## Work Completed")) {
        warnings.push(`Handoff "${hf}" is missing '## Work Completed' section`);
      }
      if (!raw.includes("## Exact Recommended Next Step")) {
        errors.push(`Handoff "${hf}" is missing required section: '## Exact Recommended Next Step'`);
      }
    }
  }

  // 9. Architectural Invariant Checks
  const invRes = checkInvariants(rootDir);
  for (const v of invRes.violations) {
    if (v.severity === "ERROR") {
      errors.push(`[${v.rule}] ${v.message}`);
    } else {
      warnings.push(`[${v.rule}] ${v.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
