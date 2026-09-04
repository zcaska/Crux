# Phase 5E Architecture Specification
## Non-Destructive Context Recovery & Operational Reconciliation

**Specialist**: Architecture Specialist  
**Target Subsystems**: `src/lifecycle.js`, `src/init.js`, `src/consistency.js`, `src/doctor.js`, `src/snapshot.js`  
**Status**: FORMAL ARCHITECTURE SPECIFICATION (AWAITING IMPLEMENTATION AUTHORIZATION)  
**Date**: 2026-09-04  

---

## 1. Executive Summary & Purpose

Phase 5E formalizes the runtime's **Non-Destructive Context Recovery & Operational Reconciliation** model. While Phases 5A through 5D established:
- Lifecycle state classification (`NEW`, `EXISTING`, `INCONSISTENT`, `INVALID`),
- External Graphify structural bridging (`graphify-out/`),
- Progressive Dual-Source Context Fusion (`getFusedContext`), and
- Unified Context Health & Consistency auditing (`runDoctor`, `checkConsistency`),

Phase 5E establishes the **exact, deterministic operational rules** for how Crux safely recovers from interrupted/crashed sessions, reconciles partial context states, and handles diagnostics without human re-explanation, without data loss, and without breaking frozen boundaries.

---

## 2. Project-Context Recovery Model

### 2.1 Recoverable vs. Non-Recoverable States
Based on `src/init.js` and `src/core.js`, Crux recognizes four lifecycle states:
1. **`NEW`**: Context store does not exist. Recoverable via standard clean initialization (`mode: 'create'` or `'auto'`).
2. **`EXISTING`**: All canonical directories and files exist and are well-formed. No recovery action needed.
3. **`INCONSISTENT`**: The `.project-context/` directory exists, but one or more canonical files or directories are missing. **RECOVERABLE** via non-destructive adoption/reconciliation.
4. **`INVALID`**: Path exists as a non-directory file, permissions are blocked, or critical YAML frontmatter cannot be parsed without catastrophic loss. **NON-RECOVERABLE AUTOMATICALLY**. Crux must fail-closed with `CONTEXT_INVALID_STATE` or `ContextIntegrityError`.

### 2.2 Canonical Artifact Matrix
The repository ground-truth establishes the exact canonical files and directories:

| Category | Artifact | Safe Auto-Creation? | Mutation Policy |
| :--- | :--- | :---: | :--- |
| **Directories** | `active-work/`, `handoffs/`, `schemas/` | **YES** | Safe `mkdirSync({ recursive: true })` |
| **Identity** | `config.json` | **YES** (fallback) | Preserved 100%; never overwritten if present |
| **Core Architecture**| `ARCHITECTURE.md`, `MANIFEST.md`, `schemas/context-schema.md` | **YES** (template) | Written only if missing; never truncated |
| **Operational State**| `STATE.md` | **NEVER** overwrite | High-value user state. If missing, restored from template; if present, untouched |
| **Task Board** | `TASKS.md` | **NEVER** overwrite | High-value user state. If missing, restored from template; if present, untouched |
| **Decisions** | `DECISIONS.md` | **NEVER** overwrite | High-value user state. If missing, restored from template; if present, untouched |
| **Changelog** | `CHANGELOG.md` | **YES** (template) | Restored with clean header if missing; existing entries never erased |
| **Active Work View** | `ACTIVE-WORK.md` | **YES** (recompile) | Deterministically recompiled from individual `active-work/*.md` files |
| **Agent Sessions** | `active-work/<agent>.md` | **NEVER** delete | Maintained per-agent; transitioned via status update, never unlinked |
| **Handoffs** | `handoffs/*.md` | **NEVER** delete/edit | Write-once immutable records |
| **External Graph** | `graphify-out/*` | **STRICTLY PROHIBITED** | Crux never creates, mutates, or deletes external Graphify artifacts |
| **Scratch Files** | `.project-context/scratch/*` | **NO AUTO-DELETION** | Treated as user/agent data. Scratch files are never deleted automatically |

