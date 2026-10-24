import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { EbaySellerApi } from '@/api/ebaySellerApi.js';
import { createEbayMcpRuntime, type EbayMcpRuntime } from '@/mcp/runtime.js';
import { Effect } from 'effect';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('safe defaults at the connected MCP boundary', () => {
  let client: Client | undefined;
  let runtime: EbayMcpRuntime | undefined;
  const writeInventory = vi.fn(() => Effect.void);
  const api = {
    initialize: () => Effect.void,
    inventory: { createOrReplaceInventoryItem: writeInventory },
    fulfillment: {
      getOrder: () =>
        Effect.succeed({
          orderId: 'ORDER-1',
          buyer: { username: 'private-buyer', email: 'buyer@example.test' },
        }),
    },
  } as unknown as EbaySellerApi;

  const connect = async (): Promise<Client> => {
    runtime = createEbayMcpRuntime({ api });
    client = new Client({ name: 'security-integration', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await runtime.server.connect(serverTransport);
    await client.connect(clientTransport);
    return client;
  };

  beforeEach(() => {
    nock.disableNetConnect();
    vi.clearAllMocks();
    for (const name of [
      'EBAY_MCP_TOOLS',
      'EBAY_READ_ONLY',
      'EBAY_ALLOW_WRITES',
      'EBAY_MCP_ALLOWED_WRITE_TOOLS',
      'EBAY_MCP_REDACT_PII',
      'EBAY_MCP_ALLOW_BINARY_EXPORTS',
    ]) {
      vi.stubEnv(name, undefined);
    }
  });

  afterEach(async () => {
    await client?.close();
    await runtime?.server.close();
    client = undefined;
    runtime = undefined;
    nock.cleanAll();
    nock.enableNetConnect();
    vi.unstubAllEnvs();
  });

  it('exposes reads and refuses a hidden write without invoking the API facade', async () => {
    const connected = await connect();
    const names = (await connected.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain('ebay_get_inventory_items');
    expect(names).not.toContain('ebay_create_or_replace_inventory_item');
    expect(names).not.toContain('ebay_issue_refund');
    expect(names).not.toContain('ebay_set_user_tokens');
    const refused = await connected.callTool({
      name: 'ebay_create_or_replace_inventory_item',
      arguments: { sku: 'SKU-1', body: {} },
    });
    expect(refused.isError).toBe(true);
    expect(writeInventory).not.toHaveBeenCalled();
  });

  it('keeps writes disabled when only the legacy read-only switch is disabled', async () => {
    vi.stubEnv('EBAY_READ_ONLY', 'false');
    const connected = await connect();
    expect((await connected.listTools()).tools.map((tool) => tool.name)).not.toContain(
      'ebay_create_or_replace_inventory_item',
    );
  });

  it('grants only an exact local write and never exposes credential maintenance tools', async () => {
    vi.stubEnv('EBAY_MCP_TOOLS', 'inventory,token-management');
    vi.stubEnv('EBAY_READ_ONLY', 'false');
    vi.stubEnv('EBAY_ALLOW_WRITES', 'true');
    vi.stubEnv(
      'EBAY_MCP_ALLOWED_WRITE_TOOLS',
      'ebay_create_or_replace_inventory_item,ebay_set_user_tokens',
    );
    const connected = await connect();
    const names = (await connected.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain('ebay_create_or_replace_inventory_item');
    expect(names).not.toContain('ebay_delete_inventory_item');
    expect(names).not.toContain('ebay_set_user_tokens');
    expect(names).not.toContain('ebay_display_credentials');
  });

  it('minimizes customer data by default when the owner explicitly enables order reads', async () => {
    vi.stubEnv('EBAY_MCP_TOOLS', 'fulfillment');
    const connected = await connect();
    const response = await connected.callTool({
      name: 'ebay_get_order',
      arguments: { orderId: 'ORDER-1' },
    });
    const serialized = JSON.stringify(response);
    expect(response.isError).not.toBe(true);
    expect(serialized).toContain('ORDER-1');
    expect(serialized).not.toMatch(/private-buyer|buyer@example/);
  });
});
