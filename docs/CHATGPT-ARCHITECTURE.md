# PROJECT CONTEXT OS — CHATGPT WEB INTEGRATION ARCHITECTURE (ARCHIVED EXPLORATION)

> [!NOTE]
> **ARCHITECTURAL DECISION (2026-09-03)**:
> The remote HTTP/MCP/OAuth bridge described below was explored as an experimental option and has been **permanently abandoned** for production.
> The official, canonical integration mechanism for ChatGPT across all projects (including CareerOS) is the **portable snapshot workflow** (`project-context snapshot`).
> Local coding agents (Antigravity, Kilo Code, Claude, OmniRoute) connect directly via local STDIO MCP.

## A. Executive Recommendation

**Recommended Architecture: Option C — Local Bridge / Tunnel via HTTP Gateway**

Direct Local STDIO (Option A) is impossible for ChatGPT Web since web browsers cannot execute local processes or establish native STDIO pipes. An arbitrary local HTTP server cannot be queried securely without mixed-content/CORS violations or exposing local ports. The most secure, standard-compliant approach to integrating ChatGPT Custom Apps with `@project-context/core` is to use an **HTTP Gateway acting as an MCP-to-OpenAPI bridge**, accessible via a Secure Tunnel. 

This architecture allows ChatGPT to treat Project Context OS as a standard Custom GPT Action (using an OpenAPI schema) while keeping `@project-context/core` frozen and maintaining full context localization. The bridge translates REST/HTTP requests from ChatGPT into the standard MCP interface used by the local core.

## B. OpenAI Capability Matrix

| Capability | Status | Evidence | Implication |
| ---------- | ------ | -------- | ----------- |
| Custom Apps via OpenAPI/Actions | SUPPORTED | Official GPT Actions documentation | We can define an OpenAPI spec for ChatGPT to interact with our bridge. |
| Direct Remote MCP Support | SUPPORTED WITH CONDITIONS | "Developer Mode" and enterprise "Apps in ChatGPT" | Direct MCP is rolling out, but Custom GPTs currently prefer REST OpenAPI. A bridge handles both. |
| Web-to-Local STDIO MCP | NOT SUPPORTED | Browser sandbox and security limits | ChatGPT Web cannot directly spawn local binaries via STDIO. |
| OAuth/API Key Auth | SUPPORTED | GPT Actions authentication configurations | We can secure the tunnel endpoint with a secret token. |
| Tool Approval/Confirmation | SUPPORTED | GPT Actions natively prompt users for confirmation on destructive writes | Aligns perfectly with our Safe Write vs Confirmation Required matrix. |
| Local Tunneling | SUPPORTED | OpenAI Secure MCP Tunnel / Third-party tunnels (ngrok/Cloudflare) | Exposes the local bridge securely without public IP or firewall changes. |

## C. Architecture Diagram

```mermaid
flowchart TD
    subgraph OpenAI Cloud
        CGPT[ChatGPT Web / Custom GPT]
    end

    subgraph Internet Boundary
        Tunnel[Secure HTTPS Tunnel / Cloudflare / ngrok]
    end

    subgraph Local Machine
        subgraph ChatGPT Integration
            Adapter[Project Context HTTP/OpenAPI Bridge]
        end
        
        subgraph Project Context OS
            Core[@project-context/core v4.0.0 (Frozen)]
            MCP[STDIO MCP Server]
        end
        
        subgraph Projects
            CareerOS[CareerOS/.project-context/]
            AcadOS[AcadOS/.project-context/]
        end
        
        Kilo[Kilo Code / OmniRoute]
        Antigravity[Antigravity IDE]
    end

    CGPT -- "OpenAPI REST / API Key" --> Tunnel
    Tunnel -- "Forward Request" --> Adapter
    Adapter -- "JSON-RPC (STDIO or Local HTTP)" --> Core
    Core -- "Read/Write" --> CareerOS
    
    Kilo -- "STDIO JSON-RPC" --> Core
    Antigravity -- "STDIO JSON-RPC" --> Core
    
    %% Isolation
    Core -. "Isolated" .- AcadOS
```

## D. Tool Exposure Matrix

Not all 29 tools should be freely exposed to ChatGPT. We classify them into four categories:

### A. SAFE READ (16 tools)
*Exposed directly. No user confirmation required.*
- `get_project_state`
- `get_active_work`
- `get_tasks`
- `get_recent_changes`
- `get_recent_handoffs`
- `get_architecture`
- `get_decisions`
- `search_project_context`
- `get_git_status`
- `get_git_diff`
- `get_context_snapshot`
- `get_context_health`
- `get_relevant_context`
- `check_context_drift`
- `get_attention_items`
- `list_agent_sessions`

### B. SAFE WRITE (4 tools)
*Exposed directly. Handles local agent lifecycle without modifying project canonical truth.*
- `bootstrap_context`
- `start_agent_session`
- `heartbeat_session`
- `update_active_work`

### C. CONFIRMATION REQUIRED (7 tools)
*Exposed to ChatGPT, but the OpenAPI schema/Action configuration requires explicit user confirmation before execution.*
- `update_project_state`
- `create_task`
- `update_task`
- `record_decision`
- `record_change`
- `create_handoff`
- `end_agent_session`

