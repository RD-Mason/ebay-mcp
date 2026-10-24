import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ErrorCode, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { EbaySellerApi } from '@/api/ebaySellerApi.js';
import {
  guardMcpTransport,
  isWithinMcpInputBudget,
  MAX_MCP_INPUT_BYTES,
} from '@/mcp/inputGuard.js';
import { createEbayMcpRuntime } from '@/mcp/runtime.js';
import { Effect } from 'effect';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const requestWith = (argumentsDocument: unknown): JSONRPCMessage => ({
  jsonrpc: '2.0',
  id: 42,
  method: 'tools/call',
  params: { name: 'budget_probe', arguments: argumentsDocument },
});

describe('MCP input budgets before schema validation', () => {
  it('allows ordinary requests and counts escaped UTF-8 JSON bytes', () => {
    expect(isWithinMcpInputBudget(requestWith({ skus: ['SKU-1'], optional: undefined }))).toBe(
      true,
    );
    expect(isWithinMcpInputBudget(requestWith({ text: '😀'.repeat(70_000) }))).toBe(false);
    expect(isWithinMcpInputBudget(requestWith({ text: '\u0000'.repeat(50_000) }))).toBe(false);
    expect(isWithinMcpInputBudget(requestWith({ text: 'x'.repeat(MAX_MCP_INPUT_BYTES) }))).toBe(
      false,
    );
  });

  it('rejects oversized arrays and objects before visiting their values', () => {
    expect(
      isWithinMcpInputBudget(requestWith({ skus: Array.from({ length: 101 }, () => 1) })),
    ).toBe(false);
    expect(
      isWithinMcpInputBudget(
        requestWith(
          Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`key${index}`, index])),
        ),
      ),
    ).toBe(false);
  });

  it('bounds total nodes even when every individual collection is small', () => {
    const grid = Array.from({ length: 100 }, () => Array.from({ length: 100 }, () => 0));
    expect(isWithinMcpInputBudget(requestWith({ grid }))).toBe(false);
  });

  it('checks depth and cycles iteratively without calling accessors or toJSON', () => {
    const deeplyNested: Record<string, unknown> = {};
    let cursor = deeplyNested;
    for (let level = 0; level < 10_000; level++) {
      const nested: Record<string, unknown> = {};
      cursor.nested = nested;
      cursor = nested;
    }
    expect(isWithinMcpInputBudget(requestWith(deeplyNested))).toBe(false);
    const circular: Record<string, unknown> = {};
    circular.loop = circular;
    expect(isWithinMcpInputBudget(requestWith(circular))).toBe(false);
    const getter = vi.fn(() => 'private');
    const accessor = Object.defineProperty({}, 'dangerous', { enumerable: true, get: getter });
    expect(isWithinMcpInputBudget(requestWith(accessor))).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    const toJSON = vi.fn(() => ({ small: true }));
    expect(isWithinMcpInputBudget(requestWith({ toJSON }))).toBe(false);
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('returns InvalidParams without forwarding or reflecting the original input', async () => {
    const send = vi.fn(async () => {});
    const transport: Transport = { start: async () => {}, close: async () => {}, send };
    const guarded = guardMcpTransport(transport);
    const downstream = vi.fn();
    guarded.onmessage = downstream;
    transport.onmessage?.(requestWith({ private: 'do-not-reflect', rows: Array(101).fill(1) }));
    await Promise.resolve();
    expect(downstream).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      {
        jsonrpc: '2.0',
        id: 42,
        error: { code: ErrorCode.InvalidParams, message: expect.stringContaining('safety budget') },
      },
      { relatedRequestId: 42 },
    );
    expect(JSON.stringify(send.mock.calls)).not.toContain('do-not-reflect');
    send.mockClear();
    transport.onmessage?.({
      jsonrpc: '2.0',
      method: 'notifications/test',
      params: { rows: Array(101).fill(1) },
    });
    expect(send).not.toHaveBeenCalled();
    expect(downstream).not.toHaveBeenCalled();
  });

  it('preserves session metadata, callbacks, and the inner receiver of methods', async () => {
    class PrivateTransport implements Transport {
      #started = false;
      sessionId = 'SESSION-1';
      onclose?: () => void;
      onmessage?: Transport['onmessage'];
      onerror?: Transport['onerror'];
      async start() {
        this.#started = true;
      }
      async send(_message: JSONRPCMessage) {
        if (!this.#started) throw new Error('not started');
      }
      async close() {
        this.#started = false;
        this.onclose?.();
      }
    }
    const inner = new PrivateTransport();
    const guarded = guardMcpTransport(inner);
    const closed = vi.fn();
    const downstream = vi.fn();
    guarded.onclose = closed;
    guarded.onmessage = downstream;
    await guarded.start();
    expect(guarded.sessionId).toBe('SESSION-1');
    const message = requestWith({ skus: ['SKU-1'] });
    const extra = { authInfo: { token: 'test', clientId: 'owner', scopes: ['mcp:tools'] } };
    inner.onmessage?.(message, extra);
    expect(downstream).toHaveBeenCalledWith(message, extra);
    await guarded.send({ jsonrpc: '2.0', id: 1, result: {} });
    await guarded.close();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('caps STDIO bytes before JSON or schema parsing, including unterminated lines', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioServerTransport(input, output, {
      maxBufferSize: MAX_MCP_INPUT_BYTES + 1,
    });
    const parsed = vi.fn();
    const errors = vi.fn();
    const closed = vi.fn();
    transport.onmessage = parsed;
    transport.onerror = errors;
    transport.onclose = closed;
    await transport.start();
    input.write(Buffer.alloc(MAX_MCP_INPUT_BYTES, 0x20));
    input.write(Buffer.from('xx'));
    await Promise.resolve();
    expect(errors).toHaveBeenCalledOnce();
    expect(parsed).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
    await transport.close();
    input.destroy();
    output.destroy();
  });
});

describe('real SDK and Zod boundary', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('refuses input before a Zod refinement or handler can run', async () => {
    const touchedSchema = vi.fn();
    const handler = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'accepted' }] }));
    const server = new McpServer({ name: 'input-guard-test', version: '1' });
    server.registerTool(
      'budget_probe',
      {
        inputSchema: {
          probe: z.any().superRefine(() => {
            touchedSchema();
          }),
        },
      },
      handler,
    );
    const client = new Client({ name: 'input-guard-client', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(guardMcpTransport(serverTransport));
      await client.connect(clientTransport);
      await expect(
        client.callTool({ name: 'budget_probe', arguments: { probe: Array(101).fill(1) } }),
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      expect(touchedSchema).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      const accepted = await client.callTool({
        name: 'budget_probe',
        arguments: { probe: 'small' },
      });
      expect(accepted.content).toEqual([{ type: 'text', text: 'accepted' }]);
      expect(touchedSchema).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('protects the actual runtime SKU tool from 101 invalid numeric elements', async () => {
    vi.stubEnv('EBAY_MCP_TOOLS', 'inventory');
    vi.stubEnv('EBAY_READ_ONLY', 'true');
    const getOffersBySkus = vi.fn(() => Effect.succeed({ results: [] }));
    const api = {
      initialize: () => Effect.void,
      inventory: { getOffersBySkus },
    } as unknown as EbaySellerApi;
    const runtime = createEbayMcpRuntime({ api });
    const client = new Client({ name: 'sku-budget-client', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await runtime.server.connect(serverTransport);
      await client.connect(clientTransport);
      await expect(
        client.callTool({
          name: 'ebay_get_offers_by_skus',
          arguments: { skus: Array(101).fill(1) },
        }),
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      expect(getOffersBySkus).not.toHaveBeenCalled();
      const accepted = await client.callTool({
        name: 'ebay_get_offers_by_skus',
        arguments: { skus: ['SKU-1'] },
      });
      expect(accepted.isError).not.toBe(true);
      expect(getOffersBySkus).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await runtime.server.close();
    }
  });
});
