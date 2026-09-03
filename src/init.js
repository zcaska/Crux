/**
 * Project Context OS — Universal Repository Initializer
 *
 * Scaffolds the complete repository-local context store (.project-context/)
 * from pristine, domain-neutral templates for any software project.
 * Enforces strict idempotence: existing context files are never overwritten.
 */

import fs from "node:fs";
import path from "node:path";
import { getContextDir } from "./core.js";
import { assertWithinProject } from "./locator.js";
import { writeProjectConfig } from "./config.js";

/**
 * Initializes Project Context OS in the target repository.
 *
 * @param {string} rootDir - Target project repository root
 * @param {object} [options={}]
 * @param {string} [options.name] - Project name (defaults to directory basename)
 * @param {string} [options.description] - Project description
 * @param {boolean} [options.force=false] - If true, overwrite files (default: false)
 * @returns {{ initialized: boolean, isNew: boolean, createdFiles: string[], preservedFiles: string[], project: object }}
 */
export function initProjectContext(rootDir, options = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const baseName = options.name || path.basename(resolvedRoot) || "Project";
  const desc = options.description || `${baseName} software project context`;
  const contextDir = getContextDir(resolvedRoot);

  const createdFiles = [];
  const preservedFiles = [];

  // Ensure directories exist
  const dirs = [
    contextDir,
    path.join(contextDir, "active-work"),
    path.join(contextDir, "handoffs"),
    path.join(contextDir, "schemas"),
  ];

  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }

  // Safe file writer: writes only if file does not exist or options.force is true
  function writeTemplate(relPath, content) {
    const fullPath = assertWithinProject(path.join(contextDir, relPath), resolvedRoot);
    if (!fs.existsSync(fullPath) || options.force) {
      fs.writeFileSync(fullPath, content.trimStart(), "utf-8");
      createdFiles.push(`.project-context/${relPath}`);
    } else {
      preservedFiles.push(`.project-context/${relPath}`);
    }
  }

  // 1. config.json
  const configPath = path.join(contextDir, "config.json");
  let cfg;
  if (!fs.existsSync(configPath) || options.force) {
    cfg = writeProjectConfig(resolvedRoot, {
      schema_version: "1.0.0",
      project_id: baseName.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
      project_name: baseName,
      description: desc,
      invariants: {},
    });
    createdFiles.push(".project-context/config.json");
  } else {
    preservedFiles.push(".project-context/config.json");
  }

  // 2. MANIFEST.md
  writeTemplate(
    "MANIFEST.md",
    `# Project Context OS Manifest — ${baseName}

This directory contains the authoritative, repository-local persistent context for **${baseName}**.
Compatible AI coding agents read this directory to bootstrap project context, record active work,
and pass durable knowledge across sessions without requiring human synchronization.

## Context Directory Structure
- \`config.json\` - Project identity and configuration
- \`STATE.md\` - Current authoritative project status and milestone
- \`TASKS.md\` - Authoritative task board with acceptance criteria
- \`ARCHITECTURE.md\` - System architecture specification and boundaries
- \`DECISIONS.md\` - Architectural Decision Records (ADRs)
- \`CHANGELOG.md\` - Semantic changelog recording WHAT and WHY
- \`ACTIVE-WORK.md\` - Compiled active work across all agents
- \`active-work/\` - Isolated agent session files (<agent>.md)
- \`handoffs/\` - Immutable write-once agent handoff records
- \`schemas/\` - Document format definitions
`
  );

  // 3. STATE.md
  const now = new Date().toISOString();
  writeTemplate(
    "STATE.md",
    `# Project State — ${baseName}

\`\`\`yaml
project_name: "${baseName}"
current_phase: "Initial Setup & Discovery"
current_status: "READY"
status: "READY"
active_milestone: "Milestone 1: Project Architecture & Setup"
updated_at: "${now}"
updated_by: "system"
\`\`\`

## Current Reality
* Project initialized with Project Context OS.
* Status: \`READY\` for active development.
* Multi-agent context synchronization is enabled.
`
  );

  // 4. TASKS.md
  writeTemplate(
    "TASKS.md",
    `# Project Tasks — ${baseName}

This file maintains project-level tasks for **${baseName}**. Statuses must be one of:
\`BACKLOG\`, \`READY\`, \`IN_PROGRESS\`, \`BLOCKED\`, \`COMPLETED\`, \`CANCELLED\`.

---

## Active Tasks

*None.*

---

## Ready & Backlog Tasks

### TASK-001: Initial Architecture & Project Setup
* **ID**: \`TASK-001\`
* **Title**: Initial Architecture & Project Setup
* **Status**: \`READY\`
* **Priority**: \`HIGH\`
* **Owner**: \`unassigned\`
* **Created Date**: \`${now.split("T")[0]}\`
* **Updated Date**: \`${now.split("T")[0]}\`
* **Dependencies**: None
* **Description**: Establish foundational project architecture, development scripts, and initial components.
* **Acceptance Criteria**:
  - [ ] Define core architecture in ARCHITECTURE.md.
  - [ ] Implement initial components with passing automated tests.
  - [ ] Record changes in CHANGELOG.md.

---

## Completed Tasks

*None.*
`
  );

  // 5. ARCHITECTURE.md
  writeTemplate(
    "ARCHITECTURE.md",
    `# System Architecture — ${baseName}

This document defines the architectural boundaries, system components, and invariants for **${baseName}**.

## 1. System Overview
* **Project Name**: ${baseName}
* **Description**: ${desc}

## 2. Component Boundaries
* Application source code lives in the designated source directory.
* Project Context OS lives in \`.project-context/\` and remains offline-first and repository-local.

## 3. Architectural Invariants
* **Invariant 1 (Separation of Concerns)**: Reusable context infrastructure remains decoupled from application business logic.
* **Invariant 2 (Security)**: Zero credentials or private keys in Git or context documents.
* **Invariant 3 (Zero Cloud Storage)**: Project context is committed directly into the Git repository.
`
  );

  // 6. DECISIONS.md
  writeTemplate(
    "DECISIONS.md",
    `# Architectural Decision Records (ADRs) — ${baseName}

This document records significant architectural decisions for **${baseName}**.
Status must be one of: \`PROPOSED\`, \`ACCEPTED\`, \`DEPRECATED\`, \`SUPERSEDED\`.

---

## ADR-001: Offline-First Repository-Local Shared Context
* **Status**: \`ACCEPTED\`
* **Date**: \`${now.split("T")[0]}\`
* **Context**: Multiple AI coding agents collaborate on ${baseName}. Relying on external cloud databases introduces latency, vendor lock-in, and synchronization drift.
* **Decision**: All shared project context is maintained locally in the repository under \`.project-context/\`.
* **Consequences**: Zero cloud dependencies for context synchronization; fully reproducible offline.

---

## ADR-002: Official Model Context Protocol (MCP) Interface
* **Status**: \`ACCEPTED\`
* **Date**: \`${now.split("T")[0]}\`
* **Context**: AI agents require structured programmatic tool calls to query and update project context without parsing raw Markdown.
* **Decision**: Expose project context operations over STDIO JSON-RPC using the official MCP SDK.
* **Consequences**: Compatible with any standard MCP client (Cursor, Claude, Antigravity, Kilo Code).

---

## ADR-003: Isolated Active-Work Descriptors
* **Status**: \`ACCEPTED\`
* **Date**: \`${now.split("T")[0]}\`
* **Context**: Concurrent agents modifying a single shared active work file causes git merge collisions.
* **Decision**: Each agent owns an isolated file: \`.project-context/active-work/<agent>.md\`.
* **Consequences**: Collision-free multi-agent concurrency.

---

## ADR-004: Write-Once Immutable Handoffs
* **Status**: \`ACCEPTED\`
* **Date**: \`${now.split("T")[0]}\`
* **Context**: Context handoffs between agents must be audit-proof and non-repudiable.
* **Decision**: Handoffs are written once to \`.project-context/handoffs/YYYY-MM-DDTHH-mm-ssZ_<from>_to_<to>.md\` and never modified.
* **Consequences**: Historical auditability of all agent decisions and next actions.
`
  );

  // 7. ACTIVE-WORK.md
  writeTemplate(
    "ACTIVE-WORK.md",
    `# Active Work Across All Agents — ${baseName}
*Compiled: ${now}*

## Summary
* **Active Agents**: 0
* **Tasks in Progress**: 0

*No agents currently have active work sessions registered.*
`
  );

  // 8. CHANGELOG.md
  writeTemplate(
    "CHANGELOG.md",
    `# Semantic Changelog — ${baseName}

This file records meaningful semantic changes made to **${baseName}**.
Format: \`YYYY-MM-DD\` [\`TASK-ID\`]: Description (WHAT & WHY).

---

## ${now.split("T")[0]}
* [TASK-001]: Initialized project with Project Context OS.
`
  );

  // 9. READMEs & Schemas
  writeTemplate(
    "active-work/README.md",
    `# Active Work Directory

This directory stores per-agent active session files (\`<agent>.md\`).
Agents register their sessions upon starting work and update their heartbeats regularly.
`
  );

  writeTemplate(
    "handoffs/README.md",
    `# Immutable Handoffs Directory

This directory stores write-once, timestamped handoff documents between collaborating agents.
Naming convention: \`YYYY-MM-DDTHH-mm-ssZ_<from-agent>_to_<to-agent>.md\`.
`
  );

  writeTemplate(
    "schemas/context-schema.md",
    `# Context Schema Definitions

Defines metadata formats for Project Context OS documents.
`
  );

  // 10. Scaffold AGENTS.md in repo root if not already present
  const agentsMdPath = path.join(resolvedRoot, "AGENTS.md");
  if (!fs.existsSync(agentsMdPath) || options.force) {
    fs.writeFileSync(
      agentsMdPath,
      `# Universal Agent Operating Protocol & Project Context OS

Welcome to the **${baseName}** repository.

This repository uses **Project Context OS**, an offline-first, vendor-neutral, repository-local collaboration infrastructure. The Git repository and \`.project-context/\` directory are the authoritative canonical source of truth.

---

## 1. The Universal 7-Step Operating Protocol

Every autonomous coding agent (Antigravity, Claude, Codex, ChatGPT, Cursor, Kilo Code, etc.) operating in this repository MUST follow this 7-step lifecycle:

\`\`\`text
1. READ        → Inspect Git working tree & bootstrap Hot Context
2. UNDERSTAND  → Inspect source code, architectural invariants, and decisions
3. PLAN        → Formulate atomic steps, register task, and write active-work descriptor
4. EXECUTE     → Implement focused, high-quality code modifications
5. TEST        → Run automated test suites and verify zero regressions
6. RECORD      → Record changes in CHANGELOG, update TASKS, and update STATE
7. HAND OFF    → Generate an immutable handoff record if transitioning sessions
\`\`\`

---

## 2. Pre-Work Checklist (Universal Agent Bootstrap)

> [!IMPORTANT]
> **MANDATORY FIRST STEP FOR ALL AGENTS**:
> Call the \`bootstrap_context\` tool with your agent name, or run:
> \`\`\`bash
> npm run context:bootstrap
> \`\`\`
`,
      "utf-8"
    );
    createdFiles.push("AGENTS.md");
  } else {
    preservedFiles.push("AGENTS.md");
  }

  // 11. Scaffold .vscode/mcp.json if not present
  const vscodeDir = path.join(resolvedRoot, ".vscode");
  const mcpJsonPath = path.join(vscodeDir, "mcp.json");
  if (!fs.existsSync(vscodeDir)) {
    fs.mkdirSync(vscodeDir, { recursive: true });
  }

  if (!fs.existsSync(mcpJsonPath) || options.force) {
    const hasLocalTools = fs.existsSync(path.join(resolvedRoot, "tools", "project-context", "src", "mcp-server.js"));
    const mcpConfig = {
      mcpServers: {
        "project-context": {
          command: hasLocalTools ? "node" : "npx",
          args: hasLocalTools ? ["tools/project-context/src/mcp-server.js"] : ["@project-context/core", "mcp"],
          env: {
            PROJECT_CONTEXT_ROOT: "${workspaceFolder}",
          },
        },
      },
    };
    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");
    createdFiles.push(".vscode/mcp.json");
  } else {
    preservedFiles.push(".vscode/mcp.json");
  }

  return {
    initialized: true,
    isNew: preservedFiles.length === 0,
    createdFiles,
    preservedFiles,
    project: {
      name: baseName,
      root: resolvedRoot,
      contextDir,
    },
  };
}