### 2.3 Reuse of Initializer Behavior
Phase 5E reuses and exposes `initProjectContext(rootDir, { mode: 'adopt' })` as the foundation for context reconciliation. Safe reconciliation is defined as:
```javascript
export function reconcileContext(rootDir, options = {}) {
  // 1. Assert path within resolved root (assertWithinProject)
  // 2. Inspect lifecycle state (inspectContextLifecycle)
  // 3. If INVALID -> throw CONTEXT_INVALID_STATE
  // 4. If INCONSISTENT -> invoke adopt mode to restore missing pieces
  // 5. Recompile ACTIVE-WORK.md from isolated active-work/*.md descriptors
  // 6. Return structured reconciliation audit report
}
```

---

## 3. Session Recovery & Classification Model

### 3.1 Taxonomy of Agent Sessions
Sessions in Crux are represented by frontmatter in `.project-context/active-work/<agent>.md`:
1. **ACTIVE (Healthy)**: `status === "IN_PROGRESS"` and `idleDurationMs <= staleThreshold` (default 24h).
2. **ACTIVE-BUT-IDLE**: `status === "IN_PROGRESS"`, `idleDurationMs > 4h` but `<= 24h`. Emits advisory diagnostics, but is NOT eligible for automatic preemption.
3. **STALE / ABANDONED**: `status === "IN_PROGRESS"` and `idleDurationMs > 24h` with no recent heartbeats.
4. **CRASHED / UNCLOSED**: Agent process terminated abruptly without calling `assistedSessionEnd`, leaving uncommitted Git changes or in-flight task flags.
5. **COMPLETED**: `status === "COMPLETED"`. Terminal state with immutable handoff created.

### 3.2 Safeguards Against Preemption
To prevent an agent from erroneously hijacking another active agent's work:
- Recovery **requires explicit action**: `recoverSession(rootDir, { action: 'ADOPT' | 'ARCHIVE', agent, new_agent })`.
- By default, `action === 'INSPECT'` only audits candidate sessions without state modification.
- A session cannot be adopted if its last heartbeat was recorded within the active grace period unless explicit override options are passed.
- Adopting a session does **NOT** delete `<stale-agent>.md`. It marks it `status: "COMPLETED"` with progress noting adoption by `<new-agent>`, and starts a fresh session file `<new-agent>.md`.

---

## 4. Consistency Reconciliation Policy

Phase 5D diagnostics (`checkConsistency`) classify findings into three action categories:

| Diagnostic Finding | Severity | Safe Automated Action | Classification |
| :--- | :---: | :--- | :--- |
| `UNCOMMITTED_CHANGES_AFTER_COMPLETION` | `WARNING` | Suggest handoff creation or commit. **DO NOT auto-commit.** | **Diagnostic-Only** |
| `STALE_ACTIVE_SESSION` | `WARNING` | Transition session via `recoverSession(rootDir, { action: 'ARCHIVE' })` or `'ADOPT'`. | **Deterministic Remediation** |
| `SIGNIFICANT_MODIFICATIONS_UNRECORDED`| `INFO` | Suggest recording semantic changelog. **DO NOT fabricate summary.** | **Diagnostic-Only** |
| `COMPLETED_TASK_NO_CHANGELOG` | `INFO` | Advisory notice. **DO NOT invent changelog.** | **Diagnostic-Only** |
| `HANDOFF_INVALID_TASK_ID` | `WARNING` | Advisory notice for metadata validation. | **Diagnostic-Only** |
| `GRAPHIFY_STRUCTURAL_STALE` | `INFO` | Non-fatal notice. **DO NOT execute graphify update.** | **Diagnostic-Only** |
| `GRAPHIFY_CORRUPTED` | `WARNING` | Flag invalid state. **DO NOT wipe graphify-out/.** | **Diagnostic-Only** |

**Guiding Invariant**: Crux never synthesizes semantic meaning or makes arbitrary commits where human/agent domain intent is required.

---

## 5. Non-Destructive Invariants & Prohibitions

