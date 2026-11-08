const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
};
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(
      root,
      '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname),
    );
    if (!target.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    const stat = await fs.stat(target);
    if (!stat.isFile()) {
      response.writeHead(404).end();
      return;
    }
    const data = await fs.readFile(target);
    response.writeHead(200, {
      'Content-Type': types[path.extname(target)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    response.end(data);
  } catch {
    response.writeHead(404).end('File not found');
  }
});
server.listen(Number(process.env.PORT) || 4173, '127.0.0.1', () =>
  console.log('Mandate is ready at http://127.0.0.1:' + server.address().port),
);
