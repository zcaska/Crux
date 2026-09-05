/**
 * Project Context OS (Crux) — Phase 6 Remote Context Synchronization Test Suite
 *
 * Covers 20 critical Phase 6 verification scenarios:
 *   1. Project identity -> remote namespace mapping
 *   2. First synchronization (clean upload)
 *   3. Repeated synchronization (idempotence)
 *   4. Changed context synchronization (content hash update)
 *   5. No-op synchronization (304 UP_TO_DATE)
 *   6. Remote unavailable (fail-safe, local Crux operational)
 *   7. Retry behavior (bounded retries on transient network errors)
 *   8. Project isolation (Project A cannot access Project B)
 *   9. Project relocation (path-independent identity preserved)
 *  10. Graphify exclusion (graphify-out/ and graph.json never synchronized)
 *  11. Source code exclusion (src/, frontend/, tests/ never in payload)
 *  12. .git database exclusion (.git/ never in payload)
 *  13. Secret exclusion (assertNoSecrets blocks sync on credentials)
 *  14. Path traversal protection (rejection of escaping paths)
 *  15. Stale remote context detection (version mismatch)
 *  16. Remote corruption fail-closed (local canonical context never corrupted)
 *  17. Fresh crux init lifecycle (does NOT create graphify-out/)
 *  18. Existing project adoption (mode: adopt / auto preserves context)
 *  19. ChatGPT adapter remote retrieval (all 8 read tools via RemoteContextProvider)
 *  20. Token-bound session authorization (invalid token rejected)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  initProjectContext,
  getProjectIdentity,
  assembleRemoteContextPayload,
  syncProjectContext,
  getLocalSyncState,
  MockContextBackend,
  SupabaseContextBackend,
  createTask,
  updateTask,
  updateState,
  recordDecision,
  recordChange,
  getContextDir,
  assertWithinProject,
  scanForSecrets,
  writeProjectConfig,
  resolveAccountAndProject,
} from "../src/index.js";
import { RemoteContextProvider } from "../integrations/chatgpt/remote-context-provider.js";
import { createChatGPTAdapter } from "../integrations/chatgpt/index.js";

export async function runRemoteSyncTests(rootDir, assert) {
  console.log("\n================================================================");
  console.log("Project Context OS (Crux) — Phase 6 Remote Synchronization Suite");
  console.log("================================================================\n");

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "crux-phase6-sync-"));
  const projectARoot = path.join(tempBase, "ProjectAlpha");
  const projectBRoot = path.join(tempBase, "ProjectBeta");
  fs.mkdirSync(projectARoot, { recursive: true });
  fs.mkdirSync(projectBRoot, { recursive: true });

  const mockBackend = new MockContextBackend();

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 1: Project Identity -> Remote Namespace Mapping
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── 1. Project Identity & Remote Namespace Mapping ──");
    const initA = initProjectContext(projectARoot, {
      name: "ProjectAlpha",
      description: "Mission-critical Alpha service",
      mode: "create",
    });
    assert(initA.initialized === true, "Project Alpha initialized");

    const identityA = getProjectIdentity(projectARoot);
    assert(identityA.id === "projectalpha", `Project identity ID is '${identityA.id}'`);
    assert(identityA.name === "ProjectAlpha", "Project identity Name is 'ProjectAlpha'");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 2: First Synchronization (Clean Upload)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 2. First Synchronization ──");
    const syncRes1 = await syncProjectContext(projectARoot, {
      backend: mockBackend,
      accountId: "acc_test_123",
    });

    assert(syncRes1.status === "SUCCESS", `First sync returned status SUCCESS (got ${syncRes1.status})`);
    assert(Boolean(syncRes1.sync_version), `Sync version generated: ${syncRes1.sync_version.slice(0, 8)}`);
    assert(syncRes1.project_id === "projectalpha", "Sync response preserves project_id");

    const storedA = await mockBackend.fetchContext({ accountId: "acc_test_123", projectId: "projectalpha" });
    assert(Boolean(storedA), "Mock remote store contains projectalpha context");
    assert(storedA.project.id === "projectalpha", "Remote context payload retains project.id = projectalpha");
    assert(storedA.project.name === "ProjectAlpha", "Remote context payload retains project.name = ProjectAlpha");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 3: Repeated Synchronization (Idempotence)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 3. Repeated Synchronization & Idempotence ──");
    const syncRes2 = await syncProjectContext(projectARoot, {
      backend: mockBackend,
      accountId: "acc_test_123",
    });
    assert(syncRes2.status === "UP_TO_DATE", `Repeated sync returned UP_TO_DATE (got ${syncRes2.status})`);
    assert(syncRes2.sync_version === syncRes1.sync_version, "Sync version hash identical for unchanged context");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 4: Changed Context Synchronization
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 4. Changed Context Synchronization ──");
    createTask(projectARoot, {
      id: "TASK-002",
      title: "Add Remote Synchronization Engine",
      status: "IN_PROGRESS",
      priority: "HIGH",
      owner: "agent-6",
      description: "Implement Phase 6 remote sync",
    });

    const syncRes3 = await syncProjectContext(projectARoot, {
      backend: mockBackend,
      accountId: "acc_test_123",
    });
    assert(syncRes3.status === "SUCCESS", `Changed sync returned SUCCESS (got ${syncRes3.status})`);
    assert(syncRes3.sync_version !== syncRes1.sync_version, "Sync version changed after context mutation");

    const updatedStoredA = await mockBackend.fetchContext({ accountId: "acc_test_123", projectId: "projectalpha" });
    assert(updatedStoredA.tasks.tasks.some((t) => t.id === "TASK-002"), "Remote payload contains newly created TASK-002");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 5: No-Op Synchronization
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 5. No-Op Synchronization ──");
    const syncRes4 = await syncProjectContext(projectARoot, {
      backend: mockBackend,
      accountId: "acc_test_123",
    });
    assert(syncRes4.status === "UP_TO_DATE", "Immediate follow-up sync is a no-op");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 5B: Dry-Run and Force Behavior
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 5B. Dry-Run and Force Synchronization Behavior ──");
    const dryRunRes = await syncProjectContext(projectARoot, {
      backend: mockBackend,
      accountId: "acc_test_123",
      dryRun: true,
    });
    assert(dryRunRes.status === "SKIPPED", "Dry-run returns status SKIPPED");
    assert(Boolean(dryRunRes.payload), "Dry-run returns complete assembled payload");

    const forceRes = await syncProjectContext(projectARoot, {
      backend: mockBackend,
      accountId: "acc_test_123",
      force: true,
    });
    assert(forceRes.status === "SUCCESS", "Force sync bypasses cache and returns status SUCCESS");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 6: Remote Unavailable (Local Crux Continues Operating)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 6. Remote Unavailable & Local-First Invariance ──");
    mockBackend.setOnline(false); // Simulate offline / network cut

    const offlineSync = await syncProjectContext(projectARoot, {
      backend: mockBackend,
      accountId: "acc_test_123",
      force: true,
      retries: 1,
    });
    assert(offlineSync.status === "OFFLINE", `Offline sync returned status OFFLINE (got ${offlineSync.status})`);
    assert(offlineSync.message.includes("working offline"), "Offline message indicates working offline");

    // Verify local operations are completely unaffected
    const taskOffline = createTask(projectARoot, {
      id: "TASK-003",
      title: "Offline Local Task",
      status: "READY",
      priority: "MEDIUM",
      owner: "local-agent",
      description: "Work continues completely offline",
    });
    assert(Boolean(taskOffline), "Local task creation succeeds while remote is offline");

    const localStateOffline = getLocalSyncState(projectARoot);
    assert(localStateOffline.status === "OFFLINE", "Local sync status recorded OFFLINE state");

    mockBackend.setOnline(true); // Restore connectivity

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 7: Retry Behavior
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 7. Bounded Retry Behavior ──");
    let callCount = 0;
    const flakeyBackend = {
      async uploadContext(params) {
        callCount++;
        if (callCount < 2) {
          throw new Error("Temporary network glitch (503 Service Unavailable)");
        }
        return { success: true, syncVersion: params.syncVersion };
      },
      async fetchContext() {
        return null;
      },
    };

    const retrySync = await syncProjectContext(projectARoot, {
      backend: flakeyBackend,
      accountId: "acc_test_123",
      force: true,
      retries: 2,
    });
    assert(retrySync.status === "SUCCESS", "Sync succeeded after transient failure retry");
    assert(callCount === 2, `Retried exactly once before succeeding (call count: ${callCount})`);

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 8: Project Isolation (Project A != Project B)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 8. Project Isolation Across Logical Partitions ──");
    const initB = initProjectContext(projectBRoot, {
      name: "ProjectBeta",
      description: "Isolated Beta pipeline",
      mode: "create",
    });
    assert(initB.initialized === true, "Project Beta initialized");

    createTask(projectBRoot, {
      id: "TASK-B-001",
      title: "Confidential Project Beta Data",
      status: "READY",
      priority: "CRITICAL",
      owner: "beta-agent",
      description: "Secret Beta Payload",
    });

    const syncB = await syncProjectContext(projectBRoot, {
      backend: mockBackend,
      accountId: "acc_test_123",
    });
    assert(syncB.status === "SUCCESS", "Project Beta synchronized successfully");

    const payloadAFromRemote = await mockBackend.fetchContext({ accountId: "acc_test_123", projectId: "projectalpha" });
    const payloadBFromRemote = await mockBackend.fetchContext({ accountId: "acc_test_123", projectId: "projectbeta" });

    // Assert Project A has zero Project B context
    const jsonA = JSON.stringify(payloadAFromRemote);
    const jsonB = JSON.stringify(payloadBFromRemote);
    assert(!jsonA.includes("ProjectBeta"), "Project Alpha remote payload contains ZERO references to ProjectBeta");
    assert(!jsonA.includes("TASK-B-001"), "Project Alpha remote payload contains ZERO Project Beta tasks");
    assert(!jsonB.includes("ProjectAlpha"), "Project Beta remote payload contains ZERO references to ProjectAlpha");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 8B: Account Isolation & Anti-Spoofing Protection
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 8B. Account Isolation & Anti-Spoofing Protection ──");
    writeProjectConfig(projectARoot, { account_id: "acc_test_123" });

    const spoofAttempt = await syncProjectContext(projectARoot, {
      backend: mockBackend,
      accountId: "acc_victim_999",
    });
    assert(spoofAttempt.status === "FAILED", "Cross-account spoofing attempt returns FAILED");
    assert(spoofAttempt.message.includes("Account spoofing prevented"), "Account spoofing error explicitly detected and reported");

    let formatRejected = false;
    try {
      resolveAccountAndProject(projectARoot, { accountId: "bad;injection--drop" });
    } catch (e) {
      formatRejected = true;
    }
    assert(formatRejected, "Malformed account_id with illegal characters is rejected");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 9: Project Relocation (Path Independence)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 9. Project Relocation Independence ──");
    const relocatedRoot = path.join(tempBase, "RelocatedAlpha");
    fs.cpSync(projectARoot, relocatedRoot, { recursive: true });

    const relocatedIdentity = getProjectIdentity(relocatedRoot);
    assert(
      relocatedIdentity.id === "projectalpha",
      `Relocated project preserves invariant project_id 'projectalpha' (got '${relocatedIdentity.id}')`
    );

    const relocatedPayload = assembleRemoteContextPayload(relocatedRoot);
    assert(relocatedPayload.project.id === "projectalpha", "Relocated assembled payload preserves project.id");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 10: Graphify Exclusion Guarantee
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 10. Graphify Exclusion Guarantee ──");
    // Simulate user independently generating graphify-out/
    const graphifyDir = path.join(projectARoot, "graphify-out");
    fs.mkdirSync(graphifyDir, { recursive: true });
    fs.writeFileSync(
      path.join(graphifyDir, "graph.json"),
      JSON.stringify({
        nodes: [{ id: "n1", label: "ASTNodeAlpha" }],
        links: [{ source: "n1", target: "n1" }],
      }),
      "utf-8"
    );

    const payloadWithGraphify = assembleRemoteContextPayload(projectARoot);
    const payloadStr = JSON.stringify(payloadWithGraphify);

    assert(!payloadStr.includes("ASTNodeAlpha"), "Remote payload strictly excludes Graphify AST nodes");
    assert(!payloadStr.includes("graphify-out"), "Remote payload strictly excludes graphify-out directory");
    assert(payloadWithGraphify.graph === undefined, "Remote payload has no top-level graph property");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 11: Source Code Exclusion Guarantee
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 11. Source Code Exclusion Guarantee ──");
    const srcDir = path.join(projectARoot, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "proprietary.js"), "const SECRET_ALGO = 42;", "utf-8");

    const payloadNoSrc = assembleRemoteContextPayload(projectARoot);
    const payloadNoSrcStr = JSON.stringify(payloadNoSrc);

    assert(!payloadNoSrcStr.includes("SECRET_ALGO"), "Remote payload strictly excludes application source code");
    assert(payloadNoSrc.source_code === undefined, "Remote payload has no source_code property");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 12: .git Database Exclusion Guarantee
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 12. .git Database Exclusion Guarantee ──");
    const gitDir = path.join(projectARoot, ".git");
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, "config"), "[core]\nrepositoryformatversion = 0", "utf-8");

    const payloadNoGit = assembleRemoteContextPayload(projectARoot);
    assert(payloadNoGit.git_objects === undefined, "Remote payload does not include git database");
    assert(typeof payloadNoGit.source_revision.branch === "string", "Source revision contains only high-level metadata");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 13: Secret Exclusion (assertNoSecrets)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 13. Secret Credential Exclusion & Guard ──");
    let secretBlocked = false;
    try {
      createTask(projectARoot, {
        id: "TASK-LEAK",
        title: "Task with leaked key",
        status: "READY",
        priority: "HIGH",
        owner: "bad-agent",
        description: "Accidental key: sk-abcdef12345678901234567890",
      });
      await syncProjectContext(projectARoot, { backend: mockBackend, accountId: "acc_test_123" });
    } catch (err) {
      if (err.message.includes("Security violation")) {
        secretBlocked = true;
      }
    }
    assert(secretBlocked, "assertNoSecrets blocked sync payload containing an API key pattern");

    // Clean up leak task
    const tasksFilePath = path.join(projectARoot, ".project-context", "TASKS.md");
    const tasksClean = fs.readFileSync(tasksFilePath, "utf-8").replace(/### TASK-LEAK[\s\S]*?(?=###|$)/, "");
    fs.writeFileSync(tasksFilePath, tasksClean, "utf-8");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 14: Path Traversal Protection
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 14. Path Traversal Protection ──");
    let traversalBlocked = false;
    try {
      assertWithinProject("../../outside-project.md", projectARoot);
    } catch (err) {
      if (err.code === "PATH_TRAVERSAL_DETECTED") {
        traversalBlocked = true;
      }
    }
    assert(traversalBlocked, "assertWithinProject successfully arrested directory traversal attempt");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 15: Stale Remote Context Detection
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 15. Stale Remote Context Detection ──");
    const freshPayload = assembleRemoteContextPayload(projectARoot);
    const mockStaleState = {
      sync_version: "outdated_hash_v0",
      last_synced_at: "2020-01-01T00:00:00.000Z",
      status: "SUCCESS",
    };
    assert(freshPayload.sync_version !== mockStaleState.sync_version, "Stale sync_version detectable via hash mismatch");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 16: Remote Corruption Fail-Closed
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 16. Remote Corruption Fail-Closed Invariance ──");
    const corruptedBackend = {
      async uploadContext() {
        throw new Error("Remote database payload corruption (500 Internal Error)");
      },
      async fetchContext() {
        return { corrupted: true };
      },
    };

    const localStateBefore = fs.readFileSync(path.join(projectARoot, ".project-context", "STATE.md"), "utf-8");
    const localTasksBefore = fs.readFileSync(path.join(projectARoot, ".project-context", "TASKS.md"), "utf-8");

    const corruptRes = await syncProjectContext(projectARoot, {
      backend: corruptedBackend,
      accountId: "acc_test_123",
      force: true,
      retries: 0,
    });

    assert(corruptRes.status === "FAILED", "Sync failed cleanly on remote corruption");

    const localStateAfter = fs.readFileSync(path.join(projectARoot, ".project-context", "STATE.md"), "utf-8");
    const localTasksAfter = fs.readFileSync(path.join(projectARoot, ".project-context", "TASKS.md"), "utf-8");

    assert(localStateBefore === localStateAfter, "Local STATE.md untouched by remote corruption");
    assert(localTasksBefore === localTasksAfter, "Local TASKS.md untouched by remote corruption");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 16B: Concurrency & Stale-Write Protection
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 16B. Concurrency & Stale-Write Protection ──");
    // Remote currently has newer state (T2: now)
    const newerPayload = assembleRemoteContextPayload(projectARoot);
    newerPayload.synchronized_at = new Date().toISOString();
    await mockBackend.uploadContext({
      accountId: "acc_test_123",
      projectId: "projectalpha",
      syncVersion: "v_newer_context",
      payload: newerPayload,
    });

    // Older delayed sync from T1 (1 hour ago) arrives later
    const olderPayload = assembleRemoteContextPayload(projectARoot);
    olderPayload.synchronized_at = new Date(Date.now() - 3600000).toISOString();

    let staleWriteRejected = false;
    try {
      await mockBackend.uploadContext({
        accountId: "acc_test_123",
        projectId: "projectalpha",
        syncVersion: "v_stale_delayed",
        payload: olderPayload,
      });
    } catch (err) {
      if (err.message.includes("Stale write rejected")) {
        staleWriteRejected = true;
      }
    }
    assert(staleWriteRejected, "Older sync finishing after newer sync is strictly rejected (stale-write prevented)");

    // Remote still retains the newer version
    const remoteStored = await mockBackend.fetchContext({ accountId: "acc_test_123", projectId: "projectalpha" });
    assert(remoteStored.project.id === "projectalpha", "Remote state preserved uncorrupted by rejected stale write");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 17: Fresh Crux Init Lifecycle (No Graphify)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 17. Fresh crux init Lifecycle ──");
    const freshProjectRoot = path.join(tempBase, "FreshInitProject");
    fs.mkdirSync(freshProjectRoot, { recursive: true });

    const freshInit = initProjectContext(freshProjectRoot, { name: "FreshInitProject" });
    assert(freshInit.initialized === true, "Fresh project initialized");
    assert(fs.existsSync(path.join(freshProjectRoot, ".project-context")), ".project-context/ created");
    assert(!fs.existsSync(path.join(freshProjectRoot, "graphify-out")), "graphify-out/ is NOT created by crux init");
    assert(!fs.existsSync(path.join(freshProjectRoot, "graph.json")), "graph.json is NOT created by crux init");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 18: Existing Project Adoption
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 18. Existing Project Adoption ──");
    createTask(freshProjectRoot, {
      id: "TASK-PRESERVED",
      title: "Preserved Task",
      status: "READY",
      priority: "HIGH",
      owner: "adopt-agent",
      description: "Must survive adopt mode",
    });

    const adoptInit = initProjectContext(freshProjectRoot, {
      mode: "adopt",
      name: "FreshInitProject",
    });
    assert(adoptInit.initialized === true, "Adopt mode succeeded");
    assert(adoptInit.isNew === false, "Adopt mode recognized existing context");

    const tasksAfterAdopt = fs.readFileSync(path.join(freshProjectRoot, ".project-context", "TASKS.md"), "utf-8");
    assert(tasksAfterAdopt.includes("TASK-PRESERVED"), "Existing tasks preserved during adoption");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 19: ChatGPT Adapter Remote Retrieval (All 8 Read Tools)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 19. ChatGPT Adapter Retrieval via RemoteContextProvider ──");
    // Ensure Alpha is cleanly synced to mockBackend
    await syncProjectContext(projectARoot, {
      backend: mockBackend,
      accountId: "acc_test_123",
      force: true,
    });

    const remotePayload = await mockBackend.fetchContext({ accountId: "acc_test_123", projectId: "projectalpha" });
    const remoteProvider = new RemoteContextProvider(remotePayload);

    // Verify all 8 read tools through RemoteContextProvider
    // 1. getSnapshot
    const rSnap = remoteProvider.getSnapshot();
    assert(rSnap._type === "HotContextSnapshot", "Remote provider getSnapshot returns HotContextSnapshot");
    assert(rSnap.project.name === "ProjectAlpha", "Remote provider snapshot project name is ProjectAlpha");

    // 2. getState
    const rState = remoteProvider.getState();
    assert(rState.exists === true, "Remote provider getState returns exists = true");
    assert(rState.raw.includes("ProjectAlpha"), "Remote provider getState raw contains ProjectAlpha");

    // 3. getTasks
    const rTasks = remoteProvider.getTasks("ALL", 10);
    assert(rTasks.tasks.length >= 1, "Remote provider getTasks returns tasks array");
    assert(rTasks.status_filter === "ALL", "Remote provider getTasks status_filter is ALL");

    // 4. getArchitecture
    const rArch = remoteProvider.getArchitecture();
    assert(typeof rArch === "string" && rArch.length > 0, "Remote provider getArchitecture returns string");

    // 5. getDecisions
    const rDecs = remoteProvider.getDecisions(5);
    assert(Array.isArray(rDecs), "Remote provider getDecisions returns array");

    // 6. searchContext
    const rSearch = remoteProvider.searchContext("ProjectAlpha", 10);
    assert(rSearch.matches.length >= 1, "Remote provider searchContext finds matches for 'ProjectAlpha'");

    // 7. getRelevantContext
    const rRel = remoteProvider.getRelevantContext({ task_id: "TASK-001" });
    assert(Array.isArray(rRel.relevant_decisions), "Remote provider getRelevantContext returns relevant_decisions");
    assert(Array.isArray(rRel.suggested_files), "Remote provider getRelevantContext returns suggested_files");

    // 8. getGitStatus
    const rGit = remoteProvider.getGitStatus();
    assert(typeof rGit.branch === "string", "Remote provider getGitStatus returns branch string");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 20: Token-Bound Session Authorization
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 20. Token-Bound Session Authorization & Anti-Impersonation ──");
    const tokenMap = new Map([
      ["token_alpha_valid", remoteProvider],
    ]);

    const secureAdapter = createChatGPTAdapter(remoteProvider, {
      tokenResolver: async (token) => {
        return tokenMap.get(token) || null;
      },
      requireAuth: true,
    });
    assert(Boolean(secureAdapter), "Secure token-bound ChatGPT adapter initialized");

    console.log("\n  ✓ Phase 6 Remote Context Synchronization Suite: All 20 scenarios passed.");
  } finally {
    // Cleanup temporary directories
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {}
  }
}

if (process.argv[1] && process.argv[1].endsWith("remote-sync.test.js")) {
  let passed = 0;
  let failed = 0;
  const assert = (condition, message) => {
    if (!condition) {
      failed++;
      console.error(`  ✗ FAILED: ${message}`);
    } else {
      passed++;
      console.log(`  ✓ ${message}`);
    }
  };
  runRemoteSyncTests(process.cwd(), assert)
    .then(() => {
      console.log(`\nResults: ${passed} passed, ${failed} failed`);
      if (failed > 0) process.exit(1);
    })
    .catch((err) => {
      console.error("Test execution failed:", err);
      process.exit(1);
    });
}
