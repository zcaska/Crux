/**
 * Project Context OS — Core Parsing & State Management Engine
 *
 * Provides reading, writing, parsing, and aggregation for all .project-context/ files.
 * Zero external cloud dependencies; uses Node.js standard libraries.
 */

import fs from "node:fs";
import path from "node:path";
import { assertNoSecrets } from "./security.js";

/**
 * Finds the project context directory (.project-context) relative to repo root.
 * @param {string} rootDir
 */
export function getContextDir(rootDir) {
  return path.resolve(rootDir, ".project-context");
}

/**
 * Helper to safely read a file or return null if it doesn't exist.
 * @param {string} filePath
 */
export function readFileSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

/**
 * Parses simple YAML-like frontmatter enclosed in ```yaml ... ``` or --- ... ---
 * @param {string} content
 */
export function parseYamlFrontmatter(content) {
  const result = {};
  if (!content) return result;

  let block = "";
  const codeBlockMatch = content.match(/^```yaml\s*([\s\S]*?)\s*```/m);
  if (codeBlockMatch) {
    block = codeBlockMatch[1];
  } else {
    const dashMatch = content.match(/^---\s*([\s\S]*?)\s*---/m);
    if (dashMatch) {
      block = dashMatch[1];
    }
  }

  if (!block) return result;

  let currentKey = null;
  let currentObj = null;

  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Nested 2-space indented key-value
    if (line.startsWith("  ") && currentKey && currentObj) {
      const subMatch = trimmed.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(.*)$/);
      if (subMatch) {
        const k = subMatch[1].trim();
        const v = subMatch[2].trim().replace(/^["']|["']$/g, "");
        currentObj[k] = v;
      }
      continue;
    }

    const match = line.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      const rawVal = match[2].trim();
      if (!rawVal) {
        currentKey = key;
        currentObj = {};
        result[key] = currentObj;
      } else {
        currentKey = null;
        currentObj = null;
        result[key] = rawVal.replace(/^["']|["']$/g, "");
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. STATE MANAGEMENT (STATE.md)
// ─────────────────────────────────────────────────────────────────────────────

export function readState(rootDir) {
  const filePath = path.join(getContextDir(rootDir), "STATE.md");
  const raw = readFileSafe(filePath);
  if (!raw) {
    return { exists: false, data: null, raw: "" };
  }
  const meta = parseYamlFrontmatter(raw);
  if (meta) {
    if (!meta.current_status && meta.status) meta.current_status = meta.status;
    if (!meta.status && meta.current_status) meta.status = meta.current_status;
  }
  return {
    exists: true,
    meta,
    raw,
  };
}

export function updateState(rootDir, updates, agentIdentity = null) {
  assertNoSecrets(updates, "updateState.updates");
  const filePath = path.join(getContextDir(rootDir), "STATE.md");
  let content = readFileSafe(filePath) || "";

  const timestamp = new Date().toISOString();
  const agentName = agentIdentity?.agent || updates.last_agent || "antigravity";
  const iface = agentIdentity?.interface || "kilo-code";
  const router = agentIdentity?.router || "omniroute";
  const model = agentIdentity?.model || "unknown";

  // Re-write frontmatter
  const current = readState(rootDir).meta || {};
  const merged = { ...current, ...updates };
  const fallbackProjectName = merged.project_name || path.basename(path.resolve(rootDir)) || "Project";

  const newYaml = `\`\`\`yaml
project_name: "${fallbackProjectName}"
current_phase: "${merged.current_phase || "Phase 1 — Project Context OS Implementation"}"
current_status: "${merged.current_status || "IN_PROGRESS"}"
current_objective: "${merged.current_objective || "Active Development"}"
last_context_update: "${timestamp}"
last_agent: "${agentName}"
current_agent:
  agent: "${agentName}"
  interface: "${iface}"
  router: "${router}"
  model: "${model}"
\`\`\``;

  if (content.match(/^```yaml[\s\S]*?```/m)) {
    content = content.replace(/^```yaml[\s\S]*?```/m, newYaml);
  } else {
    content = `# Project State — ${fallbackProjectName}\n\n${newYaml}\n\n${content}`;
  }

  // Update status section if provided
  if (updates.active_work_summary) {
    content = content.replace(
      /(\* \*\*Active Task\*\*:).*/,
      `$1 ${updates.active_work_summary}`
    );
  }

  fs.writeFileSync(filePath, content, "utf-8");
  return { success: true, timestamp };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MULTI-AGENT ACTIVE WORK (active-work/<agent>.md & ACTIVE-WORK.md)
// ─────────────────────────────────────────────────────────────────────────────

export function readActiveWork(rootDir) {
  const activeWorkDir = path.join(getContextDir(rootDir), "active-work");
  const agents = [];

  if (fs.existsSync(activeWorkDir)) {
    const files = fs.readdirSync(activeWorkDir);
    for (const file of files) {
      if (file.endsWith(".md") && file.toLowerCase() !== "readme.md") {
        const filePath = path.join(activeWorkDir, file);
        const raw = readFileSafe(filePath) || "";
        const meta = parseYamlFrontmatter(raw);
        agents.push({
          file,
          agent: meta.agent || path.basename(file, ".md"),
          interface: meta.interface || "unknown",
          router: meta.router || "unknown",
          model: meta.model || "unknown",
          active_task: meta.active_task || "NONE",
          task_title: meta.task_title || "None",
          status: meta.status || "READY",
          started_at: meta.started_at || "",
          updated_at: meta.updated_at || "",
          working_area: meta.working_area || (Array.isArray(meta.files) ? meta.files : []),
          files: meta.working_area || (Array.isArray(meta.files) ? meta.files : []),
          raw,
        });
      }
    }
  }

  const aggPath = path.join(getContextDir(rootDir), "ACTIVE-WORK.md");
  const aggregateRaw = readFileSafe(aggPath) || "";

  return {
    agents,
    aggregateRaw,
  };
}

export function updateActiveWork(rootDir, input) {
  assertNoSecrets(input, "updateActiveWork.input");
  const agent = input.agent || "antigravity";
  const activeWorkDir = path.join(getContextDir(rootDir), "active-work");
  if (!fs.existsSync(activeWorkDir)) {
    fs.mkdirSync(activeWorkDir, { recursive: true });
  }

  const filePath = path.join(activeWorkDir, `${agent}.md`);
  const timestamp = new Date().toISOString();
  const workingArea = input.working_area || input.files || [];

  const newDoc = `# Active Work — ${agent}

\`\`\`yaml
agent: "${agent}"
interface: "${input.interface || "kilo-code"}"
router: "${input.router || "omniroute"}"
model: "${input.model || "unknown"}"
active_task: "${input.active_task || "NONE"}"
task_title: "${input.task_title || input.title || "No Active Task"}"
status: "${input.status || "IN_PROGRESS"}"
started_at: "${input.started_at || timestamp}"
updated_at: "${timestamp}"
working_area: ${JSON.stringify(workingArea)}
\`\`\`

## Objective
${input.objective || input.description || "Task in progress."}

## Current Progress
${input.progress || "- Working on active task."}

## Files Being Modified / Created
${Array.isArray(input.files) ? input.files.map((f) => `- \`${f}\``).join("\n") : input.files || "- None recorded."}

## Tests Being Run
${Array.isArray(input.tests) ? input.tests.map((t) => `- \`${t}\``).join("\n") : input.tests || "- None recorded."}

## Blockers
${input.blockers || "None."}

## Next Action
${input.next_action || "Continue task execution."}
`;

  fs.writeFileSync(filePath, newDoc, "utf-8");

  // Recompile ACTIVE-WORK.md
  recompileActiveWork(rootDir);

  return { success: true, agent, filePath };
}

export function recompileActiveWork(rootDir) {
  const { agents } = readActiveWork(rootDir);
  const aggPath = path.join(getContextDir(rootDir), "ACTIVE-WORK.md");
  const timestamp = new Date().toISOString();

  let tableRows = "";
  let details = "";

  for (const a of agents) {
    tableRows += `| **${a.agent}** | \`${a.interface}\` | \`${a.router}\` | \`${a.model}\` | \`${a.active_task}\` | ${a.task_title} | \`${a.status}\` | \`${a.updated_at}\` |\n`;

    details += `\n### ${a.agent} (\`active-work/${a.file}\`)
* **Task ID**: \`${a.active_task}\`
* **Title**: ${a.task_title}
* **Status**: \`${a.status}\`
* **Interface**: \`${a.interface}\` | **Router**: \`${a.router}\` | **Model**: \`${a.model}\`
* **Updated At**: \`${a.updated_at}\`
`;
  }

  const content = `# Active Work (Aggregated View)

*Last Compiled: ${timestamp}*

This document is the compiled view of active work across all autonomous agents currently operating in the repository. Individual agents maintain their isolated task descriptors in \`.project-context/active-work/<agent>.md\`.

---

## Active Agents Summary

| Agent | Interface | Router | Model | Task ID | Task Title | Status | Updated At |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${tableRows || "| *None* | - | - | - | - | - | - | - |\n"}
---

## Detailed Agent Tasks
${details || "\nNo agents are currently registered in active-work/.\n"}
`;

  fs.writeFileSync(aggPath, content, "utf-8");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TASKS MANAGEMENT (TASKS.md)
// ─────────────────────────────────────────────────────────────────────────────

export function readTasks(rootDir, statusFilter = null) {
  const filePath = path.join(getContextDir(rootDir), "TASKS.md");
  const raw = readFileSafe(filePath) || "";
  const tasks = [];

  const taskRegex = /###\s+([A-Z0-9_\-]+):\s*([^\n]+)[\s\S]*?\* \*\*ID\*\*:\s*`?([A-Z0-9_\-]+)`?[\s\S]*?\* \*\*Status\*\*:\s*`?([A-Z_]+)`?[\s\S]*?\* \*\*Priority\*\*:\s*`?([A-Z]+)`?[\s\S]*?\* \*\*Owner\*\*:\s*`?([^`\n]+)`?[\s\S]*?\* \*\*Created Date\*\*:\s*([^\n]+)[\s\S]*?\* \*\*Updated Date\*\*:\s*([^\n]+)[\s\S]*?\* \*\*Description\*\*:\s*([^\n]+)/g;

  let match;
  while ((match = taskRegex.exec(raw)) !== null) {
    // Extract block for this task to parse criteria & dependencies
    const sectionStart = match.index;
    const nextMatch = raw.indexOf("### ", sectionStart + match[0].length);
    const taskBlock = raw.slice(sectionStart, nextMatch !== -1 ? nextMatch : undefined);

    const critMatch = taskBlock.match(/\* \*\*Acceptance Criteria\*\*:\s*\n([\s\S]*?)(?=\n---|\n###|$)/);
    const acceptanceCriteria = critMatch
      ? critMatch[1]
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("-") || l.startsWith("*"))
      : [];

    const depMatch = taskBlock.match(/\* \*\*Dependencies\*\*:\s*`?([^\n`]+)`?/);
    const dependencies = depMatch ? depMatch[1].trim() : "None";

    const task = {
      id: match[1],
      title: match[2].trim(),
      status: match[4].trim(),
      priority: match[5].trim(),
      owner: match[6].trim(),
      created_date: match[7].trim(),
      updated_date: match[8].trim(),
      description: match[9].trim(),
      dependencies,
      acceptance_criteria: acceptanceCriteria,
    };
    if (!statusFilter || task.status === statusFilter) {
      tasks.push(task);
    }
  }

  return { tasks, raw };
}

export function createTask(rootDir, input) {
  assertNoSecrets(input, "createTask.input");
  if (!input.title || input.title.trim() === "") {
    throw new Error("Task title is required.");
  }

  const filePath = path.join(getContextDir(rootDir), "TASKS.md");
  let raw = readFileSafe(filePath) || "# Project Tasks\n\n## Active Tasks\n";

  // Calculate next task ID if not explicitly specified
  let nextId = input.id;
  if (!nextId) {
    const matches = raw.match(/[A-Z]+-(\d+)/g) || [];
    let maxId = 0;
    for (const m of matches) {
      const numMatch = m.match(/\d+$/);
      if (numMatch) {
        const num = parseInt(numMatch[0], 10);
        if (num > maxId) maxId = num;
      }
    }
    const prefix = input.prefix || "TASK";
    nextId = `${prefix}-${String(maxId + 1).padStart(3, "0")}`;
  }
  const today = new Date().toISOString().slice(0, 10);

  const status = input.status || "READY";
  const priority = input.priority || "MEDIUM";
  const owner = input.owner || "antigravity";
  const desc = input.description || input.title;

  const entry = `
### ${nextId}: ${input.title.trim()}
* **ID**: \`${nextId}\`
* **Title**: ${input.title.trim()}
* **Status**: \`${status}\`
* **Priority**: \`${priority}\`
* **Owner**: \`${owner}\`
* **Created Date**: \`${today}\`
* **Updated Date**: \`${today}\`
* **Dependencies**: ${input.dependencies || "None"}
* **Description**: ${desc}
* **Acceptance Criteria**:
  - [ ] Complete implementation and tests.
`;

  // Insert under appropriate heading
  if (status === "IN_PROGRESS" || status === "READY") {
    if (raw.includes("## Active Tasks")) {
      raw = raw.replace("## Active Tasks", `## Active Tasks\n${entry}`);
    } else {
      raw += `\n## Active Tasks\n${entry}`;
    }
  } else {
    if (raw.includes("## Ready & Backlog Tasks")) {
      raw = raw.replace("## Ready & Backlog Tasks", `## Ready & Backlog Tasks\n${entry}`);
    } else {
      raw += `\n## Ready & Backlog Tasks\n${entry}`;
    }
  }

  fs.writeFileSync(filePath, raw, "utf-8");
  return { success: true, id: nextId, title: input.title, status };
}

export function updateTask(rootDir, taskId, updates) {
  assertNoSecrets(updates, "updateTask.updates");
  const filePath = path.join(getContextDir(rootDir), "TASKS.md");
  let raw = readFileSafe(filePath);
  if (!raw || !raw.includes(taskId)) {
    throw new Error(`Task ${taskId} not found in TASKS.md.`);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Replace status
  if (updates.status) {
    const statusRegex = new RegExp(`(\\*\\*ID\\*\\*:\\s*\`?${taskId}\`?[\\s\\S]*?\\* \\*\\*Status\\*\\*:\\s*\`?)([A-Z_]+)(\`?)`);
    raw = raw.replace(statusRegex, `$1${updates.status}$3`);
  }

  // Update date
  const dateRegex = new RegExp(`(\\*\\*ID\\*\\*:\\s*\`?${taskId}\`?[\\s\\S]*?\\* \\*\\*Updated Date\\*\\*:\\s*\`?)([0-9-]+)(\`?)`);
  raw = raw.replace(dateRegex, `$1${today}$3`);

  fs.writeFileSync(filePath, raw, "utf-8");
  return { success: true, id: taskId, updates };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ARCHITECTURAL DECISIONS (DECISIONS.md)
// ─────────────────────────────────────────────────────────────────────────────

export function readDecisions(rootDir) {
  const filePath = path.join(getContextDir(rootDir), "DECISIONS.md");
  const raw = readFileSafe(filePath) || "";
  const decisions = [];

  // Split by markdown ADR headings
  const sections = raw.split(/\n(?=##\s+ADR-\d+)/);
  for (const sec of sections) {
    const titleMatch = sec.match(/^##\s+(ADR-\d+):\s*([^\n]+)/);
    if (!titleMatch) continue;

    const id = titleMatch[1];
    const title = titleMatch[2].trim();

    const dateMatch = sec.match(/\* \*\*Date\*\*:\s*`?([0-9-]+)`?/);
    const statusMatch = sec.match(/\* \*\*Status\*\*:\s*`?([A-Z]+)`?/);
    const decMatch = sec.match(/\* \*\*Decision\*\*:\s*([^\n]+)/);
    const ctxMatch = sec.match(/\* \*\*Context\*\*:\s*([^\n]+)/);
    const reasonMatch = sec.match(/\* \*\*Reason\*\*:\s*([^\n]+)/);

    decisions.push({
      id,
      title,
      date: dateMatch ? dateMatch[1] : "",
      status: statusMatch ? statusMatch[1] : "ACCEPTED",
      decision: decMatch ? decMatch[1].trim() : "",
      context: ctxMatch ? ctxMatch[1].trim() : "",
      reason: reasonMatch ? reasonMatch[1].trim() : "",
      raw: sec,
    });
  }

  return { decisions, raw };
}

export function recordDecision(rootDir, input) {
  assertNoSecrets(input, "recordDecision.input");
  if (!input.title || !input.decision) {
    throw new Error("Decision title and decision text are required.");
  }

  const filePath = path.join(getContextDir(rootDir), "DECISIONS.md");
  let raw = readFileSafe(filePath) || "# Architectural Decision Records (ADR)\n";

  const matches = raw.match(/ADR-(\d+)/g) || [];
  let maxId = 0;
  for (const m of matches) {
    const num = parseInt(m.replace("ADR-", ""), 10);
    if (num > maxId) maxId = num;
  }
  const nextId = input.id || `ADR-${String(maxId + 1).padStart(3, "0")}`;
  const today = new Date().toISOString().slice(0, 10);

  const entry = `
---

## ${nextId}: ${input.title.trim()}

* **ID**: \`${nextId}\`
* **Date**: \`${today}\`
* **Status**: \`${input.status || "ACCEPTED"}\`
* **Decision**: ${input.decision.trim()}
* **Context**: ${input.context || "No context provided."}
* **Reason**: ${input.reason || "Architectural decision."}
* **Alternatives Considered**:
${Array.isArray(input.alternatives) ? input.alternatives.map((a) => `  - *${a}*`).join("\n") : `  - *${input.alternatives || "None"}*`}
* **Consequences**: ${input.consequences || "None."}
`;

  fs.appendFileSync(filePath, entry, "utf-8");
  return { success: true, id: nextId, title: input.title };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CHANGELOG (CHANGELOG.md)
// ─────────────────────────────────────────────────────────────────────────────

export function readChangelog(rootDir, limit = 10) {
  const filePath = path.join(getContextDir(rootDir), "CHANGELOG.md");
  const raw = readFileSafe(filePath) || "";
  const entries = [];

  const entryRegex = /##\s+([0-9-]+):\s*([^\n]+)[\s\S]*?\* \*\*Date\*\*:\s*`?([0-9-]+)`?[\s\S]*?\* \*\*Task ID\*\*:\s*`?([^`\n]+)`?[\s\S]*?\* \*\*Summary\*\*:\s*([^\n]+)/g;

  let match;
  while ((match = entryRegex.exec(raw)) !== null) {
    entries.push({
      date: match[1],
      title: match[2].trim(),
      task_id: match[4].trim(),
      summary: match[5].trim(),
    });
    if (entries.length >= limit) break;
  }

  return { entries, raw };
}

export function recordChange(rootDir, input) {
  assertNoSecrets(input, "recordChange.input");
  if (!input.summary) {
    throw new Error("Changelog summary is required.");
  }

  const filePath = path.join(getContextDir(rootDir), "CHANGELOG.md");
  let raw = readFileSafe(filePath) || "# Project Changelog\n";

  const today = new Date().toISOString().slice(0, 10);
  const agent = input.agent || "antigravity";
  const iface = input.interface || "kilo-code";
  const router = input.router || "omniroute";
  const model = input.model || "unknown";

  const entry = `
## ${today}: ${input.title || input.summary.slice(0, 60)}

* **Date**: \`${today}\`
* **Agent Identity**:
  * Agent: \`${agent}\`
  * Interface: \`${iface}\`
  * Router: \`${router}\`
  * Model: \`${model}\`
* **Task ID**: \`${input.task_id || "TASK-UNKNOWN"}\`
* **Summary**: ${input.summary.trim()}
* **Files / Components Affected**:
${Array.isArray(input.files) ? input.files.map((f) => `  * \`${f}\``).join("\n") : `  * ${input.files || "None"}`}
* **Behavioral & Architectural Impact**:
${Array.isArray(input.impact) ? input.impact.map((i) => `  * ${i}`).join("\n") : `  * ${input.impact || "Standard change."}`}
* **Tests Performed**:
${Array.isArray(input.tests) ? input.tests.map((t) => `  * ${t}`).join("\n") : `  * ${input.tests || "Manual review"}`}
* **Unresolved Issues**: ${input.unresolved || "None."}
`;

  // Prepend entry after header
  if (raw.includes("---")) {
    raw = raw.replace("---", `---\n${entry}`);
  } else {
    raw += `\n---\n${entry}`;
  }

  fs.writeFileSync(filePath, raw, "utf-8");
  return { success: true, date: today, summary: input.summary };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. IMMUTABLE AGENT HANDOFFS (handoffs/*.md)
// ─────────────────────────────────────────────────────────────────────────────

export function readHandoffs(rootDir, limit = 10) {
  const handoffDir = path.join(getContextDir(rootDir), "handoffs");
  const handoffs = [];

  if (fs.existsSync(handoffDir)) {
    const files = fs
      .readdirSync(handoffDir)
      .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
      .map((f) => {
        let mtime = 0;
        try {
          mtime = fs.statSync(path.join(handoffDir, f)).mtimeMs;
        } catch {}
        return { name: f, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name))
      .map((item) => item.name);

    for (const f of files.slice(0, limit)) {
      const filePath = path.join(handoffDir, f);
      const raw = readFileSafe(filePath) || "";
      const meta = parseYamlFrontmatter(raw);
      handoffs.push({
        filename: f,
        timestamp: meta.timestamp || "",
        from_agent: meta.from_agent || "unknown",
        to_agent: meta.to_agent || "any",
        task_id: meta.task_id || "",
        task_title: meta.task_title || "",
        raw,
      });
    }
  }

  return { handoffs };
}

export function createHandoff(rootDir, input) {
  assertNoSecrets(input, "createHandoff.input");
  if (!input.task && !input.task_id) {
    throw new Error("Handoff task information is required.");
  }
  if (!input.next_action) {
    throw new Error("Handoff next_action is required.");
  }

  const handoffDir = path.join(getContextDir(rootDir), "handoffs");
  if (!fs.existsSync(handoffDir)) {
    fs.mkdirSync(handoffDir, { recursive: true });
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const tsName = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}-${pad(now.getUTCSeconds())}Z`;
  const fromAgent = input.from_agent || input.agent || "antigravity";
  const toAgent = input.to_agent || "any";

  if (input.filename && (input.filename.includes("..") || input.filename.includes("/") || input.filename.includes("\\"))) {
    const err = new Error(`PathSecurityViolation: Handoff filename '${input.filename}' contains illegal path traversal characters.`);
    err.code = "PATH_TRAVERSAL_DETECTED";
    throw err;
  }

  const filename = input.filename || `${tsName}_${fromAgent}_to_${toAgent}.md`;
  const filePath = path.join(handoffDir, filename);

  // IMMUTABILITY CHECK: Never overwrite
  if (fs.existsSync(filePath)) {
    throw new Error(`Refusing to overwrite existing immutable handoff: ${filename}`);
  }

  const doc = `# Agent Handoff: ${fromAgent} -> ${toAgent}

\`\`\`yaml
timestamp: "${now.toISOString()}"
from_agent:
  agent: "${fromAgent}"
  interface: "${input.interface || "kilo-code"}"
  router: "${input.router || "omniroute"}"
  model: "${input.model || "unknown"}"
to_agent: "${toAgent}"
task_id: "${input.task_id || "TASK-UNKNOWN"}"
task_title: "${input.task || input.task_title || "Unspecified Task"}"
\`\`\`

## Objective
${input.objective || input.task || "Task continuation."}

## Work Completed
${Array.isArray(input.completed_work) ? input.completed_work.map((w) => `- ${w}`).join("\n") : input.completed_work || "- Completed session work."}

## Files Changed
${Array.isArray(input.files_changed) ? input.files_changed.map((f) => `- \`${f}\``).join("\n") : input.files_changed || "- None specified."}

## Key Decisions
${Array.isArray(input.decisions) ? input.decisions.map((d) => `- ${d}`).join("\n") : input.decisions || "- None."}

## Tests Run & Results
${Array.isArray(input.tests) ? input.tests.map((t) => `- ${t}`).join("\n") : input.tests || "- Verified."}

## Known Problems & Blockers
${input.blockers || "None."}

## Unfinished Work
${Array.isArray(input.unfinished_work) ? input.unfinished_work.map((u) => `- ${u}`).join("\n") : input.unfinished_work || "None."}

## Exact Recommended Next Step
${input.next_action}

## Context References
- \`.project-context/STATE.md\`
- \`.project-context/ACTIVE-WORK.md\`
`;

  fs.writeFileSync(filePath, doc, "utf-8");
  return { success: true, filename, filePath };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SEARCH CONTEXT (search_project_context)
// ─────────────────────────────────────────────────────────────────────────────

export function searchProjectContext(rootDir, query) {
  if (!query || query.trim() === "") return [];
  const q = query.toLowerCase();
  const contextDir = getContextDir(rootDir);
  const results = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        const content = readFileSafe(full);
        if (content) {
          const lines = content.split("\n");
          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes(q)) {
              results.push({
                file: path.relative(rootDir, full).replace(/\\/g, "/"),
                lineNumber: idx + 1,
                lineContent: line.trim(),
              });
            }
          });
        }
      }
    }
  }

  walk(contextDir);
  return results.slice(0, 50);
}

export function parseFrontmatter(content) {
  return {
    meta: parseYamlFrontmatter(content),
    raw: content,
  };
}
