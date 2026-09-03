# Project Context OS — Context Schema

This document specifies the exact schemas and formatting requirements for all `.project-context/` documents.

---

## 1. Agent Identity Specification

Agent identity must be recorded across four layers:

| Layer | Field | Type | Allowed / Example Values |
| :--- | :--- | :--- | :--- |
| **Agent** | `agent` | string | `antigravity`, `claude`, `codex`, `chatgpt`, `human` |
| **Interface** | `interface` | string | `kilo-code`, `vscode`, `terminal`, `web`, `cursor` |
| **Router** | `router` | string | `omniroute`, `openrouter`, `none` |
| **Model** | `model` | string | `gemini-3.8-flash`, `claude-3-7-sonnet`, `gpt-4o`, `unknown` |

### Distinction Rule:
* Kilo Code is the IDE extension/interface, not the task owner.
* OmniRoute is the prompt router, not the task owner.
* An agent running in Kilo Code through OmniRoute has `agent: "antigravity"`, `interface: "kilo-code"`, `router: "omniroute"`.

---

## 2. Canonical Document Schemas

### 2.1 State Snapshot (`STATE.md`)
* Frontmatter: `project_name`, `current_phase`, `current_status`, `current_objective`, `last_context_update`, `last_agent`, `current_agent`.
* Sections: Executive Summary, Completed Milestones, Active Work & Tasks, Blocked Work & Known Problems, Important Recent Changes, Next Recommended Actions.

### 2.2 Active Work Record (`active-work/<agent>.md`)
* Frontmatter: `agent`, `interface`, `router`, `model`, `active_task`, `task_title`, `status`, `started_at`, `updated_at`.
* Sections: `## Objective`, `## Current Progress`, `## Files Being Modified / Created`, `## Tests Being Run`, `## Blockers`, `## Next Action`.

### 2.3 Tasks Board (`TASKS.md`)
* Groupings: `## Active Tasks`, `## Ready & Backlog Tasks`, `## Completed Tasks`.
* Fields per task: `ID` (`TASK-XXX`), `Title`, `Status` (`BACKLOG`, `READY`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, `CANCELLED`), `Priority` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `Owner`, `Created Date`, `Updated Date`, `Dependencies`, `Description`, `Acceptance Criteria`.

### 2.4 Decisions Record (`DECISIONS.md`)
* Format: ADR format (`## ADR-XXX: Title`).
* Fields: `ID`, `Date`, `Status` (`ACCEPTED`, `SUPERSEDED`, `DEPRECATED`), `Decision`, `Context`, `Reason`, `Alternatives Considered`, `Consequences`.

### 2.5 Changelog (`CHANGELOG.md`)
* Grouping: Reverse chronological entries (`## YYYY-MM-DD: Title`).
* Fields: `Date`, `Agent Identity`, `Task ID`, `Summary`, `Files / Components Affected`, `Behavioral & Architectural Impact`, `Tests Performed`, `Unresolved Issues`.

### 2.6 Handoff Record (`handoffs/*.md`)
* Filename: `YYYY-MM-DDTHH-mm-ssZ_<from>_to_<to>.md`
* Frontmatter: `timestamp`, `from_agent`, `to_agent`, `task_id`, `task_title`.
* Sections: `## Objective`, `## Work Completed`, `## Files Changed`, `## Key Decisions`, `## Tests Run & Results`, `## Known Problems & Blockers`, `## Unfinished Work`, `## Exact Recommended Next Step`, `## Context References`.
