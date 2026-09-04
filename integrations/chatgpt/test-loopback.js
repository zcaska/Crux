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
      const toolDef = tools.find((t) => t.name === name);
      assert(Boolean(toolDef), `Curated tool '${name}' is registered`);
      assert(toolDef?.annotations?.readOnlyHint === true, `Tool '${name}' has readOnlyHint: true`);
      assert(toolDef?.annotations?.destructiveHint === false, `Tool '${name}' has destructiveHint: false`);
      assert(
        Boolean(toolDef?.outputSchema && typeof toolDef.outputSchema === "object"),
        `Tool '${name}' exposes hardened outputSchema on tools/list`
      );
    }

    // Ensure zero dangerous tools
    const forbiddenPatterns = ["write", "update", "create", "delete", "exec", "shell", "start_session", "recover", "modify", "edit"];
    const foundForbidden = tools.filter((t) => forbiddenPatterns.some((p) => t.name.includes(p)));
    assert(foundForbidden.length === 0, "Surface guard: Zero write, lifecycle, or execution tools registered");

    // Helper to invoke a tool and verify text content and structured content
    async function invokeTool(name, args = {}) {
      const res = await client.callTool({ name, arguments: args });
      assert(!res.isError, `Tool '${name}' invocation succeeded without isError flag`);
      assert(Array.isArray(res.content) && res.content.length === 1, `Tool '${name}' returned 1 content block`);
      assert(
        Boolean(res.structuredContent !== undefined),
        `Tool '${name}' returned structuredContent alongside text content`
      );
      const text = res.content[0]?.text || "";
      let parsed;
      if (res.structuredContent && typeof res.structuredContent === "object") {
        if (res.structuredContent.result !== undefined) {
          parsed = res.structuredContent.result;
        } else if (res.structuredContent.content !== undefined) {
          parsed = res.structuredContent.content;
        } else {
          parsed = res.structuredContent;
        }
      } else {
        parsed = JSON.parse(text);
      }
      return { raw: text, parsed, structuredContent: res.structuredContent };
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

  // 14. Phase 4E-B: No-Auth Transport & Security Boundary Verification
  console.log("\n── 14. Phase 4E-B: No-Auth Transport & Security Boundary Verification ──");

  // Start a fresh adapter instance on an ephemeral loopback port with No Auth
  const noAuthAdapter = await startChatGPTAdapter({
    rootDir: testRoot,
    port: 0
  });

  assert(Boolean(noAuthAdapter.server), "No-Auth server started successfully");
  assert(noAuthAdapter.port > 0, `No-Auth server bound to port ${noAuthAdapter.port}`);

  // Test 1: Raw POST tools/list without ANY Authorization header succeeds (HTTP 200)
  const noAuthPostRes = await fetch(noAuthAdapter.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "no-auth-test-1",
      method: "tools/list",
      params: {}
    })
  });
  assert(noAuthPostRes.status === 200, `Raw POST without Authorization header returned 200 OK (got ${noAuthPostRes.status})`);
  assert(!noAuthPostRes.headers.get("www-authenticate"), "No WWW-Authenticate header returned (no auth challenge)");

  const rawText = await noAuthPostRes.text();
  let discoveredToolsCount = 0;
  if (rawText.startsWith("event:") || rawText.includes("data:")) {
    const dataLine = rawText.split("\n").find((l) => l.startsWith("data:"));
    if (dataLine) {
      const parsed = JSON.parse(dataLine.replace(/^data:\s*/, ""));
      discoveredToolsCount = parsed.result?.tools?.length || 0;
    }
  } else {
    const parsed = JSON.parse(rawText);
    discoveredToolsCount = parsed.result?.tools?.length || 0;
  }
  assert(discoveredToolsCount === 8, `Raw POST tools/list discovered exactly 8 tools (got ${discoveredToolsCount})`);

  // Test 2: Connect full MCP client over Streamable HTTP WITHOUT Authorization
  const noAuthClient = new Client(
    { name: "chatgpt-phase4e-noauth-client", version: "1.0.0" },
    { capabilities: {} }
  );
  const noAuthTransport = new StreamableHTTPClientTransport(new URL(noAuthAdapter.url));

  await noAuthClient.connect(noAuthTransport);
  assert(true, "Client successfully established MCP connection over Streamable HTTP without Authorization");

  // Test 3: tools/list succeeds without authentication
  const noAuthTools = await noAuthClient.listTools();
  assert(noAuthTools.tools.length === 8, `MCP tools/list without auth returned exactly 8 tools (got ${noAuthTools.tools.length})`);

  // Test 4: All 8 tools have readOnly annotations and valid outputSchema
  for (const t of noAuthTools.tools) {
    assert(t.annotations?.readOnlyHint === true, `Tool '${t.name}' verifies readOnlyHint: true`);
    assert(t.annotations?.destructiveHint === false, `Tool '${t.name}' verifies destructiveHint: false`);
    assert(
      Boolean(t.outputSchema && typeof t.outputSchema === "object" && t.outputSchema.type),
      `Tool '${t.name}' advertises valid outputSchema with type '${t.outputSchema?.type}'`
    );
  }

  // Test 5: Representative read calls succeed: get_context_snapshot, get_project_state, get_tasks, get_architecture
  const snapCall = await noAuthClient.callTool({
    name: "get_context_snapshot",
    arguments: { limit: 2 }
  });
  assert(!snapCall.isError, "get_context_snapshot succeeds over No-Auth transport");
  const snapParsed = JSON.parse(snapCall.content[0].text);
  assert(snapParsed._type === "HotContextSnapshot", "Snapshot type is HotContextSnapshot");
  assertNoSecrets(snapParsed, "noauth.get_context_snapshot");

  const stateCall = await noAuthClient.callTool({
    name: "get_project_state",
    arguments: {}
  });
  assert(!stateCall.isError, "get_project_state succeeds over No-Auth transport");
  const stateParsed = JSON.parse(stateCall.content[0].text);
  assert(stateParsed.meta?.project_name === (isTemp ? "TestProject" : "CareerOS"), "get_project_state matches target project");
  assertNoSecrets(stateParsed, "noauth.get_project_state");

  const tasksCall = await noAuthClient.callTool({
    name: "get_tasks",
    arguments: { limit: 5 }
  });
  assert(!tasksCall.isError, "get_tasks succeeds over No-Auth transport");
  const tasksParsed = JSON.parse(tasksCall.content[0].text);
  assert(tasksParsed.count <= 5, "get_tasks respects limit bound <= 5");
  assertNoSecrets(tasksParsed, "noauth.get_tasks");

  const archCall = await noAuthClient.callTool({
    name: "get_architecture",
    arguments: {}
  });
  assert(!archCall.isError, "get_architecture succeeds over No-Auth transport");
  assert(archCall.content[0].text.length > 0, "get_architecture text is non-empty");
  assertNoSecrets(archCall.content[0].text, "noauth.get_architecture");

  // Test 6: Input Validation & Boundary Enforcement
  // 6a: Oversized query in search_project_context (> 200 chars)
  const oversizedQuery = "A".repeat(250);
  const oversizedSearch = await noAuthClient.callTool({
    name: "search_project_context",
    arguments: { query: oversizedQuery }
  });
  assert(oversizedSearch.isError === true, "Oversized search query (>200 chars) rejected safely with isError flag");

  // 6b: Search with bounded limit
  const boundedSearch = await noAuthClient.callTool({
    name: "search_project_context",
    arguments: { query: isTemp ? "TestProject" : "CareerOS", limit: 3 }
  });
  assert(!boundedSearch.isError, "Bounded search succeeded");
  const boundedSearchParsed = JSON.parse(boundedSearch.content[0].text);
  assert(boundedSearchParsed.match_count <= 3, `Search results safely bounded by limit <= 3 (got ${boundedSearchParsed.match_count})`);

  // Test 7: Security Negative Invariance
  // Remote caller cannot specify root/path override parameters
  const paramsSnap = await noAuthClient.callTool({
    name: "get_context_snapshot",
    arguments: { projectRoot: "C:/Windows/System32", root: "C:/Windows", path: "C:/" }
  });
  assert(!paramsSnap.isError, "Arbitrary extra path parameters safely ignored by get_context_snapshot");
  const paramsSnapParsed = JSON.parse(paramsSnap.content[0].text);
  assert(paramsSnapParsed.project?.name === (isTemp ? "TestProject" : "CareerOS"), "Fixed project root preserved, cannot be overridden");

  // Test 8: Safe Error Sanitization (no leaked filesystem absolute paths)
  const emptySearchCall = await noAuthClient.callTool({
    name: "search_project_context",
    arguments: { query: "   " }
  });
  assert(emptySearchCall.isError === true, "Empty search query returns isError: true");
  assert(!emptySearchCall.content[0].text.includes(":\\"), "Error message contains zero absolute filesystem paths");
  assert(!emptySearchCall.content[0].text.includes("C:/Users"), "Error message contains zero local user directory paths");

  await noAuthClient.close();
  await noAuthAdapter.server.close();

  console.log("\n================================================================");
  console.log(`Phase 4E-B Comprehensive Test Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runComprehensiveLoopbackTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
