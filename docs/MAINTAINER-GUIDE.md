# Project Context OS — Maintainer Guide

This document is the authoritative guide for maintainers of **Project Context OS** (`@project-context/core`). It covers architecture boundaries, package distribution, testing standards, release engineering, security invariants, and versioning policies.

---

## 1. Architectural Architecture & Dual-Boundary Isolation

Project Context OS follows a strict separation of concerns between the reusable context engine and any host application repository:

```text
┌──────────────────────────────────────────────────────────┐
│                   TARGET REPOSITORY                      │
│                                                          │
│   Host Application Code          Project Context Layer   │
│   (e.g. React, Python, Go)       (.project-context/)     │
│             ▲                             ▲              │
│             │                             │              │
└─────────────┼─────────────────────────────┼──────────────┘
              │                             │
              │                 ┌───────────┴──────────┐
              │                 │ @project-context/core│
              │                 │   (v4.0.0 Engine)    │
              │                 └───────────┬──────────┘
              │                             │
              │                  ┌──────────┴──────────┐
              │                  │  CLI & MCP Server   │
              │                  │ (29 Official Tools) │
              │                  └─────────────────────┘
              │                             ▲
              │                             │
   Zero Dependency Coupling         Compatible AI Agents
   (No app imports Context OS)    (Antigravity, Claude, Cursor)
```

### Invariants:
1. **Purity of Core**: Files inside `src/` must NEVER import application code, application database clients (e.g. Supabase, Prisma), or application UI frameworks (React, Vue).
2. **Domain-Neutrality**: The core engine must NEVER hardcode domain terms, table names, or application-specific file paths. Domain rules must be configured via `.project-context/config.json`.
3. **No External Cloud Dependencies**: The core context layer is strictly repository-local and offline-first. Never introduce remote cloud backends, hosted vector databases, or telemetry collectors.

---

## 2. Package Boundaries & Tarball Whitelist

The package configuration is defined in [`tools/project-context/package.json`](file:///C:/Users/AGP/Documents/Projects/Job-Hunt/tools/project-context/package.json).

### Whitelisted Files (`files` array):
Only the following paths are packaged for distribution:
* `bin/` (`project-context.js`)
* `src/` (Universal engine source files)
* `templates/` (Client MCP configuration templates)
* `README.md` (Package documentation)

### Strictly Excluded:
* `tests/`: Never bundle internal automated tests into the distribution tarball.
* `.project-context/`: Never bundle repository state into the tarball.
* Application code (`frontend/`, `supabase/`, `backend/`).

### Verification Command:
Before cutting a release, inspect the tarball contents:
```bash
npm pack --dry-run
```
Ensure total file count is exactly **27 files**, unpacked size is ~204 kB, and zero application or test files are listed.

---

## 3. Testing Standards & Test Gates

Project Context OS uses a comprehensive, automated test runner located at `tools/project-context/tests/run-all-tests.js`.

### Test Groups (21 Total):
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
17. Real Host Workflow (TASK-002 Edge Function & Frontend)
18. Cross-Project Portability & 11-Dimension Isolation
19. Model Interoperability & OmniRoute Switching
20. Quantitative Token Efficiency Benchmark
21. Core Decoupling & Boundary Integrity

### Running the Full Master Suite:
```bash
node tools/project-context/tests/run-all-tests.js
```
**Pass Requirement**: 289 passed, 0 failed.

---

## 4. Release Process

### Step 1: Clean Working Tree Check
Verify all files are accounted for and no stray test files exist in `tools/project-context/tests/`.

### Step 2: Run Regressions
```bash
# 1. Master test suite
node tools/project-context/tests/run-all-tests.js

# 2. Host application validate
npm run context:validate

# 3. Host context health (must be >= 95% Grade A)
npm run context:health

# 4. Host production build
cd frontend && npm run build
```

### Step 3: Build Tarball
```bash
cd tools/project-context
npm pack
```

### Step 4: Clean-Room Verification
Install the tarball in an external temporary directory and run:
```bash
npx project-context init --name "ReleaseCheck"
npx project-context doctor
npx project-context mcp
```

### Step 5: Publishing (When Authorized)
```bash
cd tools/project-context
npm publish
```

---

## 5. Security & Path Jailing Policies

1. **Path Traversal Guard**:
   All filesystem writes that accept agent names, task IDs, or filenames must pass through `assertWithinProject(rootDir, targetPath)`. Traversal attempts (`../../`, absolute external paths) must throw `PATH_TRAVERSAL_DETECTED`.
2. **Anti-Credential Scanning**:
   `scanForSecrets` runs regex pattern matching against all input payloads. Any write operation attempting to persist OpenAI/Anthropic keys (`sk-`), GitHub tokens (`ghp_`), Bearer tokens, or private keys must be rejected with a `SecurityViolation`.
3. **Symlink Limitation Classification**:
   Path jailing uses lexical normalization (`path.resolve`). Physical symlink traversal is classified as a **KNOWN NON-BLOCKING LIMITATION**. If realpath canonicalization is required in specific security-sensitive environments, configure `PROJECT_CONTEXT_ROOT` directly.

---

## 6. Migration Policy

* **v3 -> v4 Compatibility**: 100% backwards-compatible. Older v3 `.project-context/` folders are readable because `config.js` provides safe defaults for all newly introduced configuration keys (`project_name`, `component_hints`, `invariants`).
* **v4 -> v5 Breaking Migrations**: If future versions require destructive transformations (e.g. converting markdown to structured SQLite or changing YAML frontmatter schemas), a formal migration engine (`project-context migrate`) must be implemented with automated backups.

---

## 7. Model Context Protocol (MCP) Standards

* Built on official `@modelcontextprotocol/sdk`.
* Server version must match `@project-context/core` version in `package.json`.
* Exposes exactly **29 official tools** (14 read tools, 15 write/lifecycle tools).
* Server transport is standard STDIO (`StdioServerTransport`).
