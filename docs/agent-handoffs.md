# Project Context OS — Agent Handoffs Guide

This document details the mechanics, immutability rules, and conventions for creating and consuming agent handoffs.

---

## 1. Why Handoffs Matter

When an AI coding agent finishes a task, runs out of context tokens, or transitions work to another agent or human reviewer, it must transmit its findings clearly.

Without structured handoffs, the incoming agent must guess:
* What was actually done versus merely planned?
* Which files were altered?
* Did the automated tests actually pass?
* What are the known pitfalls or blockers?
* What is the single best next action to take?

Project Context OS solves this by making handoffs **first-class repository artifacts**.

---

## 2. Immutability Principle

> [!IMPORTANT]
> **Handoffs are Write-Once Records**:
> Once written to `.project-context/handoffs/`, a handoff document must NEVER be edited, truncated, or overwritten.
> * If a correction is needed, author a new handoff that references the previous one.
> * The integrity validator (`npm run context:validate`) flags duplicate filenames or mutated timestamps.

---

## 3. Filename Format

Handoff files use ISO 8601 UTC timestamping to guarantee chronological sorting and uniqueness:

```text
YYYY-MM-DDTHH-mm-ssZ_<from-agent>_to_<to-agent>.md
```

Examples:
* `2026-09-03T09-30-00Z_antigravity_to_chatgpt.md`
* `2026-09-03T14-15-22Z_codex_to_antigravity.md`
* `2026-09-04T08-00-10Z_antigravity_to_human.md`

---

## 4. How to Generate a Handoff

### Via CLI:
```bash
npm run context:handoff -- --to chatgpt --task "Phase 1 Implementation" --next "Review test suite and MCP server"
```

### Via MCP:
Invoke `create_handoff`:
```json
{
  "to_agent": "chatgpt",
  "task_id": "TASK-001",
  "task": "Project Context OS — Core Implementation",
  "completed_work": [
    "Scaffolded .project-context/ directory and MANIFEST.md",
    "Implemented local CLI in bin/project-context.js",
    "Implemented official MCP server with 29 tools",
    "Verified 289/289 tests pass"
  ],
  "files_changed": [
    ".project-context/*",
    "tools/project-context/*",
    "package.json",
    "AGENTS.md"
  ],
  "next_action": "Verify MCP connection and test conversational queries."
}
```

---

## 5. How an Incoming Agent Consumes Handoffs

1. When bootstrapping, check `latest_handoff` in `get_context_snapshot()` or run:
   ```bash
   npm run context:handoffs 1
   ```
2. Read the `## Exact Recommended Next Step` section.
3. Read the `## Known Problems & Blockers` section before writing code.
