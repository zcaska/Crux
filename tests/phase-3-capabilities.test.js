/**
 * Project Context OS — Phase 3 Automated Capability Test Suite
 *
 * Tests:
 *   1. Architectural Invariants (ADR-001, ADR-003, ADR-004, Core Tables)
 *   2. Deterministic Context Relevance Engine (Hot/Warm/Cold, Task-based Ranking)
 *   3. Context Quality & Freshness Assessment (6-Pillar Model, Scoring, Grading)
 *   4. Git ↔ Context Drift & Synchronization (Untracked mods, Lingering files)
 *   5. Multi-Agent Concurrency & Working Area Collisions
 *   6. Context-Aware Smart Bootstrap
 *   7. Phase 3 MCP Tools (29 total tools verified over official SDK Client)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { checkInvariants } from "../src/invariants.js";
import { getRelevantContext } from "../src/relevance.js";
import { assessContextQuality } from "../src/quality.js";
import { checkContextDrift } from "../src/drift.js";
import { startSession, checkWorkingAreaCollisions, listSessions } from "../src/session.js";
import { getAgentBootstrap, formatBootstrapMarkdown } from "../src/bootstrap.js";
import { getContextDir } from "../src/core.js";

export async function runPhase3CapabilityTests(rootDir, assert) {
  console.log("\n================================================================");
  console.log("Project Context OS — Phase 3 Capability Test Suite");
  console.log("================================================================");

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Invariant Guard Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── 1. Invariant Guard ──");
  const invRes = checkInvariants(rootDir);
  assert(invRes.passed === true, "Architectural invariants pass on repository baseline");
  assert(invRes.summary.errors === 0, "Zero invariant error violations on baseline");

  // Controlled violation: Injecting Supabase import into tools/project-context
  const tempViolationFile = path.join(rootDir, "tools", "project-context", "src", "temp-violation-test.js");
  try {
    const forbiddenPkg = "@supabase/" + "supabase-js";
    fs.writeFileSync(tempViolationFile, `import { createClient } from "${forbiddenPkg}";\n`);
    const violRes = checkInvariants(rootDir);
    assert(violRes.passed === false, "Invariant guard detects controlled ADR-001 Supabase violation");
    assert(violRes.violations.some((v) => v.rule === "ADR-001_NO_SUPABASE_IN_CONTEXT_OS"), "Flags specific ADR-001_NO_SUPABASE_IN_CONTEXT_OS rule");
  } finally {
    if (fs.existsSync(tempViolationFile)) fs.unlinkSync(tempViolationFile);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Deterministic Context Relevance Engine Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── 2. Context Relevance Engine ──");
  const relTask2 = getRelevantContext(rootDir, { task_id: "TASK-002" });
  assert(Array.isArray(relTask2.suggested_files), "Relevance engine returns suggested_files array");
  assert(
    relTask2.suggested_files.some((f) => f.includes("parse-resume")),
    "TASK-002 relevance suggests 'supabase/functions/parse-resume/index.ts'"
  );
  assert(Array.isArray(relTask2.relevant_decisions), "Returns relevant_decisions array");
  assert(
    relTask2.relevant_decisions.some((d) => d.id === "ADR-001"),
    "TASK-002 relevance ranks ADR-001 (Supabase architecture boundary) as relevant"
  );

  const relQuery = getRelevantContext(rootDir, { query: "MCP protocol stdio" });
  assert(
    relQuery.relevant_decisions.some((d) => d.id === "ADR-002"),
    "Query for 'MCP protocol stdio' ranks ADR-002 (Adopt Official MCP SDK)"
  );

  // Behavioral test: Prioritization over irrelevant context
  const resumeRelevance = getRelevantContext(rootDir, { query: "LaTeX resume parser" });
  const topFile = resumeRelevance.suggested_files[0];
  assert(topFile && topFile.includes("parse-resume"), "Relevance engine prioritizes 'parse-resume' as top suggested file ahead of unrelated files");

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Context Quality & Freshness Assessment Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── 3. Context Quality & Freshness Assessment ──");
  const quality = assessContextQuality(rootDir);
  assert(typeof quality.health_score === "number", "Quality assessment returns numeric health_score");
  assert(quality.health_score >= 80, `Repository baseline health score is high (${quality.health_score}%)`);
  assert(["A", "B"].includes(quality.grade), `Repository baseline grade is A or B (got ${quality.grade})`);
  assert(quality.summary.freshness >= 80, "Freshness pillar is >= 80%");
  assert(quality.summary.integrity === 100, "Referential integrity pillar is 100%");
  assert(quality.summary.recoverability >= 80, "Recoverability pillar is >= 80%");

  // Behavioral test: Controlled abandoned session detection
  const contextDirRoot = getContextDir(rootDir);
  const tempStaleFile = path.join(contextDirRoot, "active-work", "stale-test-agent.md");
  try {
    const staleTime = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
    fs.writeFileSync(
      tempStaleFile,
      `---\nagent: "stale-test"\nstatus: "IN_PROGRESS"\nactive_task: "TASK-001"\nstarted_at: "${staleTime}"\nupdated_at: "${staleTime}"\n---\n`
    );
    const staleQuality = assessContextQuality(rootDir);
    assert(staleQuality.issues.some((i) => i.code === "SESSION_ABANDONED_24H"), "Context quality flags deliberately abandoned session (>24h idle)");
  } finally {
    if (fs.existsSync(tempStaleFile)) fs.unlinkSync(tempStaleFile);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Git ↔ Context Drift Detection Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── 4. Git ↔ Context Drift Detection ──");
  const drift = checkContextDrift(rootDir);
  assert(typeof drift.hasDrift === "boolean", "checkContextDrift returns hasDrift boolean");
  assert(Array.isArray(drift.untracked_modifications), "Returns untracked_modifications array");
  assert(Array.isArray(drift.stale_completed_tasks), "Returns stale_completed_tasks array");
  assert(Array.isArray(drift.missing_context_files), "Returns missing_context_files array");
  assert(drift.untracked_modifications.length > 0, "Drift detector identifies existing uncommitted files not covered by active session");

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Working Area Concurrency Collision Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── 5. Multi-Agent Concurrency & Working Area Collisions ──");
  const contextDir = getContextDir(rootDir);
  const testAgentAFile = path.join(contextDir, "active-work", "collision-agent-a.md");
  const testAgentBFile = path.join(contextDir, "active-work", "collision-agent-b.md");

  try {
    startSession(rootDir, {
      agent: "collision-agent-a",
      working_area: ["frontend/src/services/"],
      task_id: "TASK-COLLISION-1",
      title: "Collision Test A",
    });

    startSession(rootDir, {
      agent: "collision-agent-b",
      working_area: ["frontend/src/services/aiDecisionService.ts"],
      task_id: "TASK-COLLISION-2",
      title: "Collision Test B",
    });

    const collisionRes = checkWorkingAreaCollisions(rootDir);
    assert(collisionRes.hasCollisions === true, "Detected overlapping working area collision");
    assert(
      collisionRes.collisions.some((c) => c.agent_a === "collision-agent-a" && c.agent_b === "collision-agent-b"),
      "Identified collision-agent-a and collision-agent-b as conflicting agents"
    );
  } finally {
    if (fs.existsSync(testAgentAFile)) fs.unlinkSync(testAgentAFile);
    if (fs.existsSync(testAgentBFile)) fs.unlinkSync(testAgentBFile);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Context-Aware Smart Bootstrap Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── 6. Context-Aware Smart Bootstrap ──");
  const smartBootstrap = getAgentBootstrap(rootDir, {
    agent: "smart-agent",
    task_id: "TASK-002",
  });

  assert(smartBootstrap.version === "3.0.0", "Bootstrap version is 3.0.0");
  assert(smartBootstrap.target_task_id === "TASK-002", "Bootstrap records target_task_id");
  assert(typeof smartBootstrap.context_health.score === "number", "Bootstrap includes context_health score");
  assert(Array.isArray(smartBootstrap.relevant_context.suggested_files), "Bootstrap includes suggested_files");
  assert(
    smartBootstrap.relevant_context.suggested_files.some((f) => f.includes("parse-resume")),
    "Smart bootstrap suggested files include 'supabase/functions/parse-resume/index.ts'"
  );

  const smartBriefing = formatBootstrapMarkdown(smartBootstrap);
  assert(smartBriefing.includes("Health Score"), "Markdown briefing includes Health Score");
  assert(smartBriefing.includes("Task-Tailored Warm Context (`TASK-002`)"), "Markdown briefing includes Warm Context section");

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Phase 3 MCP Server Verification (29 Tools over STDIO)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── 7. Phase 3 MCP Server (29 Official Tools) ──");
  const serverScript = path.join(rootDir, "tools", "project-context", "src", "mcp-server.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverScript],
    cwd: rootDir,
  });

  const client = new Client(
    { name: "phase-3-audit-client", version: "3.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    const toolsRes = await client.listTools();
    const toolNames = new Set(toolsRes.tools.map((t) => t.name));

    assert(toolNames.size === 29, `Exposes exactly 29 tools (got ${toolNames.size})`);
    assert(toolNames.has("get_context_health"), "Tool 'get_context_health' registered");
    assert(toolNames.has("get_relevant_context"), "Tool 'get_relevant_context' registered");
    assert(toolNames.has("check_context_drift"), "Tool 'check_context_drift' registered");
    assert(toolNames.has("get_attention_items"), "Tool 'get_attention_items' registered");

    // Call get_context_health
    const healthCall = await client.callTool({ name: "get_context_health", arguments: {} });
    const healthData = JSON.parse(healthCall.content[0].text);
    assert(typeof healthData.health_score === "number", "MCP 'get_context_health' returns health_score");

    // Call get_relevant_context
    const relCall = await client.callTool({
      name: "get_relevant_context",
      arguments: { task_id: "TASK-002" },
    });
    const relData = JSON.parse(relCall.content[0].text);
    assert(
      relData.suggested_files.some((f) => f.includes("parse-resume")),
      "MCP 'get_relevant_context' returns parse-resume file pointer"
    );

    // Call check_context_drift
    const driftCall = await client.callTool({ name: "check_context_drift", arguments: {} });
    const driftData = JSON.parse(driftCall.content[0].text);
    assert(typeof driftData.hasDrift === "boolean", "MCP 'check_context_drift' returns hasDrift boolean");

    // Call get_attention_items
    const attnCall = await client.callTool({ name: "get_attention_items", arguments: {} });
    const attnData = JSON.parse(attnCall.content[0].text);
    assert(typeof attnData.total_attention_items === "number", "MCP 'get_attention_items' returns total_attention_items");
  } finally {
    try {
      await client.close();
    } catch (e) {
      // Ignored
    }
  }

  console.log("\nPhase 3 Capabilities: All tests passed.\n");
  return true;
}
