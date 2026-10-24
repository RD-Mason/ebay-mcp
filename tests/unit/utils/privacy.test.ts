import { describe, expect, it } from 'vitest';
import { sanitizeSecretText, sanitizeToolResultForModel } from '@/utils/privacy.js';

describe('AI result minimization', () => {
  it('removes customer details while preserving inventory and order identifiers', () => {
    const order = {
      orderId: '01-12345-67890',
      buyer: { username: 'buyer-account', email: 'buyer@example.test' },
      fulfillmentStartInstructions: [
        {
          shippingStep: {
            shipTo: {
              fullName: 'Jane Seller',
              contactAddress: { addressLine1: 'Secret street' },
              primaryPhone: { phoneNumber: '1234567' },
            },
          },
        },
      ],
      lineItems: [
        { itemId: '123', sku: 'PHONE-1', title: 'Vintage phone', price: { value: '10.00' } },
      ],
    };
    const safe = sanitizeToolResultForModel(order);
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toMatch(/buyer-account|buyer@example|Jane Seller|Secret street|1234567/);
    expect(serialized).toContain('01-12345-67890');
    expect(serialized).toContain('PHONE-1');
    expect(serialized).toContain('Vintage phone');
    expect(order.buyer.username).toBe('buyer-account');
  });

  it('minimizes JSON inside MCP text blocks and structured results', () => {
    const safe = sanitizeToolResultForModel({
      content: [
        { type: 'text', text: JSON.stringify({ email: 'private@example.test', orderId: 'O1' }) },
      ],
      structuredContent: { address: { addressLine1: 'secret' }, sku: 'S1' },
    }) as { content: { text: string }[]; structuredContent: { address: string; sku: string } };
    expect(JSON.parse(safe.content[0].text)).toEqual({ email: '[REDACTED]', orderId: 'O1' });
    expect(safe.structuredContent).toEqual({ address: '[REDACTED]', sku: 'S1' });
  });

  it('always removes credentials even when the owner explicitly opts out of PII masking', () => {
    expect(
      sanitizeToolResultForModel(
        { clientSecret: 'secret', buyer: { username: 'buyer' } },
        { EBAY_MCP_REDACT_PII: 'false' },
      ),
    ).toEqual({
      clientSecret: '[REDACTED]',
      buyer: { username: 'buyer' },
    });
    expect(sanitizeSecretText('https://u:p@host.test/?access_token=secret&code=private')).toBe(
      'https://[REDACTED]@host.test/?access_token=[REDACTED]&code=[REDACTED]',
    );
    expect(sanitizeSecretText('Authorization: Bearer abc123')).toBe(
      'Authorization: Bearer [REDACTED]',
    );
  });

  it('handles cyclic diagnostics and does not serialize binary customer documents', () => {
    const cyclic: Record<string, unknown> = { file: Buffer.from('private document') };
    cyclic.nested = cyclic;
    expect(sanitizeToolResultForModel(cyclic)).toEqual({
      file: '[REDACTED BINARY CONTENT]',
      nested: '[REDACTED CIRCULAR REFERENCE]',
    });
  });
});
