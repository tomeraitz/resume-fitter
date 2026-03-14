const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 3006;
const PAGES_DIR = path.join(__dirname, 'pages');

const routes = {
  '/test-comp/jobs/4488055101': 'greenhouse-test-comp-ai-engineer.html',
};

const server = http.createServer((req, res) => {
  const file = routes[req.url];

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const filePath = path.join(PAGES_DIR, file);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`E2E mock server running at http://localhost:${PORT}`);
  console.log('Routes:');
  for (const [route, file] of Object.entries(routes)) {
    console.log(`  http://localhost:${PORT}${route} -> ${file}`);
  }
});
