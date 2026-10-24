import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Effect } from 'effect';
import { createEbayMcpRuntime } from '../build/mcp/runtime.js';
import { MAX_MCP_INPUT_BYTES } from '../build/mcp/inputGuard.js';
import process from 'node:process';

const unavailable = () => {
  throw new Error('OFFLINE: no eBay credentials configured; no API request was made.');
};
const offlineApi = new Proxy(
  { initialize: () => Effect.void },
  {
    get(target, property) {
      if (property === 'initialize') return target.initialize;
      return new Proxy({}, { get: () => unavailable });
    },
  },
);
process.env.EBAY_READ_ONLY = 'true';
process.env.EBAY_ALLOW_WRITES = 'false';
process.env.EBAY_MCP_CHECK_UPDATES = 'false';
process.env.EBAY_MCP_REDACT_PII = 'true';
process.env.EBAY_MCP_TOOLS = 'inventory,metadata,taxonomy,stores';
const runtime = createEbayMcpRuntime({ api: offlineApi, logToolExecution: false });
await runtime.server.connect(
  new StdioServerTransport(process.stdin, process.stdout, {
    maxBufferSize: MAX_MCP_INPUT_BYTES + 1,
  }),
);
process.stderr.write(
  'eBay MCP OFFLINE: protocol is running; eBay data and operations are unavailable.\n',
);
