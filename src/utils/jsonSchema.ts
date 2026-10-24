import { z } from 'zod';

/** Native Zod 4 JSON Schema generation; keeps the former call-site options during migration. */
export const zodToJsonSchema = (
  schema: z.ZodType,
  _options?: { name?: string; $refStrategy?: 'none' },
): Record<string, unknown> =>
  z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input',
    reused: 'inline',
    unrepresentable: 'any',
  });
