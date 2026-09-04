# LOCAL DEVELOPMENT

To develop and test the ChatGPT HTTP Gateway locally without exposing it to the internet:

## 1. Setup Environment
1. Define a local API key:
   ```bash
   $env:CHATGPT_API_KEY="test-key-123"
   ```
2. Create `projects.json`:
   ```json
   {
     "career-os": "C:/Users/AGP/Documents/Projects/Job-Hunt"
   }
   ```

## 2. Run Server
Start the server in local mode (binds to `127.0.0.1:3000`):
```bash
node server.js
```

## 3. Test
Use `curl` or Postman to test endpoints:
```bash
curl -H "Authorization: Bearer test-key-123" http://127.0.0.1:3000/api/projects/career-os/tasks
```

## 4. Acceptance Tests
Run the integration and security tests locally:
```bash
node security_tests.js
node tests.js
```
