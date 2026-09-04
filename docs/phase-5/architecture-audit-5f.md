# Crux Phase 5F — Architecture Specification
## Multi-Agent Operational Coordination & Project-Local Observability

**Specialist**: Architecture Specialist & Lead Orchestrator  
**Status**: AUTHORITATIVE SPECIFICATION (PHASE 5F)  
**Date**: 2026-09-04  
**Target Subsystems**: `src/session.js`, `src/doctor.js`, `src/snapshot.js`, `src/lifecycle.js`, `src/index.js`, `bin/project-context.js`  

---

## 1. Executive Summary & Architectural Invariants

Phase 5F specifies the operational coordination and diagnostic observability layer of Project Context OS (Crux). It unifies multi-agent runtime coordination, collision taxonomy, and holistic health reporting while strictly adhering to the architectural foundations established in Phases 5A through 5E:

1. **Strict Project Locality**: All coordination, session discovery, collision diagnostics, and health exports operate exclusively within the single resolved project repository root. No cross-project registry, sibling-project scanning, or remote telemetry exists.
2. **Deterministic Root Jailing & Path Safety**: All candidate paths pass through `assertWithinProject`. Symlinks pointing outside the project root are rejected immediately with `SYMLINK_ESCAPE_DETECTED`.
3. **Pure Structural Source of Truth (Graphify)**: Graphify remains an external, read-only structural artifact under `graphify-out/`. Phase 5F reads Graphify status but **never** mutates, deletes, or executes Graphify.
4. **Git Non-Mutation Invariant**: Working tree inspection is strictly read-only (`git status`, `git log`, `git diff`). Zero `git commit`, `git reset`, `git checkout`, or history mutations are permitted.
5. **Frozen ChatGPT MCP Boundary**: The remote ChatGPT MCP adapter (`integrations/chatgpt/`) remains frozen at exactly 8 read-only tools. No mutation endpoints or new diagnostic tools are exposed over ChatGPT MCP.
6. **Anti-Credential Protection**: All diagnostic records, collision payloads, and exported JSON structures are audited by `assertNoSecrets`.
7. **Read-Only / Advisory Coordination**: Working-area collision diagnostics and session audits are strictly diagnostic and advisory. The system **never** force-kills agents, overwrites active sessions, or arbitrarily reassigns file ownership.

---

## 2. Working-Area Collision Diagnostics

Phase 5F formalizes and extends the working-area collision detection engine (`checkWorkingAreaCollisions` in `src/session.js`) with an explicit taxonomy, normalized path prefix matching, and actionable advisory recommendations.

### 2.1 Collision Taxonomy

A collision occurs when two or more concurrent agent sessions with `status === "IN_PROGRESS"` declare overlapping working areas (`working_area` or `files` arrays):

| Collision Type | Condition | Semantic Meaning | Risk Level |
| :--- | :--- | :--- | :---: |
| **`EXACT`** | Normalized path $P_A == P_B$ | Both agents claim the identical file or directory. | `HIGH` |
| **`CONTAINMENT_DIR_FILE`** | Directory path $P_{dir}$ contains file $P_{file}$ (e.g. `src/services/` vs `src/services/auth.js`) | One agent claims a directory hierarchy while another claims a specific file within it. | `HIGH` |
| **`CONTAINMENT_DIR_DIR`** | Directory path $P_{parent}$ contains sub-directory $P_{child}$ (e.g. `src/` vs `src/services/`) | Nested directory scope overlap. | `MEDIUM` |
| **`DISJOINT`** | Neither path is a prefix of the other. | Safe concurrent execution. Zero collision. | `NONE` |

### 2.2 Path Normalization & Overlap Semantics

