import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Effect } from 'effect';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createHttpMcpApp } from '@/mcp/httpTransport.js';

// Exercise the real SDK session handshake while replacing eBay access and the
// external identity provider. No network requests leave this local HTTP test.
vi.mock('@/mcp/runtime.js', () => ({
  createEbayMcpRuntime: () => ({
    server: new McpServer({ name: 'session-isolation-test', version: '1.0.0' }),
    initializeApi: async () => {},
  }),
}));

vi.mock('@/auth/tokenVerifier.js', () => ({
  TokenVerifier: class {
    initialize() {
      return Effect.void;
    }
    verifyToken(token: string) {
      return Effect.succeed({
        token,
        clientId: 'test-client',
        subject: token,
        scopes: ['mcp:tools'],
      });
    }
  },
}));

describe('HTTP authenticated session isolation', () => {
  it('rejects another verified user reusing an initialized session on POST and DELETE', async () => {
    const app = await createHttpMcpApp({
      authEnabled: true,
      corsOrigins: [],
      host: '127.0.0.1',
      port: 3000,
      projectRoot: process.cwd(),
      ebayConfig: { clientId: 'test', clientSecret: 'test', environment: 'sandbox' },
      oauth: {
        authServerUrl: 'https://auth.example.test',
        requiredScopes: ['mcp:tools'],
        useIntrospection: true,
      },
    });
    const initialized = await request(app)
      .post('/')
      .set('Authorization', 'Bearer alice')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      });
    expect(initialized.status).toBe(200);
    const sessionId = initialized.headers['mcp-session-id'];
    expect(sessionId).toEqual(expect.any(String));

    const stolenPost = await request(app)
      .post('/')
      .set('Authorization', 'Bearer bob')
      .set('Mcp-Session-Id', sessionId)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 2, method: 'ping' });
    const stolenDelete = await request(app)
      .delete('/')
      .set('Authorization', 'Bearer bob')
      .set('Mcp-Session-Id', sessionId);
    expect(stolenPost.status).toBe(403);
    expect(stolenPost.body.error).toBe('session_principal_mismatch');
    expect(stolenDelete.status).toBe(403);

    const ownerDelete = await request(app)
      .delete('/')
      .set('Authorization', 'Bearer alice')
      .set('Mcp-Session-Id', sessionId);
    expect(ownerDelete.status).toBe(200);
  });
});
