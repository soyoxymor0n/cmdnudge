// Renders og/og.html into src/og-image.png (1200x630) with headless Chrome.
// Builds the site first so the card uses the real landing.css and icon, serves dist/ plus
// og.html on a throwaway port, screenshots, stops. Usage: node og/render.mjs
// CHROME=/path/to/chrome overrides the browser.
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..');
const dist = path.join(web, 'dist');
const out = path.join(web, 'src/og-image.png');

const chrome =
  process.env.CHROME ||
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p));
if (!chrome) throw new Error('Chrome not found; set CHROME=/path/to/chrome');

execFileSync(process.execPath, [path.join(web, 'build.mjs')], { stdio: 'inherit' });

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  const file = url === '/og.html' ? path.join(here, 'og.html') : path.join(dist, path.normalize(url).replace(/^([/\\])+/, ''));
  if (!file.startsWith(dist) && file !== path.join(here, 'og.html')) return res.writeHead(403).end();
  let body;
  try {
    body = await readFile(file);
  } catch {
    return res.writeHead(404).end();
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

try {
  // Async on purpose: a sync child would block this process, and with it the server Chrome reads from.
  const { code } = await new Promise((resolve, reject) => {
    const child = spawn(chrome, [
      '--headless=new',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1200,630',
      '--virtual-time-budget=5000',
      `--screenshot=${out}`,
      `http://127.0.0.1:${port}/og.html`,
    ], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (c) => resolve({ code: c }));
  });
  if (code !== 0) throw new Error(`Chrome exited with ${code}`);
} finally {
  server.close();
}
console.log(`og: wrote ${path.relative(web, out)}`);
