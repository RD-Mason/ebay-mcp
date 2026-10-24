import { describe, expect, it } from 'vitest';
import { assertEbayRequestUrl, validateLocalProxyUrl } from '@/config/networkPolicy.js';

describe('credential destination policy', () => {
  it.each([
    'https://api.ebay.com/sell/inventory/v1/inventory_item',
    'https://apiz.sandbox.ebay.com/sell/finances/v1/transaction',
    'https://apim.ebay.com/commerce/media/v1_beta/video',
  ])('accepts an exact official API host %s', (url) => {
    expect(() => assertEbayRequestUrl(url)).not.toThrow();
  });

  it.each([
    'https://api.ebay.com.evil.test/steal',
    'https://evil.test/api.ebay.com',
    'http://api.ebay.com/sell/inventory/v1/inventory_item',
    'https://api.ebay.com:8443/steal',
    'https://user:secret@api.ebay.com/',
    'http://127.0.0.1:9999/steal',
    'file:///etc/passwd',
  ])('rejects an unapproved credential destination %s', (url) => {
    expect(() => assertEbayRequestUrl(url)).toThrow();
  });

  it('only trusts the configured local proxy origin and path', () => {
    const proxy = 'http://127.0.0.1:8099/ebay';
    expect(() => assertEbayRequestUrl(`${proxy}/sell/inventory/v1/test`, proxy)).not.toThrow();
    expect(() => assertEbayRequestUrl('http://127.0.0.1:8099/outside', proxy)).toThrow();
    expect(() => assertEbayRequestUrl('http://127.0.0.1:9000/ebay/sell', proxy)).toThrow();
    expect(() => assertEbayRequestUrl('http://127.0.0.1:8099/ebay-other/sell', proxy)).toThrow();
    expect(() => validateLocalProxyUrl('https://proxy.evil.test')).toThrow(
      'Remote proxies are disabled',
    );
  });
});
