import { resolveProjectRoot } from "../src/locator.js";
/**
 * Project Context OS â€” Real Integration Audit
 *
 * Verifies the 11 real-agent integration requirements using the official
 * MCP SDK Client over real STDIO transport.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { recompileActiveWork } from "../src/core.js";

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
const results = [];

function check(id, title, condition, details = "") {
  if (condition) {
    console.log(`  âœ“ [Item ${id}] ${title}`);
    passed++;
    results.push({ id, title, status: "PASS", details });
  } else {
    console.error(`  âœ— [Item ${id}] FAILED: ${title} â€” ${details}`);
    failed++;
    results.push({ id, title, status: "FAIL", details });
  }
}

export async function runRealIntegrationAudit() {
  console.log("================================================================");
  console.log("Project Context OS â€” Phase 2.1 Real Integration Audit");
  console.log("================================================================\n");

  const statePath = path.join(rootDir, ".project-context", "STATE.md");
  const tasksPath = path.join(rootDir, ".project-context", "TASKS.md");
  const initialTasks = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, "utf-8") : null;
  const initialState = fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf-8") : null;

  // 1. MCP configuration is actually discoverable
  const vscodeMcpPath = path.join(rootDir, ".vscode", "mcp.json");
  const templatePath = fs.existsSync(path.join(__dirname, "..", "templates", "kilo-mcp.json"))
    ? path.join(__dirname, "..", "templates", "kilo-mcp.json")
    : path.join(rootDir, "tools", "project-context", "templates", "kilo-mcp.json");
  const configDiscoverable = fs.existsSync(vscodeMcpPath) && fs.existsSync(templatePath);
  check(1, "MCP configuration is discoverable in workspace (.vscode/mcp.json)", configDiscoverable);

  // Connect client to MCP server over STDIO
  const mcpServerPath = fs.existsSync(path.join(__dirname, "..", "src", "mcp-server.js"))
    ? path.join(__dirname, "..", "src", "mcp-server.js")
    : path.join(rootDir, "tools", "project-context", "src", "mcp-server.js");
  const mcpTransport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpServerPath],
    cwd: rootDir,
  });

  const mcpClient = new Client(
    { name: "real-agent-audit-client", version: "2.1.0" },
    { capabilities: {} }
  );

  try {
    // 2. The MCP server starts successfully
    await mcpClient.connect(mcpTransport);
    check(2, "MCP server process starts and establishes STDIO connection", true);

    // 3. The real client can list the Context OS tools
    const listRes = await mcpClient.listTools();
    const tools = listRes.tools || [];
    const hasRequiredTools = tools.length >= 25 &&
      tools.some((t) => t.name === "bootstrap_context") &&
      tools.some((t) => t.name === "start_agent_session") &&
      tools.some((t) => t.name === "end_agent_session") &&
      tools.some((t) => t.name === "check_context_consistency");
    check(3, `Client lists ${tools.length} Context OS tools including all Phase 2 tools`, hasRequiredTools);

    // 4. The real agent can call bootstrap_context
    const bootRes = await mcpClient.callTool({
      name: "bootstrap_context",
      arguments: { agent: "audit-agent-a" },
    });
    check(4, "Agent calls bootstrap_context tool successfully", !bootRes.isError);

    // 5. The returned bootstrap information is sufficient to understand the project
    const bootData = JSON.parse(bootRes.content[0].text).bootstrap;
    const isSufficient = Boolean(
      bootData.project?.name === "CareerOS" &&
      bootData.project?.phase &&
      Array.isArray(bootData.active_tasks) &&
      bootData.latest_handoff !== undefined &&
      bootData.git &&
      bootData.cold_context_pointers
    );
    check(5, "Bootstrap data provides sufficient hot context (reality, tasks, handoff, git)", isSufficient);

    // 6. The agent can access deeper context when required
    const searchRes = await mcpClient.callTool({
      name: "search_project_context",
      arguments: { query: "vendor-neutral" },
    });
    const searchData = JSON.parse(searchRes.content[0].text);
    check(6, "Agent accesses deeper cold context via search_project_context", searchData.match_count > 0);

    // 7. The agent can start a session
    const startRes = await mcpClient.callTool({
      name: "start_agent_session",
      arguments: {
        agent: "audit-agent-a",
        interface: "kilo-code",
        router: "omniroute",
        model: "gemini-3.8-flash",
        task_id: "TASK-AUDIT-01",
        task_title: "Real Agent Integration Audit",
        objective: "Verify end-to-end tool execution",
      },
    });
    check(7, "Agent starts session and establishes active-work record via start_agent_session", !startRes.isError);

    // 8. The agent can update/inspect active work
    const hbRes = await mcpClient.callTool({
      name: "heartbeat_session",
      arguments: {
        agent: "audit-agent-a",
        progress: "Step 1 verification complete",
        next_action: "Execute step 2 verification",
      },
    });
    const activeRes = await mcpClient.callTool({
      name: "get_active_work",
      arguments: {},
    });
    const activeText = activeRes.content[0].text;
    check(8, "Agent updates and inspects active work via heartbeat and get_active_work", !hbRes.isError && activeText.includes("audit-agent-a"));

    // 9. The agent can create/update tasks
    const taskRes = await mcpClient.callTool({
      name: "create_task",
      arguments: {
        title: "Disposable Integration Task",
        status: "IN_PROGRESS",
        priority: "LOW",
        owner: "audit-agent-a",
      },
    });
    const taskData = JSON.parse(taskRes.content[0].text);
    const createdTaskId = taskData.task_id;
    let taskUpdated = false;
    if (createdTaskId) {
      const updRes = await mcpClient.callTool({
        name: "update_task",
        arguments: { id: createdTaskId, status: "COMPLETED" },
      });
      taskUpdated = !updRes.isError;
    }
    check(9, "Agent creates and updates tasks in TASKS.md via create_task and update_task", Boolean(createdTaskId && taskUpdated));

    // 10. The agent can create a handoff
    const endRes = await mcpClient.callTool({
      name: "end_agent_session",
      arguments: {
        agent: "audit-agent-a",
        to_agent: "audit-agent-b",
        task_id: "TASK-AUDIT-01",
        task_title: "Real Agent Integration Audit",
        completed_work: ["Verified MCP tools 1 through 9"],
        next_action: "Resume audit verification at step 11",
        mark_task_completed: true,
      },
    });
    const endData = JSON.parse(endRes.content[0].text);
    const handoffCreated = Boolean(endData.success && endData.handoff?.filename);
    const handoffPath = endData.handoff?.filePath;
    check(10, "Agent creates immutable handoff via end_agent_session", handoffCreated);

    // 11. Another agent/client can consume that handoff
    const bootResB = await mcpClient.callTool({
      name: "bootstrap_context",
      arguments: { agent: "audit-agent-b" },
    });
    const bootDataB = JSON.parse(bootResB.content[0].text).bootstrap;
    const consumedHandoff = bootDataB.latest_handoff;
    const handoffConsumed = Boolean(
      consumedHandoff &&
      consumedHandoff.from_agent === "audit-agent-a" &&
      consumedHandoff.to_agent === "audit-agent-b" &&
      consumedHandoff.next_action?.includes("step 11")
    );
    check(11, "Incoming Agent B consumes Agent A's handoff and exact next action via bootstrap_context", handoffConsumed);

    // Cleanup temporary audit artifacts
    if (handoffPath && fs.existsSync(handoffPath)) {
      fs.unlinkSync(handoffPath);
    }
    const auditAgentFile = path.join(rootDir, ".project-context", "active-work", "audit-agent-a.md");
    if (fs.existsSync(auditAgentFile)) {
      fs.unlinkSync(auditAgentFile);
    }
  } finally {
    await mcpClient.close();
    if (initialTasks) fs.writeFileSync(tasksPath, initialTasks, "utf-8");
    if (initialState) fs.writeFileSync(statePath, initialState, "utf-8");
    recompileActiveWork(rootDir);
  }

  console.log("\n================================================================");
  console.log(`Integration Audit Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================\n");

  return { passed, failed, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runRealIntegrationAudit().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

