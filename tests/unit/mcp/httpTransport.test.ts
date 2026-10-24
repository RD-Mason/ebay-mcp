import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createHttpMcpApp,
  createHttpTransportConfigFromEnv,
  getAuthServerMetadataUrl,
  getHttpServerUrl,
  getHttpSessionPrincipal,
  type HttpTransportConfig,
} from '@/mcp/httpTransport.js';
import process from 'node:process';
import type { AuthenticatedRequest } from '@/auth/oauthMiddleware.js';
import { gzipSync } from 'node:zlib';

const TEST_TOKEN = 'test-only-static-token-at-least-32-characters';

function createTestConfig(overrides: Partial<HttpTransportConfig> = {}): HttpTransportConfig {
  return {
    authEnabled: false,
    staticAuthToken: TEST_TOKEN,
    corsOrigins: ['https://app.example.test'],
    ebayConfig: {
      clientId: 'client',
      clientSecret: 'secret',
      environment: 'sandbox',
    },
    host: '127.0.0.1',
    oauth: {
      authServerUrl: 'http://localhost:8080/realms/master',
      requiredScopes: ['mcp:tools'],
      useIntrospection: true,
    },
    port: 3000,
    projectRoot: process.cwd(),
    ...overrides,
  };
}

describe('HTTP MCP transport', () => {
  it('rejects compressed JSON before decompression, including trailing bytes', async () => {
    const app = await createHttpMcpApp(createTestConfig());
    const compressed = Buffer.concat([
      gzipSync('{"jsonrpc":"2.0"}'),
      Buffer.from('trailing bytes'),
    ]);
    const response = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send(compressed);
    expect(response.status).toBe(415);
    // A later request still succeeds: malformed compression cannot kill the server.
    expect((await request(app).get('/health')).status).toBe(200);
  });
  it('refuses unauthenticated HTTP even on loopback', async () => {
    await expect(
      createHttpMcpApp(createTestConfig({ staticAuthToken: undefined })),
    ).rejects.toThrow('Unauthenticated HTTP is disabled');
  });

  it('rejects non-loopback binding even with an allowlist and authentication', async () => {
    await expect(
      createHttpMcpApp(createTestConfig({ host: '0.0.0.0', allowedHosts: ['shop.example.test'] })),
    ).rejects.toThrow('only supports loopback');
  });

  it('rejects weak bearer tokens and wildcard browser origins', async () => {
    await expect(createHttpMcpApp(createTestConfig({ staticAuthToken: 'short' }))).rejects.toThrow(
      'at least 32',
    );
    await expect(createHttpMcpApp(createTestConfig({ corsOrigins: ['*'] }))).rejects.toThrow(
      'Wildcard',
    );
  });

  it('blocks DNS rebinding Host headers before routing, even with a valid bearer', async () => {
    const app = await createHttpMcpApp(createTestConfig());
    const blocked = await request(app)
      .get('/health')
      .set('Host', 'evil.example.test:3000')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('invalid_host');
  });

  it('ignores spoofed forwarding headers when checking the Host', async () => {
    const app = await createHttpMcpApp(createTestConfig());
    const blocked = await request(app)
      .get('/health')
      .set('Host', 'evil.example.test')
      .set('X-Forwarded-Host', '127.0.0.1:3000');
    expect(blocked.status).toBe(403);
  });

  it('binds sessions to the authenticated subject and client, or the exact bearer', () => {
    const makeRequest = (token: string, subject?: string, clientId = 'client') =>
      ({
        headers: { authorization: `Bearer ${token}` },
        auth: subject ? { token, subject, clientId, scopes: ['mcp:tools'] } : undefined,
      }) as AuthenticatedRequest;
    expect(getHttpSessionPrincipal(makeRequest('token-a'))).not.toBe(
      getHttpSessionPrincipal(makeRequest('token-b')),
    );
    expect(getHttpSessionPrincipal(makeRequest('token-a', 'alice'))).not.toBe(
      getHttpSessionPrincipal(makeRequest('token-a', 'bob')),
    );
    expect(getHttpSessionPrincipal(makeRequest('token-a', 'alice'))).not.toBe(
      getHttpSessionPrincipal(makeRequest('token-a', 'alice', 'other-client')),
    );
    expect(getHttpSessionPrincipal(makeRequest('old', 'alice'))).toBe(
      getHttpSessionPrincipal(makeRequest('refreshed', 'alice')),
    );
  });

  it('builds HTTP server and metadata URLs from config', () => {
    const config = createTestConfig();

    expect(getHttpServerUrl(config)).toBe('http://127.0.0.1:3000');
    expect(getAuthServerMetadataUrl(config)).toBe(
      'http://localhost:8080/realms/master/.well-known/openid-configuration',
    );

    expect(
      getAuthServerMetadataUrl({
        oauth: {
          ...config.oauth,
          authServerUrl: 'https://auth.example.test',
        },
      }),
    ).toBe('https://auth.example.test/.well-known/oauth-authorization-server');
  });

  it('creates config from env defaults and overrides', () => {
    const config = createHttpTransportConfigFromEnv({
      MCP_HOST: '0.0.0.0',
      MCP_PORT: '4444',
      OAUTH_ENABLED: 'false',
      OAUTH_REQUIRED_SCOPES: 'mcp:tools,mcp:admin',
    });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(4444);
    expect(config.authEnabled).toBe(false);
    expect(config.oauth.requiredScopes).toEqual(['mcp:tools', 'mcp:admin']);
  });

  it('keeps loopback binding when only PORT is set', () => {
    const config = createHttpTransportConfigFromEnv({
      PORT: '8080',
    });

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8080);
  });

  it('allows an explicit MCP_HOST', () => {
    const config = createHttpTransportConfigFromEnv({
      PORT: '8080',
      MCP_HOST: '127.0.0.1',
    });

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8080);
  });

  it('prefers MCP_PORT over PORT', () => {
    const config = createHttpTransportConfigFromEnv({
      PORT: '8080',
      MCP_PORT: '4000',
    });

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4000);
  });

  it('reads staticAuthToken from MCP_AUTH_TOKEN', () => {
    const config = createHttpTransportConfigFromEnv({
      MCP_AUTH_TOKEN: TEST_TOKEN,
    });

    expect(config.staticAuthToken).toBe(TEST_TOKEN);
  });

  it('allows only loopback browser origins when MCP_CORS_ORIGINS is unset', async () => {
    const { corsOrigins } = createHttpTransportConfigFromEnv({});
    const app = await createHttpMcpApp(createTestConfig({ corsOrigins }));

    const local = await request(app).get('/health').set('Origin', 'http://localhost:6274');
    const loopback = await request(app).get('/health').set('Origin', 'http://127.0.0.1:3000');
    const remote = await request(app).get('/health').set('Origin', 'https://evil.example.test');

    expect(local.headers['access-control-allow-origin']).toBe('http://localhost:6274');
    expect(loopback.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
    expect(remote.status).toBe(403);
    expect(remote.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('reads the CORS allowlist from MCP_CORS_ORIGINS', () => {
    const config = createHttpTransportConfigFromEnv({
      MCP_CORS_ORIGINS: 'https://app.example.test, https://inspector.example.test,',
    });

    expect(config.corsOrigins).toEqual([
      'https://app.example.test',
      'https://inspector.example.test',
    ]);
  });

  it('answers preflight for allowed origins and exposes the MCP session header', async () => {
    const app = await createHttpMcpApp(createTestConfig());

    const preflight = await request(app)
      .options('/')
      .set('Origin', 'https://app.example.test')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,mcp-session-id');
    const blocked = await request(app)
      .options('/')
      .set('Origin', 'https://other.example.test')
      .set('Access-Control-Request-Method', 'POST');
    const allowed = await request(app).get('/health').set('Origin', 'https://app.example.test');

    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://app.example.test');
    expect(preflight.headers['access-control-allow-headers']).toBe('content-type,mcp-session-id');
    expect(blocked.status).toBe(403);
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    expect(allowed.headers['access-control-expose-headers']).toBe('Mcp-Session-Id');
  });

  it('keeps health available without OAuth', async () => {
    const app = await createHttpMcpApp(createTestConfig());
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'healthy',
      oauth_enabled: false,
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it('rejects session requests without a valid MCP session id', async () => {
    const app = await createHttpMcpApp(createTestConfig());
    const response = await request(app).get('/').set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'invalid_session',
      error_description: 'Invalid or missing session ID',
    });
  });

  it('rejects protected routes without the static bearer token', async () => {
    const app = await createHttpMcpApp(
      createTestConfig({
        staticAuthToken: TEST_TOKEN,
      }),
    );

    const response = await request(app).get('/');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'unauthorized',
      error_description: 'Missing or invalid bearer token',
    });
  });

  it('accepts protected routes with the static bearer token', async () => {
    const app = await createHttpMcpApp(
      createTestConfig({
        staticAuthToken: TEST_TOKEN,
      }),
    );

    // Health is unauthenticated; hit the MCP session route which uses auth middleware.
    // A valid bearer passes auth, then the handler still rejects missing session id.
    const response = await request(app).get('/').set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'invalid_session',
      error_description: 'Invalid or missing session ID',
    });
  });

  it('keeps health unauthenticated when static bearer auth is enabled', async () => {
    const app = await createHttpMcpApp(
      createTestConfig({
        staticAuthToken: TEST_TOKEN,
      }),
    );

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'healthy' });
  });
});
