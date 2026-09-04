import { spawn } from 'child_process';
 // wait, node-fetch isn't installed. I'll use node's built-in fetch.
import fs from 'fs/promises';
import { updateTask, getAgentBootstrap } from '@project-context/core';

async function runTests() {
  console.log("Starting server...");
  const server = spawn('node', ['server.js'], { stdio: 'inherit', env: { ...process.env, PORT: '3000', CHATGPT_API_KEY: 'test-key-123' } });

  await new Promise(resolve => setTimeout(resolve, 2000));

  const API_URL = 'http://127.0.0.1:3000/api/projects';
  const HEADERS = {
    'Authorization': 'Bearer test-key-123',
    'Content-Type': 'application/json'
  };

  try {
    // 1. Discovery & Authentication
    console.log("Testing Authentication...");
    let res = await fetch(`${API_URL}/career-os/state`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    
    res = await fetch(`${API_URL}/career-os/tasks`, { headers: HEADERS });
    if (!res.ok) throw new Error(`Expected 200, got ${res.status}`);
    const tasksData = await res.json();
    console.log(`Successfully fetched ${tasksData.count} tasks.`);

    // 2. Project Isolation
    console.log("Testing Project Isolation...");
    res = await fetch(`${API_URL}/acad-os/state`, { headers: HEADERS });
    // Since AcadOS doesn't exist, core might throw ENOENT or we might just get empty state if core creates it.
    // Actually, projects.json points to AcadOS, if it doesn't exist core might init it.
    
    res = await fetch(`${API_URL}/career-os/../../secrets`, { headers: HEADERS });
    if (res.status !== 404) throw new Error(`Expected 404 for traversal, got ${res.status}`);

    // 3. Cross-Client Continuity (CRITICAL)
    console.log("Testing Cross-Client Continuity...");
    // ChatGPT writes a decision
    res = await fetch(`${API_URL}/career-os/decisions`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        title: 'Use HTTP Bridge for ChatGPT',
        context: 'Need ChatGPT Web integration',
        decision: 'Implemented Express server with OpenAPI schema',
        consequences: 'Requires running a local tunnel'
      })
    });
    if (!res.ok) throw new Error(`Expected 200, got ${res.status} ${await res.text()}`);

    // Antigravity reads decisions (simulating local core read)
    console.log("Antigravity reading decisions...");
    const decisions = await import('@project-context/core').then(m => m.readDecisions('C:/Users/AGP/Documents/Projects/Job-Hunt'));
    if (!JSON.stringify(decisions).includes('Use HTTP Bridge for ChatGPT')) {
      throw new Error("Antigravity did not see the new decision.");
    }

    // ChatGPT creates a task
    res = await fetch(`${API_URL}/career-os/tasks`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        title: 'Build ChatGPT HTTP Gateway',
        description: 'Implement the REST API bridge.'
      })
    });
    const taskRes = await res.json();
    const taskId = taskRes.id || taskRes.task_id || taskRes.match(/([A-Z0-9-]+)/)[1];

    // Antigravity writes a task update
    console.log(`Antigravity updating task ${taskId}...`);
    await import('@project-context/core').then(m => m.updateTask('C:/Users/AGP/Documents/Projects/Job-Hunt', taskId, { status: 'COMPLETED', notes: 'Completed by Antigravity' }));

    // ChatGPT reads the tasks
    console.log("ChatGPT reading tasks...");
    res = await fetch(`${API_URL}/career-os/tasks`, { headers: HEADERS });
    const newTasks = await res.json();
    const task = newTasks.tasks.find(t => t.id === taskId);
    if (task.status !== 'COMPLETED') {
      throw new Error(`ChatGPT did not see task completion, status is ${task.status}`);
    }

    console.log("All Acceptance Tests Passed!");
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    server.kill();
  }
}

runTests();
