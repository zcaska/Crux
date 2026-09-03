/**
 * Project Context OS — Project Configuration Engine
 *
 * Reads and manages .project-context/config.json, declaring project identity,
 * schema version, and project-specific invariant rules without polluting the universal core.
 */

import fs from "node:fs";
import path from "node:path";
import { getContextDir, readFileSafe } from "./core.js";
import { assertWithinProject } from "./locator.js";

export const DEFAULT_SCHEMA_VERSION = "1.0.0";

/**
 * Reads the project configuration.
 * @param {string} rootDir
 * @returns {object} Parsed project configuration
 */
export function readProjectConfig(rootDir) {
  const contextDir = getContextDir(rootDir);
  const configPath = path.join(contextDir, "config.json");

  const raw = readFileSafe(configPath);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // Return fallback on parse failure
    }
  }

  // Sensible default when config.json does not yet exist
  const baseName = path.basename(path.resolve(rootDir)) || "Project";
  return {
    schema_version: DEFAULT_SCHEMA_VERSION,
    project_id: baseName.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
    project_name: baseName,
    description: "Software Project Context",
    created_at: new Date().toISOString(),
    invariants: {},
  };
}

/**
 * Writes or updates the project configuration.
 * @param {string} rootDir
 * @param {object} configData
 * @returns {object} Updated configuration
 */
export function writeProjectConfig(rootDir, configData) {
  const contextDir = getContextDir(rootDir);
  const configPath = assertWithinProject(path.join(contextDir, "config.json"), rootDir);

  const existing = readProjectConfig(rootDir);
  const merged = {
    ...existing,
    ...configData,
    updated_at: new Date().toISOString(),
  };

  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  return merged;
}

/**
 * Returns project identity metadata.
 * @param {string} rootDir
 * @returns {{ id: string, name: string, description: string, schema_version: string }}
 */
export function getProjectIdentity(rootDir) {
  const cfg = readProjectConfig(rootDir);
  return {
    id: cfg.project_id || path.basename(rootDir).toLowerCase(),
    name: cfg.project_name || path.basename(rootDir),
    description: cfg.description || "",
    schema_version: cfg.schema_version || DEFAULT_SCHEMA_VERSION,
  };
}
