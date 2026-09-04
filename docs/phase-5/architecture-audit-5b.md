# Phase 5B Architecture Audit & Design Specification
## External Graphify Structural Source of Truth Bridge

**Specialist**: Architecture Specialist  
**Target Subsystems**: `src/graphify.js`, `src/relevance.js`, `src/snapshot.js`, `integrations/chatgpt/index.js`  
**Status**: AUDIT COMPLETE / SPECIFICATION AUTHORITATIVE  
**Date**: 2026-09-04  

---

## 1. System Invariants & Strict Boundaries

1. **Pure Structural Source of Truth**:
   - `graphify-out/` is an external, read-only artifact.
   - Crux must NEVER write, delete, or invoke compilers/Python within `graphify-out/`.
   - Crux context files (`.project-context/`) must never absorb or copy the entire Graphify AST.
2. **Deterministic Progressive Context Fusion**:
   - **Semantic First**: Crux queries tasks, decisions, and semantic changelogs.
   - **Structural Enrichment**: When Graphify is `AVAILABLE`, Crux inspects candidate file neighbors (1-hop dependencies and callers) and enriches suggested files without changing existing return types or schemas.
3. **Graceful Degradation**:
   - If Graphify is `MISSING`, `STALE`, or `INVALID`, Crux functions 100% reliably in pure semantic mode.
   - Zero fatal crashes on missing/corrupt graphs.
4. **Fast In-Memory Caching & Staleness**:
   - For performance, Graphify parsing must be cached in-memory keyed by `(graphPath, fileMtime)`.
   - Staleness is deterministically evaluated:
     1. Git commit check (`built_at_commit` vs `git rev-parse HEAD`).
     2. Mtime fallback if git is unavailable.
5. **Path Jailing**:
   - All Graphify reads must be asserted within the resolved project root (`assertWithinProject`).
6. **MCP Schema Non-Regression**:
   - `get_relevant_context` output schema already specifies:
     ```json
     {
       "suggested_files": { "type": "array", "items": { "type": "string" } }
     }
     ```
   - Structural neighbors are synthesized directly into `suggested_files` (and optionally a non-breaking `structural_context` object if permitted, or within `suggested_files`), preserving schema conformance for ChatGPT Web.

---

## 2. Component Design for Phase 5B

### A. Caching Layer in `src/graphify.js`
- Cache graph data in a module-level `Map` keyed by resolved file path.
- Cache entry stores `{ mtimeMs, data, nodeIndex, edgeIndex, fileNodeMap }`.
- Invalidate cache automatically if `fs.statSync(graphJsonPath).mtimeMs !== cached.mtimeMs`.

### B. Structural Neighbor Extraction (`getStructuralNeighbors`)
- Given a `source_file` or list of files (e.g. `supabase/functions/parse-resume/index.ts`):
  - Find nodes matching `source_file`.
  - Traverse edges: find all targets where node is source, and all sources where node is target.
  - Return unique connected `source_file` paths (1-hop callers and dependencies).

### C. Progressive Context Fusion in `src/relevance.js`
- After deriving initial `suggested_files` from tasks and changelogs:
  - If Graphify is `AVAILABLE` or `STALE`:
    - Query structural neighbors for each suggested file.
    - Append structural neighbor files to `suggested_files` (up to limit).
    - Expose `structural_hints` in query context without breaking downstream schema.

### D. Snapshot Enrichment in `src/snapshot.js`
- In `cold_context_pointers` or warm context section, include `graphify: { state, nodes, edges, stale }` if present, without altering the `HotContextSnapshot` root schema.
