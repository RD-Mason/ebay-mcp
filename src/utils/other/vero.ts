import { z } from 'zod';

/**
 * Zod schemas for VERO API input validation
 * Based on: src/api/other/vero.ts
 * OpenAPI spec: commerce_vero_v1_oas3.json
 * Types from: src/types/commerce_vero_v1_oas3.ts
 *
 * Note: The VERO API is only available for members of the Verified Rights Owner (VeRO) Program
 */

// Reusable schema for filter parameter
const filterSchema = z
  .string({ error: 'filter must be a string' })
  .describe('Filter criteria for the query (e.g., date range)')
  .optional();

// Reusable schema for limit parameter
const limitSchema = z
  .number({ error: 'limit must be a number' })
  .describe('Maximum number of items to return')
  .int()
  .positive()
  .optional();

// Reusable schema for offset parameter
const offsetSchema = z
  .number({ error: 'offset must be a number' })
  .describe('Number of items to skip')
  .int()
  .nonnegative()
  .optional();

const reportItemSchema = z
  .object({
    brand: z.string().optional(),
    copyEmailToRightsOwner: z.boolean().optional(),
    countries: z.array(z.string()).optional(),
    detailedMessage: z.string().optional(),
    itemId: z.string().optional(),
    messageToSeller: z.string().optional(),
    patent: z.string().optional(),
    regions: z.array(z.string()).optional(),
    veroReasonCodeId: z.string().optional(),
  })
  .passthrough();

/**
 * Schema for createVeroReport method
 * Endpoint: POST /vero_report
 * Body: VeroReportItemsRequest - report data
 */
export const createVeroReportSchema = z.object({
  reportData: z
    .object({
      reportItems: z.array(reportItemSchema).optional(),
    })
    .passthrough(),
});

/**
 * Schema for getVeroReport method
 * Endpoint: GET /vero_report/{vero_report_id}
 * Path: vero_report_id
 */
export const getVeroReportSchema = z.object({
  veroReportId: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'veroReportId is required' : 'veroReportId must be a string',
    })
    .describe('The unique identifier of the VERO report')
    .min(1, 'VERO report ID cannot be empty'),
});

/**
 * Schema for getVeroReportItems method
 * Endpoint: GET /vero_report_items
 * Query: filter, limit, offset
 */
export const getVeroReportItemsSchema = z.object({
  filter: filterSchema,
  limit: limitSchema,
  offset: offsetSchema,
});

/**
 * Schema for getVeroReasonCode method
 * Endpoint: GET /vero_reason_code/{vero_reason_code_id}
 * Path: vero_reason_code_id
 */
export const getVeroReasonCodeSchema = z.object({
  veroReasonCodeId: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'veroReasonCodeId is required'
          : 'veroReasonCodeId must be a string',
    })
    .describe('The unique identifier of the VERO reason code')
    .min(1, 'VERO reason code ID cannot be empty'),
});

/**
 * Schema for getVeroReasonCodes method
 * Endpoint: GET /vero_reason_code
 * No parameters required
 */
export const getVeroReasonCodesSchema = z.object({});
