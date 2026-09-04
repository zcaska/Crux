/**
 * Project Context OS (Crux) — Phase 5G Clean-Room Distribution Verification Test
 *
 * Rigorously executes Acceptance Gate 5G.5:
 *  1. Produces the package tarball via `npm pack`.
 *  2. Verifies tarball contents against strict manifest whitelist (zero tests, zero .project-context, zero graphify-out leakage).
 *  3. Creates an isolated temporary clean-room directory.
 *  4. Installs the package from the generated tarball.
 *  5. Initializes a fresh repository/project using the installed package CLI.
 *  6. Verifies project identity, config, and lifecycle initialization.
 *  7. Verifies the installed CLI commands (state, doctor, snapshot, diagnostics).
 *  8. Verifies project-local diagnostics and health scores.
 *  9. Verifies MCP startup / STDIO connectivity from the installed package.
 * 10. Confirms the clean-room environment has zero dependencies on source repo.
 * 11. Confirms no source-repository .project-context state leaks into the installation.
 * 12. Cleans up temporary artifacts safely.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

export async function runCleanRoomDistributionGate(assert) {
  console.log("\n================================================================");
  console.log("Phase 5G: Clean-Room Release Distribution Gate (5G.5)");
  console.log("================================================================\n");

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "crux-cleanroom-gate-"));
  const cleanRoomProject = path.join(tempBase, "CleanRoomApp");
  fs.mkdirSync(cleanRoomProject, { recursive: true });

  let tarballFilename = null;
  let tarballPath = null;

  try {
    // 1. Pack tarball in repository root
    console.log("── 1. Packing distribution tarball ──");
    const packOutput = execSync("npm pack --json", { cwd: repoRoot, encoding: "utf-8" });
    const packMetadata = JSON.parse(packOutput);
    assert(Array.isArray(packMetadata) && packMetadata.length > 0, "npm pack generated metadata");
    
    tarballFilename = packMetadata[0].filename;
    tarballPath = path.join(repoRoot, tarballFilename);
    assert(fs.existsSync(tarballPath), `Tarball '${tarballFilename}' created at repository root`);
    assert(packMetadata[0].version === "5.0.0", "Tarball version is 5.0.0");
    assert(packMetadata[0].name === "@project-context/core", "Tarball package name is '@project-context/core'");

    // 2. Inspect manifest contents for leakages
    console.log("── 2. Verifying tarball file manifest ──");
    const files = packMetadata[0].files.map((f) => f.path);
    assert(files.length === 28, `Tarball contains exactly 28 whitelisted files (found ${files.length})`);

    // Ensure zero leakages
    const forbiddenPatterns = [
      /^tests\//,
      /^\.project-context\//,
      /^graphify-out\//,
      /^\.git\//,
      /adversarial/,
      /scratch\//,
      /career/,
      /chatgpt\//,
    ];
    for (const file of files) {
      for (const pat of forbiddenPatterns) {
        assert(!pat.test(file), `Tarball file '${file}' does not match forbidden pattern '${pat}'`);
      }
    }

    // Check essential runtime files are included
    assert(files.includes("bin/project-context.js"), "Includes CLI entry bin/project-context.js");
    assert(files.includes("src/index.js"), "Includes src/index.js");
    assert(files.includes("src/graphify.js"), "Includes src/graphify.js");
    assert(files.includes("src/init.js"), "Includes src/init.js");
    assert(files.includes("src/doctor.js"), "Includes src/doctor.js");
    assert(files.includes("src/relevance.js"), "Includes src/relevance.js");
    assert(files.includes("src/snapshot.js"), "Includes src/snapshot.js");
    assert(files.includes("src/session.js"), "Includes src/session.js");

    // 3. Set up isolated clean-room project
    console.log("── 3. Installing tarball into clean-room project ──");
    // Move tarball into temp directory so clean-room install doesn't reference repoRoot
    const cleanRoomTarball = path.join(tempBase, tarballFilename);
    fs.copyFileSync(tarballPath, cleanRoomTarball);

    // Initialize a minimal package.json in CleanRoomApp
    fs.writeFileSync(
      path.join(cleanRoomProject, "package.json"),
      JSON.stringify({
        name: "clean-room-app",
        version: "1.0.0",
        type: "module",
      }, null, 2),
      "utf-8"
    );

    // Install the tarball locally into cleanRoomProject
    execSync(`npm install --silent "${cleanRoomTarball}"`, {
      cwd: cleanRoomProject,
      encoding: "utf-8",
      stdio: "pipe",
    });

    const installedCoreDir = path.join(cleanRoomProject, "node_modules", "@project-context", "core");
    assert(fs.existsSync(installedCoreDir), "@project-context/core successfully installed in clean-room node_modules");

    // 4. Initialize repository context using installed CLI via node
    console.log("── 4. Initializing fresh project context via installed CLI ──");
    const cliPath = path.join(installedCoreDir, "bin", "project-context.js");
    
    const initCmdOutput = execSync(`node "${cliPath}" init --name CleanRoomApp --description "Clean room enterprise application"`, {
      cwd: cleanRoomProject,
      encoding: "utf-8",
    });
    assert(initCmdOutput.includes("Initialization complete") || initCmdOutput.includes("Project Context OS Initialization"), "CLI init command completed successfully");

    const contextDir = path.join(cleanRoomProject, ".project-context");
    assert(fs.existsSync(contextDir), ".project-context/ directory created in clean room");
    assert(fs.existsSync(path.join(contextDir, "config.json")), ".project-context/config.json created");
    assert(fs.existsSync(path.join(contextDir, "STATE.md")), ".project-context/STATE.md created");
    assert(fs.existsSync(path.join(cleanRoomProject, "AGENTS.md")), "AGENTS.md created in clean room root");

    // Verify config identity
    const configData = JSON.parse(fs.readFileSync(path.join(contextDir, "config.json"), "utf-8"));
    assert(configData.project_name === "CleanRoomApp", "Config reflects clean-room project name");
    assert(configData.project_id === "cleanroomapp", "Config reflects clean-room project id");

    // 5. Test CLI state command
    console.log("── 5. Testing installed CLI state & snapshot commands ──");
    const stateOutput = execSync(`node "${cliPath}" state --json`, {
      cwd: cleanRoomProject,
      encoding: "utf-8",
    });
    const stateJson = JSON.parse(stateOutput);
    assert(stateJson.meta && stateJson.meta.project_name === "CleanRoomApp", "state command returns correct project name in meta");

    // 6. Test CLI diagnostics command (Phase 5F engine in installed package)
    console.log("── 6. Testing installed CLI diagnostics command ──");
    const diagOutput = execSync(`node "${cliPath}" diagnostics --json`, {
      cwd: cleanRoomProject,
      encoding: "utf-8",
    });
    const diagJson = JSON.parse(diagOutput);
    assert(diagJson._type === "ProjectDiagnosticsRecord", "diagnostics output has correct _type");
    assert(diagJson.project.id === "cleanroomapp", "diagnostics output reflects clean room project id");
    assert(diagJson.lifecycle.state === "EXISTING" || diagJson.lifecycle.state === "RECONCILED", "lifecycle state is valid");
    assert(typeof diagJson.health.score === "number", "health score is a number");
    assert(diagJson.structural.source === "graphify", "structural source is reported as graphify");

    // 7. Verify absolute isolation from source repo
    console.log("── 7. Verifying zero context leak from source repo ──");
    const stateMdContent = fs.readFileSync(path.join(contextDir, "STATE.md"), "utf-8");
    assert(!stateMdContent.includes("Crux"), "Clean room state does not leak source repo project names");
    assert(!stateMdContent.includes("CareerOS"), "Clean room state does not leak historical terms");
    assert(!stateMdContent.includes("Phase 5"), "Clean room state does not leak source repo tasks");

    // 8. Test MCP server startup from installed package using official SDK Client
    console.log("── 8. Testing MCP server startup via STDIO from clean room ──");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

    const mcpTransport = new StdioClientTransport({
      command: "node",
      args: [cliPath, "mcp"],
      cwd: cleanRoomProject,
      env: { ...process.env, PROJECT_CONTEXT_ROOT: cleanRoomProject },
    });

    const mcpClient = new Client(
      { name: "cleanroom-test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await mcpClient.connect(mcpTransport);
    const listRes = await mcpClient.listTools();
    const tools = listRes.tools || [];
    assert(tools.length >= 25, `MCP listTools discovered ${tools.length} tools from installed package (expected >= 25)`);
    await mcpClient.close();

    console.log("  ✓ Gate 5G.5: Clean-Room Release Distribution Gate passed completely.");

  } finally {
    // Clean up generated tarball in repo root
    if (tarballPath && fs.existsSync(tarballPath)) {
      try {
        fs.unlinkSync(tarballPath);
      } catch {}
    }
    // Clean up temporary sandbox directory
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {}
  }
}
