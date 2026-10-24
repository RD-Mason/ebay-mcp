import { verifyLocalRuntime } from './local-integrity.mjs';
import process from 'node:process';

try {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('Use the validated Node.js 24+ executable.');
  verifyLocalRuntime();
  // Fork defaults: no registry updates, customer-data minimization, no write tools.
  // The source runtime enforces the defaults and local write allowlist as well.
  if (process.argv.includes('--offline')) {
    await import('./offline-server.mjs');
  } else {
    await import('../build/index.js');
  }
} catch (error) {
  process.stderr.write(`eBay MCP local startup refused: ${error.message}\n`);
  process.exitCode = 1;
}
