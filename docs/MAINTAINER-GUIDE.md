# Project Context OS — Maintainer Guide (v5.0.0)

This document is the authoritative guide for maintainers of **Project Context OS** (`@project-context/core`). It covers architecture boundaries, package distribution, testing standards, release engineering, security invariants, and versioning policies.

---

## 1. Architecture Isolation & Purity Principles

Project Context OS maintains a strict separation of concerns between the reusable context engine and any host application repository:

```text
┌──────────────────────────────────────────────────────────┐
│                   TARGET REPOSITORY                      │
│                                                          │
│   Host Application Code          Project Context Layer   │
│   (e.g. Node, Python, Rust)      (.project-context/)     │
│             ▲                             ▲              │
│             │                             │              │
└─────────────┼─────────────────────────────┼──────────────┘
              │                             │
              │                 ┌───────────┴──────────┐
              │                 │ @project-context/core│
              │                 │   (v5.0.0 Engine)    │
              │                 └───────────┬──────────┘
              │                             │
              │                  ┌──────────┴──────────┐
              │                  │  CLI & MCP Server   │
              │                  │ (29 Official Tools) │
              │                  └─────────────────────┘
              │                             ▲
              │                             │
   Zero Dependency Coupling         Compatible AI Agents
  (No app imports Context OS)     (Antigravity, Claude, Cursor)
```

### Invariants:
1. **Purity of Core**: Files inside `src/` must NEVER import application code, application database clients, or application UI frameworks.
2. **Domain-Neutrality**: The core engine must NEVER hardcode domain terms or application-specific file paths. Domain rules must be configured via `.project-context/config.json`.
3. **No External Cloud Dependencies**: The core context layer is strictly repository-local and offline-first. Never introduce remote cloud backends, hosted vector databases, or telemetry collectors.
4. **Read-Only Structural Boundary**: External structural graphs in `graphify-out/` are strictly read-only. The core engine never compiles, mutates, or deletes Graphify artifacts.

---

## 2. Package Boundaries & Tarball Whitelist

The package configuration is defined in [`package.json`](file:///C:/Users/AGP/Documents/Projects/project-context-os/package.json).

### Whitelisted Files (`files` array):
Only the following paths are packaged for distribution:
* `bin/` (`project-context.js`)
* `src/` (Universal engine source files)
* `templates/` (Client MCP configuration templates)
* `README.md` (Package documentation)

### Strictly Excluded:
* `tests/`: Never bundle internal automated tests into the distribution tarball.
* `.project-context/`: Never bundle repository state into the tarball.
* `graphify-out/`: Never bundle structural AST artifacts into the tarball.

### Verification Command:
Before cutting a release, inspect the tarball contents:
```bash
npm pack --dry-run
```
Ensure total file count is exactly **28 files**, unpacked size is ~254 kB, and zero test, state, or mock files are listed.

---

## 3. Testing Standards & Test Gates

Project Context OS uses a comprehensive, automated test runner located at `tests/run-all-tests.js`.

### Test Groups (23 Total):
1. Core Context Operations (State, Tasks, Decisions, Changes, Active Work, Search)
2. Git Integration & Zero-Commit Status
3. Security & Anti-Credential Scanner (API keys, tokens, passwords)
4. Multi-Agent Concurrency (Isolated active-work descriptors)
5. Immutable Handoff Engine (Write-once enforcement)
6. Official MCP Server (Real STDIO Transport via SDK Client)
7. Context Integrity Validator
8. Universal Agent Bootstrap
9. Agent Session Registry & Heartbeats
10. Git ↔ Context Consistency Checker
11. Git Hook Automation (Pre-commit hook)
12. Cross-Agent Interoperability (Autonomous H0 simulation)
13. Real Integration Audit (11 MCP integration items)
14. Real Agent A -> Agent B Lifecycle Test
15. Git Hook Safety & Failure Path Tests
16. Phase 3 Intelligence Capabilities (29 Tools, Relevance, Drift, Health)
17. Real Host Workflow Simulation
18. Cross-Project Portability & 11-Dimension Isolation
19. Model Interoperability & OmniRoute Switching
20. Quantitative Token Efficiency Benchmark
21. Core Decoupling & Boundary Integrity
22. Phase 5 Adversarial & Multi-Project Isolation (10 Gates)
23. Phase 5G Clean-Room Release Distribution Gate

### Running the Full Master Suite:
```bash
node tests/run-all-tests.js
```
**Pass Requirement**: 760 passed, 0 failed.

### Running the ChatGPT MCP Adapter Suite:
```bash
npm test --prefix integrations/chatgpt/
```
**Pass Requirement**: 159 passed, 0 failed across 14 verification sections.

---

## 4. Release Process

### Step 1: Clean Working Tree Check
Verify all files are accounted for and no stray test files exist in `tests/`.

### Step 2: Run Master Regressions
```bash
node tests/run-all-tests.js
npm test --prefix integrations/chatgpt/
```

### Step 3: Run Distribution Gate & Tarball Verification
```bash
npm pack --dry-run
```

### Step 4: Clean-Room Verification
Automated clean-room verification is executed as part of Test Group 23 (`tests/clean-room-gate.test.js`).

### Step 5: Publishing (When Authorized)
```bash
npm publish
```

---

## 5. Security & Path Jailing Policies

1. **Path Traversal Guard**:
   All filesystem reads and writes must pass through `assertWithinProject(targetPath, rootDir)`. Traversal attempts (`../../`, absolute external paths) must throw `PATH_TRAVERSAL_DETECTED`.
2. **Anti-Credential Scanning**:
   `scanForSecrets` runs regex pattern matching against all input payloads. Any write operation attempting to persist OpenAI/Anthropic keys (`sk-`), GitHub tokens (`ghp_`), Bearer tokens, or private keys must be rejected with a `SecurityViolation`.
3. **Symlink Escape Protection**:
   All resolved targets are checked against the project root boundary. Symlinks attempting to escape the root boundary throw `SYMLINK_ESCAPE_DETECTED`.

---

## 6. Migration Policy

* **v4 -> v5 Compatibility**: 100% backwards-compatible. Existing `.project-context/` folders are safely adopted via `initProjectContext(rootDir, { mode: 'adopt' })` or `reconcileContext(rootDir)`. Canonical files and ADRs are never overwritten.
* **Non-Destructive Guarantee**: Context recovery restores missing canonical files from domain-neutral templates without touching existing user state.

---

## 7. Model Context Protocol (MCP) Standards

* Built on official `@modelcontextprotocol/sdk`.
* Server version matches `@project-context/core` version `5.0.0`.
* Exposes exactly **29 official tools** (14 read tools, 15 write/lifecycle tools).
* Server transport is standard STDIO (`StdioServerTransport`).

