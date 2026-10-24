import { join, isAbsolute } from 'node:path';
import process from 'node:process';

/**
 * Start only the audited checkout. Credentials stay in its private .env file;
 * client configuration contains safe switches, never copies of API secrets.
 */
export const localClientConfig = (
  projectRoot: string,
  environment = process.env.EBAY_ENVIRONMENT || 'sandbox',
) => {
  if (!isAbsolute(projectRoot)) {
    throw new Error('MCP project root must be an absolute path');
  }
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('eBay environment must be sandbox or production');
  }
  return {
    command: process.execPath,
    args: [join(projectRoot, 'scripts', 'run-local.mjs')],
    env: {
      NODE_OPTIONS: '',
      NODE_PATH: '',
      DYLD_INSERT_LIBRARIES: '',
      LD_PRELOAD: '',
      EBAY_ENVIRONMENT: environment,
      EBAY_READ_ONLY: 'true',
      EBAY_MCP_REDACT_PII: 'true',
      EBAY_MCP_CHECK_UPDATES: 'false',
    },
  };
};
