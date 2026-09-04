
import crypto from 'crypto';
import { spawn } from 'child_process';

function base64URLEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest();
}

async function runTests() {
  console.log("Starting server...");
  const server = spawn('node', ['server.js'], { 
    stdio: 'inherit', 
    env: { ...process.env, PORT: '3000', CHATGPT_API_KEY: 'test-key-123' } 
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    const codeVerifier = crypto.randomBytes(32).toString('hex');
    const codeChallenge = base64URLEncode(sha256(codeVerifier));
    
    // 0. Test Discovery
    const discoveryRes = await fetch('http://127.0.0.1:3000/api/projects/career-os/oauth/.well-known/oauth-authorization-server');
    if (!discoveryRes.ok) throw new Error("Discovery failed");
    const discovery = await discoveryRes.json();
    console.log("Discovery metadata scopes supported:", discovery.scopes_supported);

    // 1. Authorize GET
    const authUrl = `http://127.0.0.1:3000/api/projects/career-os/oauth/authorize?response_type=code&client_id=chatgpt&redirect_uri=http://127.0.0.1/callback&state=123&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    let res = await fetch(authUrl);
    if (!res.ok) throw new Error("GET /authorize failed");
    console.log("GET /authorize rendered HTML correctly.");

    // 2. Authorize POST
    res = await fetch('http://127.0.0.1:3000/api/projects/career-os/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'chatgpt',
        redirect_uri: 'http://127.0.0.1/callback',
        state: '123',
        code_challenge: codeChallenge
      }),
      redirect: 'manual' // so we can catch the Location header
    });
    
    if (res.status !== 302) throw new Error("Expected redirect");
    const loc = res.headers.get('location');
    const url = new URL(loc);
    const code = url.searchParams.get('code');
    console.log("Received authorization code:", code);

    // 3. Token POST
    res = await fetch('http://127.0.0.1:3000/api/projects/career-os/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: 'chatgpt',
        redirect_uri: 'http://127.0.0.1/callback',
        code_verifier: codeVerifier
      })
    });

    if (!res.ok) throw new Error(`Token request failed: ${await res.text()}`);
    const tokenData = await res.json();
    console.log("Received tokens:", tokenData);

    // 4. Test MCP API with the new access_token!
    // Since MCP SSE uses normal Express requests, we can just test any REST endpoint with this token.
    res = await fetch('http://127.0.0.1:3000/api/projects/career-os/state', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    if (!res.ok) throw new Error(`REST request with OAuth token failed: ${await res.text()}`);
    console.log("Successfully authenticated using OAuth access_token!");

    // 5. Test refresh token
    res = await fetch('http://127.0.0.1:3000/api/projects/career-os/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenData.refresh_token,
        client_id: 'chatgpt'
      })
    });
    if (!res.ok) throw new Error(`Refresh token failed: ${await res.text()}`);
    const refreshData = await res.json();
    console.log("Successfully refreshed token:", refreshData);

    console.log("OAuth tests passed!");
  } finally {
    server.kill();
  }
}

runTests();