Any Phase 5E recovery or reconciliation implementation MUST satisfy the following hard constraints:
1. **Zero Data Loss**: Never truncate, overwrite, or delete user work, tasks, ADRs, or active-work files.
2. **Zero Git Mutation**: Never execute `git commit`, `git reset`, `git checkout`, or alter git history automatically.
3. **Zero Graphify Mutation**: Never write, delete, or invoke Python/Node compilers in `graphify-out/`.
4. **Strict Project Locality**: No sibling-project discovery, no global registries, and zero cross-root reads.
5. **Path Jailing**: All file writes and reads are passed through `assertWithinProject`.
6. **Anti-Credential Protection**: All generated handoffs and audit entries pass `assertNoSecrets`.
7. **Idempotency**: Running `reconcileContext` or `recoverSession` multiple times sequentially yields identical, stable state.

---

## 6. Auditability Specification

Every recovery and reconciliation event must produce a typed, deterministic audit record:
```typescript
interface ReconciliationAuditRecord {
  timestamp: string;
  project_id: string;
  lifecycle_before: "NEW" | "EXISTING" | "INCONSISTENT" | "INVALID";
  lifecycle_after: "NEW" | "EXISTING" | "INCONSISTENT" | "INVALID";
  actions_taken: Array<{
    type: "RESTORE_CANONICAL_FILE" | "ENSURE_DIRECTORY" | "RECOMPILE_ACTIVE_WORK";
    target: string;
    reason: string;
  }>;
  preserved_count: number;
  created_count: number;
}
```

---

## 7. Frozen MCP Boundary Guarantee

The ChatGPT MCP adapter in `integrations/chatgpt/index.js` remains **COMPLETELY FROZEN**:
- Exactly 8 curated read-only tools:
  1. `get_context_snapshot`
  2. `get_project_state`
  3. `get_tasks`
  4. `get_architecture`
  5. `get_decisions`
  6. `search_project_context`
  7. `get_relevant_context`
  8. `get_git_status`
- **NO new MCP tools** (e.g. no `heal_context`, no `recover_session` over ChatGPT MCP).
- **NO schema modifications**.
- **NO mutation tools**.
- All Phase 5E recovery APIs are strictly internal/core CLI capabilities.

---

## 8. Scope Boundaries

### REQUIRED (Phase 5E Implementation Scope)
1. Export dedicated `reconcileContext(rootDir, options)` in `src/lifecycle.js` and `src/index.js`.
2. Connect `inspectContextLifecycle` and `checkConsistency` into an audit-backed reconciliation workflow.
3. Extend `recoverSession` to generate emergency recovery handoffs with file detection when adopting crashed sessions.
4. Verify idempotency and non-destructive invariance across synthetic projects.
5. Add Section 9 adversarial tests in `tests/adversarial-phase5.test.js`.

### EXPLICITLY OUT OF SCOPE
- Automatic `git commit` or workspace resetting.
- Deletion or mutation of `graphify-out/`.
- Automatic pruning or deletion of `.project-context/scratch/`.
- Adding write or healing tools to ChatGPT MCP adapter.
- Global cross-project reconciliation registries.

---

## 9. Acceptance Criteria & Verification Gates

Implementation will be judged strictly against the following gates:
1. **Inconsistent State Reconciliation**:
   - Deleting `CHANGELOG.md` or `active-work/README.md` produces `lifecycleState === 'INCONSISTENT'`.
   - `reconcileContext` restores missing files from neutral templates without altering `TASKS.md`, `STATE.md`, or user sentinels.
2. **Crash & Session Recovery**:
   - `recoverSession` on an interrupted session cleanly archives or adopts the task and recompiles `ACTIVE-WORK.md`.
   - Generates an immutable recovery handoff recording in-flight files.
3. **Idempotency Gate**:
   - Calling `reconcileContext` 3 times sequentially produces zero new files and identical audit results on runs 2 and 3.
4. **Jailing & Isolation Gate**:
   - Attempting reconciliation on symlinks escaping project root throws `SYMLINK_ESCAPE_DETECTED`.
   - Project-12 recovery cannot view or mutate Project-19 files.
5. **Full Regression Gate**:
   - Canonical core test suite (419+ assertions) passes 100%.
   - ChatGPT MCP adapter suite (159 assertions) passes 100%.
   - Total assertions >= 440 with 0 failures.
