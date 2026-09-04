import { spawn } from 'child_process';
import assert from 'assert';

const PORT = 3001;
const API_URL = `http://127.0.0.1:${PORT}/api/projects`;
const HEADERS = {
  'Authorization': 'Bearer test-secret-token-for-ci',
  'Content-Type': 'application/json'
};

async function testFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch(e) {}
  return { status: res.status, headers: res.headers, data, text };
}

async function runTests() {
  console.log("Starting security test server...");
  const server = spawn('node', ['server.js'], { 
    env: { ...process.env, PORT: PORT.toString(), CHATGPT_API_KEY: 'test-secret-token-for-ci' }
  });
  
  // Collect server output to check for leaks
  let serverOutput = '';
  server.stdout.on('data', d => serverOutput += d.toString());
  server.stderr.on('data', d => serverOutput += d.toString());

  await new Promise(resolve => setTimeout(resolve, 1500));

  let passed = 0;
  let failed = 0;

  async function assertStatus(name, url, options, expectedStatus) {
    const res = await testFetch(url, options);
    if (res.status === expectedStatus) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} - Expected ${expectedStatus}, got ${res.status}`);
      failed++;
    }
    return res;
  }

  try {
    // 1. Authentication
    await assertStatus('Missing token', `${API_URL}/career-os/state`, {}, 401);
    await assertStatus('Invalid token', `${API_URL}/career-os/state`, { headers: { 'Authorization': 'Bearer wrong' } }, 401);
    await assertStatus('Malformed token', `${API_URL}/career-os/state`, { headers: { 'Authorization': 'Basic test-secret-token-for-ci' } }, 401);
    await assertStatus('Valid token', `${API_URL}/career-os/state`, { headers: HEADERS }, 200);

    // 2. Path security & Project isolation
    await assertStatus('Valid CareerOS', `${API_URL}/career-os/state`, { headers: HEADERS }, 200);
    await assertStatus('Unknown project', `${API_URL}/unknown-os/state`, { headers: HEADERS }, 404);
    await assertStatus('Parent traversal', `${API_URL}/../career-os/state`, { headers: HEADERS }, 404);
    await assertStatus('Deep traversal', `${API_URL}/%2e%2e%2fcareer-os/state`, { headers: HEADERS }, 404);
    await assertStatus('Absolute path', `${API_URL}/C:%5CUsers%5CAGP/state`, { headers: HEADERS }, 404);

    // 3. HTTP Methods & Routes
    await assertStatus('Unsupported method', `${API_URL}/career-os/state`, { method: 'PUT', headers: HEADERS }, 405);
    await assertStatus('Unknown endpoint', `${API_URL}/career-os/nonexistent`, { headers: HEADERS }, 404);

    // 4. Rate limiting (make 100 requests)
    let rateLimited = false;
    for (let i=0; i<150; i++) {
      const res = await fetch(`${API_URL}/career-os/state`, { headers: HEADERS });
      if (res.status === 429) rateLimited = true;
    }
    if (rateLimited) {
      console.log(`[PASS] Rate limiting triggered`);
      passed++;
    } else {
      console.error(`[FAIL] Rate limiting not triggered`);
      failed++;
    }

    // 5. Information disclosure in errors
    // Trigger an error by sending bad payload to POST /tasks
    const errRes = await testFetch(`${API_URL}/career-os/tasks`, { 
      method: 'POST', headers: HEADERS, body: '{"title":}' // bad JSON
    });
    if (errRes.status === 400 && !errRes.text.includes('C:\\')) {
      console.log(`[PASS] Information disclosure (Syntax error)`);
      passed++;
    } else {
      console.error(`[FAIL] Information disclosure (Syntax error) - Status: ${errRes.status}, Body: ${errRes.text}`);
      failed++;
    }

  } finally {
    server.kill();
    console.log(`\nSecurity Tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  }
}

runTests();
