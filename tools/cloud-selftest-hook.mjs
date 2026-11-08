#!/usr/bin/env node
// SessionStart wrapper: runs the cloud selftest only in a cloud session, never fails the session.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.CLAUDE_CODE_REMOTE) {
  const tool = join(dirname(fileURLToPath(import.meta.url)), 'cloud-selftest.mjs');
  if (existsSync(tool)) {
    const r = spawnSync(process.execPath, [tool], { encoding: 'utf8', timeout: 18000, windowsHide: true });
    process.stdout.write(r.stdout ?? '');
  }
}
process.exit(0);
