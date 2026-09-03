/**
 * Project Context OS — Phase 4 Cross-Project Portability & Isolation Test Suite
 *
 * Proves that Project Context OS can be initialized, operated, and diagnosed
 * in a completely clean, independent repository (AcadOS) without relying on CareerOS.
 *
 * Verifies:
 *  1. Clean-room initialization from pristine templates
 *  2. Idempotent initialization (non-destructive re-runs)
 *  3. Strict cross-project isolation (CareerOS context ≠ AcadOS context)
 *  4. Path traversal / path jailing security protection
 *  5. Diagnostics via runDoctor on the independent repository
 *  6. Autonomous multi-agent lifecycle on AcadOS (Agent A -> Agent B with H0 Recovery)
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
  readHandoffs,
  searchProjectContext,
  runDoctor,
  getAgentBootstrap,
  startSession,
  assistedSessionEnd,
  validateContext,
} from "../src/index.js";

/**
 * Runs the complete cross-project portability and isolation test suite.
 * @param {string} careerOsRoot
 * @param {function} assert
 */
export async function runCrossProjectPortabilityTests(careerOsRoot, assert) {
  console.log("\n================================================================");
  console.log("Project Context OS — Cross-Project Portability & Isolation Suite");
  console.log("================================================================\n");

  // Create clean temporary sandbox for AcadOS
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "project-context-acados-"));
  const acadosRoot = path.join(tempBase, "AcadOS");
  fs.mkdirSync(acadosRoot, { recursive: true });

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: Clean-Room Repository Initialization
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── 1. Clean-Room Repository Initialization (AcadOS) ──");

    assert(
      !fs.existsSync(path.join(acadosRoot, ".project-context")),
      "AcadOS target begins with zero context files"
    );

    const initResult = initProjectContext(acadosRoot, {
      name: "AcadOS",
      description: "Academic Research and Learning Operating System",
    });

    assert(initResult.initialized === true, "initProjectContext returned initialized = true");
    assert(initResult.isNew === true, "initProjectContext reports isNew = true on fresh repository");
    assert(
      fs.existsSync(path.join(acadosRoot, ".project-context", "config.json")),
      "AcadOS .project-context/config.json created"
    );
    assert(
      fs.existsSync(path.join(acadosRoot, ".project-context", "STATE.md")),
      "AcadOS .project-context/STATE.md created"
    );
    assert(
      fs.existsSync(path.join(acadosRoot, ".project-context", "TASKS.md")),
      "AcadOS .project-context/TASKS.md created"
    );
    assert(
      fs.existsSync(path.join(acadosRoot, "AGENTS.md")),
      "AcadOS AGENTS.md Universal Protocol created in root"
    );
    assert(
      fs.existsSync(path.join(acadosRoot, ".vscode", "mcp.json")),
      "AcadOS .vscode/mcp.json client discovery config created"
    );

    const acadosState = readState(acadosRoot);
    assert(acadosState.meta.project_name === "AcadOS", "AcadOS STATE.md project_name is 'AcadOS'");
    assert(acadosState.meta.current_status === "READY", "AcadOS initial status is 'READY'");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: Idempotent Initialization
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 2. Idempotent Initialization Guarantee ──");

    // Add custom task to AcadOS
    const customTask = createTask(acadosRoot, {
      id: "ACAD-001",
      title: "Course Catalog Architecture",
      status: "READY",
      priority: "HIGH",
      owner: "curriculum-agent",
      description: "Design modular course catalog schema and prerequisites graph.",
    });
    assert(customTask.id === "ACAD-001", "Created custom task ACAD-001 in AcadOS");

    // Re-run initProjectContext on the same directory
    const reinitResult = initProjectContext(acadosRoot, { name: "AcadOS" });
    assert(reinitResult.initialized === true, "Re-initialization succeeded");
    assert(reinitResult.isNew === false, "Re-initialization recognized existing context (isNew = false)");

    const recheckTasks = readTasks(acadosRoot);
    const hasCustomTask = recheckTasks.tasks.some((t) => t.id === "ACAD-001");
    assert(hasCustomTask, "Idempotent init preserved existing task ACAD-001 without overwriting");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: Cross-Project Isolation Proof
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 3. Cross-Project Isolation & Jailing ──");

    const careerState = readState(careerOsRoot);
    assert(
      careerState.meta.project_name === "CareerOS",
      "CareerOS maintains independent project_name 'CareerOS'"
    );
    assert(
      acadosState.meta.project_name === "AcadOS",
      "AcadOS maintains independent project_name 'AcadOS'"
    );

    const careerTasks = readTasks(careerOsRoot);
    const acadosTasks = readTasks(acadosRoot);

    const acadosHasCareerTasks = acadosTasks.tasks.some(
      (t) => t.id === "TASK-002" || t.title.toLowerCase().includes("resume")
    );
    assert(!acadosHasCareerTasks, "AcadOS has ZERO CareerOS tasks or resume references");

    const careerHasAcadosTasks = careerTasks.tasks.some(
      (t) => t.id === "ACAD-001" || t.title.toLowerCase().includes("course catalog")
    );
    assert(!careerHasAcadosTasks, "CareerOS has ZERO AcadOS tasks or course references");

    // Search Isolation
    const acadosSearchResults = searchProjectContext(acadosRoot, "CareerOS");
    assert(acadosSearchResults.length === 0, "searchProjectContext in AcadOS returns 0 CareerOS matches");

    const careerSearchResults = searchProjectContext(careerOsRoot, "prerequisites graph");
    assert(careerSearchResults.length === 0, "searchProjectContext in CareerOS returns 0 AcadOS matches");

    // Path Jailing Security Test
    let traversalBlocked = false;
    try {
      assertWithinProject("../../CareerOS/.project-context", acadosRoot);
    } catch (e) {
      if (e.code === "PATH_TRAVERSAL_DETECTED") {
        traversalBlocked = true;
      }
    }
    assert(traversalBlocked, "assertWithinProject successfully blocks path traversal escape attempt");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: Diagnostic Doctor on Clean Project
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 4. Diagnostic Doctor on Independent Repository ──");

    const docResult = runDoctor(acadosRoot);
    assert(docResult.healthy === true, "runDoctor reports healthy = true on clean AcadOS project");
    assert(docResult.project.name === "AcadOS", "Doctor identifies project as 'AcadOS'");
    assert(docResult.score >= 80, `Doctor health score is high (${docResult.score}%)`);

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: Multi-Agent H0 Lifecycle in AcadOS (Agent A -> Agent B)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── 5. Autonomous Multi-Agent H0 Recovery on AcadOS ──");

    // Step 5.1: Agent A enters AcadOS
    const bootA = getAgentBootstrap(acadosRoot, { agent: "acad-agent-a" });
    assert(bootA.project.name === "AcadOS", "Agent A bootstraps: project is 'AcadOS'");

    // Step 5.2: Agent A registers task and session
    createTask(acadosRoot, {
      id: "ACAD-002",
      title: "Course Catalog Implementation",
      status: "IN_PROGRESS",
      priority: "HIGH",
      owner: "acad-agent-a",
      description: "Implement core catalog classes in src/catalog.ts.",
    });

    startSession(acadosRoot, {
      agent: "acad-agent-a",
      task: "ACAD-002",
      task_title: "Course Catalog Implementation",
      working_area: ["src/catalog.ts"],
    });

    // Step 5.3: Agent A performs code modification in AcadOS
    const srcDir = path.join(acadosRoot, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const catalogFile = path.join(srcDir, "catalog.ts");
    fs.writeFileSync(
      catalogFile,
      `export interface Course { id: string; title: string; credits: number; }\n` +
      `export class CourseCatalog {\n  private courses: Course[] = [];\n  addCourse(c: Course) { this.courses.push(c); }\n}\n`,
      "utf-8"
    );

    // Step 5.4: Agent A records semantic changelog
    recordChange(acadosRoot, {
      task_id: "ACAD-002",
      summary: "Implemented CourseCatalog interface and class in src/catalog.ts",
      details: ["Defined Course interface with credits", "Implemented CourseCatalog addCourse"],
      files: ["src/catalog.ts"],
      author: "acad-agent-a",
    });

    // Step 5.5: Agent A ends session with handoff targeted to Agent B
    const handoffA = assistedSessionEnd(acadosRoot, {
      agent: "acad-agent-a",
      to_agent: "acad-agent-b",
      task_id: "ACAD-002",
      task_title: "Course Catalog Implementation",
      summary: "Created CourseCatalog class in src/catalog.ts",
      files_changed: ["src/catalog.ts"],
      next_action: "Extend CourseCatalog with findCourseById method and verify.",
    });
    assert(handoffA.success === true, "Agent A completed session with immutable handoff");

    // Step 5.6: Agent B starts COLD (zero verbal prompt, zero prior memory)
    const bootB = getAgentBootstrap(acadosRoot, { agent: "acad-agent-b" });
    assert(bootB.project.name === "AcadOS", "Agent B cold bootstrap: identifies project 'AcadOS'");
    assert(
      bootB.latest_handoff?.from_agent === "acad-agent-a",
      "Agent B discovers handoff from 'acad-agent-a'"
    );
    assert(
      bootB.latest_handoff?.next_action.includes("findCourseById"),
      "Agent B extracts exact next action mentioning findCourseById (H0 recovery)"
    );
    assert(
      bootB.latest_handoff?.files_changed.includes("src/catalog.ts"),
      "Agent B identifies modified file 'src/catalog.ts'"
    );

    // Step 5.7: Agent B executes continuation without human guidance
    fs.appendFileSync(
      catalogFile,
      `  findCourseById(id: string) { return this.courses.find(c => c.id === id); }\n`,
      "utf-8"
    );

    updateTask(acadosRoot, "ACAD-002", {
      status: "COMPLETED",
      notes: "Implemented findCourseById method.",
    });

    const finalTasks = readTasks(acadosRoot);
    const completedTask = finalTasks.tasks.find((t) => t.id === "ACAD-002");
    assert(completedTask?.status === "COMPLETED", "Agent B completed ACAD-002 autonomously");

    console.log("  ✓ AcadOS Multi-Agent H0 Recovery verified cleanly.");

  } finally {
    // Clean up temporary sandbox directory
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on windows locks
    }
  }

  console.log("\nCross-Project Portability & Isolation: All assertions passed.\n");
}
