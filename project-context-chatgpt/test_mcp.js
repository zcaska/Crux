import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { spawn } from 'child_process';

async function runTests() {
  console.log("Starting server...");
  const server = spawn('node', ['server.js'], { 
    stdio: 'inherit', 
    env: { ...process.env, PORT: '3000', CHATGPT_API_KEY: 'test-key-123' } 
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    const url = new URL('http://127.0.0.1:3000/api/projects/career-os/mcp');
    // Using SSEClientTransport to connect to our SSE endpoint
    // It will automatically handle the endpoint event to figure out the POST url.
    // However, our SSEClientTransport needs to send the Auth header? Wait, does SSEClientTransport support headers?
    // Let's check constructor signature or if EventSource allows headers. EventSource in Node (like eventsource package) supports headers via dict.
    
    // Instead of using the full SDK, we can use a quick custom test if needed, or instantiate the client correctly.
    const transport = new SSEClientTransport(url, {
      requestInit: {
        headers: {
          'Authorization': 'Bearer test-key-123'
        }
      }
    });

    const client = new Client({
      name: "test-client",
      version: "1.0.0"
    }, {
      capabilities: {}
    });

    console.log("Connecting MCP Client...");
    await client.connect(transport);
    console.log("Connected successfully!");

    console.log("Listing tools...");
    const tools = await client.listTools();
    console.log(`Received ${tools.tools.length} tools`);

    console.log("Calling get_project_state...");
    const stateResult = await client.callTool({
      name: "get_project_state",
      arguments: {}
    });
    console.log("Result:", stateResult.content[0].text.slice(0, 100) + "...");

    console.log("All MCP local tests passed!");
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    server.kill();
  }
}

runTests();
