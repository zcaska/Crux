/**
 * Project Context OS — Phase 4 Core Decoupling & Boundary Verification Suite
 *
 * Statically and behaviorally proves that the reusable engine in tools/project-context/src/
 * is completely decoupled from CareerOS application code, schemas, and terminology.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initProjectContext, readFileSafe } from "../src/index.js";

/**
 * Runs the decoupling and boundary test suite.
 * @param {string} rootDir
 * @param {function} assert
 */
export async function runDecouplingTests(rootDir, assert) {
  console.log("\n================================================================");
  console.log("Project Context OS — Core Decoupling & Boundary Suite");
  console.log("================================================================\n");

  const srcDir = path.join(rootDir, "tools", "project-context", "src");
  assert(fs.existsSync(srcDir), "tools/project-context/src directory exists");

  const srcFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith(".js"));

  // 1. Static Scan: No application imports from frontend/ or supabase/
  console.log("── 1. Static Scan: Separation of Dependency Layers ──");

  for (const file of srcFiles) {
    const fullPath = path.join(srcDir, file);
    const content = fs.readFileSync(fullPath, "utf-8");

    // Must not import from frontend
    const hasFrontendImport = /from\s+["'][^"']*frontend\//.test(content) || /require\(["'][^"']*frontend\//.test(content);
    assert(!hasFrontendImport, `File 'src/${file}' does not import from frontend/`);

    // Must not import from supabase application
    const hasSupabaseImport = /from\s+["'][^"']*supabase\//.test(content) || /require\(["'][^"']*supabase\//.test(content);
    assert(!hasSupabaseImport, `File 'src/${file}' does not import from supabase/`);
  }

  // 2. Package Boundaries: Core tool package.json
  console.log("\n── 2. Package Boundary Integrity ──");

  const corePkgPath = path.join(rootDir, "tools", "project-context", "package.json");
  assert(fs.existsSync(corePkgPath), "tools/project-context/package.json exists");
  const corePkg = JSON.parse(fs.readFileSync(corePkgPath, "utf-8"));

  assert(corePkg.name === "@project-context/core", "Core package name is '@project-context/core'");
  assert(corePkg.version === "4.0.0", "Core package version is 4.0.0");
  assert(!corePkg.dependencies["react"], "Core package does not depend on React");
  assert(!corePkg.dependencies["@supabase/supabase-js"], "Core package does not depend on Supabase");

  // 3. Clean-Room Parameterization Test: zero CareerOS terms in new project
  console.log("\n── 3. Clean-Room Template Parameterization ──");

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "decouple-test-"));
  const cleanAppRoot = path.join(tempBase, "CleanEnterpriseApp");
  fs.mkdirSync(cleanAppRoot, { recursive: true });

  try {
    initProjectContext(cleanAppRoot, {
      name: "CleanEnterpriseApp",
      description: "An independent enterprise business application",
    });

    const contextDir = path.join(cleanAppRoot, ".project-context");
    const filesToCheck = ["STATE.md", "TASKS.md", "ARCHITECTURE.md", "DECISIONS.md", "config.json"];

    for (const f of filesToCheck) {
      const p = path.join(contextDir, f);
      const text = readFileSafe(p) || "";

      assert(
        !text.includes("CareerOS"),
        `Clean project file '${f}' contains ZERO occurrences of 'CareerOS'`
      );
      assert(
        !text.includes("Job-Hunt"),
        `Clean project file '${f}' contains ZERO occurrences of 'Job-Hunt'`
      );
      assert(
        !text.includes("resume"),
        `Clean project file '${f}' contains ZERO occurrences of 'resume'`
      );
      assert(
        text.includes("CleanEnterpriseApp"),
        `Clean project file '${f}' correctly reflects project name 'CleanEnterpriseApp'`
      );
    }
  } finally {
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {}
  }

  console.log("\nCore Decoupling: All assertions passed.\n");
}
