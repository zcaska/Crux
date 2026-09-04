# STEP 4C.2: CHATGPT NATIVE MCP ADAPTER REPORT

## 1. Architecture & Protocol Requirements

Based on current official OpenAI and MCP SDK documentation:
1. **Remote MCP Transport:** ChatGPT Custom MCP apps require HTTP-based MCP transport.
2. **SSE vs Streamable HTTP:** The MCP SDK (v1.30.0) recently introduced `StreamableHTTPServerTransport` as the new standard, replacing SSE. However, the `@modelcontextprotocol/sdk` explicitly maintains backwards compatibility with `SSEServerTransport` (`/sse` + `/messages`). ChatGPT's UI historically asks for an SSE URL, making `SSEServerTransport` the safest initial target.
3. **Endpoint Structure:** ChatGPT expects an initialization URL (e.g., `/mcp/sse`) which returns the event stream, and a callback URL for JSON-RPC messages (e.g., `/mcp/messages?sessionId=...`).
4. **Tool Discovery:** Tool discovery happens inherently over the MCP protocol (via `tools/list` JSON-RPC requests).
5. **OAuth Requirements:** ChatGPT requires standard OAuth 2.0 (Authorization Code Flow) to securely delegate access to remote MCP servers, preventing the leakage of static credentials.
6. **No Auth / Mixed:** "No Auth" is strictly discouraged for public tunnel endpoints (like ngrok) because it leaves the local server entirely exposed to the internet. 
7. **Secure MCP Tunnel:** OpenAI's Secure MCP Tunnel establishes a reverse outbound connection, removing the need for ngrok and inherently tying the connection to the OpenAI Organization. This would allow "No Auth" securely. However, the `@openai/tunnel-client` is not globally available in this execution environment.

## 2. Transport Decision
**Decision:** Implement `SSEServerTransport` natively via `@modelcontextprotocol/sdk/server/sse.js`. 
- **Reason:** It is fully supported by the `@modelcontextprotocol/sdk` installed in `@project-context/core v4.0.0`, is widely compatible with current MCP clients, and seamlessly fits into the existing Express architecture. 

## 3. Authentication Decision
**Decision:** Implement a minimal local OAuth 2.0 Authorization Server alongside the MCP Resource Server.
- **Why not No Auth?** ngrok exposes the server to the public internet. No Auth would be a critical vulnerability.
- **Why not Static API Keys?** ChatGPT's UI does not support it for MCP.
- **OAuth Design:**
  - `GET /oauth/authorize`: Renders a local confirmation page.
  - `POST /oauth/approve`: Form submission that generates an `auth_code`.
  - `POST /oauth/token`: Exchanges `auth_code` for an `access_token` (valid for 1 hour).
  - `Middleware`: Protects `/mcp/*` by requiring `Authorization: Bearer <access_token>`.

## 4. MCP Adapter Design (Minimal Implementation Plan)

The adapter will instantiate a standalone `McpServer` to strictly control exposed capabilities, rather than blindly exposing all of `@project-context/core`.

```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { readState, readTasks } from "@project-context/core";

// 1. Initialize strictly sandboxed server
const mcpServer = new McpServer({ name: "ChatGPT-Bridge", version: "1.0.0" });

// 2. Register ONLY Read Tools
mcpServer.tool("getProjectState", "Get Project State", {}, async () => {
    return { content: [{ type: "text", text: JSON.stringify(readState(projectRoot)) }] };
});
mcpServer.tool("getTasks", "Get Tasks", {}, async () => {
    return { content: [{ type: "text", text: JSON.stringify(readTasks(projectRoot)) }] };
});

// 3. Mount SSE Transport
app.get('/mcp/sse', oauthMiddleware, async (req, res) => {
    const transport = new SSEServerTransport('/mcp/messages', res);
    transports[transport.sessionId] = transport;
    await mcpServer.connect(transport);
});
app.post('/mcp/messages', oauthMiddleware, async (req, res) => {
    await transports[req.query.sessionId].handlePostMessage(req, res, req.body);
});
```

## 5. Security Controls
- **REST Compatibility:** Existing REST routes and `openapi.yaml` remain intact and function independently.
- **Path Isolation:** The `projectRoot` remains securely jailed via `projects.json`.
- **OAuth Delegation:** Prevents static credential leakage.
- **Read-Only Enforced:** The MCP Server instantiation explicitly omits all write operations (e.g., `updateTask`, `recordDecision`).
- **Network:** Bound exclusively to `127.0.0.1:3000`.

## 6. Tunnel Decision
**Decision:** Retain ngrok temporarily for the local acceptance test. 
While OpenAI Secure MCP Tunnel is the superior production architecture for local agents, deploying it requires binary tunnel-clients that are not accessible right now. Ngrok + OAuth satisfies the immediate testing requirement securely.

## 7. Remaining Limitations
- **Stateful Auth:** The bridge must track OAuth tokens in memory, so server restarts will drop ChatGPT sessions.
- **ngrok Instability:** Free ngrok URLs change on restart, requiring ChatGPT UI reconfiguration.

## 8. Final Verdict
**MCP ADAPTER NOT READY**
*Reasoning:* The architectural design, OAuth requirements, and MCP SDK mapping are fully solved and documented above. However, per the directive *"Do not implement a fake OAuth flow merely to satisfy the UI"* and *"Do not invent an OAuth implementation until the exact ChatGPT requirements are established"*, I have drafted the minimal secure architecture but stopped short of modifying `server.js`. 

Awaiting explicit authorization to implement this OAuth/SSE layer and execute Phase 6 (Local Testing) to transition the verdict to READY.
