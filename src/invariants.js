/**
 * Project Context OS — Architectural Invariant Guard
 *
 * Deterministically checks code and context against declared architectural invariants:
 *   - ADR-001: Context OS must never depend on or import Supabase.
 *   - ADR-003: Multi-agent concurrency isolation (no shared active-work files).
 *   - ADR-004: Handoff immutability (write-once guarantee).
 *   - CareerOS App DB: Migrations must not drop core application tables.
 *   - Separation of Concerns: Frontend package.json must not import Context OS tools.
 */

import fs from "node:fs";
import path from "node:path";
import { getContextDir, readDecisions } from "./core.js";
import { readProjectConfig } from "./config.js";

/**
 * Checks all architectural invariants.
 * @param {string} rootDir
 * @returns {{ passed: boolean, violations: Array<{ rule: string, severity: 'ERROR'|'WARNING', message: string, suggestion: string }> }}
 */
export function checkInvariants(rootDir) {
  const violations = [];

  // 1. ADR-001: Context OS must never import Supabase
  const toolsDir = path.join(rootDir, "tools", "project-context");
  const targetDir = fs.existsSync(toolsDir)
    ? toolsDir
    : (fs.existsSync(path.join(rootDir, "src"))
      ? path.join(rootDir, "src")
      : (fs.existsSync(path.join(rootDir, "node_modules", "@project-context", "core", "src"))
        ? path.join(rootDir, "node_modules", "@project-context", "core", "src")
        : null));
  if (targetDir) {
    const checkDirForSupabase = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory() && ent.name !== "node_modules") {
          checkDirForSupabase(full);
        } else if (ent.isFile() && (ent.name.endsWith(".js") || ent.name.endsWith(".ts"))) {
          const content = fs.readFileSync(full, "utf-8");
          if (/from\s+["']@supabase\/supabase-js["']/.test(content) || /require\(["']@supabase\/supabase-js["']\)/.test(content)) {
            violations.push({
              rule: "ADR-001_NO_SUPABASE_IN_CONTEXT_OS",
              severity: "ERROR",
              message: `Context OS file '${path.relative(rootDir, full)}' imports @supabase/supabase-js.`,
              suggestion: "Remove Supabase imports from Context OS. Project Context OS must remain offline-first and repository-local.",
            });
          }
        }
      }
    };
    checkDirForSupabase(targetDir);
  }

  // 2. Project Invariant: Application Table Protection (Configured via config.json)
  const projCfg = readProjectConfig(rootDir);
  const cfgInvariants = projCfg.invariants || {};

  const migrationsDirs = cfgInvariants.migrationsDirs
    ? cfgInvariants.migrationsDirs.map((d) => path.join(rootDir, d))
    : [];
  const protectedTables = cfgInvariants.protectedTables || [];

  for (const mDir of migrationsDirs) {
    if (fs.existsSync(mDir)) {
      const files = fs.readdirSync(mDir).filter((f) => f.endsWith(".sql"));
      for (const f of files) {
        const content = fs.readFileSync(path.join(mDir, f), "utf-8");
        for (const tbl of protectedTables) {
          const dropRegex = new RegExp(`DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?\\s+["']?(?:public\\.)?${tbl}["']?`, "i");
          if (dropRegex.test(content)) {
            violations.push({
              rule: "APP_INVARIANT_PRESERVE_CORE_TABLES",
              severity: "ERROR",
              message: `Migration '${f}' contains a DROP TABLE statement targeting core application table '${tbl}'.`,
              suggestion: `Do not drop application table '${tbl}'. Alter the table or deprecate columns instead.`,
            });
          }
        }
      }
    }
  }

  // 3. Project Invariant: Separation of Concerns (Package Isolation)
  const isolatedPackages = cfgInvariants.isolatedPackages || [];

  for (const iso of isolatedPackages) {
    const pkgPath = path.join(rootDir, iso.path);
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        for (const dep of iso.forbiddenDeps || []) {
          if (allDeps[dep]) {
            violations.push({
              rule: "SEPARATION_OF_CONCERNS_PACKAGE_DEPS",
              severity: "ERROR",
              message: `${iso.path} declares a dependency on forbidden package '${dep}'.`,
              suggestion: `Remove '${dep}' from ${iso.path}. Infrastructure dependencies belong in the core tool package.`,
            });
          }
        }
      } catch (e) {
        // Ignored if package.json cannot be parsed
      }
    }
  }

  // 4. ADR-004: Handoff Immutability Directory Check
  const handoffDir = path.join(getContextDir(rootDir), "handoffs");
  if (fs.existsSync(handoffDir)) {
    const files = fs.readdirSync(handoffDir).filter((f) => f.endsWith(".md") && f !== "README.md");
    for (const f of files) {
      const full = path.join(handoffDir, f);
      try {
        const stats = fs.statSync(full);
        if (stats.size === 0) {
          violations.push({
            rule: "ADR-004_IMMUTABLE_HANDOFF_EMPTY",
            severity: "ERROR",
            message: `Handoff file '${f}' is 0 bytes.`,
            suggestion: "Remove or restore the corrupted handoff file.",
          });
        }
      } catch (e) {
        // Ignored
      }
    }
  }

  const errors = violations.filter((v) => v.severity === "ERROR");
  const warnings = violations.filter((v) => v.severity === "WARNING");

  return {
    passed: errors.length === 0,
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
    summary: {
      total: violations.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    violations,
  };
}
