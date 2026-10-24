import { z } from 'zod';

/**
 * Reusable schema builder for required string ID parameters.
 *
 * @param name - Human-readable parameter name used in validation messages.
 * @param description - Schema description exposed to MCP clients.
 * @returns Zod string schema for a required ID parameter.
 *
 * @example
 * ```ts
 * const listingId = idSchema('Listing ID', 'The eBay listing identifier');
 * ```
 */
export const idSchema = (name: string, description: string) => {
  const normalized = name.toLowerCase().replace(/\s+/g, '_');

  return z
    .string({
      error: (issue) =>
        issue.input === undefined ? `${normalized} is required` : `${normalized} must be a string`,
    })
    .describe(description);
};
