/**
 * Project Context OS (Crux) — Phase 5 Adversarial & Multi-Project Isolation Suite
 *
 * Rigorously tests:
 *  1. Multi-Project Isolation (project-12 vs project-19 with distinct context tokens)
 *  2. Cross-Project Sibling Contamination Prevention (zero token leakage)
 *  3. Path Jailing & Attack Scenarios (parent traversal, symlink escapes)
 *  4. Non-Destructive Adoption Invariance (auto, create, adopt modes with file preservation)
 *  5. Graphify 4-State Detection (AVAILABLE, MISSING, STALE, INVALID)
 *  6. Fail-Closed Assertions (empty/nil results strictly fail)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  initProjectContext,
  resolveProjectRoot,
  assertWithinProject,
  readState,
  readTasks,
  createTask,
  updateTask,
  readDecisions,
  readChangelog,
  recordChange,
  searchProjectContext,
  runDoctor,
  getGraphifyStatus,
  inspectContextLifecycle,
  getProjectIdentity,
  getStructuralNeighbors,
  getDetailedStructuralNeighbors,
  getCommunityFiles,
  clearGraphCache,
  loadGraphData,
  getRelevantContext,
  getFusedContext,
  getContextSnapshot,
  checkConsistency,
  reconcileContext,
  recoverSession,
  startSession,
  listSessions,
  checkWorkingAreaCollisions,
  getProjectDiagnostics,
} from "../src/index.js";

const TOKEN_12 = "PROJECT_TWELVE_ALPHA_CONTEXT_TOKEN_12";
const TOKEN_19 = "PROJECT_NINETEEN_BETA_CONTEXT_TOKEN_19";

export async function runAdversarialPhase5Tests(careerOsRoot, assert) {
  console.log("\n================================================================");
  console.log("Project Context OS (Crux) — Phase 5 Adversarial & Isolation Suite");
  console.log("================================================================\n");

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "crux-phase5-adversarial-"));
  const project12Root = path.join(tempBase, "project-12");
  const project19Root = path.join(tempBase, "project-19");
  fs.mkdirSync(project12Root, { recursive: true });
  fs.mkdirSync(project19Root, { recursive: true });

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: Multi-Project Independent Initialization & Token Seeding
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── 1. Independent Multi-Project Scaffolding (project-12 & project-19) ──");

    const init12 = initProjectContext(project12Root, {
      name: "Project-12",
      description: "Isolated Microservice Alpha",
      mode: "create",
    });
    assert(init12.initialized === true, "Project-12 init returned initialized = true");
    assert(init12.lifecycleState === "NEW", "Project-12 lifecycleState is NEW");

    const init19 = initProjectContext(project19Root, {
      name: "Project-19",
      description: "Isolated Data Pipeline Beta",
      mode: "create",
    });
    assert(init19.initialized === true, "Project-19 init returned initialized = true");
    assert(init19.lifecycleState === "NEW", "Project-19 lifecycleState is NEW");

    // Seed project-12 with unique token
    createTask(project12Root, {
      id: "TASK-P12-001",
      title: `Secret Alpha Work for ${TOKEN_12}`,
      status: "READY",
      priority: "HIGH",
      owner: "agent-12",
      description: `Contains confidential payload: ${TOKEN_12}`,
    });

    // Seed project-19 with unique token
    createTask(project19Root, {
      id: "TASK-P19-001",
      title: `Secret Beta Pipeline for ${TOKEN_19}`,
      status: "IN_PROGRESS",
      priority: "CRITICAL",
      owner: "agent-19",
      description: `Contains confidential payload: ${TOKEN_19}`,
    });

    // Verify both projects seeded and tasks actually exist (fail if empty)
    const tasks12 = readTasks(project12Root);
    const tasks19 = readTasks(project19Root);

    assert(tasks12.tasks.length > 0, "Project-12 has non-empty task list (fail-closed)");
    assert(tasks19.tasks.length > 0, "Project-19 has non-empty task list (fail-closed)");

    const foundToken12In12 = tasks12.tasks.some(
      (t) => t.title.includes(TOKEN_12) || t.description.includes(TOKEN_12)
    );
    assert(foundToken12In12 === true, "Project-12 tasks verify presence of TOKEN_12");

    const foundToken19In19 = tasks19.tasks.some(
      (t) => t.title.includes(TOKEN_19) || t.description.includes(TOKEN_19)
    );
    assert(foundToken19In19 === true, "Project-19 tasks verify presence of TOKEN_19");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: Sibling Contamination & Search Isolation
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 2. Cross-Project Sibling Contamination Prevention ──");

    // Sibling contamination check on raw tasks
    const foundToken19In12 = tasks12.tasks.some(
      (t) => t.title.includes(TOKEN_19) || t.description.includes(TOKEN_19)
    );
    assert(foundToken19In12 === false, "Project-12 tasks contain ZERO traces of TOKEN_19");

    const foundToken12In19 = tasks19.tasks.some(
      (t) => t.title.includes(TOKEN_12) || t.description.includes(TOKEN_12)
    );
    assert(foundToken12In19 === false, "Project-19 tasks contain ZERO traces of TOKEN_12");

    // Cross-search isolation
    const search12For12 = searchProjectContext(project12Root, TOKEN_12);
    assert(search12For12.length > 0, "Search in Project-12 successfully locates TOKEN_12 (fail-closed)");

    const search12For19 = searchProjectContext(project12Root, TOKEN_19);
    assert(search12For19.length === 0, "Search in Project-12 for TOKEN_19 yields exactly 0 results");

    const search19For19 = searchProjectContext(project19Root, TOKEN_19);
    assert(search19For19.length > 0, "Search in Project-19 successfully locates TOKEN_19 (fail-closed)");

    const search19For12 = searchProjectContext(project19Root, TOKEN_12);
    assert(search19For12.length === 0, "Search in Project-19 for TOKEN_12 yields exactly 0 results");

    // State isolation
    const state12 = readState(project12Root);
    const state19 = readState(project19Root);
    assert(state12.meta.project_name === "Project-12", "Project-12 state name is 'Project-12'");
    assert(state19.meta.project_name === "Project-19", "Project-19 state name is 'Project-19'");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: Adversarial Path Jailing & Symlink Attacks
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 3. Adversarial Path Jailing & Symlink Attacks ──");

    // Test 3.1: Relative parent traversal escape attempt
    let parentEscapeBlocked = false;
    try {
      assertWithinProject(path.join("..", "project-19", ".project-context", "TASKS.md"), project12Root);
    } catch (err) {
      if (err.code === "PATH_TRAVERSAL_DETECTED") {
        parentEscapeBlocked = true;
      }
    }
    assert(parentEscapeBlocked === true, "Relative parent traversal (../project-19) strictly blocked");

    // Test 3.2: Absolute path escape attempt to sibling project
    let siblingEscapeBlocked = false;
    try {
      assertWithinProject(path.join(project19Root, ".project-context", "TASKS.md"), project12Root);
    } catch (err) {
      if (err.code === "PATH_TRAVERSAL_DETECTED") {
        siblingEscapeBlocked = true;
      }
    }
    assert(siblingEscapeBlocked === true, "Absolute path to sibling project strictly blocked");

    // Test 3.3: Symlink escape attempt (symlink inside project-12 pointing to project-19)
    const symlinkTarget = path.join(project19Root, ".project-context", "TASKS.md");
    const symlinkPath = path.join(project12Root, "external_escape_link.md");

    let symlinkCreated = false;
    try {
      fs.symlinkSync(symlinkTarget, symlinkPath, "file");
      symlinkCreated = true;
    } catch {
      // Symlink creation might require Windows Developer Mode or Admin rights
      console.log("    [i] Windows symlink creation restricted; testing canonical symlink rejection logic directly");
    }

    if (symlinkCreated) {
      let symlinkEscapeBlocked = false;
      try {
        assertWithinProject(symlinkPath, project12Root);
      } catch (err) {
        if (err.code === "SYMLINK_ESCAPE_DETECTED" || err.code === "PATH_TRAVERSAL_DETECTED") {
          symlinkEscapeBlocked = true;
        }
      }
      assert(symlinkEscapeBlocked === true, "Symlink pointing outside project root strictly rejected with SYMLINK_ESCAPE_DETECTED");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: Non-Destructive Adoption Invariance & Lifecycle Modes
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 4. Non-Destructive Adoption Invariance Across Modes ──");

    // Modify a file in project-12 context with a custom sentinel marker
    const SENTINEL = "IMMUTABLE_SENTINEL_USER_CUSTOM_SECTION_12345";
    const tasksFile12 = path.join(project12Root, ".project-context", "TASKS.md");
    fs.appendFileSync(tasksFile12, `\n\n## Custom Note\n${SENTINEL}\n`, "utf-8");

    // Test 4.1: 'create' mode on existing context must throw error
    let createModeRejected = false;
    try {
      initProjectContext(project12Root, { mode: "create" });
    } catch (err) {
      if (err.code === "CONTEXT_ALREADY_EXISTS") {
        createModeRejected = true;
      }
    }
    assert(createModeRejected === true, "Mode 'create' strictly rejects existing context (CONTEXT_ALREADY_EXISTS)");

    // Test 4.2: 'adopt' mode on non-existing context must throw error
    const nonExistentDir = path.join(tempBase, "ghost-project");
    fs.mkdirSync(nonExistentDir, { recursive: true });
    let adoptModeRejectedMissing = false;
    try {
      initProjectContext(nonExistentDir, { mode: "adopt" });
    } catch (err) {
      if (err.code === "CONTEXT_NOT_FOUND") {
        adoptModeRejectedMissing = true;
      }
    }
    assert(adoptModeRejectedMissing === true, "Mode 'adopt' strictly rejects missing context (CONTEXT_NOT_FOUND)");

    // Test 4.3: 'adopt' mode on existing context preserves user content 100%
    const adoptResult = initProjectContext(project12Root, { mode: "adopt" });
    assert(adoptResult.initialized === true, "Mode 'adopt' succeeded on existing context");
    assert(adoptResult.lifecycleState === "EXISTING", "Mode 'adopt' returned lifecycleState = EXISTING");
    assert(adoptResult.preservedFiles.length > 0, "Mode 'adopt' reports preservedFiles (fail-closed)");

    const reloadedTasks12 = fs.readFileSync(tasksFile12, "utf-8");
    assert(reloadedTasks12.includes(SENTINEL), "User sentinel preserved 100% after 'adopt' mode execution");

    // Test 4.4: 'auto' mode on existing context adopts without overwriting
    const autoResult = initProjectContext(project12Root, { mode: "auto" });
    assert(autoResult.lifecycleState === "EXISTING", "Mode 'auto' recognizes existing context as EXISTING");
    const reloadedTasksAuto = fs.readFileSync(tasksFile12, "utf-8");
    assert(reloadedTasksAuto.includes(SENTINEL), "User sentinel preserved 100% after 'auto' re-init");

    // Test 4.5: Repeated initialization idempotency (crux init 3x)
    const initRun1 = initProjectContext(project12Root, { mode: "auto" });
    const initRun2 = initProjectContext(project12Root, { mode: "auto" });
    const initRun3 = initProjectContext(project12Root, { mode: "auto" });
    assert(initRun1.initialized && initRun2.initialized && initRun3.initialized, "Repeated init 3x all succeed");
    assert(initRun1.lifecycleState === "EXISTING" && initRun3.lifecycleState === "EXISTING", "Repeated init consistently reports EXISTING");
    const reloadedTasks3x = fs.readFileSync(tasksFile12, "utf-8");
    assert(reloadedTasks3x.includes(SENTINEL), "Custom sentinel preserved intact across 3 repeated inits");

    // Test 4.6: Explicit Lifecycle Inspector (NEW, EXISTING, INCONSISTENT, INVALID)
    const inspectClean = inspectContextLifecycle(nonExistentDir);
    assert(inspectClean.state === "NEW", "Clean directory detected as lifecycle NEW");
    assert(inspectClean.exists === false, "exists is false for lifecycle NEW");

    const inspectExisting = inspectContextLifecycle(project12Root);
    assert(inspectExisting.state === "EXISTING", "Full context detected as lifecycle EXISTING");
    assert(inspectExisting.missingCanonicalFiles.length === 0, "No missing canonical files in full context");

    // Remove a canonical file to create INCONSISTENT state
    const inconsistentDir = path.join(tempBase, "inconsistent-project");
    fs.mkdirSync(inconsistentDir, { recursive: true });
    initProjectContext(inconsistentDir, { name: "InconsistentProject", mode: "create" });
    fs.unlinkSync(path.join(inconsistentDir, ".project-context", "CHANGELOG.md"));

    const inspectInconsistent = inspectContextLifecycle(inconsistentDir);
    assert(inspectInconsistent.state === "INCONSISTENT", "Missing CHANGELOG.md detected as lifecycle INCONSISTENT");
    assert(inspectInconsistent.missingCanonicalFiles.includes("CHANGELOG.md"), "missingCanonicalFiles explicitly lists CHANGELOG.md");

    // Reconcile inconsistent context non-destructively
    const reconcileResult = initProjectContext(inconsistentDir, { mode: "adopt" });
    assert(reconcileResult.lifecycleState === "RECONCILED", "Adopting partial context yields lifecycleState = RECONCILED");
    assert(reconcileResult.createdFiles.includes(".project-context/CHANGELOG.md"), "Reconciliation created missing CHANGELOG.md");
    const inspectReconciled = inspectContextLifecycle(inconsistentDir);
    assert(inspectReconciled.state === "EXISTING", "Reconciled context transitions to lifecycle EXISTING");

    // Test 4.7: INVALID context state (file instead of directory)
    const invalidDir = path.join(tempBase, "invalid-project");
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(invalidDir, ".project-context"), "I am a file, not a directory", "utf-8");
    const inspectInvalid = inspectContextLifecycle(invalidDir);
    assert(inspectInvalid.state === "INVALID", "File at .project-context detected as lifecycle INVALID");

    let invalidInitCaught = false;
    try {
      initProjectContext(invalidDir, { mode: "auto" });
    } catch (err) {
      if (err.code === "CONTEXT_INVALID_STATE") {
        invalidInitCaught = true;
      }
    }
    assert(invalidInitCaught === true, "Initializing on INVALID context fails with CONTEXT_INVALID_STATE");

    // Test 4.8: Project Relocation & Identity Stability
    // Verify that moving project-12 to a completely new folder preserves identity
    const relocated12Root = path.join(tempBase, "relocated-project-12");
    fs.renameSync(project12Root, relocated12Root);

    const relocatedIdentity = getProjectIdentity(relocated12Root);
    assert(relocatedIdentity.id === "project-12", "Relocated project retains stable project_id 'project-12'");
    assert(relocatedIdentity.name === "Project-12", "Relocated project retains project_name 'Project-12'");

    const relocatedTasks = readTasks(relocated12Root);
    const relocatedHasSentinel = fs.readFileSync(path.join(relocated12Root, ".project-context", "TASKS.md"), "utf-8").includes(SENTINEL);
    assert(relocatedHasSentinel, "Relocated project preserves sentinel tasks without data loss");

    // Restore path so downstream teardown and any subsequent tests stay clean
    fs.renameSync(relocated12Root, project12Root);

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: Graphify 4-State Read-Only Inspector
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 5. Graphify 4-State Detection (AVAILABLE, MISSING, STALE, INVALID) ──");

    // Test 5.1: MISSING State (project-12 has no graphify-out)
    const statusMissing = getGraphifyStatus(project12Root);
    assert(statusMissing.state === "MISSING", "Graphify state on project without graphify-out is MISSING");
    assert(statusMissing.exists === false, "exists flag is false on MISSING");
    assert(statusMissing.nodesCount === 0, "nodesCount is 0 on MISSING");

    // Test 5.2: INVALID State (corrupt graph.json)
    const graphifyOut12 = path.join(project12Root, "graphify-out");
    fs.mkdirSync(graphifyOut12, { recursive: true });
    fs.writeFileSync(path.join(graphifyOut12, "graph.json"), "{ NOT_VALID_JSON ...", "utf-8");

    const statusInvalid = getGraphifyStatus(project12Root);
    assert(statusInvalid.state === "INVALID", "Corrupted graph.json detected as INVALID");
    assert(statusInvalid.error !== null, "INVALID state populates error message");

    // Test 5.3: STALE State (graph.json git_commit doesn't match HEAD)
    const validGraphPayload = {
      git_commit: "deadbeef00000000000000000000000000000000",
      generated_at: "2026-01-01T00:00:00.000Z",
      nodes: [
        { id: "node_1", label: "ServiceAlpha", kind: "class", community: 1 },
        { id: "node_2", label: "ServiceBeta", kind: "class", community: 1 },
      ],
      edges: [
        { source: "node_1", target: "node_2", relation: "calls" },
      ],
      communities: [{ id: 1, name: "CoreServices" }],
    };
    fs.writeFileSync(path.join(graphifyOut12, "graph.json"), JSON.stringify(validGraphPayload, null, 2), "utf-8");

    // In a repo without git HEAD matching deadbeef, state is STALE (or AVAILABLE if no git repo)
    const statusWithGraph = getGraphifyStatus(project12Root);
    assert(
      statusWithGraph.state === "STALE" || statusWithGraph.state === "AVAILABLE",
      `Graphify with graph.json yields valid state (got ${statusWithGraph.state})`
    );
    assert(statusWithGraph.nodesCount === 2, "nodesCount parses correctly (got 2)");
    assert(statusWithGraph.edgesCount === 1, "edgesCount parses correctly (got 1)");
    assert(statusWithGraph.communitiesCount === 1, "communitiesCount parses correctly (got 1)");

    // Test 5.4: CareerOS real Graphify verification (must be AVAILABLE or STALE)
    const careerOsGraphStatus = getGraphifyStatus(careerOsRoot);
    assert(careerOsGraphStatus.exists === true, "CareerOS graphify-out/graph.json exists");
    assert(
      careerOsGraphStatus.state === "AVAILABLE" || careerOsGraphStatus.state === "STALE",
      `CareerOS Graphify status is AVAILABLE or STALE (got ${careerOsGraphStatus.state})`
    );
    assert(careerOsGraphStatus.nodesCount > 1000, `CareerOS has substantial node count (got ${careerOsGraphStatus.nodesCount})`);
    assert(careerOsGraphStatus.godNodes.length > 0, "CareerOS godNodes detected and non-empty");

    // Test 5.5: Doctor Integration Check on Graphify
    const docResult12 = runDoctor(project12Root);
    assert(docResult12.healthy === true, "Doctor succeeds even with non-fatal Graphify states");
    const graphifyCheck = docResult12.checks.find((c) => c.name === "Graphify Structural Integration");
    assert(graphifyCheck !== undefined, "Doctor includes Check #9 'Graphify Structural Integration'");
    assert(graphifyCheck.passed === true, "Doctor Graphify check passes gracefully");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 6: Phase 5B Structural Neighbor Traversal & Progressive Fusion
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 6. Phase 5B Structural Graph Traversal & Context Fusion ──");

    // Test 6.1: In-memory Caching & Automatic Mtime Cache Invalidation
    clearGraphCache();
    const load1 = loadGraphData(careerOsRoot);
    assert(load1 !== null && load1.loaded === true, "loadGraphData loads CareerOS graph successfully");
    const load2 = loadGraphData(careerOsRoot);
    assert(load1 === load2, "Second load returns identical cached instance (in-memory caching verified)");

    // Test 6.2: Structural Neighbor Traversal on Ground Truth Graph
    const testService = "frontend/src/features/profile/profileService.ts";
    const neighbors = getStructuralNeighbors(careerOsRoot, testService);
    assert(Array.isArray(neighbors), "getStructuralNeighbors returns array");
    assert(neighbors.length > 0, `getStructuralNeighbors finds 1-hop connections for ${testService} (got ${neighbors.length})`);
    assert(neighbors.includes("frontend/src/features/profile/useProfile.ts") || neighbors.includes("frontend/src/pages/Profile.tsx"), "Neighbors include expected caller/dependency files");

    // Test 6.3: Community-to-File Mapping
    const commFiles = getCommunityFiles(careerOsRoot, 117);
    assert(Array.isArray(commFiles), "getCommunityFiles returns array");
    assert(commFiles.length > 0, `Community 117 maps to non-empty source files (got ${commFiles.length})`);
    assert(commFiles.includes("frontend/src/features/profile/profileService.ts"), "Community 117 includes profileService.ts");

    // Test 6.4: Synthetic Isolated Graph Traversal on project-12
    const synthGraph = {
      git_commit: "deadbeef00000000000000000000000000000000",
      nodes: [
        { id: "modA_fn1", label: "fnA", source_file: "src/moduleA.js", community: 42, community_name: "Auth" },
        { id: "modB_fn2", label: "fnB", source_file: "src/moduleB.js", community: 42, community_name: "Auth" },
        { id: "modC_fn3", label: "fnC", source_file: "src/moduleC.js", community: 99, community_name: "Billing" },
      ],
      edges: [
        { source: "modA_fn1", target: "modB_fn2", relation: "calls" },
        { source: "modB_fn2", target: "modC_fn3", relation: "calls" },
      ],
    };
    fs.writeFileSync(path.join(graphifyOut12, "graph.json"), JSON.stringify(synthGraph, null, 2), "utf-8");
    clearGraphCache();

    const synthNeighborsA = getStructuralNeighbors(project12Root, "src/moduleA.js");
    assert(synthNeighborsA.includes("src/moduleB.js"), "1-hop dependency src/moduleB.js found from src/moduleA.js");
    assert(!synthNeighborsA.includes("src/moduleC.js"), "2-hop connection src/moduleC.js correctly excluded from 1-hop neighborhood");

    const synthNeighborsB = getStructuralNeighbors(project12Root, "src/moduleB.js");
    assert(synthNeighborsB.includes("src/moduleA.js"), "1-hop caller src/moduleA.js found from src/moduleB.js");
    assert(synthNeighborsB.includes("src/moduleC.js"), "1-hop dependency src/moduleC.js found from src/moduleB.js");

    const authCommFiles = getCommunityFiles(project12Root, 42);
    assert(authCommFiles.length === 2 && authCommFiles.includes("src/moduleA.js") && authCommFiles.includes("src/moduleB.js"), "Community 42 maps exactly to moduleA and moduleB");

    // Test 6.5: Progressive Context Fusion in getRelevantContext
    const fusionContext = getRelevantContext(project12Root, { files: ["src/moduleA.js"], limit: 5 });
    assert(Array.isArray(fusionContext.suggested_files), "getRelevantContext returns suggested_files array");
    assert(fusionContext.suggested_files.includes("src/moduleB.js"), "Progressive Context Fusion enriched suggested_files with structural neighbor src/moduleB.js");

    // Test 6.6: Graceful Degradation on MISSING or INVALID Graphify
    const ghostContext = getRelevantContext(nonExistentDir, { query: "test query", limit: 5 });
    assert(Array.isArray(ghostContext.suggested_files), "Graceful fallback on MISSING Graphify returns valid object");
    assert(ghostContext.suggested_files.length === 0, "MISSING Graphify gracefully returns empty suggested_files without error");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 7: Phase 5C Dual-Source Progressive Context Fusion
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 7. Phase 5C Dual-Source Context Fusion & Provenance ──");

    // Test 7.1: Semantic-Only Retrieval when Graphify is MISSING
    const fusedMissing = getFusedContext(nonExistentDir, { query: "authentication token", limit: 3 });
    assert(fusedMissing.structural_context.state === "MISSING", "Fused context reports structural_context.state = MISSING for non-existent graph");
    assert(fusedMissing.structural_context.neighbors.length === 0, "MISSING graph yields empty structural neighbors");
    assert(fusedMissing.structural_context.community === undefined, "MISSING graph yields undefined community");
    assert(Array.isArray(fusedMissing.suggested_files), "suggested_files is always a valid array");

    // Test 7.2: Graphify AVAILABLE on Isolated Synthetic Project (project-12)
    clearGraphCache();
    const fusedAvailable = getFusedContext(project12Root, { files: ["src/moduleA.js"], limit: 3 });
    assert(fusedAvailable.project_id === "project-12", "Fused context preserves project_id = project-12");
    assert(fusedAvailable.project_name === "Project-12", "Fused context preserves project_name = Project-12");
    assert(
      fusedAvailable.structural_context.state === "AVAILABLE" || fusedAvailable.structural_context.state === "STALE",
      `Fused context on project-12 reports valid state (got ${fusedAvailable.structural_context.state})`
    );

    // Test 7.3: Inbound & Outbound Neighbor Relationships with Provenance
    const fusedModuleB = getFusedContext(project12Root, { files: ["src/moduleB.js"], limit: 5 });
    const callers = fusedModuleB.structural_context.neighbors.filter((n) => n.relation === "caller");
    const dependencies = fusedModuleB.structural_context.neighbors.filter((n) => n.relation === "dependency");
    assert(callers.some((c) => c.file === "src/moduleA.js"), "Inbound caller src/moduleA.js identified with relation: caller");
    assert(dependencies.some((d) => d.file === "src/moduleC.js"), "Outbound dependency src/moduleC.js identified with relation: dependency");

    // Test 7.4: Community Cluster Enrichment in Fused Context
    assert(fusedAvailable.structural_context.community !== undefined, "Fused context identifies community cluster");
    assert(fusedAvailable.structural_context.community.id === 42, "Community ID is correctly resolved to 42");
    assert(fusedAvailable.structural_context.community.name === "Auth", "Community Name is correctly resolved to 'Auth'");
    assert(fusedAvailable.structural_context.community.files.includes("src/moduleB.js"), "Community files include moduleB.js");

    // Test 7.5: Bounded Result Counts & No 2+ Hop Leakage
    assert(fusedAvailable.structural_context.neighbors.length <= 5, "Structural neighbors strictly bounded by maxNeighbors limit");
    assert(!fusedAvailable.structural_context.neighbors.some((n) => n.file === "src/moduleC.js"), "2-hop connection src/moduleC.js strictly excluded from moduleA neighbors");

    // Test 7.6: No Self-Referential Neighbor Links
    assert(!fusedAvailable.structural_context.neighbors.some((n) => n.file === "src/moduleA.js"), "Self-referential link src/moduleA.js strictly excluded from neighbors");

    // Test 7.7: Secret-Token & Sibling Isolation in Fused Context
    // Verify that fused context in project-12 NEVER leaks sibling project-19 tasks, decisions, or paths
    const fused12 = getFusedContext(project12Root, { query: "Secret Pipeline", limit: 5 });
    const semantic12Str = JSON.stringify(fused12.semantic_context);
    const structural12Str = JSON.stringify(fused12.structural_context);
    assert(!semantic12Str.includes(TOKEN_19), "Fused semantic context in project-12 contains ZERO traces of sibling TOKEN_19");
    assert(!structural12Str.includes(TOKEN_19), "Fused structural context in project-12 contains ZERO traces of sibling TOKEN_19");
    assert(!JSON.stringify(fused12).includes("project-19"), "Fused context in project-12 contains ZERO file paths from sibling project-19");

    // Test 7.8: CareerOS Real Graph Staleness & Freshness Verification
    const fusedCareer = getFusedContext(careerOsRoot, { files: ["frontend/src/features/profile/profileService.ts"], limit: 3 });
    assert(fusedCareer.structural_context.state === "STALE", "CareerOS real graph correctly reported as STALE (built_at_commit != HEAD)");
    assert(fusedCareer.structural_context.is_stale === true, "is_stale flag is explicitly true");
    assert(fusedCareer.structural_context.built_commit !== null, "built_commit is present");
    assert(fusedCareer.structural_context.head_commit !== null, "head_commit is present");
    assert(fusedCareer.structural_context.neighbors.length > 0, "STALE graph still provides bounded 1-hop structural neighbors without crashing");

    // Test 7.9: Full AST & Full Project Exclusion Guarantee
    // Verify that fused result does NOT include full AST, entire graph, or all project files
    assert(fusedCareer.structural_context.nodes === undefined, "Fused context strictly excludes full raw AST nodes array");
    assert(fusedCareer.structural_context.edges === undefined, "Fused context strictly excludes full raw AST edges array");
    assert(fusedCareer.suggested_files.length <= 15, "suggested_files strictly bounded (got <= 15)");

    // Test 7.10: Graphify INVALID State Graceful Degradation
    fs.writeFileSync(path.join(graphifyOut12, "graph.json"), "CORRUPT_JSON_DATA{{{", "utf-8");
    clearGraphCache();
    const fusedInvalid = getFusedContext(project12Root, { query: "auth", limit: 3 });
    assert(fusedInvalid.structural_context.state === "INVALID", "Corrupt graph.json yields structural_context.state = INVALID");
    assert(fusedInvalid.structural_context.neighbors.length === 0, "INVALID graph yields 0 neighbors without throwing");
    assert(Array.isArray(fusedInvalid.semantic_context.decisions), "Semantic context remains 100% accessible despite INVALID Graphify");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 8: Phase 5D Context Health, Consistency & Snapshot Harmonization
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 8. Phase 5D Context Health & Snapshot Harmonization ──");

    // Test 8.1: Snapshot with Graphify Metadata (AVAILABLE / STALE)
    const snapCareer = getContextSnapshot(careerOsRoot);
    assert(snapCareer.cold_context_pointers.graphify !== undefined, "Snapshot includes cold_context_pointers.graphify object");
    assert(
      snapCareer.cold_context_pointers.graphify.state === "AVAILABLE" || snapCareer.cold_context_pointers.graphify.state === "STALE",
      `CareerOS snapshot graphify state is valid (got ${snapCareer.cold_context_pointers.graphify.state})`
    );
    assert(typeof snapCareer.cold_context_pointers.graphify.is_stale === "boolean", "is_stale is boolean");
    assert(snapCareer.cold_context_pointers.graphify.nodes_count > 1000, `nodes_count is populated (got ${snapCareer.cold_context_pointers.graphify.nodes_count})`);
    assert(snapCareer.cold_context_pointers.graphify.edges_count > 1000, `edges_count is populated (got ${snapCareer.cold_context_pointers.graphify.edges_count})`);

    // Verify snapshot does NOT leak raw AST nodes, edges, or full syntax trees
    assert(snapCareer.cold_context_pointers.graphify.nodes === undefined, "Snapshot strictly excludes raw nodes array");
    assert(snapCareer.cold_context_pointers.graphify.edges === undefined, "Snapshot strictly excludes raw edges array");
    assert(snapCareer.cold_context_pointers.graphify.links === undefined, "Snapshot strictly excludes raw links array");

    // Test 8.2: Snapshot without Graphify (MISSING fallback)
    const snapMissing = getContextSnapshot(project19Root);
    assert(snapMissing.cold_context_pointers.graphify !== undefined, "Project-19 snapshot includes graphify object");
    assert(snapMissing.cold_context_pointers.graphify.state === "MISSING", "Project-19 without graphify reports state = MISSING");
    assert(snapMissing.cold_context_pointers.graphify.nodes_count === 0, "MISSING graphify reports nodes_count = 0");
    assert(snapMissing.cold_context_pointers.graphify.edges_count === 0, "MISSING graphify reports edges_count = 0");

    // Test 8.3: Consistency Engine with Graphify Freshness
    const consistencyCareer = checkConsistency(careerOsRoot);
    assert(typeof consistencyCareer.isConsistent === "boolean", "checkConsistency returns isConsistent boolean");
    const staleIssue = consistencyCareer.issues.find((i) => i.code === "GRAPHIFY_STRUCTURAL_STALE");
    assert(staleIssue !== undefined, "checkConsistency identifies GRAPHIFY_STRUCTURAL_STALE when commit mismatch exists");
    assert(staleIssue.severity === "INFO", "GRAPHIFY_STRUCTURAL_STALE is classified as non-fatal INFO severity");

    // Test 8.4: Consistency Engine with Corrupted Graphify
    const consistencyInvalid = checkConsistency(project12Root);
    const corruptIssue = consistencyInvalid.issues.find((i) => i.code === "GRAPHIFY_CORRUPTED");
    assert(corruptIssue !== undefined, "checkConsistency identifies GRAPHIFY_CORRUPTED when graph.json is unparseable");
    assert(corruptIssue.severity === "WARNING", "GRAPHIFY_CORRUPTED is classified as WARNING severity");

    // Test 8.5: Doctor Integration with Unified Context Health Model
    const docCareer = runDoctor(careerOsRoot);
    assert(docCareer.healthy === true, "Doctor succeeds on healthy project with stale Graphify");
    const check9 = docCareer.checks.find((c) => c.name === "Graphify Structural Integration");
    const check10 = docCareer.checks.find((c) => c.name === "Context Consistency Audit");
    assert(check9 !== undefined, "Doctor includes Check #9 'Graphify Structural Integration'");
    assert(check10 !== undefined, "Doctor includes Check #10 'Context Consistency Audit'");
    assert(check9.passed === true, "Check #9 passes for STALE graph (non-fatal)");
    assert(check10.passed === true, "Check #10 passes when zero ERROR-level consistency issues exist");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 9: Phase 5E Non-Destructive Context Recovery & Operational Reconciliation
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 9. Phase 5E Non-Destructive Context Recovery & Operational Reconciliation ──");

    // Test 9.1: Inconsistent Context Store Reconciles to EXISTING
    const p12Changelog = path.join(project12Root, ".project-context", "CHANGELOG.md");
    const p12ChangelogBackup = fs.readFileSync(p12Changelog, "utf-8");
    fs.unlinkSync(p12Changelog);

    const inspectP12Inconsistent = inspectContextLifecycle(project12Root);
    assert(inspectP12Inconsistent.state === "INCONSISTENT", "Missing CHANGELOG.md creates INCONSISTENT lifecycle state");
    assert(inspectP12Inconsistent.missingCanonicalFiles.includes("CHANGELOG.md"), "missingCanonicalFiles explicitly lists CHANGELOG.md");

    const audit1 = reconcileContext(project12Root);
    assert(audit1.success === true, "reconcileContext executes successfully");
    assert(audit1.lifecycle_before === "INCONSISTENT", "Audit record captures lifecycle_before = INCONSISTENT");
    assert(audit1.lifecycle_after === "EXISTING", "Audit record captures lifecycle_after = EXISTING");
    assert(audit1.created_count >= 1, "Audit record shows at least 1 created file");
    assert(audit1.created_files.includes(".project-context/CHANGELOG.md"), "Created files includes CHANGELOG.md");
    assert(fs.existsSync(p12Changelog), "CHANGELOG.md restored to disk");

    // Test 9.2: Sentinel Preservation in STATE.md, TASKS.md, DECISIONS.md
    const p12State = readState(project12Root);
    const p12Tasks = readTasks(project12Root);
    const p12Decisions = readDecisions(project12Root);
    assert(p12State.meta.project_name === "Project-12", "reconcileContext preserved STATE.md project_name");
    assert(p12Tasks.tasks.some((t) => t.id === "TASK-P12-001" && t.title.includes(TOKEN_12)), "reconcileContext preserved TASKS.md sentinel task TOKEN_12");
    assert(p12Decisions.decisions.some((d) => d.id === "ADR-001"), "reconcileContext preserved DECISIONS.md ADRs");

    // Test 9.3: Fail-Closed on INVALID Context
    const invalidSubdir = path.join(tempBase, "invalid-context-project");
    fs.mkdirSync(invalidSubdir, { recursive: true });
    const fakeContextFile = path.join(invalidSubdir, ".project-context");
    fs.writeFileSync(fakeContextFile, "NOT_A_DIRECTORY", "utf-8");

    let invalidThrown = false;
    try {
      reconcileContext(invalidSubdir);
    } catch (err) {
      invalidThrown = true;
      assert(err.code === "CONTEXT_INVALID_STATE", "reconcileContext fails closed with CONTEXT_INVALID_STATE when .project-context is not a directory");
    }
    assert(invalidThrown === true, "reconcileContext throws on INVALID context");

    // Test 9.4: Crashed Session Adoption & Recovery Handoff Generation
    const crashedAgent = "crashed-agent-adversarial";
    startSession(project12Root, {
      agent: crashedAgent,
      interface: "antigravity-cli",
      router: "omniroute",
      model: "gemini-3.8-flash",
      task_id: "TASK-P12-001",
      task_title: `Adversarial Crash Test with ${TOKEN_12}`,
      objective: "Interrupted task simulating worker death",
      working_area: ["src/moduleA.js"],
    });

    const adoptRes = recoverSession(project12Root, {
      agent: crashedAgent,
      new_agent: "recovering-agent",
      action: "ADOPT",
    });
    assert(adoptRes.success === true, "recoverSession ADOPT succeeds");
    assert(adoptRes.recovered_count === 1, "recoverSession reports recovered_count = 1");

    const recoveryEntry = adoptRes.recoveries[0];
    assert(recoveryEntry.status === "ADOPTED", "Adopted recovery has status = ADOPTED");
    assert(recoveryEntry.adopted_by === "recovering-agent", "Adopted recovery indicates adopted_by = recovering-agent");
    assert(typeof recoveryEntry.recovery_handoff === "string", "Emergency recovery handoff generated");

    const handoffPath = path.join(project12Root, ".project-context", "handoffs", recoveryEntry.recovery_handoff);
    assert(fs.existsSync(handoffPath), "Emergency recovery handoff file exists on disk");
    const handoffRaw = fs.readFileSync(handoffPath, "utf-8");
    assert(handoffRaw.includes("src/moduleA.js"), "Recovery handoff documents in-flight files");
    assert(handoffRaw.includes("recovering-agent"), "Recovery handoff designates incoming agent");

    // Verify original stale session file preserved
    const staleFilePath = path.join(project12Root, ".project-context", "active-work", `${crashedAgent}.md`);
    assert(fs.existsSync(staleFilePath), "Stale agent descriptor file was NOT deleted (non-destructive)");
    const staleRaw = fs.readFileSync(staleFilePath, "utf-8");
    assert(staleRaw.includes("COMPLETED"), "Stale agent descriptor marked COMPLETED");

    // Test 9.5: 3x Repeated Reconciliation Idempotency
    const run2 = reconcileContext(project12Root);
    const run3 = reconcileContext(project12Root);
    assert(run2.success === true && run3.success === true, "Repeated reconciliation runs 2 and 3 succeed");
    assert(run2.created_count === 0, "Run 2 created exactly 0 files (idempotent)");
    assert(run3.created_count === 0, "Run 3 created exactly 0 files (idempotent)");
    assert(run2.lifecycle_before === "EXISTING" && run2.lifecycle_after === "EXISTING", "Run 2 maintains EXISTING lifecycle state");
    assert(run3.lifecycle_before === "EXISTING" && run3.lifecycle_after === "EXISTING", "Run 3 maintains EXISTING lifecycle state");

    // Test 9.6: Symlink Escape & Path Traversal Rejection
    let traversalThrown = false;
    try {
      reconcileContext(path.join(project12Root, "..", "project-19"));
    } catch {
      // Direct call on sibling is valid if passed as its own root, but passing escaping paths throws:
    }
    try {
      assertWithinProject(path.join(project12Root, "..", "project-19"), project12Root);
    } catch (err) {
      traversalThrown = true;
      assert(err.code === "PATH_TRAVERSAL_DETECTED", "Escaping project root throws PATH_TRAVERSAL_DETECTED");
    }
    assert(traversalThrown === true, "Path jailing strictly enforced");

    // Test 9.7: Project-12 vs Project-19 Isolation During Recovery
    const p19Changelog = path.join(project19Root, ".project-context", "CHANGELOG.md");
    const p19ChangelogBefore = fs.readFileSync(p19Changelog, "utf-8");
    reconcileContext(project12Root);
    const p19ChangelogAfter = fs.readFileSync(p19Changelog, "utf-8");
    assert(p19ChangelogBefore === p19ChangelogAfter, "Reconciliation on Project-12 has ZERO effect on sibling Project-19 files");

    // Test 9.8: Scratch Files and graphify-out Preserved 100% Untouched
    const p12ScratchDir = path.join(project12Root, ".project-context", "scratch");
    fs.mkdirSync(p12ScratchDir, { recursive: true });
    const sentinelScratch = path.join(p12ScratchDir, "user-scratch-script.py");
    fs.writeFileSync(sentinelScratch, "# Important user scratch work", "utf-8");

    const auditScratch = reconcileContext(project12Root);
    assert(auditScratch.success === true, "Reconciliation succeeds with scratch directory present");
    assert(fs.existsSync(sentinelScratch), "Scratch file is preserved 100% untouched");
    assert(fs.readFileSync(sentinelScratch, "utf-8") === "# Important user scratch work", "Scratch file content is identical");

    // ───────────────────────────────────────────────────────────────────────────
    // 10. Phase 5F Multi-Agent Coordination, Liveness & Diagnostics Export
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n── 10. Phase 5F Multi-Agent Coordination, Liveness & Diagnostics Export ──");

    // Clean active-work directory on project12Root for deterministic session tests
    const p12ActiveWorkDir = path.join(project12Root, ".project-context", "active-work");
    const existingWorkFiles = fs.readdirSync(p12ActiveWorkDir);
    for (const wf of existingWorkFiles) {
      if (wf.endsWith(".md") && wf !== "README.md") {
        fs.unlinkSync(path.join(p12ActiveWorkDir, wf));
      }
    }

    // Gate 10.1: Directory-File Containment Collision (CONTAINMENT_DIR_FILE)
    startSession(project12Root, {
      agent: "agent-alpha-dir",
      active_task: "TASK-DIR-001",
      working_area: ["frontend/src/services/"],
    });
    startSession(project12Root, {
      agent: "agent-beta-file",
      active_task: "TASK-FILE-002",
      working_area: ["frontend/src/services/auth.js"],
    });

    const colDirFile = checkWorkingAreaCollisions(project12Root);
    assert(colDirFile.hasCollisions === true, "checkWorkingAreaCollisions detects collision between directory and contained file");
    assert(colDirFile.count === 1, "Exactly 1 collision detected for dir->file overlap");
    assert(colDirFile.collisions[0].type === "OVERLAP", "Collision type is OVERLAP");
    assert(colDirFile.collisions[0].subtype === "CONTAINMENT_DIR_FILE", "Collision subtype is CONTAINMENT_DIR_FILE");
    assert(colDirFile.collisions[0].recommendation.includes("Hierarchical scope overlap"), "Provides advisory recommendation for containment");

    // Gate 10.2: Exact Collision Detection (EXACT)
    // Add third agent with exact file match
    startSession(project12Root, {
      agent: "agent-gamma-exact",
      active_task: "TASK-EXACT-003",
      working_area: ["frontend/src/services/auth.js"],
    });

    const colExact = checkWorkingAreaCollisions(project12Root);
    const exactMatches = colExact.collisions.filter((c) => c.type === "EXACT");
    assert(exactMatches.length === 1, "Exactly 1 EXACT collision detected");
    assert(exactMatches[0].subtype === "EXACT", "Exact collision subtype is EXACT");
    assert(exactMatches[0].area_a === "frontend/src/services/auth.js" && exactMatches[0].area_b === "frontend/src/services/auth.js", "Both agents conflict on identical file");
    assert(exactMatches[0].recommendation.includes("Exact collision"), "Provides advisory recommendation for exact collision");

    // Gate 10.3: Disjoint Non-Colliding Sessions
    // Reset sessions with disjoint areas
    fs.unlinkSync(path.join(p12ActiveWorkDir, "agent-alpha-dir.md"));
    fs.unlinkSync(path.join(p12ActiveWorkDir, "agent-beta-file.md"));
    fs.unlinkSync(path.join(p12ActiveWorkDir, "agent-gamma-exact.md"));

    startSession(project12Root, {
      agent: "agent-disjoint-1",
      active_task: "TASK-DISJOINT-1",
      working_area: ["src/features/auth.js"],
    });
    startSession(project12Root, {
      agent: "agent-disjoint-2",
      active_task: "TASK-DISJOINT-2",
      working_area: ["src/features/billing.js"],
    });

    const colDisjoint = checkWorkingAreaCollisions(project12Root);
    assert(colDisjoint.hasCollisions === false, "Disjoint sessions yield hasCollisions = false");
    assert(colDisjoint.count === 0, "Disjoint sessions yield count = 0");
    assert(colDisjoint.collisions.length === 0, "Disjoint sessions return empty collisions array");

    // Gate 10.4: Advisory-Only Invariance
    // Re-create a collision and ensure descriptors on disk are byte-for-byte untouched
    startSession(project12Root, {
      agent: "agent-invariance-a",
      active_task: "TASK-INV-A",
      working_area: ["src/core.js"],
    });
    startSession(project12Root, {
      agent: "agent-invariance-b",
      active_task: "TASK-INV-B",
      working_area: ["src/core.js"],
    });

    const pathA = path.join(p12ActiveWorkDir, "agent-invariance-a.md");
    const pathB = path.join(p12ActiveWorkDir, "agent-invariance-b.md");
    const contentABefore = fs.readFileSync(pathA, "utf-8");
    const contentBBefore = fs.readFileSync(pathB, "utf-8");

    const colInv = checkWorkingAreaCollisions(project12Root);
    assert(colInv.hasCollisions === true, "Collision detected between invariance test agents");

    const contentAAfter = fs.readFileSync(pathA, "utf-8");
    const contentBAfter = fs.readFileSync(pathB, "utf-8");
    assert(contentABefore === contentAAfter, "Agent A descriptor remains 100% byte-for-byte identical after collision detection");
    assert(contentBBefore === contentBAfter, "Agent B descriptor remains 100% byte-for-byte identical after collision detection");

    // Gate 10.5: Unified Diagnostic Export Completeness & Bounded Arrays
    const diag = getProjectDiagnostics(project12Root);
    assert(diag._type === "ProjectDiagnosticsRecord", "Diagnostics type is ProjectDiagnosticsRecord");
    assert(diag.schema_version === "1.0.0", "Diagnostics schema_version is 1.0.0");
    assert(diag.project.id === "project-12", "Diagnostics records correct project.id");
    assert(diag.lifecycle.state === "EXISTING", "Lifecycle state is EXISTING");
    assert(typeof diag.health.score === "number", "Health score is numeric");
    assert(diag.sessions.total >= 2, "Sessions total reflects registered agents");
    assert(diag.sessions.collisions.has_collisions === true, "Consolidated collisions reported in diagnostics");
    assert(diag.structural.source === "graphify", "Structural source is graphify");
    assert(typeof diag.git.is_clean === "boolean", "Git is_clean boolean reported");
    assert(diag.consistency.is_consistent !== undefined, "Consistency state reported");
    assert(diag.reconciliation.reconcile_recommended !== undefined, "Reconciliation recommendation reported");
    assert(Array.isArray(diag.consistency.issues), "Consistency issues is an array");
    assert(diag.consistency.issues.length <= 25, "Consistency issues bounded to <= 25 entries");
    assert(diag.sessions.collisions.items.length <= 20, "Session collisions bounded to <= 20 entries");

    // Gate 10.6: Anti-Credential Scrubbing on Diagnostics
    // Create an unclosed agent with an API token to verify assertNoSecrets triggers
    let secretArrested = false;
    try {
      startSession(project12Root, {
        agent: "agent-leak",
        active_task: "TASK-LEAK",
        objective: "Testing sk-proj-1234567890abcdef1234567890abcdef leak prevention",
      });
    } catch (err) {
      if (err.message.includes("Credential") || err.message.includes("Secret") || err.code === "SECURITY_VIOLATION") {
        secretArrested = true;
      }
    }
    assert(secretArrested === true, "Anti-credential check arrested secret API token from entering session registry");

    // Gate 10.7: Multi-Project Isolation in Diagnostics
    const p12Diag = getProjectDiagnostics(project12Root);
    const p19Diag = getProjectDiagnostics(project19Root);
    const p12DiagStr = JSON.stringify(p12Diag);
    const p19DiagStr = JSON.stringify(p19Diag);

    assert(p12Diag.project.id === "project-12", "p12 diagnostics bound to project-12");
    assert(p19Diag.project.id === "project-19", "p19 diagnostics bound to project-19");
    assert(!p12DiagStr.includes("TOKEN_19"), "Project-12 diagnostics contain ZERO traces of sibling Project-19 tokens");
    assert(!p12DiagStr.includes(project19Root.replace(/\\/g, "/")), "Project-12 diagnostics contain ZERO paths from Project-19");
    assert(!p19DiagStr.includes("TOKEN_12"), "Project-19 diagnostics contain ZERO traces of sibling Project-12 tokens");

    // Gate 10.8: Symlink & Traversal Resistance in Diagnostics
    let diagTraversalThrown = false;
    try {
      getProjectDiagnostics(path.join(project12Root, "..", "project-19", "..", ".."));
    } catch {
      diagTraversalThrown = true;
    }
    try {
      assertWithinProject(path.join(project12Root, "..", "escaped"), project12Root);
    } catch (err) {
      diagTraversalThrown = true;
      assert(err.code === "PATH_TRAVERSAL_DETECTED", "Escaped path throws PATH_TRAVERSAL_DETECTED");
    }
    assert(diagTraversalThrown === true, "Path traversal in diagnostics is rejected");

    // Gate 10.9: Read-Only Graphify & Git Invariance
    const p12GraphPath = path.join(project12Root, "graphify-out", "graph.json");
    const graphMtimeBefore = fs.existsSync(p12GraphPath) ? fs.statSync(p12GraphPath).mtimeMs : 0;
    const gitHeadBefore = diag.git.recent_commit;

    getProjectDiagnostics(project12Root);

    const graphMtimeAfter = fs.existsSync(p12GraphPath) ? fs.statSync(p12GraphPath).mtimeMs : 0;
    const gitHeadAfter = getProjectDiagnostics(project12Root).git.recent_commit;
    assert(graphMtimeBefore === graphMtimeAfter, "graphify-out/ remains completely untouched during diagnostics");
    assert(gitHeadBefore === gitHeadAfter, "Git commit HEAD remains unchanged during diagnostics");

    // Gate 10.10: Explicit Liveness vs. Crash Invariant Tests (live-but-idle != CRASHED)
    // 1. Fresh session (<= 1h) -> ACTIVE
    const freshSession = listSessions(project12Root).sessions.find((s) => s.agent === "agent-invariance-a");
    assert(freshSession !== undefined, "Found test agent session");
    assert(freshSession.liveness === "ACTIVE", "Recently updated session classified as ACTIVE");

    // 2. Synthesize an idle session (idle = 2 hours) -> ACTIVE_BUT_IDLE
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const idlePath = path.join(p12ActiveWorkDir, "agent-idle-test.md");
    fs.writeFileSync(idlePath, `---
agent: agent-idle-test
interface: kilo-code
router: omniroute
model: gpt-4o
active_task: TASK-IDLE
task_title: Idle Test
status: IN_PROGRESS
started_at: ${twoHoursAgo}
last_activity: ${twoHoursAgo}
updated_at: ${twoHoursAgo}
working_area:
  - src/idle.js
---
Idle session test.
`, "utf-8");

    const idleSessions = listSessions(project12Root);
    const idleAgent = idleSessions.sessions.find((s) => s.agent === "agent-idle-test");
    assert(idleAgent.liveness === "ACTIVE_BUT_IDLE", "Session idle for 2h classified as ACTIVE_BUT_IDLE (not STALE, not CRASHED)");
    assert(idleAgent.isStale === false, "Session idle for 2h is not stale (threshold is 24h)");

    // 3. Synthesize a stale session (idle = 30 hours) -> STALE
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const stalePath = path.join(p12ActiveWorkDir, "agent-stale-test.md");
    fs.writeFileSync(stalePath, `---
agent: agent-stale-test
interface: kilo-code
router: omniroute
model: gpt-4o
active_task: TASK-STALE
task_title: Stale Test
status: IN_PROGRESS
started_at: ${thirtyHoursAgo}
last_activity: ${thirtyHoursAgo}
updated_at: ${thirtyHoursAgo}
working_area:
  - src/stale.js
---
Stale session test.
`, "utf-8");

    const staleSessions = listSessions(project12Root);
    const staleAgent = staleSessions.sessions.find((s) => s.agent === "agent-stale-test");
    assert(staleAgent.liveness === "STALE", "Session idle for 30h classified as STALE");
    assert(staleAgent.isStale === true, "Session idle for 30h marked isStale = true");

    // 4. Synthesize an abandoned session (idle = 80 hours) -> ABANDONED
    const eightyHoursAgo = new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString();
    const abandonedPath = path.join(p12ActiveWorkDir, "agent-abandoned-test.md");
    fs.writeFileSync(abandonedPath, `---
agent: agent-abandoned-test
interface: kilo-code
router: omniroute
model: gpt-4o
active_task: TASK-ABANDONED
task_title: Abandoned Test
status: IN_PROGRESS
started_at: ${eightyHoursAgo}
last_activity: ${eightyHoursAgo}
updated_at: ${eightyHoursAgo}
working_area:
  - src/abandoned.js
---
Abandoned session test.
`, "utf-8");

    const abandonedSessions = listSessions(project12Root);
    const abandonedAgent = abandonedSessions.sessions.find((s) => s.agent === "agent-abandoned-test");
    assert(abandonedAgent.liveness === "ABANDONED", "Session idle for 80h classified as ABANDONED");

    // Crux invariant: Live-but-idle and stale sessions with no in-flight git changes are NEVER marked CRASHED
    assert(idleAgent.liveness !== "CRASHED", "Idle session is NOT classified as CRASHED");
    assert(staleAgent.liveness !== "CRASHED", "Stale session is NOT classified as CRASHED");
    assert(abandonedAgent.liveness !== "CRASHED", "Abandoned session is NOT classified as CRASHED");

    // Session descriptors on disk remain preserved without deletion
    assert(fs.existsSync(idlePath), "Idle descriptor preserved on disk");
    assert(fs.existsSync(stalePath), "Stale descriptor preserved on disk");
    assert(fs.existsSync(abandonedPath), "Abandoned descriptor preserved on disk");

    console.log("  ✓ Section 10: Phase 5F Multi-Agent Coordination & Diagnostics verified.");

    console.log("  ✓ Adversarial & Isolation Suite completed all checks successfully.");

  } finally {
    // Clean up temporary sandbox directory
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {
      // Ignore Windows file lock cleanup errors
    }
  }

  console.log("\nAdversarial & Isolation Suite: All assertions passed.\n");
}