Paths must be normalized deterministically across platforms:
1. Replace backslashes `\` with forward slashes `/`.
2. Lowercase comparison on case-insensitive filesystems (Windows/macOS).
3. Trailing slash normalization:
   - For directory paths, enforce trailing `/` when testing prefixes so that `src/services` does not collide with `src/services-legacy.js`.
   - Formally: $P_A$ contains $P_B$ if and only if $P_B\text{.startsWith}(P_A + (P_A\text{.endsWith('/')} ? '' : '/'))$.

### 2.3 Advisory Recommendations & Output Schema

The diagnostic record must be strictly read-only and bounded:

```typescript
interface WorkingAreaCollisionRecord {
  hasCollisions: boolean;
  count: number;
  collisions: Array<{
    agent_a: string;
    agent_b: string;
    task_a: string;
    task_b: string;
    area_a: string;
    area_b: string;
    type: "EXACT" | "OVERLAP";
    subtype: "EXACT" | "CONTAINMENT_DIR_FILE" | "CONTAINMENT_DIR_DIR";
    recommendation: string;
  }>;
}
```

#### Advisory Guidelines (Zero Auto-Mutation):
- **For `EXACT` collision**: Advise agents to coordinate via sequential handoffs (`assistedSessionEnd` -> `bootstrap_context`) or narrow working paths to specific non-overlapping functions/files.
- **For `CONTAINMENT` collision**: Advise the parent-scope agent to exclude the specific child path, or serialize task execution.
- **Prohibited Behavior**: Crux must **never** terminate a session, truncate an active file, or auto-reassign working areas.

---

## 3. Unified Project-Local Diagnostic Export

Phase 5F introduces a single, consolidated, machine-readable diagnostic model that synthesizes the entire operational state of the repository context without duplicating or competing with the Phase 5D health model.

### 3.1 Public Architecture

The diagnostic engine is exposed via:
1. **Core API**: `getProjectDiagnostics(rootDir, options = {})` exported from `src/index.js` and implemented in `src/doctor.js` (or `src/diagnostics.js`).
2. **CLI Command**: `project-context diagnostics [--json] [--output <file>]`.

### 3.2 Unified Diagnostic Schema

```typescript
interface ProjectDiagnosticsRecord {
  _type: "ProjectDiagnosticsRecord";
  schema_version: "1.0.0";
  timestamp: string;
  project: {
    id: string;
    name: string;
    root: string;
  };
  lifecycle: {
    state: "NEW" | "EXISTING" | "INCONSISTENT" | "INVALID";
    is_valid: boolean;
    missing_files: string[];
    missing_directories: string[];
  };
  health: {
    score: number;        // 0–100%
    grade: "A" | "B" | "C" | "D" | "F";
    healthy: boolean;
    pillars: {
      freshness: number;
      completeness: number;
      consistency: number;
      integrity: number;
      recoverability: number;
    };
  };
  sessions: {
    total: number;
    active_count: number;
    stale_count: number;
    completed_count: number;
    collisions: {
      has_collisions: boolean;
      count: number;
      items: WorkingAreaCollisionRecord["collisions"];
    };
  };
  structural: {
    source: "graphify";
    state: "AVAILABLE" | "STALE" | "MISSING" | "INVALID";
    is_stale: boolean;
    nodes_count: number;
    edges_count: number;
    communities_count?: number;
  };
  git: {
    branch: string;
    is_clean: boolean;
    staged_count: number;
    unstaged_count: number;
    untracked_count: number;
    recent_commit?: string;
  };
  consistency: {
    is_consistent: boolean;
    errors_count: number;
    warnings_count: number;
    info_count: number;
    issues: Array<{
      code: string;
      severity: "ERROR" | "WARNING" | "INFO";
      message: string;
      suggestion?: string;
    }>;
  };
  reconciliation: {
    reconcile_recommended: boolean;
    reasons: string[];
  };
}
```

### 3.3 Diagnostic Invariants
- **Deterministic & Bounded**: Collection counts are capped (e.g. issues capped at 25, commit log at 1, collisions at 20) to prevent unbounded memory growth.
- **Read-Only**: Generating diagnostics produces zero side effects on disk.
- **Passes `assertNoSecrets`**: Any credentials, tokens, or private keys accidentally present in Git or context documents are scrubbed or cause diagnostic error flagging.

---

## 4. Session Liveness, Staleness & Expiration Semantics

To prevent arbitrary or premature expiration of active agent tasks, Phase 5F establishes an explicit 6-state liveness taxonomy based on repository evidence (`src/session.js`, `src/core.js`, and `src/quality.js`).

### 4.1 The 6-State Session Taxonomy

```text
               ┌───────────────────────┐
               │    startSession()     │
               └──────────┬────────────┘
                          │
                          ▼
               ┌───────────────────────┐
        ┌─────►│      1. ACTIVE        │◄────────────┐
        │      └──────────┬────────────┘             │
        │                 │ idle > 1 hour            │ heartbeatSession()
        │                 ▼                          │
        │      ┌───────────────────────┐             │
        │      │   2. ACTIVE-BUT-IDLE  │─────────────┤
        │      └──────────┬────────────┘             │
        │                 │ idle > 24 hours          │
        │                 ▼                          │
        │      ┌───────────────────────┐             │
        │      │       3. STALE        │─────────────┘
        │      └──────────┬────────────┘
        │                 │
        │      ┌──────────┴──────────────────────────┐
        │      │                                     │
        │  Explicit ADOPT                        Explicit ARCHIVE
        │  (recoverSession)                      (recoverSession)
        │      │                                     │
        │      ▼                                     ▼
