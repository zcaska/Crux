# Project Context OS — ChatGPT Experimental Bridge (ARCHIVED)

> [!WARNING]
> **STATUS: EXPERIMENTAL / ABANDONED**
> This repository was an exploratory implementation of an Express-based REST & Native MCP HTTP/SSE/OAuth bridge for ChatGPT.
> 
> Production decision:
> **CareerOS permanently uses the canonical SNAPSHOT workflow (`project-context snapshot`) for ChatGPT.**
> 
> CareerOS has **ZERO dependency** on this repository or any component herein.
> This repository is strictly isolated and outside the CareerOS project boundary.

## Contents
- `server.js` — Express REST API gateway and bridge routes
- `mcp-adapter.js` — Experimental MCP SSE transport & OAuth 2.1 authorization server
- `openapi.yaml` — OpenAPI 3.1 specification for experimental GPT actions
- `projects.json` — Semantic project alias map (career-os -> local filesystem path)
- `tests.js`, `test_mcp.js`, `test_oauth.js`, `security_tests.js` — Test harnesses for local experimental validation
