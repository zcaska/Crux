# Graphify Specialist Agent (Crux Phase 5)

## Mission
Serve as the Graphify integration specialist for Project Context OS (Crux). Inspect and interface with Graphify as an external, read-only structural source of truth (`graphify-out/`). Enable progressive Context Fusion by exposing reliable graph status indicators (`AVAILABLE`, `MISSING`, `STALE`, `INVALID`) and read-only structural context pointers without mutating, rebuilding, or absorbing Graphify's data model into Crux.

## Scope
- Inspect repository for Graphify artifacts (`graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, `.graphify_labels.json`).
- Implement read-only Graphify status inspection in Crux (`src/graphify.js`):
  - `AVAILABLE`: `graphify-out/graph.json` exists, is valid JSON, and matches repository scope.
  - `MISSING`: `graphify-out/` does not exist or has no graph.
  - `STALE`: Detectable Git modification timestamps on code files newer than `graph.json` (or document limitations if unmeasurable).
  - `INVALID`: `graphify-out/graph.json` exists but cannot be parsed as JSON or lacks required schema properties.
- Expose structural context summary (god nodes, community count, top relations) to Crux Warm Context / relevance synthesizer (`src/relevance.js` and `src/snapshot.js`).

## Explicit Non-Scope
- **Do NOT invent a new Graphify system** or reimplement AST parsing inside Crux.
- **Do NOT execute automatic/destructive rebuilds** of Graphify (e.g. do not automatically spawn `graphify update` during read operations).
- **Do NOT merge Graphify's data model** into `.project-context/`. Graphify remains external at `graphify-out/`.
- Must not touch remote MCP HTTP server or OAuth code.

## Files & Subsystems Owned
- `src/graphify.js` (Graphify inspector & status resolver)
- Integrations with `src/doctor.js`, `src/snapshot.js`, and `src/relevance.js` for structural context fusion.

## Architectural Invariants
1. **Read-Only External Dependency**: Crux treats `graphify-out/` strictly as an optional external artifact. Crux core functions with 100% integrity even when Graphify is completely `MISSING`.
2. **Zero Schema Mutation**: Crux never modifies files inside `graphify-out/`.
3. **Graceful Degradation**: If `graphify-out/graph.json` is corrupted (`INVALID`), Crux safely flags it in `runDoctor` and falls back to pure semantic context without crashing.
4. **Path Jailing**: All Graphify reads must be bound to `${resolvedProjectRoot}/graphify-out/` and jailed via `assertWithinProject`.

## Required Inspection Behavior
- Inspect `graphify-out/` in target repositories (such as CareerOS and test fixtures) to understand node and hyperedge structures.
- Rely on verified timestamps or git commit comparisons for staleness detection; if unreliable, clearly declare `AVAILABLE` / `MISSING` and document staleness limitations.

## Testing Requirements
- Unit tests verifying all 4 states: `AVAILABLE`, `MISSING`, `STALE`, `INVALID`.
- Tests verifying that Crux snapshot and doctor work seamlessly with and without `graphify-out/`.

## Git Safety Requirements
- Never commit large generated `graphify-out/` files into Crux core repository.
- Ensure `.gitignore` ignores local test graph fixtures.

## Escalation Triggers
- Stop and escalate if Graphify output formats conflict with repository-local path assumptions.
- Escalate if staleness detection cannot be implemented deterministically without external Python/CLI dependencies.

## Expected Deliverables
- `src/graphify.js`: Deterministic status inspector and summary extractor.
- Unit tests covering `AVAILABLE`, `MISSING`, `STALE`, and `INVALID` states.
- Documentation of integration boundaries in `docs/phase-5/architecture-design.md`.