┌───────┴───────────────┐                 ┌────────────────────┐
│   4. ADOPTED          │                 │   6. COMPLETED /   │
│ (Emergency Handoff +  │                 │      ARCHIVED      │
│  New Active Session)  │                 └────────────────────┘
└───────────────────────┘
```

| State | Definition & Detection Criteria | Operational Behavior |
| :--- | :--- | :--- |
| **1. `ACTIVE`** | `status == "IN_PROGRESS"` AND `idleDuration <= 1 hour` | Full active concurrency. Working areas actively protected. |
| **2. `ACTIVE-BUT-IDLE`** | `status == "IN_PROGRESS"` AND `1 hour < idleDuration <= 24 hours` | Active session experiencing normal pause or long compilation/task delay. Emit `INFO: SESSION_STALE_HEARTBEAT_12H`. Working area still protected. |
| **3. `STALE`** | `status == "IN_PROGRESS"` AND `24 hours < idleDuration <= 72 hours` | Candidate for non-destructive recovery or archiving. Flags `WARNING` in `checkConsistency`. Working area flagged in collisions. |
| **4. `ABANDONED / UNCLOSED`** | `status == "IN_PROGRESS"` AND `idleDuration > 72 hours` (or machine reboot / orphan descriptor) | Considered abandoned. Crux recommends adoption via `recoverSession(rootDir, { action: 'ADOPT' })`. |
| **5. `CRASHED`** | In-flight changes detected in Git working tree attributed to agent, but agent process is dead and descriptor was not closed cleanly. (Orthogonal condition, NOT determined by idle duration alone). | Recovery generates emergency handoff recording uncommitted files. |
| **6. `COMPLETED`** | `status == "COMPLETED"` (via `assistedSessionEnd` or `recoverSession`) | Historical record. Descriptor remains indefinitely in `active-work/<agent>.md`. Never deleted. |

### 4.2 Liveness vs. Crash Distinction (Architectural Invariant)
- **Temporal Liveness is purely duration-based**: Sessions advance from `ACTIVE` -> `ACTIVE_BUT_IDLE` -> `STALE` -> `ABANDONED` based strictly on elapsed time since `last_activity`.
- **`live-but-idle != CRASHED`**: A session idle for >24h with zero uncommitted working tree modifications is `STALE`, never `CRASHED`. Treating a live-but-idle session as crashed is an invariant violation.
- **Process/Git condition is orthogonal**: `CRASHED` is an emergency recovery classification triggered when there are uncommitted working tree changes matching the agent's working area/session but the agent process has terminated or the session was left unclosed without a handoff.
- **No Automatic Expiration**: Stale sessions are **never** auto-terminated or deleted by background processes.
- **Explicit Operator/Agent Intent**: Transitioning a stale session requires explicit execution of `recoverSession(rootDir, { agent, action: 'ADOPT' | 'ARCHIVE' })`.
- **Non-Destructive Preservation**: Descriptors remain intact on disk for full auditability.

---

## 5. Security & Isolation Guarantees

Phase 5F reinforces the core security invariants across all diagnostic operations:
1. **Lexical & Physical Path Jailing**: All target paths are checked with `assertWithinProject(targetPath, rootDir)`. Attempts to inspect parent directories (`../../`) or sibling repositories are rejected with `PATH_TRAVERSAL_DETECTED`.
2. **Symlink Escape Enforcement**: Symlink targets are verified via `fs.realpathSync`. Escapes throw `SYMLINK_ESCAPE_DETECTED`.
3. **Secret Sanitization**: All exported diagnostic records pass `assertNoSecrets`.
4. **Project Locality**: No cross-project aggregation. Each diagnostic record explicitly reports `project.id` and `project.root` bound to the active runtime root.

---

## 6. Model Context Protocol (MCP) Boundary

The ChatGPT MCP boundary remains **100% FROZEN**:
- Exactly 8 tools: `get_context_snapshot`, `get_project_state`, `get_tasks`, `get_architecture`, `get_decisions`, `search_project_context`, `get_relevant_context`, `get_git_status`.
- **NO new MCP tools** (e.g. no `get_diagnostics` or `resolve_collisions` on ChatGPT MCP).
- **NO schema changes** or mutation tools.
- Phase 5F diagnostics are exposed exclusively via local CLI (`project-context diagnostics`) and core programmatic API (`getProjectDiagnostics`).

---

## 7. Documentation Alignment Plan

The repository documentation index in `docs/` currently reflects the v4.0.0 product freeze. 
- **Alignment Recommendation**: Defer full public documentation rewrites (`docs/README.md`, `docs/capabilities-matrix.md`, `docs/OPERATIONAL-HANDOFF.md`) to a dedicated **Phase 5G (Documentation & Operational Release Hardening)** phase.
- **Phase 5F Scope Boundary**: Phase 5F authors only its architecture audit and implementation specifications under `docs/phase-5/`.

---

## 8. Acceptance Criteria & Test Gates (Section 10)

Adversarial verification for Phase 5F will be implemented in Section 10 of `tests/adversarial-phase5.test.js`:

1. **Gate 10.1: Directory-File Containment Collision**:
   - Agent A claims `frontend/src/services/`, Agent B claims `frontend/src/services/auth.js`.
   - `checkWorkingAreaCollisions` detects `OVERLAP` with `subtype: "CONTAINMENT_DIR_FILE"`.
2. **Gate 10.2: Exact Collision Detection**:
   - Both agents claim `src/core.js`.
   - Detected as `type: "EXACT"`.
3. **Gate 10.3: Disjoint Non-Colliding Sessions**:
   - Agent A claims `src/a.js`, Agent B claims `src/b.js`.
   - Returns `hasCollisions === false` and `collisions.length === 0`.
4. **Gate 10.4: Advisory-Only Invariance**:
   - After collision inspection, both agent descriptor files on disk remain byte-for-byte identical (no truncation, no status mutation).
5. **Gate 10.5: Unified Diagnostic Export Completeness**:
   - `getProjectDiagnostics(rootDir)` returns all top-level keys: `lifecycle`, `health`, `sessions`, `structural`, `git`, `consistency`, `reconciliation`.
   - Bounded arrays verified (zero runaway token dumps).
6. **Gate 10.6: Anti-Credential Scrubbing on Diagnostics**:
   - Synthetically injected API token in git or comments is arrested by `assertNoSecrets`.
7. **Gate 10.7: Multi-Project Isolation in Diagnostics**:
   - Diagnostics run on `project-12` contain zero tokens or paths from `project-19`.
8. **Gate 10.8: Symlink & Traversal Resistance**:
   - Passing an escaped root or symlink to `getProjectDiagnostics` throws `PATH_TRAVERSAL_DETECTED` or `SYMLINK_ESCAPE_DETECTED`.
9. **Gate 10.9: Read-Only Graphify & Git Invariance**:
   - `graphify-out/` mtime and git HEAD commit hash remain completely unchanged after diagnostic export.
10. **Gate 10.10: Full Regression Suite Gate**:
    - Canonical core suite passes 100% (453+ assertions).
    - ChatGPT MCP adapter suite passes 100% (159 assertions).
    - Total assertions >= 465 with 0 failures.

---

## 9. Architectural Questions & Resolutions

1. **Should collision resolution ever be automated?**
   - **Resolution**: **NO.** Automated collision resolution (e.g. killing a session or reassigning paths) in an autonomous agent environment introduces catastrophic merge overwrites. Collision management is strictly advisory.
2. **Where should `getProjectDiagnostics` reside?**
   - **Resolution**: Inside `src/doctor.js` (or a dedicated `src/diagnostics.js` re-exported in `src/index.js`), leveraging existing `runDoctor`, `assessContextQuality`, `checkConsistency`, and `checkWorkingAreaCollisions` without duplicating inspection logic.
3. **Should ChatGPT MCP be updated?**
   - **Resolution**: **NO.** ChatGPT MCP remains strictly frozen at 8 read-only tools to preserve compatibility and security.