### D. ADMIN / SHOULD NOT BE EXPOSED (2 tools)
*Removed from the ChatGPT OpenAPI schema entirely to prevent unintended corruption of other concurrent agents.*
- `check_context_consistency`
- `recover_stale_sessions`

## E. Security Model

1. **Authentication:** The Custom GPT is configured with a Bearer Token (API Key) shared only between the GPT Action and the Local Bridge. The Local Bridge rejects all unauthenticated requests.
2. **Authorization:** The Bridge acts as a Principle of Least Privilege proxy, mapping the ChatGPT OpenAPI requests to the restricted subset of MCP tools.
3. **Write Protection:** By flagging destructive write endpoints in the GPT Action schema as requiring user confirmation, ChatGPT handles user consent natively before the HTTP request is even dispatched.
4. **Symlink / Traversal Mitigation:** The core `v4.0.0` lexical path normalization remains the primary defense. The Bridge does not expose absolute path parameters; it strictly passes project identifiers that the Bridge maps to internal absolute paths.

## F. Project Identity Model

To prevent ChatGPT from accidentally crossing context boundaries (e.g., modifying `AcadOS` while working on `CareerOS`):
- The Local Bridge maintains a **Project Registry** (`projects.json`), mapping Project IDs to local filesystem roots (e.g., `career-os -> C:/Users/.../CareerOS`).
- The GPT Action is configured with an environment variable or header `X-Project-ID`.
- ChatGPT Web never passes filesystem paths. It passes the semantic ID `career-os`. The Bridge resolves this ID against the registry and spawns/routes to the correct `@project-context/core` instance.
- This ensures 100% strict isolation. If ChatGPT guesses `acad-os`, it is rejected unless that project ID is explicitly bound to that specific GPT Action.

## G. Local/Remote Deployment Model

### Local Development (Testing the Integration)
- The developer runs `node bin/chatgpt-bridge.js --dev`.
- A local HTTP server starts on `localhost:3000`.
- The developer tests API requests directly against `localhost` using `curl` or Postman.

### Production (Real ChatGPT Use)
- The developer runs `npx project-context-chatgpt tunnel --project career-os`.
- A secure Cloudflare Tunnel (or similar) opens: `https://career-os-random.trycloudflare.com`.
- This URL is pasted into the ChatGPT Custom GPT Action configuration along with the API Key.
- ChatGPT Web communicates securely over the public internet to the local machine, restricted to the `career-os` project workspace.

## H. Step 4C Implementation Plan

1. **Create Integration Package:** Create `project-context-chatgpt/` outside of the core, containing an Express/Fastify server.
2. **Implement Tool Mapping:** Map the 27 allowed MCP tools (A, B, C) to REST endpoints.
3. **Generate OpenAPI Schema:** Generate the `openapi.yaml` required for ChatGPT Custom Actions.
4. **Implement Project Registry:** Add the `Project ID -> Local Path` mapping logic to ensure path isolation.
5. **Add Authentication:** Implement a simple Bearer token validation middleware.
6. **Test Bridge Locally:** Verify the bridge can invoke `@project-context/core v4.0.0` over STDIO/Local MCP.

## I. Acceptance Test Plan

**1. Discovery & Authentication:**
- **Pass:** Unauthenticated requests to the bridge are rejected with 401.
- **Pass:** ChatGPT successfully loads the OpenAPI schema and retrieves the active tasks.

**2. Project Isolation:**
- **Pass:** A request for `career-os` retrieves CareerOS context. A request for `acad-os` retrieves AcadOS context.
- **Pass:** Path traversal attempts (`../`) in project IDs are rejected by the bridge.

**3. Cross-Client Continuity (CRITICAL):**
- **Test:** ChatGPT uses `record_decision` to log an architectural choice.
- **Test:** Antigravity runs `bootstrap_context` and immediately sees the new decision.
- **Test:** Antigravity modifies a task status via MCP.
- **Test:** ChatGPT queries `get_tasks` and sees the status update.
- **Pass:** Both agents seamlessly collaborate over the identical `.project-context` directory.

**4. Model Independence:**
- **Pass:** The integration works flawlessly whether the Custom GPT uses GPT-4o, GPT-4, or any future OpenAI model, as the context is deterministically injected.

## J. Risks / Limitations

- **BLOCKERS:** None. The HTTP Gateway architecture is fully supported by existing technologies.
- **CONDITIONS:** The local machine must be turned on and the secure tunnel must be running for ChatGPT Web to access the project context.
- **NON-BLOCKING LIMITATIONS:** 
  - ChatGPT UI does not natively support continuous background sync; context retrieval is strictly request/response during the user's conversation.
  - Symlink canonicalization remains a known limitation of the core `v4.0.0` path jail.
- **FUTURE HARDENING:** 
  - Implementing true symlink resolution in the core path jail.
  - Moving from REST OpenAPI to native Remote MCP as OpenAI's direct MCP support matures for standard web users.

## K. Decision

**ARCHITECTURE APPROVED**
