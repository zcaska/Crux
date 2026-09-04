# Phase 5D Architecture Audit & Design Specification
## Context Health, Consistency & Snapshot Harmonization

**Specialist**: Architecture Specialist  
**Target Subsystems**: `src/snapshot.js`, `src/consistency.js`, `src/doctor.js`, `src/quality.js`, `src/graphify.js`  
**Status**: AUTHORITATIVE PHASE 5D SPECIFICATION  
**Date**: 2026-09-04  

---

## 1. Executive Mandate & Authority Principles

1. **Semantic Authority**:
   - `.project-context/` remains the sole authority for project identity, state, tasks, ADRs, active work, and changelogs.
   - Graphify MUST NOT become semantic authority.
2. **Structural Authority**:
   - `graphify-out/` remains the sole authority for AST relationships, nodes, edges, callers, and dependencies.
   - Crux operates strictly read-only against `graphify-out/`.
3. **Unified Context Health Model**:
   - Health diagnostics synthesize:
     1. Project Lifecycle / Context Integrity (`inspectContextLifecycle`).
     2. Git <-> Semantic Consistency (`checkConsistency`).
     3. Graphify Structural State (`inspectGraphifyStatus`).
     4. Semantic <-> Structural Alignment.
   - Zero competing health models. `runDoctor` and `assessContextQuality` reuse unified checks.
4. **Non-Fatal Degradation**:
   - `MISSING` or `STALE` Graphify MUST NOT fail health audits or crash semantic operations.
   - `INVALID` Graphify produces a diagnostic WARNING/ERROR, but never terminates normal operations.
5. **Snapshot Harmonization**:
   - Snapshot incorporates bounded Graphify metadata in `cold_context_pointers.graphify`:
     - `state`: `AVAILABLE | STALE | MISSING | INVALID`
     - `is_stale`: boolean
     - `nodes_count`: number
     - `edges_count`: number
   - Strictly NO raw AST dumps, syntax trees, or full graph leaks.
6. **Frozen MCP Boundary**:
   - Exactly 8 tools in ChatGPT MCP adapter.
   - No added/removed tools. No schema regressions.

---

## 2. Component Enhancements

### A. Snapshot Harmonization (`src/snapshot.js`)
- `getContextSnapshot(rootDir)` calls `getGraphifyStatus(rootDir)` safely.
- In `cold_context_pointers`:
  ```javascript
  graphify: {
    state: status.state,
    is_stale: Boolean(status.isStale),
    nodes_count: status.nodesCount || 0,
    edges_count: status.edgesCount || 0,
  }
  ```
- If Graphify is `MISSING` or error occurs, fallback cleanly:
  ```javascript
  graphify: {
    state: "MISSING",
    is_stale: false,
    nodes_count: 0,
    edges_count: 0,
  }
  ```

### B. Consistency Engine Upgrades (`src/consistency.js`)
- Add check for Graphify structural staleness:
  - If Graphify `is_stale === true`, emit `INFO`: `GRAPHIFY_STRUCTURAL_STALE` with commit hashes.
- Add check for Graphify corruption:
  - If Graphify `state === "INVALID"`, emit `WARNING`: `GRAPHIFY_CORRUPTED`.
- Semantic-Structural alignment check:
  - Identify major components in active tasks or recent changelog that have corresponding Graphify nodes.

### C. Doctor Integration (`src/doctor.js`)
- Integrate Consistency issues into Doctor diagnostics:
  - Add Check #10: "Context Consistency Audit" consuming `checkConsistency(resolvedRoot)`.
- Ensure Doctor health score calculation remains resilient:
  - `MISSING` or `STALE` Graphify does not fail Doctor health (`healthy === true`).
  - `INVALID` Graphify marks Check #9 as failed with actionable suggestion, but doesn't throw.

### D. Quality Assessment Harmonization (`src/quality.js`)
- Factor structural integrity into Quality pillar score without penalizing projects that do not use Graphify.
