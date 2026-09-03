/**
 * Project Context OS — Phase 4 Model Interoperability & Identity Boundary Suite
 *
 * Verifies:
 *  1. Conceptual separation of Agent vs Interface vs Router vs Model
 *  2. Multi-Model handoff & state recovery (Model A -> Model B via OmniRoute)
 *  3. ChatGPT portable snapshot fallback workflow (zero-socket token-efficient briefing)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  initProjectContext,
  readState,
  startSession,
  heartbeatSession,
  listSessions,
  assistedSessionEnd,
  getAgentBootstrap,
  getContextSnapshot,
  formatSnapshotMarkdown,
  recordDecision,
  readDecisions,
} from "../src/index.js";

/**
 * Runs the model interoperability test suite.
 * @param {string} rootDir
 * @param {function} assert
 */
export async function runModelInteropTests(rootDir, assert) {
  console.log("\n================================================================");
  console.log("Project Context OS — Model Interoperability & Identity Suite");
  console.log("================================================================\n");

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "project-context-model-"));
  const projectRoot = path.join(tempBase, "ModelTestProject");
  fs.mkdirSync(projectRoot, { recursive: true });

  try {
    initProjectContext(projectRoot, { name: "ModelTestProject" });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: Distinct Identity Dimensions
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── 1. Conceptual Identity Dimensions (Agent / Interface / Router / Model) ──");

    const sessionA = startSession(projectRoot, {
      agent: "lead-architect",
      interface: "kilo-code",
      router: "omniroute",
      model: "gemini-3.8-flash",
      task: "TASK-001",
      task_title: "Initial Setup",
      working_area: ["src/"],
    });

    assert(sessionA.agent === "lead-architect", "Agent dimension recorded: 'lead-architect'");
    assert(sessionA.interface === "kilo-code", "Interface dimension recorded: 'kilo-code'");
    assert(sessionA.router === "omniroute", "Router dimension recorded: 'omniroute'");
    assert(sessionA.model === "gemini-3.8-flash", "Model dimension recorded: 'gemini-3.8-flash'");

    const sessList = listSessions(projectRoot);
    const active = sessList.sessions.find((s) => s.agent === "lead-architect");
    assert(active?.router === "omniroute", "Session registry preserves router 'omniroute'");
    assert(active?.model === "gemini-3.8-flash", "Session registry preserves model 'gemini-3.8-flash'");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: Model Switching Test (Model A -> Model B via OmniRoute)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 2. Model Switching Test (OmniRoute: Model A -> Model B) ──");

    // Model A concludes work
    const endResultA = assistedSessionEnd(projectRoot, {
      agent: "lead-architect",
      interface: "kilo-code",
      router: "omniroute",
      model: "gemini-3.8-flash",
      to_agent: "lead-architect", // Same persona, but model will switch
      task_id: "TASK-001",
      task_title: "Initial Setup",
      summary: "Defined core architectural boundaries under Model A",
      next_action: "Implement database connection adapter under Model B.",
    });
    assert(endResultA.success === true, "Model A successfully generated handoff");

    // Developer switches model in OmniRoute to claude-3-7-sonnet
    // Model B enters repository with ZERO conversation history
    const bootModelB = getAgentBootstrap(projectRoot, {
      agent: "lead-architect",
    });

    assert(
      bootModelB.project.name === "ModelTestProject",
      "Model B bootstraps and recovers project identity"
    );
    assert(
      bootModelB.latest_handoff?.next_action.includes("database connection adapter"),
      "Model B recovers exact next step without human explanation (Model-Switching H0)"
    );

    // Model B registers session with new model identity
    const sessionB = startSession(projectRoot, {
      agent: "lead-architect",
      interface: "kilo-code",
      router: "omniroute",
      model: "claude-3-7-sonnet",
      task: "TASK-001",
      task_title: "Initial Setup",
      working_area: ["src/db/"],
    });
    assert(sessionB.model === "claude-3-7-sonnet", "Model B session registered with 'claude-3-7-sonnet'");
    assert(sessionB.router === "omniroute", "Model B router registered with 'omniroute'");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: ChatGPT Snapshot Fallback Workflow
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 3. ChatGPT Portable Snapshot Fallback Workflow ──");

    const snapshot = getContextSnapshot(projectRoot, { limit: 5 });
    const markdownBriefing = formatSnapshotMarkdown(snapshot);

    assert(typeof markdownBriefing === "string", "Snapshot formatting produces markdown string");
    assert(markdownBriefing.includes("# Project Context Snapshot"), "Briefing contains snapshot header");
    assert(markdownBriefing.includes("ModelTestProject"), "Briefing contains project name");
    assert(markdownBriefing.includes("## 1. Project Reality"), "Briefing contains Project Reality");
    assert(markdownBriefing.includes("## 4. Latest Handoff"), "Briefing contains Latest Handoff pointer");

    // Verify token boundedness (markdown briefing must be compact for web copy-paste)
    const lineCount = markdownBriefing.split("\n").length;
    assert(lineCount < 150, `Snapshot briefing is compact (${lineCount} lines < 150 lines)`);

    // Simulate ChatGPT strategic decision recorded back to repo
    const adrRes = recordDecision(projectRoot, {
      id: "ADR-007",
      title: "Pluggable Storage Adapters Designed via ChatGPT",
      status: "ACCEPTED",
      context: "ChatGPT evaluated storage trade-offs in architecture review.",
      decision: "Support pluggable local file storage adapters.",
      reason: "Provides maximum flexibility across edge and desktop runtimes.",
    });

    assert(adrRes.id === "ADR-007", "ADR-007 successfully recorded into DECISIONS.md");
    const allDecs = readDecisions(projectRoot);
    const foundAdr = allDecs.decisions.find((d) => d.id === "ADR-007");
    assert(Boolean(foundAdr), "Verified ADR-007 persists in repository decisions");

  } finally {
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {}
  }

  console.log("\nModel Interoperability: All assertions passed.\n");
}
