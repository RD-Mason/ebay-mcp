import { z } from 'zod';

/**
 * Zod schemas for Translation API input validation
 * Based on: src/api/other/translation.ts
 * OpenAPI spec: commerce_translation_v1_beta_oas3.json
 * Types from: src/types/commerce_translation_v1_beta_oas3.ts
 */

/**
 * Schema for translate method
 * Endpoint: POST /translate
 * Body: TranslateRequest - from, to, translationContext, text
 */
export const translateSchema = z.object({
  from: z
    .string({ error: 'from must be a string' })
    .describe('The language of the input text to be translated (e.g., en_US, fr_FR, de_DE)')
    .optional(),
  to: z
    .string({ error: 'to must be a string' })
    .describe('The target language for translation (e.g., en_US, fr_FR, de_DE)')
    .optional(),
  translationContext: z
    .string({ error: 'translationContext must be a string' })
    .describe('The listing entity to translate (ITEM_TITLE or ITEM_DESCRIPTION)')
    .optional(),
  text: z
    .array(
      z.string({ error: 'text array items must be strings' }).describe('Text string to translate'),
      { error: 'text must be an array' },
    )
    .describe(
      'Array of text to translate (max 1000 chars for ITEM_TITLE, 20,000 for ITEM_DESCRIPTION)',
    )
    .optional(),
});
