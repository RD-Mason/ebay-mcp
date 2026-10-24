import nock from 'nock';
import { afterAll, vi } from 'vitest';
import {
  createEbayMcpRuntime,
  type EbayMcpRuntime,
  type EbayMcpRuntimeOptions,
} from '@/mcp/runtime.js';
import { isReadOnlyTool } from '@/mcp/readOnlyFilter.js';
import { getToolDefinitions } from '@/tools/index.js';

const LOCAL_ONLY_TOOLS = new Set([
  'ebay_set_user_tokens',
  'ebay_set_user_tokens_with_expiry',
  'ebay_clear_tokens',
  'ebay_display_credentials',
  'ebay_refresh_access_token',
  'ebay_exchange_authorization_code',
]);

/**
 * The existing endpoint-contract specs deliberately exercise writes and binary
 * downloads against nock fixtures. They must explicitly grant each exact tool,
 * rather than relaxing production defaults or using a wildcard permission.
 * Security-default integration specs use createEbayMcpRuntime directly.
 */
export const createContractRuntime = (options: EbayMcpRuntimeOptions = {}): EbayMcpRuntime => {
  // Authorize only after real network access has been denied in this process.
  nock.disableNetConnect();
  if (!options.api) {
    throw new Error(
      'Contract tests must inject their mock API facade; local credentials are not used.',
    );
  }
  if (!process.env.EBAY_MCP_TOOLS) vi.stubEnv('EBAY_MCP_TOOLS', 'all');
  vi.stubEnv('EBAY_READ_ONLY', 'false');
  vi.stubEnv('EBAY_ALLOW_WRITES', 'true');
  vi.stubEnv(
    'EBAY_MCP_ALLOWED_WRITE_TOOLS',
    getToolDefinitions()
      .filter((definition) => !isReadOnlyTool(definition) && !LOCAL_ONLY_TOOLS.has(definition.name))
      .map((definition) => definition.name)
      .join(','),
  );
  vi.stubEnv('EBAY_MCP_REDACT_PII', 'false');
  vi.stubEnv('EBAY_MCP_ALLOW_BINARY_EXPORTS', 'true');
  vi.stubEnv('EBAY_MCP_CHECK_UPDATES', 'false');
  return createEbayMcpRuntime(options);
};

afterAll(() => vi.unstubAllEnvs());
