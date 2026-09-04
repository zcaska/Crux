/**
 * Project Context OS — ChatGPT MCP Adapter Comprehensive Loopback Test Suite (Phase 3)
 *
 * Verifies end-to-end Streamable HTTP connectivity and tool contracts for all 8 curated read tools:
 *   1. Server Lifecycle & Loopback Binding
 *   2. Streamable HTTP Client Connection
 *   3. Exact Tool Discovery & Surface Guard (exactly 8 read tools, zero write/lifecycle tools)
 *   4. Tool 1: get_context_snapshot (Hot Context Synthesizer & Identity)
 *   5. Tool 2: get_project_state (Authoritative High-Level Status)
 *   6. Tool 3: get_tasks (Task Board & Status Filter)
 *   7. Tool 4: get_architecture (Architecture Invariants & System Boundaries)
 *   8. Tool 5: get_decisions (ADRs with Bounded Limit)
 *   9. Tool 6: search_project_context (Keyword Search & Empty Query Rejection)
 *   10. Tool 7: get_relevant_context (Deterministic Warm Context Ranking)
 *   11. Tool 8: get_git_status (Working Tree Ground Truth)
 *   12. Anti-Credential Scanning for every tool payload
 *   13. Read-Only Invariance: Zero file modifications on disk across all 8 tools
 *   14. Failure Path & Security Jailing
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { assertNoSecrets, initProjectContext } from "@project-context/core";
import {
  startChatGPTAdapter,
  createChatGPTAdapter,
  getTargetProjectRoot
} from "./index.js";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
    failed++;
  }
}

async function runComprehensiveLoopbackTests() {
  console.log("================================================================");
  console.log("ChatGPT MCP Adapter — Phase 3 Comprehensive Loopback Suite");
  console.log("================================================================\n");

  // Determine a valid test repository root (CareerOS or scaffold clean temp)
  const candidateRoot = "C:/Users/AGP/Documents/Projects/Job-Hunt";
  let testRoot;
  let isTemp = false;

  if (fs.existsSync(path.join(candidateRoot, ".project-context"))) {
    testRoot = candidateRoot;
  } else {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-phase3-test-"));
    testRoot = path.join(tempDir, "TestProject");
    initProjectContext(testRoot, { name: "TestProject", description: "Phase 3 loopback fixture" });
    isTemp = true;
  }

  console.log(`Target Test Project Root: ${testRoot}`);

  // Capture file timestamps before testing to verify read-only guarantee
  const statePath = path.join(testRoot, ".project-context", "STATE.md");
  const tasksPath = path.join(testRoot, ".project-context", "TASKS.md");
  const decisionsPath = path.join(testRoot, ".project-context", "DECISIONS.md");

  const initialMtimes = {
    state: fs.existsSync(statePath) ? fs.statSync(statePath).mtimeMs : null,
    tasks: fs.existsSync(tasksPath) ? fs.statSync(tasksPath).mtimeMs : null,
    decisions: fs.existsSync(decisionsPath) ? fs.statSync(decisionsPath).mtimeMs : null
  };

  // 1. Start Server on dynamic loopback port
  console.log("\n── 1. Server Lifecycle & Loopback Binding ──");
  const { server, port, url } = await startChatGPTAdapter({
    rootDir: testRoot,
    port: 0 // dynamic loopback port
  });

  assert(Boolean(server), "mcp-use MCPServer instance created successfully");
  assert(port > 0, `Server bound to dynamic loopback port ${port}`);
  assert(url.startsWith(`http://localhost:${port}/mcp`), `Streamable HTTP URL mounted: ${url}`);

  const client = new Client(
    { name: "chatgpt-phase3-client", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    // 2. Connect Client via Streamable HTTP Transport
    console.log("\n── 2. Streamable HTTP Client Connection ──");
    const transport = new StreamableHTTPClientTransport(new URL(url));
    await client.connect(transport);
    assert(true, "Client successfully connected over Streamable HTTP transport");

    // 3. Exact Tool Discovery & Surface Guard
    console.log("\n── 3. Exact Tool Discovery & Surface Guard ──");
    const toolList = await client.listTools();
    const tools = toolList.tools || [];
    assert(tools.length === 8, `Discovered exactly 8 tools (got: ${tools.length})`);

    const expectedToolNames = [
      "get_context_snapshot",
      "get_project_state",
      "get_tasks",
      "get_architecture",
      "get_decisions",
      "search_project_context",
      "get_relevant_context",
      "get_git_status"
    ];

    for (const name of expectedToolNames) {
      assert(tools.some((t) => t.name === name), `Curated tool '${name}' is registered`);
    }

    // Ensure zero dangerous tools
    const forbiddenPatterns = ["write", "update", "create", "delete", "exec", "shell", "start_session", "recover"];
    const foundForbidden = tools.filter((t) => forbiddenPatterns.some((p) => t.name.includes(p)));
    assert(foundForbidden.length === 0, "Surface guard: Zero write, lifecycle, or execution tools registered");

    // Helper to invoke a tool and verify text content
    async function invokeTool(name, args = {}) {
      const res = await client.callTool({ name, arguments: args });
      assert(!res.isError, `Tool '${name}' invocation succeeded without isError flag`);
      assert(Array.isArray(res.content) && res.content.length === 1, `Tool '${name}' returned 1 content block`);
      const text = res.content[0]?.text || "";
      return { raw: text, parsed: JSON.parse(text) };
    }

    // 4. Tool 1: get_context_snapshot
    console.log("\n── 4. Tool 1: get_context_snapshot ──");
    const snap = await invokeTool("get_context_snapshot", { limit: 3 });
    assert(snap.parsed._type === "HotContextSnapshot", "Snapshot type is 'HotContextSnapshot'");
    assert(Boolean(snap.parsed.project?.name), `Project name present: '${snap.parsed.project?.name}'`);
    assert(Array.isArray(snap.parsed.active_tasks), "Provides active_tasks array");
    assert(Boolean(snap.parsed.cold_context_pointers), "Provides cold_context_pointers");
    assertNoSecrets(snap.parsed, "tool.get_context_snapshot");
    assert(true, "Anti-credential check PASSED for get_context_snapshot");

    // 5. Tool 2: get_project_state
    console.log("\n── 5. Tool 2: get_project_state ──");
    const state = await invokeTool("get_project_state");
    assert(typeof state.parsed.exists === "boolean", "State exists flag is boolean");
    assert(Boolean(state.parsed.meta), "State meta object returned");
    assert(typeof state.parsed.raw === "string", "State raw markdown string returned");
    assert(state.parsed.meta?.project_name === (isTemp ? "TestProject" : "CareerOS"), "State project_name matches target");
    assertNoSecrets(state.parsed, "tool.get_project_state");
    assert(true, "Anti-credential check PASSED for get_project_state");

    // 6. Tool 3: get_tasks
    console.log("\n── 6. Tool 3: get_tasks ──");
    const allTasks = await invokeTool("get_tasks");
    assert(typeof allTasks.parsed.count === "number", `Total tasks count: ${allTasks.parsed.count}`);
    assert(Array.isArray(allTasks.parsed.tasks), "Tasks array returned");
    assert(allTasks.parsed.status_filter === "ALL", "Default status_filter is 'ALL'");
    if (allTasks.parsed.tasks.length > 0) {
      assert(Boolean(allTasks.parsed.tasks[0].id), `Sample task ID: ${allTasks.parsed.tasks[0].id}`);
    }

    // Test with status filter
    const inProgTasks = await invokeTool("get_tasks", { status: "IN_PROGRESS" });
    assert(inProgTasks.parsed.status_filter === "IN_PROGRESS", "Filter acknowledges 'IN_PROGRESS'");
    for (const t of inProgTasks.parsed.tasks) {
      assert(t.status === "IN_PROGRESS", `Task ${t.id} correctly filtered by status IN_PROGRESS`);
    }
    assertNoSecrets(allTasks.parsed, "tool.get_tasks");
    assert(true, "Anti-credential check PASSED for get_tasks");

    // 7. Tool 4: get_architecture
    console.log("\n── 7. Tool 4: get_architecture ──");
    const archRes = await client.callTool({ name: "get_architecture", arguments: {} });
    assert(!archRes.isError, "get_architecture returned without error");
    const archText = archRes.content[0]?.text || "";
    assert(archText.length > 0, `Architecture text returned (${archText.length} chars)`);
    assert(archText.includes("Architecture") || archText.includes("ARCHITECTURE"), "Architecture text contains expected headline");
    assertNoSecrets(archText, "tool.get_architecture");
    assert(true, "Anti-credential check PASSED for get_architecture");

    // 8. Tool 5: get_decisions
    console.log("\n── 8. Tool 5: get_decisions ──");
    const decisions = await invokeTool("get_decisions", { limit: 5 });
    assert(Array.isArray(decisions.parsed), "Decisions returned as array");
    assert(decisions.parsed.length <= 5, `Decisions respects limit <= 5 (got ${decisions.parsed.length})`);
    if (decisions.parsed.length > 0) {
      assert(Boolean(decisions.parsed[0].id), `ADR record ID: ${decisions.parsed[0].id}`);
      assert(Boolean(decisions.parsed[0].decision), "ADR contains decision text");
    }
    assertNoSecrets(decisions.parsed, "tool.get_decisions");
    assert(true, "Anti-credential check PASSED for get_decisions");

    // 9. Tool 6: search_project_context
    console.log("\n── 9. Tool 6: search_project_context ──");
    const searchTarget = isTemp ? "TestProject" : "CareerOS";
    const searchRes = await invokeTool("search_project_context", { query: searchTarget });
    assert(searchRes.parsed.query === searchTarget, `Search query matches: '${searchRes.parsed.query}'`);
    assert(typeof searchRes.parsed.match_count === "number", `Match count: ${searchRes.parsed.match_count}`);
    assert(Array.isArray(searchRes.parsed.matches), "Matches array returned");
    if (searchRes.parsed.matches.length > 0) {
      const match = searchRes.parsed.matches[0];
      assert(Boolean(match.file), `Matched file: ${match.file}`);
      assert(typeof match.lineNumber === "number", `Line number: ${match.lineNumber}`);
      assert(Boolean(match.lineContent), `Line content: ${match.lineContent.slice(0, 50)}...`);
    }

    // Empty search query rejection test
    const emptySearchRes = await client.callTool({ name: "search_project_context", arguments: { query: "   " } });
    assert(emptySearchRes.isError === true, "Empty search query rejected safely with isError flag");
    assertNoSecrets(searchRes.parsed, "tool.search_project_context");
    assert(true, "Anti-credential check PASSED for search_project_context");

    // 10. Tool 7: get_relevant_context
    console.log("\n── 10. Tool 7: get_relevant_context ──");
    const relevant = await invokeTool("get_relevant_context", {
      task_id: "TASK-001",
      query: "MCP protocol architecture",
      limit: 3
    });
    assert(Boolean(relevant.parsed.query_context), "Returns query_context object");
    assert(Array.isArray(relevant.parsed.relevant_decisions), "Returns relevant_decisions array");
    assert(Array.isArray(relevant.parsed.relevant_changes), "Returns relevant_changes array");
    assert(Array.isArray(relevant.parsed.suggested_files), "Returns suggested_files array");
    assert(relevant.parsed.relevant_decisions.length <= 3, "Respected limit <= 3 for decisions");
    assertNoSecrets(relevant.parsed, "tool.get_relevant_context");
    assert(true, "Anti-credential check PASSED for get_relevant_context");

    // 11. Tool 8: get_git_status
    console.log("\n── 11. Tool 8: get_git_status ──");
    const git = await invokeTool("get_git_status");
    assert(Boolean(git.parsed.branch), `Git branch resolved: '${git.parsed.branch}'`);
    assert(typeof git.parsed.isClean === "boolean", `Git isClean: ${git.parsed.isClean}`);
    assert(Array.isArray(git.parsed.staged), "Git staged array returned");
    assert(Array.isArray(git.parsed.unstaged), "Git unstaged array returned");
    assert(Array.isArray(git.parsed.untracked), "Git untracked array returned");
    assertNoSecrets(git.parsed, "tool.get_git_status");
    assert(true, "Anti-credential check PASSED for get_git_status");

    // 12. Read-Only Disk Invariance Check
    console.log("\n── 12. Read-Only Invariance Check Across All 8 Tools ──");
    if (initialMtimes.state !== null && fs.existsSync(statePath)) {
      assert(
        initialMtimes.state === fs.statSync(statePath).mtimeMs,
        "STATE.md timestamp untouched after all 8 tool invocations"
      );
    }
    if (initialMtimes.tasks !== null && fs.existsSync(tasksPath)) {
      assert(
        initialMtimes.tasks === fs.statSync(tasksPath).mtimeMs,
        "TASKS.md timestamp untouched after all 8 tool invocations"
      );
    }
    if (initialMtimes.decisions !== null && fs.existsSync(decisionsPath)) {
      assert(
        initialMtimes.decisions === fs.statSync(decisionsPath).mtimeMs,
        "DECISIONS.md timestamp untouched after all 8 tool invocations"
      );
    }

  } finally {
    // Clean Shutdown
    await client.close();
    await server.close();
    console.log("\n  ✓ Client and server closed cleanly.");

    if (isTemp) {
      fs.rmSync(path.dirname(testRoot), { recursive: true, force: true });
    }
  }

  // 13. Failure Path & Security Jailing
  console.log("\n── 13. Failure Path & Security Jailing ──");
  let invalidRootBlocked = false;
  try {
    createChatGPTAdapter("C:/invalid/nonexistent/directory/project-root");
  } catch (err) {
    if (err.message.includes("does not exist")) {
      invalidRootBlocked = true;
    }
  }
  assert(invalidRootBlocked, "createChatGPTAdapter cleanly rejects nonexistent project roots");

  let cliRootBlocked = false;
  try {
    getTargetProjectRoot(["--root", "C:/invalid/nonexistent/directory/project-root"]);
  } catch (err) {
    if (err.message.includes("does not exist")) {
      cliRootBlocked = true;
    }
  }
  assert(cliRootBlocked, "getTargetProjectRoot cleanly rejects invalid --root arguments");

  // 14. Phase 4: Authentication & Security Boundary Verification
  console.log("\n── 14. Phase 4: Authentication & Security Boundary Verification ──");
  const testSecret = "pc-test-secret-a1b2c3d4e5f6g7h8";

  // Start an authenticated instance of the adapter on an ephemeral port
  const authAdapter = await startChatGPTAdapter({
    rootDir: testRoot,
    port: 0,
    secret: testSecret
  });

  assert(Boolean(authAdapter.server), "Authenticated server started successfully");
  assert(authAdapter.port > 0, `Authenticated server bound to port ${authAdapter.port}`);

  // Test A: Request with NO Authorization header returns 401
  const noAuthRes = await fetch(authAdapter.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "auth-test-1",
      method: "tools/list",
      params: {}
    })
  });
  assert(noAuthRes.status === 401, `Unauthenticated request returned 401 Unauthorized (got ${noAuthRes.status})`);
  assert(noAuthRes.headers.get("www-authenticate")?.includes("Bearer"), "401 response contains WWW-Authenticate Bearer header");

  // Test B: Request with WRONG Bearer token returns 401
  const wrongAuthRes = await fetch(authAdapter.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": "Bearer wrong-invalid-secret-key-12345"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "auth-test-2",
      method: "tools/list",
      params: {}
    })
  });
  assert(wrongAuthRes.status === 401, `Invalid secret request returned 401 Unauthorized (got ${wrongAuthRes.status})`);

  // Test C: Request with DIFFERENT LENGTH Bearer token returns 401
  const diffLenAuthRes = await fetch(authAdapter.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": "Bearer short"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "auth-test-3",
      method: "tools/list",
      params: {}
    })
  });
  assert(diffLenAuthRes.status === 401, `Different length secret returned 401 Unauthorized (got ${diffLenAuthRes.status})`);

  // Test D: Full MCP Client connecting WITH valid Authorization header succeeds
  const authClient = new Client(
    { name: "chatgpt-phase4-auth-client", version: "1.0.0" },
    { capabilities: {} }
  );
  const authTransport = new StreamableHTTPClientTransport(new URL(authAdapter.url), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${testSecret}`
      }
    }
  });

  await authClient.connect(authTransport);
  assert(true, "Authenticated MCP client connected successfully with valid Bearer token");

  const authTools = await authClient.listTools();
  assert(authTools.tools.length === 8, `Authenticated client discovered exactly 8 tools (got ${authTools.tools.length})`);

  // Test Tool Call over authenticated connection
  const snapshotRes = await authClient.callTool({
    name: "get_context_snapshot",
    arguments: { limit: 2 }
  });
  assert(!snapshotRes.isError, "Authenticated client successfully called get_context_snapshot");
  assert(snapshotRes.content[0].text.length > 0, "Snapshot result payload is non-empty");

  await authClient.close();
  await authAdapter.server.close();

  console.log("\n================================================================");
  console.log(`Phase 4 Comprehensive Test Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runComprehensiveLoopbackTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
