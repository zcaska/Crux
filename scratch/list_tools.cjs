const fs = require('fs');
const content = fs.readFileSync('src/mcp-server.js', 'utf8');
const regex = /server\.tool\(\s*['"]([^'"]+)['"]/g;
let match;
const tools = [];
while((match = regex.exec(content)) !== null) {
  tools.push(match[1]);
}
console.log(tools.join('\n'));
console.log("Total tools:", tools.length);
