import { resolveProjectRoot } from "../src/locator.js";
/**
 * Project Context OS â€” Cross-Agent Handoff & Interoperability Acceptance Test
 *
 * Verifies that Agent B can enter the repository after Agent A terminates,
 * bootstrap context, understand Agent A's work and unfinished tasks exclusively
 * from Context OS, and continue work without any manual explanation.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createTask,
  updateTask,
  recordChange,
  getContextDir,
  recompileActiveWork,
} from "../src/core.js";
import { startSession } from "../src/session.js";
import { assistedSessionEnd, recoverSession } from "../src/lifecycle.js";
import { getAgentBootstrap } from "../src/bootstrap.js";
import { checkConsistency } from "../src/consistency.js";

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

export async function runCrossAgentAcceptanceTest() {
  console.log("\nâ”€â”€ Cross-Agent Interoperability Acceptance Simulation â”€â”€");

  const scratchDir = path.join(__dirname, "../scratch");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const simFilePath = path.join(scratchDir, "sim-work-artifact.txt");
  const agentA = "sim-agent-a";
  const agentB = "sim-agent-b";
  let simHandoffFile = null;

  const changelogPath = path.join(getContextDir(rootDir), "CHANGELOG.md");
  const initialChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, "utf-8") : "";

  try {
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PHASE 1: AGENT A EXECUTION
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // 1. Agent A enters repository and bootstraps
    const bootA = getAgentBootstrap(rootDir, { agent: agentA });
    assert(bootA && bootA.project && bootA.project.name === "CareerOS", "Agent A successfully bootstrapped repository context");

    // 2. Agent A registers session
    const sessA = startSession(rootDir, {
      agent: agentA,
      interface: "kilo-code",
      router: "omniroute",
      model: "claude-3-5-sonnet",
      task_id: "TASK-SIM-101",
      task_title: "Automated Cross-Agent Pipeline Simulation",
      objective: "Implement step 1 and leave structured handoff for Agent B",
      working_area: ["tools/project-context/scratch/*"],
      next_action: "Implement step 1 in sim-work-artifact.txt",
    });
    assert(sessA.success && sessA.agent === agentA, "Agent A registered active session in active-work/sim-agent-a.md");

    // 3. Agent A modifies a project file
    fs.writeFileSync(simFilePath, "Step 1 completed by sim-agent-a at " + new Date().toISOString() + "\nRemaining: Step 2\n", "utf-8");
    assert(fs.existsSync(simFilePath), "Agent A performed meaningful file modification");

    // 4. Agent A records a semantic change
    const changeA = recordChange(rootDir, {
      task_id: "TASK-SIM-101",
      summary: "Agent A implemented Step 1 of the automated pipeline simulation.",
      agent: agentA,
    });
    assert(changeA && changeA.success, "Agent A recorded semantic changelog entry");

    // 5. Agent A executes assisted session-end with handoff targeted to Agent B
    const endA = assistedSessionEnd(rootDir, {
      agent: agentA,
      to_agent: agentB,
      task_id: "TASK-SIM-101",
      task_title: "Automated Cross-Agent Pipeline Simulation",
      completed_work: [
        "Created scratch simulation artifact",
        "Wrote Step 1 pipeline processing logic",
      ],
      files_changed: ["tools/project-context/scratch/sim-work-artifact.txt"],
      tests: ["Verified file write operation"],
      unresolved: "Step 2 is pending execution by Agent B.",
      next_action: "Read sim-work-artifact.txt, append Step 2 completion, and verify.",
    });

    assert(endA.success && endA.handoff && endA.handoff.filename, "Agent A created immutable handoff targeted to Agent B");
    simHandoffFile = endA.handoff.filePath;
    assert(fs.existsSync(simHandoffFile), "Handoff file exists on disk");
    assert(endA.status === "COMPLETED", "Agent A active-work status transitioned to COMPLETED");

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // AGENT A DISAPPEARS COMPLETELY â€” ZERO MEMORY TRANSMISSION
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PHASE 2: AGENT B ARRIVAL & AUTONOMOUS RECOVERY
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // 6. Agent B arrives fresh and runs bootstrap
    const bootB = getAgentBootstrap(rootDir, { agent: agentB });
    assert(bootB && bootB._type === "UniversalAgentBootstrap", "Agent B successfully executed universal bootstrap");

    // 7. Agent B identifies incoming handoff from Agent A
    const latestHandoff = bootB.latest_handoff;
    assert(latestHandoff !== null, "Agent B recovered latest handoff from bootstrap");
    assert(latestHandoff.from_agent === agentA, `Agent B correctly identified previous agent as '${agentA}'`);
    assert(latestHandoff.to_agent === agentB, `Agent B verified handoff was addressed to '${agentB}'`);
    assert(latestHandoff.task_id === "TASK-SIM-101", `Agent B recovered task ID '${latestHandoff.task_id}'`);
    assert(
      latestHandoff.next_action.includes("sim-work-artifact.txt"),
      `Agent B extracted exact next action: "${latestHandoff.next_action}"`
    );

    // 8. Agent B inspects files identified in handoff
    const previousArtifact = latestHandoff.files_changed[0];
    assert(previousArtifact.includes("sim-work-artifact.txt"), "Agent B identified modified artifact path from handoff");

    // 9. Agent B registers its session and takes ownership of the task
    const sessB = startSession(rootDir, {
      agent: agentB,
      interface: "cursor",
      router: "omniroute",
      model: "gemini-3.8-flash",
      task_id: latestHandoff.task_id,
      task_title: latestHandoff.task_title || "Automated Cross-Agent Pipeline Simulation",
      objective: latestHandoff.next_action,
      working_area: latestHandoff.files_changed,
      next_action: "Complete Step 2 as instructed in handoff.",
    });
    assert(sessB.success && sessB.agent === agentB, "Agent B successfully claimed task and registered session");

    // 10. Agent B executes the requested next action
    fs.appendFileSync(simFilePath, "Step 2 completed by sim-agent-b at " + new Date().toISOString() + "\nStatus: All Steps Finished\n", "utf-8");
    const updatedContent = fs.readFileSync(simFilePath, "utf-8");
    assert(updatedContent.includes("Step 2 completed by sim-agent-b"), "Agent B executed requested task continuation without manual prompt");

    // 11. Agent B concludes session
    const endB = assistedSessionEnd(rootDir, {
      agent: agentB,
      to_agent: "human",
      task_id: "TASK-SIM-101",
      task_title: "Automated Cross-Agent Pipeline Simulation",
      completed_work: ["Completed Step 2 based on Agent A handoff instructions"],
      files_changed: ["tools/project-context/scratch/sim-work-artifact.txt"],
      tests: ["Full pipeline simulation passed"],
      next_action: "Review simulation results and archive.",
    });

    assert(endB.success && endB.status === "COMPLETED", "Agent B concluded session with final handoff to human");

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PHASE 3: CRASH & STALE RECOVERY SIMULATION
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    console.log("â”€â”€ Crash & Stale Recovery Tests â”€â”€");

    // Crash scenario 1: Agent registers session but crashes before work
    const crashedAgent = "crashed-agent-x";
    startSession(rootDir, {
      agent: crashedAgent,
      task_id: "TASK-CRASH-99",
      task_title: "Interrupted Task",
      objective: "Will crash midway",
    });

    // Verify recovery inspection finds crashed agent
    const inspectRes = recoverSession(rootDir, { agent: crashedAgent, action: "INSPECT" });
    assert(inspectRes.candidate_count >= 1, "Crash recovery detected candidate interrupted session");

    // Adopt crashed task by incoming agent
    const adoptRes = recoverSession(rootDir, {
      agent: crashedAgent,
      new_agent: "recovery-agent",
      action: "ADOPT",
    });
    assert(adoptRes.success && adoptRes.recovered_count === 1, "Incoming agent safely adopted crashed agent task");

    // Clean up simulation artifacts
    const contextDir = getContextDir(rootDir);
    const activeWorkDir = path.join(contextDir, "active-work");
    [agentA, agentB, crashedAgent, "recovery-agent"].forEach((name) => {
      const p = path.join(activeWorkDir, `${name}.md`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    if (fs.existsSync(simFilePath)) {
      fs.unlinkSync(simFilePath);
    }
    if (simHandoffFile && fs.existsSync(simHandoffFile)) {
      fs.unlinkSync(simHandoffFile);
    }
    if (endB?.handoff?.filePath && fs.existsSync(endB.handoff.filePath)) {
      fs.unlinkSync(endB.handoff.filePath);
    }
    const recoveryHandoffName = adoptRes?.recoveries?.[0]?.recovery_handoff;
    if (recoveryHandoffName) {
      const recoveryHandoffPath = path.join(contextDir, "handoffs", recoveryHandoffName);
      if (fs.existsSync(recoveryHandoffPath)) fs.unlinkSync(recoveryHandoffPath);
    }
    if (initialChangelog) {
      fs.writeFileSync(changelogPath, initialChangelog, "utf-8");
    }

    recompileActiveWork(rootDir);

    console.log(`\nSimulation Results: ${passed} passed, ${failed} failed`);
    return { passed, failed };
  } catch (err) {
    console.error("Simulation error:", err);
    if (initialChangelog) {
      fs.writeFileSync(changelogPath, initialChangelog, "utf-8");
    }
    recompileActiveWork(rootDir);
    return { passed, failed: failed + 1 };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCrossAgentAcceptanceTest().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

