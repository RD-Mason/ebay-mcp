import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from '@/utils/jsonSchema.js';

describe('native Zod 4 validation', () => {
  it('rejects an oversized constrained collection before visiting its elements', () => {
    const schema = z.array(z.string().min(1).max(50)).min(1).max(25);
    const result = schema.safeParse(Array(5000).fill(0));
    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod 3's compatibility implementation would collect 5001 issues here.
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].code).toBe('too_big');
    }
    expect(typeof z.toJSONSchema).toBe('function');
  });

  it('generates real nested JSON Schema with native record keys and descriptions', () => {
    const schema = z.object({
      sku: z.string().describe('Seller SKU'),
      aspects: z.record(z.string(), z.array(z.string())),
    });
    const emitted = zodToJsonSchema(schema, { name: 'Inventory', $refStrategy: 'none' });
    expect(emitted).toMatchObject({
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Seller SKU' },
        aspects: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
      },
    });
  });
});
