import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const digestFile = (filePath) =>
  createHash('sha256').update(readFileSync(filePath)).digest('hex');
const TRANSIENT = new Set(['.cache', '.vite', '.vite-temp']);

/** Hash local executable code, dependencies and their symlink targets; never credentials. */
export const runtimeFiles = () => {
  const fingerprints = {};
  const visit = (filePath) => {
    const stat = lstatSync(filePath);
    const key = relative(projectRoot, filePath);
    if (stat.isSymbolicLink()) {
      const target = realpathSync(filePath);
      const targetKey = relative(projectRoot, target);
      if (
        targetKey.split(sep).some((segment) => TRANSIENT.has(segment)) ||
        !['build', 'node_modules', 'scripts'].some(
          (tree) => targetKey === tree || targetKey.startsWith(`${tree}${sep}`),
        )
      ) {
        throw new Error(`Runtime symlink escapes the verified tree: ${key}`);
      }
      fingerprints[key] = `link:${readlinkSync(filePath)}`;
    } else if (stat.isDirectory()) {
      for (const entry of readdirSync(filePath).sort()) {
        if (!TRANSIENT.has(entry)) visit(join(filePath, entry));
      }
    } else if (stat.isFile()) {
      fingerprints[key] = digestFile(filePath);
    } else {
      throw new Error(`Unexpected runtime file: ${key}`);
    }
  };
  for (const entry of ['build', 'node_modules', 'scripts', 'package.json', 'pnpm-lock.yaml']) {
    visit(join(projectRoot, entry));
  }
  return fingerprints;
};

export const currentCommit = () =>
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

export const nodeFingerprint = () => ({
  executable: realpathSync(process.execPath),
  version: process.version,
  sha256: digestFile(realpathSync(process.execPath)),
});

export const verifyLocalRuntime = () => {
  let pinned;
  try {
    pinned = JSON.parse(readFileSync(join(projectRoot, '.local', 'runtime-lock.json'), 'utf8'));
  } catch {
    throw new Error(
      'No local runtime lock. Build and test this checkout, then run node scripts/seal-local.mjs.',
    );
  }
  if (pinned.commit !== currentCommit()) {
    throw new Error(
      'Checkout changed since validation. Review, rebuild and test before sealing a new local version.',
    );
  }
  if (JSON.stringify(pinned.node) !== JSON.stringify(nodeFingerprint())) {
    throw new Error(
      'Node runtime changed since validation. Re-test before sealing the new runtime.',
    );
  }
  const actual = runtimeFiles();
  if (JSON.stringify(pinned.files) !== JSON.stringify(actual)) {
    throw new Error(
      'Built code or dependencies changed since validation. Refusing to run an unverified local version.',
    );
  }
  return pinned;
};
