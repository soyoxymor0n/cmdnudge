// Builds the static site into dist/: copies src/, the real shortcut library and the shared
// chord module, and pastes the real privacy filter (filter.rs) into the page, so the code
// on the landing page is always the code in the app.
import { cp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const dist = path.join(here, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(here, 'src'), dist, { recursive: true });
await copyFile(path.join(root, 'packages/library/dist/library.json'), path.join(dist, 'library.json'));
await copyFile(path.join(root, 'packages/library/lib/chord.mjs'), path.join(dist, 'chord.mjs'));
await copyFile(path.join(root, 'apps/desktop/src-tauri/icons/128x128@2x.png'), path.join(dist, 'icon.png'));
await copyFile(path.join(root, 'apps/desktop/src-tauri/icons/32x32.png'), path.join(dist, 'favicon.png'));

const lib = JSON.parse(await readFile(path.join(dist, 'library.json'), 'utf8'));
const filter = await readFile(path.join(root, 'apps/desktop/src-tauri/src/filter.rs'), 'utf8');

// The function itself plus the doc comment above it, line numbers kept for the GitHub link.
const lines = filter.split('\n');
const fnAt = lines.findIndex((l) => l.startsWith('pub fn is_key_combo'));
if (fnAt < 0) throw new Error('is_key_combo not found in filter.rs');
let start = fnAt;
while (start > 0 && lines[start - 1].startsWith('///')) start--;
let end = fnAt;
while (lines[end] !== '}') end++;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hl = (line) =>
  esc(line)
    .replace(/^(\s*\/\/\/?.*)$/, '<span class="c">$1</span>')
    .replace(/\b(pub|fn|if|return|matches|bool|u16)\b(?![^<]*<\/span>)/g, '<span class="k">$1</span>')
    .replace(/\b(true|false)\b(?![^<]*<\/span>)/g, '<span class="n">$1</span>');
const code = lines
  .slice(start, end + 1)
  .map((l, i) => `<span class="ln">${start + i + 1}</span>${hl(l)}`)
  .join('\n');

const counts = {
  habits: lib.habits.length,
  rules: lib.habitRules.length,
  layouts: lib.layouts.length,
  mapped: lib.layoutInfo.filter((l) => l.id !== 'other').length,
  keyboards: lib.keyboards.length,
  families: lib.appFamilies.length,
};
const fill = (html) =>
  html
    .replace('<!--FILTER_RS-->', code)
    .replaceAll('{{FILTER_LINES}}', `L${start + 1}-L${end + 1}`)
    .replace(/\{\{(habits|rules|layouts|mapped|keyboards|families)\}\}/g, (_, k) => String(counts[k]));

for (const page of ['index.html', 'privacy.html', 'imprint.html']) {
  const p = path.join(dist, page);
  await writeFile(p, fill(await readFile(p, 'utf8')));
}
console.log(`web: dist/ built (${counts.habits} habits, ${counts.rules} rules, filter.rs L${start + 1}-L${end + 1})`);
