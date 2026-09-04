# REMOTE EXPOSURE (TUNNEL MODE)

This bridge is designed to be exposed to ChatGPT Web via a secure reverse proxy/tunnel.

## Architecture

```text
ChatGPT Web
   ↓  (HTTPS via OpenAPI Custom Action)
Cloudflare Tunnel / ngrok (Public Endpoint)
   ↓  (Secure Tunnel)
Local Proxy Client (e.g., cloudflared)
   ↓  (HTTP on 127.0.0.1:3000)
project-context-chatgpt (Bridge)
   ↓  (Local File I/O)
@project-context/core
```

## Tunnel Readiness
The bridge is fully structurally ready for a tunnel deployment:
- **Binding:** Binds to `127.0.0.1` locally, forcing the tunnel client to run on the same machine/network namespace.
- **Authentication:** Relies on the `Authorization: Bearer <API_KEY>` header forwarded unmodified by the tunnel. The tunnel should terminate HTTPS, then forward plain HTTP to the bridge.
- **Paths:** Expects relative `/api/projects/` paths, making it agnostic to the tunnel's external domain name.

## Configuration for Production Tunnel
1. Generate a strong, cryptographically secure `CHATGPT_API_KEY`.
2. Do **not** use `test-key-123`.
3. Set the key in your environment and start the bridge:
   ```bash
   $env:CHATGPT_API_KEY="<strong-secret>"
   node server.js
   ```
4. Start the tunnel, pointing it to `http://127.0.0.1:3000`.
5. Enter the public tunnel URL and your `<strong-secret>` token into the ChatGPT Custom Action configuration.
