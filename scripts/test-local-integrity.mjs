import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot, runtimeFiles, verifyLocalRuntime } from './local-integrity.mjs';
import process from 'node:process';

verifyLocalRuntime();
const probe = join(projectRoot, 'build', `.integrity-probe-${randomUUID()}`);
const outside = join(projectRoot, '.cache', `.integrity-target-${randomUUID()}`);
const cleanupErrors = [];
try {
  writeFileSync(probe, 'unvalidated artifact', { flag: 'wx' });
  assert.throws(verifyLocalRuntime, /changed since validation/);
  unlinkSync(probe);
  mkdirSync(join(projectRoot, '.cache'), { recursive: true });
  writeFileSync(outside, 'non-sensitive probe', { flag: 'wx', mode: 0o600 });
  symlinkSync(outside, probe);
  assert.throws(runtimeFiles, /symlink escapes the verified tree/);
} finally {
  for (const file of [probe, outside]) {
    try {
      unlinkSync(file);
    } catch (error) {
      if (error.code !== 'ENOENT') cleanupErrors.push(error);
    }
  }
}
assert.equal(cleanupErrors.length, 0, 'Integrity probe files must be removed after the test.');
verifyLocalRuntime();
process.stdout.write(
  'Local integrity checks passed: artifact changes and escaping symlinks are refused.\n',
);
