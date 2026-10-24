import { describe, expect, it, vi, afterEach } from 'vitest';
import { localClientConfig } from '@/utils/localClientConfig.js';
import process from 'node:process';

afterEach(() => vi.unstubAllEnvs());

describe('local client launch configuration', () => {
  it('pins the current Node binary and local build without copying any credentials', () => {
    vi.stubEnv('EBAY_CLIENT_SECRET', 'do-not-copy');
    vi.stubEnv('EBAY_USER_REFRESH_TOKEN', 'do-not-copy-refresh');
    const launch = localClientConfig('/audited checkout', 'production');
    expect(launch.command).toBe(process.execPath);
    expect(launch.args).toEqual(['/audited checkout/scripts/run-local.mjs']);
    expect(launch.env).toMatchObject({ EBAY_ENVIRONMENT: 'production', EBAY_READ_ONLY: 'true' });
    expect(launch.env).toMatchObject({
      NODE_OPTIONS: '',
      NODE_PATH: '',
      DYLD_INSERT_LIBRARIES: '',
      LD_PRELOAD: '',
    });
    expect(JSON.stringify(launch)).not.toMatch(/do-not-copy|npx|CLIENT_SECRET|REFRESH_TOKEN/);
  });

  it('rejects relative checkouts and unexpected environments', () => {
    expect(() => localClientConfig('./checkout')).toThrow('absolute');
    expect(() => localClientConfig('/checkout', 'surprise')).toThrow('environment');
  });
});
