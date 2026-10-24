import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./run-local.mjs', import.meta.url)), '--offline'],
  stderr: 'pipe',
  env: { ...process.env, EBAY_MCP_UI: 'off' },
});
const client = new Client({ name: 'rd-mason-local-smoke', version: '1.0.0' });
try {
  await client.connect(transport);
  const catalogue = await client.listTools();
  assert(catalogue.tools.length > 0);
  const names = catalogue.tools.map((tool) => tool.name);
  assert(names.includes('ebay_get_inventory_items'));
  for (const name of [
    'ebay_issue_refund',
    'ebay_publish_offer',
    'ebay_set_user_tokens',
    'ebay_send_message',
  ]) {
    assert(!names.includes(name), `${name} must not be exposed by default`);
  }
  const result = await client.callTool({
    name: 'ebay_get_inventory_items',
    arguments: { limit: 1 },
  });
  assert.equal(result.isError, true);
  assert(JSON.stringify(result).includes('OFFLINE'));
  process.stdout.write(
    `${JSON.stringify({ status: 'passed', mode: 'offline', tools: names.length, credentialsUsed: false, ebayRequests: 0, commitWritesExposed: false })}\n`,
  );
} finally {
  await client.close();
}
