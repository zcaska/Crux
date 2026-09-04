/**
 * Project Context OS â€” Comprehensive Automated Test Suite
 *
 * Covers:
 *   1. Core Context (State, Tasks, Decisions, Changelog, Active-Work, Snapshot, Search)
 *   2. Git Integration (Status, Commits, Diff)
 *   3. Security & Anti-Credential Detection (API keys, tokens, private keys, passwords)
 *   4. Multi-Agent Concurrency (Separate files, collision prevention, correct aggregation)
 *   5. Immutable Handoffs (Creation, retrieval, uniqueness, immutability)
 *   6. Official MCP Server (Real STDIO Transport using Official SDK Client)
 *   7. Context Integrity Validator (All canonical files, schemas, and audits)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readState,
  updateState,
  readActiveWork,
  updateActiveWork,
  readTasks,
  createTask,
  updateTask,
  readDecisions,
  recordDecision,
  readChangelog,
  recordChange,
  readHandoffs,
  createHandoff,
  searchProjectContext,
  getContextDir,
  recompileActiveWork,
} from "../src/core.js";
import { resolveProjectRoot } from "../src/locator.js";
import { getGitStatus, getGitRecentCommits, getGitDiff } from "../src/git.js";
import { getContextSnapshot } from "../src/snapshot.js";
import { scanForSecrets, assertNoSecrets } from "../src/security.js";
import { validateContext } from "../src/validator.js";
import { getAgentBootstrap, formatBootstrapMarkdown } from "../src/bootstrap.js";
import { startSession, heartbeatSession, listSessions } from "../src/session.js";
import { checkConsistency } from "../src/consistency.js";
import { assistedSessionEnd, recoverSession } from "../src/lifecycle.js";
import { installGitHook, uninstallGitHook } from "../src/hooks.js";
import { runCrossAgentAcceptanceTest } from "./cross-agent-handoff.test.js";
import { runRealIntegrationAudit } from "./real-integration-audit.js";
import { runRealAgentAcceptance } from "./real-agent-lifecycle-test.js";
import { runGitHookSafetyTest } from "./git-hook-safety.test.js";
import { runPhase3CapabilityTests } from "./phase-3-capabilities.test.js";
import { runRealCareerOsWorkflow } from "./real-careeros-workflow.test.js";
import { runCrossProjectPortabilityTests } from "./cross-project-portability.test.js";
import { runModelInteropTests } from "./model-interop.test.js";
import { runTokenEfficiencyTests } from "./token-efficiency.test.js";
import { runDecouplingTests } from "./decoupling.test.js";
import { runAdversarialPhase5Tests } from "./adversarial-phase5.test.js";
import { runCleanRoomDistributionGate } from "./clean-room-gate.test.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const discoveredRoot = resolveProjectRoot();
const rootDir = (discoveredRoot && fs.existsSync(path.join(discoveredRoot, ".project-context")))
  ? discoveredRoot
  : (fs.existsSync("C:/Users/AGP/Documents/Projects/Job-Hunt/.project-context")
    ? "C:/Users/AGP/Documents/Projects/Job-Hunt"
    : path.resolve(__dirname, ".."));

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  âœ“ ${message}`);
    passed++;
  } else {
    console.error(`  âœ— FAILED: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("================================================================");
  console.log("Project Context OS â€” Automated Test Suite");
  console.log("================================================================\n");

  const statePath = path.join(getContextDir(rootDir), "STATE.md");
  const tasksPath = path.join(getContextDir(rootDir), "TASKS.md");
  const stateRaw = fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf-8") : null;
  const tasksRaw = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, "utf-8") : null;

  try {

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 1: Core Context Operations
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("â”€â”€ 1. Core Context Operations â”€â”€");

  // 1.1 Read State
  const state = readState(rootDir);
  assert(state.exists === true, "STATE.md exists and is readable");
  assert(state.meta.project_name === "CareerOS", "STATE.md project_name is 'CareerOS'");
  assert(Boolean(state.meta.current_phase), "STATE.md specifies current_phase");

  // 1.2 Read Active Work & Aggregation
  const activeWork = readActiveWork(rootDir);
  assert(activeWork.agents.length >= 1, "At least one active agent file found in active-work/");
  assert(activeWork.agents.some((a) => a.agent === "antigravity"), "Antigravity active work descriptor exists");
  assert(activeWork.aggregateRaw.includes("Active Work (Aggregated View)"), "ACTIVE-WORK.md aggregated view exists");

  // 1.3 Read Tasks
  const { tasks } = readTasks(rootDir);
  assert(tasks.length >= 2, "TASKS.md parses multiple project tasks");
  const task1 = tasks.find((t) => t.id === "TASK-001");
  assert(Boolean(task1), "TASK-001 is present in TASKS.md");
  assert(["IN_PROGRESS", "COMPLETED"].includes(task1?.status), `TASK-001 status is valid active/completed state (got: ${task1?.status})`);

  // 1.4 Read Decisions
  const { decisions } = readDecisions(rootDir);
  assert(decisions.length >= 3, "DECISIONS.md parses multiple ADR records");
  assert(decisions.some((d) => d.id === "ADR-001"), "ADR-001 (Establish Context OS) is present");
  assert(decisions.some((d) => d.id === "ADR-002"), "ADR-002 (Official MCP SDK) is present");

  // 1.5 Read Changelog
  const { entries } = readChangelog(rootDir, 200);
  assert(entries.length >= 1, "CHANGELOG.md parses semantic change entries");
  assert(entries.some((e) => e.task_id === "TASK-001"), "Changelog includes entry referencing TASK-001");

  // 1.6 Search Context
  const searchResults = searchProjectContext(rootDir, "vendor-neutral");
  assert(searchResults.length >= 1, "searchProjectContext finds matches for 'vendor-neutral'");
  assert(searchResults.some((r) => r.file.includes("MANIFEST.md")), "Search matches MANIFEST.md");

  // 1.7 Context Snapshot
  const snapshot = getContextSnapshot(rootDir, { limit: 5 });
  assert(snapshot._type === "HotContextSnapshot", "Snapshot returns HotContextSnapshot object");
  assert(snapshot.project.name === "CareerOS", "Snapshot contains project identity");
  assert(snapshot.active_agents.length >= 1, "Snapshot includes active agents");
  assert(snapshot.active_tasks.length >= 1, "Snapshot includes active tasks");
  assert(Boolean(snapshot.cold_context_pointers), "Snapshot provides pointers to Cold Context");

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 2: Git Integration
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€ 2. Git Integration â”€â”€");

  // 2.1 Git Status
  const gitStatus = getGitStatus(rootDir);
  assert(Boolean(gitStatus.branch), `Git branch resolved: "${gitStatus.branch}"`);
  assert(typeof gitStatus.isClean === "boolean", "Git isClean boolean returned");
  assert(Array.isArray(gitStatus.staged), "Git staged files array returned");
  assert(Array.isArray(gitStatus.unstaged), "Git unstaged files array returned");

  // 2.2 Recent Commits
  const commits = getGitRecentCommits(rootDir, 3);
  assert(commits.length >= 1, `Recent git commits retrieved (${commits.length})`);
  assert(Boolean(commits[0].hash), `Latest commit hash: ${commits[0].hash}`);

  // 2.3 Git Diff
  const diff = getGitDiff(rootDir, false);
  assert(typeof diff === "string", "Git diff executed and returned string");

  // 2.4 Zero-Commit Fresh Repository Git Status (PC-F07 Hardening)
  const os = await import("node:os");
  const { execSync } = await import("node:child_process");
  const tempGitRepo = fs.mkdtempSync(path.join(os.tmpdir(), "context-zero-commit-"));
  try {
    execSync("git init", { cwd: tempGitRepo, stdio: "ignore" });
    fs.writeFileSync(path.join(tempGitRepo, "untracked.txt"), "hello world");
    const zeroStatus = getGitStatus(tempGitRepo);
    assert(zeroStatus.branch !== "unknown", `Zero-commit branch resolved cleanly ('${zeroStatus.branch}')`);
    assert(zeroStatus.untracked.includes("untracked.txt"), "Zero-commit untracked file detected in status");
    assert(zeroStatus.isClean === false, "Zero-commit repo with files isClean is false");
    const zeroCommits = getGitRecentCommits(tempGitRepo, 5);
    assert(Array.isArray(zeroCommits) && zeroCommits.length === 0, "Zero-commit repo commits returned empty array without throwing");
  } finally {
    fs.rmSync(tempGitRepo, { recursive: true, force: true });
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 3: Security & Anti-Credential Scanner
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€ 3. Security & Anti-Credential Scanner â”€â”€");

  // 3.1 Detect OpenAI/Anthropic secret key
  const leak1 = scanForSecrets("My key is sk-abcdef12345678901234567890");
  assert(leak1.length > 0 && leak1[0].patternName.includes("Secret Key"), "Detected API key (sk-...)");

  // 3.2 Detect GitHub token
  const leak2 = scanForSecrets("ghp_123456789012345678901234567890");
  assert(leak2.length > 0 && leak2[0].patternName.includes("GitHub Personal Access Token"), "Detected GitHub token (ghp_...)");

  // 3.3 Detect Bearer token
  const leak3 = scanForSecrets("Authorization: Bearer myverylongsecrettokenvalue1234567890");
  assert(leak3.length > 0 && leak3[0].patternName.includes("Bearer"), "Detected HTTP Bearer token");

  // 3.4 Detect private key
  const leak4 = scanForSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...");
  assert(leak4.length > 0 && leak4[0].patternName.includes("Private Cryptographic Key"), "Detected private key pattern");

  // 3.5 Detect sensitive object assignment
  const leak5 = scanForSecrets({ db_config: { password: "super-secret-db-password-123" } });
  assert(leak5.length > 0, "Detected sensitive object password key");

  // 3.6 Safe content passes without violation
  const safeContent = {
    title: "Project Context OS implementation",
    description: "Configured local CLI and official MCP server",
    status: "READY",
  };
  const safeViolations = scanForSecrets(safeContent);
  assert(safeViolations.length === 0, "Safe content has zero violations");

  // 3.7 assertNoSecrets throws on leak
  let threw = false;
  try {
    assertNoSecrets({ apiKey: "sk-1234567890123456789012345" });
  } catch (err) {
    threw = true;
    assert(err.message.includes("Security violation"), "assertNoSecrets successfully threw Security violation error");
  }
  if (!threw) assert(false, "assertNoSecrets failed to throw on secret payload");

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 4: Multi-Agent Concurrency
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€ 4. Multi-Agent Concurrency â”€â”€");

  // 4.1 Register a second agent ("codex")
  const codexWork = {
    agent: "codex",
    interface: "vscode",
    router: "none",
    model: "gpt-4o",
    active_task: "TASK-002",
    task_title: "CareerOS Resume Parser Fine-Tuning",
    status: "IN_PROGRESS",
    objective: "Fine-tune edge function parse-resume for LaTeX templates",
    progress: "Analyzing edge function inputs",
    files: ["supabase/functions/parse-resume/index.ts"],
    tests: ["npm test"],
    next_action: "Add parser test cases",
  };
  const updateRes = updateActiveWork(rootDir, codexWork);
  assert(updateRes.success === true, "Successfully registered second concurrent agent 'codex'");

  // 4.2 Verify isolated file exists
  const codexFilePath = path.join(getContextDir(rootDir), "active-work", "codex.md");
  assert(fs.existsSync(codexFilePath), "active-work/codex.md was created in isolation");

  // 4.3 Verify both agents are present in aggregated view
  const recompiled = readActiveWork(rootDir);
  assert(recompiled.agents.some((a) => a.agent === "antigravity"), "Aggregated view retains 'antigravity'");
  assert(recompiled.agents.some((a) => a.agent === "codex"), "Aggregated view includes 'codex'");
  assert(recompiled.aggregateRaw.includes("codex"), "ACTIVE-WORK.md table contains 'codex'");

  // Clean up test agent record
  if (fs.existsSync(codexFilePath)) {
    fs.unlinkSync(codexFilePath);
    recompileActiveWork(rootDir);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 5: Immutable Handoffs
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€ 5. Immutable Handoffs â”€â”€");

  // 5.1 Create handoff
  const handoffInput = {
    from_agent: "antigravity",
    interface: "kilo-code",
    router: "omniroute",
    model: "gemini-3.8-flash",
    to_agent: "chatgpt",
    task_id: "TASK-001",
    task: "Project Context OS Verification",
    objective: "Verify Phase 1 implementation",
    completed_work: ["Built local CLI", "Implemented official MCP server"],
    files_changed: ["tools/project-context/*"],
    next_action: "Review implementation plan and tests",
  };
  const handoffRes = createHandoff(rootDir, handoffInput);
  assert(handoffRes.success === true, `Created immutable handoff: ${handoffRes.filename}`);
  assert(fs.existsSync(handoffRes.filePath), "Handoff file exists in handoffs/");

  // 5.2 Read handoff
  const handoffList = readHandoffs(rootDir, 5);
  assert(handoffList.handoffs.some((h) => h.filename === handoffRes.filename), "Handoff list includes newly created handoff");

  // 5.3 Attempt to overwrite existing handoff (Immutability Violation)
  let overwriteBlocked = false;
  try {
    createHandoff(rootDir, {
      ...handoffInput,
      filename: handoffRes.filename,
      task: "Overwrite attempt",
    });
  } catch (err) {
    if (err.message.includes("Refusing to overwrite")) {
      overwriteBlocked = true;
    }
  }
  assert(overwriteBlocked, "Handoff creation respects write-once policy");

  // Clean up the temporary test handoff
  if (fs.existsSync(handoffRes.filePath)) {
    fs.unlinkSync(handoffRes.filePath);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 6: Official MCP Server (Real STDIO Transport via SDK Client)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€ 6. Official MCP Server (Real STDIO Transport via SDK Client) â”€â”€");

  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

  const mcpServerScript = fs.existsSync(path.join(__dirname, "..", "src", "mcp-server.js"))
    ? path.join(__dirname, "..", "src", "mcp-server.js")
    : path.join(rootDir, "tools", "project-context", "src", "mcp-server.js");

  const mcpTransport = new StdioClientTransport({
    command: "node",
    args: [mcpServerScript],
    cwd: rootDir,
  });

  const mcpClient = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    // 6.1 Connect over STDIO
    await mcpClient.connect(mcpTransport);
    assert(true, "Successfully connected official MCP client to server over STDIO transport");

    // 6.2 Tool Discovery (listTools)
    const listRes = await mcpClient.listTools();
    const tools = listRes.tools || [];
    assert(tools.length >= 25, `MCP listTools discovered ${tools.length} tools (expected >= 25)`);

    const expectedTools = [
      "get_project_state",
      "get_active_work",
      "get_tasks",
      "get_recent_changes",
      "get_recent_handoffs",
      "get_architecture",
      "get_decisions",
      "search_project_context",
      "get_git_status",
      "get_git_diff",
      "get_context_snapshot",
      "update_project_state",
      "update_active_work",
      "create_task",
      "update_task",
      "record_decision",
      "record_change",
      "create_handoff",
      "bootstrap_context",
      "start_agent_session",
      "heartbeat_session",
      "end_agent_session",
      "check_context_consistency",
      "recover_stale_sessions",
      "list_agent_sessions",
    ];
    for (const t of expectedTools) {
      assert(tools.some((tool) => tool.name === t), `Tool '${t}' is registered`);
    }

    // 6.3 Call Read Tool: get_context_snapshot
    const snapRes = await mcpClient.callTool({
      name: "get_context_snapshot",
      arguments: { limit: 2 },
    });
    assert(!snapRes.isError, "callTool 'get_context_snapshot' succeeded without error");
    const snapText = snapRes.content?.[0]?.text || "";
    assert(snapText.includes("HotContextSnapshot"), "Snapshot output includes 'HotContextSnapshot'");

    // 6.4 Call Write Tool: create_task
    const taskRes = await mcpClient.callTool({
      name: "create_task",
      arguments: {
        title: "Test Task from Official MCP Client",
        status: "READY",
        priority: "LOW",
        owner: "test-suite",
      },
    });
    assert(!taskRes.isError, "callTool 'create_task' succeeded");
    const taskText = taskRes.content?.[0]?.text || "";
    assert(taskText.includes("TASK-"), "Task was created with TASK-XXX ID");

    // 6.5 Call Write Tool: validation rejection (invalid status)
    let badStatusRejected = false;
    try {
      const badStatusRes = await mcpClient.callTool({
        name: "create_task",
        arguments: {
          title: "Invalid task",
          status: "INVALID_STATUS_NAME",
        },
      });
      if (badStatusRes.isError) badStatusRejected = true;
    } catch {
      badStatusRejected = true;
    }
    assert(badStatusRejected, "callTool rejected invalid status enum value");

    // 6.6 Security rejection via MCP (attempting to persist an API key)
    const secretRes = await mcpClient.callTool({
      name: "record_change",
      arguments: {
        task_id: "TASK-001",
        summary: "Leaked key test: sk-abcdef12345678901234567890",
      },
    });
    assert(
      secretRes.isError === true && secretRes.content?.[0]?.text?.includes("Security violation"),
      "MCP write operation rejected secret API key with Security violation"
    );

    // 6.7 Phase 2 MCP Tool: bootstrap_context
    const bootRes = await mcpClient.callTool({
      name: "bootstrap_context",
      arguments: { agent: "mcp-test-agent" },
    });
    assert(!bootRes.isError, "callTool 'bootstrap_context' succeeded");
    const bootText = bootRes.content?.[0]?.text || "";
    assert(bootText.includes("UniversalAgentBootstrap"), "Bootstrap MCP tool returns UniversalAgentBootstrap");

    // 6.8 Phase 2 MCP Tool: check_context_consistency
    const consRes = await mcpClient.callTool({
      name: "check_context_consistency",
      arguments: {},
    });
    assert(!consRes.isError, "callTool 'check_context_consistency' succeeded");
    const consText = consRes.content?.[0]?.text || "";
    assert(consText.includes("isConsistent"), "check_context_consistency returns isConsistent boolean");

    // 6.9 Phase 2 MCP Tool: list_agent_sessions
    const listSessRes = await mcpClient.callTool({
      name: "list_agent_sessions",
      arguments: {},
    });
    assert(!listSessRes.isError, "callTool 'list_agent_sessions' succeeded");
  } finally {
    await mcpClient.close();
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 7: Context Integrity Validator
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€ 7. Context Integrity Validator â”€â”€");

  const validation = validateContext(rootDir);
  assert(validation.valid === true, "validateContext(rootDir) returned valid = true");
  assert(validation.errors.length === 0, `Zero validation errors (got ${validation.errors.length})`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 8: Universal Agent Bootstrap
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€ 8. Universal Agent Bootstrap â”€â”€");

  const boot = getAgentBootstrap(rootDir, { agent: "test-agent" });
  assert(boot._type === "UniversalAgentBootstrap", "getAgentBootstrap returns UniversalAgentBootstrap object");
  assert(boot.project && boot.project.name === "CareerOS", "Bootstrap includes project identity");
  assert(boot.incoming_agent === "test-agent", "Bootstrap acknowledges target incoming agent");
  assert(Array.isArray(boot.active_tasks), "Bootstrap provides array of active tasks");
  assert(boot.git && typeof boot.git.is_clean === "boolean", "Bootstrap embeds Git ground truth");
  assert(boot.latest_handoff !== undefined, "Bootstrap provides latest handoff pointer");

  const bootMd = formatBootstrapMarkdown(boot);
  assert(bootMd.includes("Agent Bootstrap Briefing"), "formatBootstrapMarkdown outputs human briefing");
  assert(bootMd.includes("Project Reality"), "Briefing contains Project Reality section");

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 9: Agent Session Registry & Heartbeats
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€ 9. Agent Session Registry & Heartbeats â”€â”€");

  const sessStart = startSession(rootDir, {
    agent: "unit-agent-alpha",
    interface: "kilo-code",
    router: "omniroute",
    model: "claude-3-5-sonnet",
    task_id: "TASK-UNIT-1",
    task_title: "Unit Test Session",
    objective: "Verify session registry functionality",
    working_area: ["tools/project-context/tests/*"],
  });
  assert(sessStart.success === true, "startSession successfully registered session");
  assert(sessStart.agent === "unit-agent-alpha", "Session registered correct agent name");

  const heartbeat = heartbeatSession(rootDir, "unit-agent-alpha", {
    progress: "50% unit tests completed",
    next_action: "Execute remaining assertions",
  });
  assert(heartbeat.success === true, "heartbeatSession updated heartbeat timestamp");

  const sessions = listSessions(rootDir);
  assert(sessions.total >= 1, "listSessions returns active session list");
  assert(sessions.sessions.some((s) => s.agent === "unit-agent-alpha"), "listSessions includes unit-agent-alpha");

  // Clean up unit-agent-alpha file
  const alphaFile = path.join(getContextDir(rootDir), "active-work", "unit-agent-alpha.md");
  if (fs.existsSync(alphaFile)) fs.unlinkSync(alphaFile);
  recompileActiveWork(rootDir);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 10: Git â†” Context Consistency Checker
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€ 10. Git â†” Context Consistency Checker â”€â”€");

  const consistency = checkConsistency(rootDir);
  assert(typeof consistency.isConsistent === "boolean", "checkConsistency returns isConsistent boolean");
  assert(Array.isArray(consistency.issues), "checkConsistency returns array of issues");
  assert(typeof consistency.summary.total_issues === "number", "checkConsistency provides summary counts");

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 11: Git Hook Automation
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€ 11. Git Hook Automation â”€â”€");

  const installRes = installGitHook(rootDir);
  assert(installRes.success === true, "installGitHook successfully installs pre-commit hook");
  assert(fs.existsSync(installRes.hookPath), "Pre-commit hook file exists in .git/hooks/pre-commit");

  // Verify hook content
  const hookContent = fs.readFileSync(installRes.hookPath, "utf-8");
  assert(hookContent.includes("project-context.js validate"), "Pre-commit hook executes validate command");

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 12: Cross-Agent Interoperability Simulation
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const simResults = await runCrossAgentAcceptanceTest();
  assert(simResults.failed === 0, `Cross-agent acceptance simulation passed with 0 failures (passed ${simResults.passed})`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 13: Phase 2.1 Real Integration Audit (11 Items)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const auditRes = await runRealIntegrationAudit();
  assert(auditRes.failed === 0, `Real integration audit passed with 0 failures (passed ${auditRes.passed})`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 14: Phase 2.1 Real Agent A -> Agent B Lifecycle (H0 Intervention)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const realAgentRes = await runRealAgentAcceptance();
  assert(realAgentRes.failed === 0, `Real agent acceptance passed with 0 failures (passed ${realAgentRes.passed})`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 15: Phase 2.1 Git Hook Safety & Failure Path
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hookSafetyRes = await runGitHookSafetyTest();
  assert(hookSafetyRes.failed === 0, `Git hook safety passed with 0 failures (passed ${hookSafetyRes.passed})`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 16: Phase 3 Capabilities (Invariants, Relevance, Quality, Drift, Collisions, MCP 29 Tools)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await runPhase3CapabilityTests(rootDir, assert);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 17: Phase 3 Real CareerOS Workflow Integration (TASK-002 H0 Lifecycle)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await runRealCareerOsWorkflow(rootDir, assert);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 18: Phase 4 Cross-Project Portability & Isolation (AcadOS)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await runCrossProjectPortabilityTests(rootDir, assert);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 19: Phase 4 Model Interoperability & Identity Dimensions
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await runModelInteropTests(rootDir, assert);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TEST GROUP 20: Phase 4 Quantitative Token Efficiency & Completeness
  // ─────────────────────────────────────────────────────────────────────────
  await runTokenEfficiencyTests(rootDir, assert);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST GROUP 21: Phase 4 Core Decoupling & Boundary Verification
  // ─────────────────────────────────────────────────────────────────────────
  await runDecouplingTests(rootDir, assert);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST GROUP 22: Phase 5 Adversarial & Multi-Project Isolation
  // ─────────────────────────────────────────────────────────────────────────
  await runAdversarialPhase5Tests(rootDir, assert);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST GROUP 23: Phase 5G Clean-Room Release Distribution Gate
  // ─────────────────────────────────────────────────────────────────────────
  await runCleanRoomDistributionGate(assert);

  console.log("\n================================================================");
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    if (stateRaw) fs.writeFileSync(statePath, stateRaw, "utf-8");
    if (tasksRaw) fs.writeFileSync(tasksPath, tasksRaw, "utf-8");
    recompileActiveWork(rootDir);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});


