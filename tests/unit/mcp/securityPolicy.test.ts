import { describe, expect, it } from 'vitest';
import {
  assertSafeToolResult,
  createToolSecurityPolicy,
  isToolAllowed,
} from '@/mcp/securityPolicy.js';

const read = { name: 'ebay_get_orders' };
const refund = { name: 'ebay_issue_refund' };

describe('local tool security policy', () => {
  it('denies writes by default, even if a client can discover their names', () => {
    const policy = createToolSecurityPolicy({});
    expect(isToolAllowed(read, policy)).toBe(true);
    expect(isToolAllowed(refund, policy)).toBe(false);
  });

  it.each([
    { EBAY_READ_ONLY: 'false' },
    { EBAY_ALLOW_WRITES: 'true' },
    { EBAY_READ_ONLY: 'false', EBAY_ALLOW_WRITES: 'true' },
    {
      EBAY_READ_ONLY: 'typo',
      EBAY_ALLOW_WRITES: 'true',
      EBAY_MCP_ALLOWED_WRITE_TOOLS: refund.name,
    },
  ])('requires every local write opt-in: %j', (env) => {
    expect(isToolAllowed(refund, createToolSecurityPolicy(env))).toBe(false);
  });

  it('permits only an exact write allowlist with both opt-ins', () => {
    const policy = createToolSecurityPolicy({
      EBAY_READ_ONLY: 'false',
      EBAY_ALLOW_WRITES: 'true',
      EBAY_MCP_ALLOWED_WRITE_TOOLS: refund.name,
    });
    expect(isToolAllowed(refund, policy)).toBe(true);
    expect(isToolAllowed({ name: 'ebay_send_message' }, policy)).toBe(false);
    expect(isToolAllowed({ name: 'ebay_set_user_tokens' }, policy)).toBe(false);
  });

  it('never exposes credential maintenance, even if allowlisted', () => {
    const policy = createToolSecurityPolicy({
      EBAY_READ_ONLY: 'false',
      EBAY_ALLOW_WRITES: 'true',
      EBAY_MCP_ALLOWED_WRITE_TOOLS:
        'ebay_clear_tokens,ebay_set_user_tokens,ebay_display_credentials',
    });
    for (const name of policy.allowedWrites) expect(isToolAllowed({ name }, policy)).toBe(false);
  });

  it('rejects wildcard permissions', () => {
    expect(() => createToolSecurityPolicy({ EBAY_MCP_ALLOWED_WRITE_TOOLS: 'ebay_*' })).toThrow(
      'exact tool names',
    );
  });

  it('cannot expand permissions by changing env after startup', () => {
    const env: NodeJS.ProcessEnv = {};
    const policy = createToolSecurityPolicy(env);
    env.EBAY_READ_ONLY = 'false';
    env.EBAY_ALLOW_WRITES = 'true';
    env.EBAY_MCP_ALLOWED_WRITE_TOOLS = refund.name;
    expect(isToolAllowed(refund, policy)).toBe(false);
  });

  it('blocks opaque binary resources and limits response size', () => {
    const policy = createToolSecurityPolicy({});
    expect(() =>
      assertSafeToolResult(
        { content: [{ type: 'resource', resource: { blob: 'c2VjcmV0' } }] },
        policy,
      ),
    ).toThrow('Binary exports');
    expect(() =>
      assertSafeToolResult({ content: [{ type: 'text', text: 'x'.repeat(1024 * 1024) }] }, policy),
    ).toThrow('1 MiB');
    expect(() =>
      assertSafeToolResult({ content: [{ type: 'text', text: '{}' }] }, policy),
    ).not.toThrow();
    expect(() => assertSafeToolResult(Buffer.from('customer evidence'), policy)).toThrow(
      'Binary exports',
    );
    expect(() => assertSafeToolResult({ nested: new Uint8Array([1, 2]) }, policy)).toThrow(
      'Binary exports',
    );
    expect(() =>
      assertSafeToolResult({ type: 'Buffer', data: [115, 101, 99, 114, 101, 116] }, policy),
    ).toThrow('Binary exports');
  });
});
