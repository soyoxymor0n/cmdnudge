#!/usr/bin/env node
/**
 * feature-drift - does docs/features/*.md agree with the repo's GitHub issues?
 *
 *   node tools/feature-drift.mjs [--strict] [--docs docs/features] [--id-pattern 'F\d+[a-z]?']
 *
 * Doc side: level-3 headings "### F12 - Title". Issue side: titles "[F12] Title"
 * (read with `gh issue list --state all --limit 500`). Reports features with no
 * issue, [F..] issues with no doc entry, and open issues already labelled
 * on-beta/released. A closed issue with no lifecycle label is fine (migrated).
 * Exit 1 on drift only with --strict.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ID = String.raw`F\d+[a-z]?`;

export function parseDocFeatures(md, idPattern = DEFAULT_ID) {
  const re = new RegExp(String.raw`^###\s+(${idPattern})\s*[-—–:]\s*(.+)$`);
  const out = [];
  for (const line of String(md).split(/\r?\n/)) {
    const m = re.exec(line.trimEnd());
    if (m) out.push({ id: m[1], title: m[2].trim() });
  }
  return out;
}

export function parseIssueFeatures(issues, idPattern = DEFAULT_ID) {
  const re = new RegExp(String.raw`^\[(${idPattern})\]\s*(.*)$`);
  const out = [];
  for (const i of issues) {
    const m = re.exec(String(i.title).trim());
    if (m) out.push({ id: m[1], number: i.number, state: String(i.state).toUpperCase(), labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)) });
  }
  return out;
}

export function diffFeatures(docFeatures, issueFeatures) {
  const docIds = new Set(docFeatures.map((f) => f.id));
  const issueIds = new Set(issueFeatures.map((f) => f.id));
  return {
    withoutIssue: docFeatures.filter((f) => !issueIds.has(f.id)),
    withoutDoc: issueFeatures.filter((f) => !docIds.has(f.id)),
    statusMismatch: issueFeatures.filter((f) => f.state === 'OPEN' && f.labels.some((l) => l === 'on-beta' || l === 'released')),
  };
}

export const hasDrift = (d) => d.withoutIssue.length + d.withoutDoc.length + d.statusMismatch.length > 0;

function main() {
  const argv = process.argv.slice(2);
  const val = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
  const idPattern = val('--id-pattern', DEFAULT_ID);
  const docsDir = resolve(val('--docs', 'docs/features'));
  const strict = argv.includes('--strict');
  const docs = existsSync(docsDir)
    ? readdirSync(docsDir).filter((f) => f.endsWith('.md')).flatMap((f) => parseDocFeatures(readFileSync(join(docsDir, f), 'utf8'), idPattern))
    : [];
  const issues = JSON.parse(execFileSync('gh', ['issue', 'list', '--state', 'all', '--limit', '500', '--json', 'number,title,state,labels'], { encoding: 'utf8' }));
  const d = diffFeatures(docs, parseIssueFeatures(issues, idPattern));
  console.log(`feature-drift: ${docs.length} doc feature(s), ${issues.length} issue(s) read.`);
  for (const f of d.withoutIssue) console.log(`  no issue:       ${f.id} ${f.title}`);
  for (const f of d.withoutDoc) console.log(`  no doc entry:   ${f.id} (#${f.number})`);
  for (const f of d.statusMismatch) console.log(`  open but ${f.labels.filter((l) => l === 'on-beta' || l === 'released').join('/')}: ${f.id} (#${f.number})`);
  if (!hasDrift(d)) console.log('  no drift.');
  if (strict && hasDrift(d)) process.exit(1);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) main();
