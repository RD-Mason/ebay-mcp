import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentCommit, nodeFingerprint, projectRoot, runtimeFiles } from './local-integrity.mjs';
import process from 'node:process';

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use Node.js 24 or later.');
mkdirSync(join(projectRoot, '.local'), { recursive: true, mode: 0o700 });
const lock = {
  schema: 1,
  commit: currentCommit(),
  validatedAt: new Date().toISOString(),
  node: nodeFingerprint(),
  files: runtimeFiles(),
};
writeFileSync(
  join(projectRoot, '.local', 'runtime-lock.json'),
  `${JSON.stringify(lock, null, 2)}\n`,
  { mode: 0o600 },
);
writeFileSync(join(projectRoot, '.local', 'node-path'), `${process.execPath}\n`, { mode: 0o600 });
process.stdout.write(
  `Pinned local runtime at ${lock.commit}. No credentials are included in this lock.\n`,
);
