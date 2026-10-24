import { z } from 'zod';

/**
 * Zod schemas for Feedback API input validation.
 * OpenAPI spec: commerce_feedback_v1_beta_oas3.json
 */

/** Optional feedback filter expression. */
const filterSchema = z
  .string({ error: 'filter must be a string' })
  .describe('Filter criteria for the query')
  .optional();

/** Optional positive page size accepted by Feedback list endpoints. */
const limitSchema = z
  .number({ error: 'limit must be a number' })
  .describe('Maximum number of items to return per page (25-200)')
  .positive('limit must be a positive number')
  .optional();

/** Optional zero-based page offset accepted by Feedback list endpoints. */
const offsetSchema = z
  .number({ error: 'offset must be a number' })
  .describe('Number of items to skip')
  .min(0, 'offset must be a non-negative number')
  .optional();

/** Optional feedback result sort order. */
const sortSchema = z
  .string({ error: 'sort must be a string' })
  .describe('Sort order for results')
  .optional();

/** Schema for getItemsAwaitingFeedback input. */
export const getItemsAwaitingFeedbackSchema = z.object({
  filter: filterSchema,
  limit: limitSchema,
  offset: offsetSchema,
  sort: sortSchema,
});

/** Schema for getFeedback input. */
export const getFeedbackSchema = z.object({
  userId: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'userId is required' : 'userId must be a string',
    })
    .describe('The unique identifier (eBay username) of the user'),
  feedbackType: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'feedbackType is required' : 'feedbackType must be a string',
    })
    .describe('Type of feedback (FEEDBACK_RECEIVED or FEEDBACK_SENT)'),
  feedbackId: z
    .string({ error: 'feedbackId must be a string' })
    .describe('Filter by specific feedback ID')
    .optional(),
  filter: filterSchema,
  limit: limitSchema,
  listingId: z
    .string({ error: 'listingId must be a string' })
    .describe('Filter by listing ID')
    .optional(),
  offset: offsetSchema,
  orderLineItemId: z
    .string({ error: 'orderLineItemId must be a string' })
    .describe('Filter by order line item ID')
    .optional(),
  sort: sortSchema,
  transactionId: z
    .string({ error: 'transactionId must be a string' })
    .describe('The unique identifier of the transaction')
    .optional(),
});

/** Schema for getFeedbackRatingSummary input. */
export const getFeedbackRatingSummarySchema = z.object({
  userId: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'userId is required' : 'userId must be a string',
    })
    .describe('The unique identifier of the eBay user'),
  filter: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'filter is required' : 'filter must be a string',
    })
    .describe('Filter with required ratingType parameter'),
});

/** Schema for leaveFeedback input. */
export const leaveFeedbackSchema = z.object({
  commentText: z
    .string({ error: 'commentText must be a string' })
    .describe('The feedback comment text (max 500 characters)')
    .max(500, 'commentText must be 500 characters or less')
    .optional(),
  commentType: z
    .string({ error: 'commentType must be a string' })
    .describe('Overall rating: POSITIVE, NEUTRAL, or NEGATIVE')
    .optional(),
  images: z
    .array(
      z.object({
        url: z
          .string({ error: 'image url must be a string' })
          .describe('URL of the image')
          .optional(),
      }),
      { error: 'images must be an array' },
    )
    .describe('Array of up to 5 images')
    .max(5, 'Maximum 5 images allowed')
    .optional(),
  listingId: z
    .string({ error: 'listingId must be a string' })
    .describe('The listing ID related to the transaction')
    .optional(),
  orderLineItemId: z
    .string({ error: 'orderLineItemId must be a string' })
    .describe('The unique identifier of the line item')
    .optional(),
  sellerRatings: z
    .array(
      z.object({
        key: z
          .string({ error: 'seller rating key must be a string' })
          .describe('Rating category (e.g., ON_TIME_DELIVERY, ITEM_AS_DESCRIBED)')
          .optional(),
        value: z
          .string({ error: 'seller rating value must be a string' })
          .describe('Rating value (1-5)')
          .optional(),
      }),
      { error: 'sellerRatings must be an array' },
    )
    .describe('Array of seller performance ratings')
    .optional(),
  transactionId: z
    .string({ error: 'transactionId must be a string' })
    .describe('The unique identifier of the transaction')
    .optional(),
});

/** Schema for respondToFeedback input. */
export const respondToFeedbackSchema = z.object({
  feedbackId: z
    .string({ error: 'feedbackId must be a string' })
    .describe('The unique identifier of the feedback being responded to')
    .optional(),
  recipientUserId: z
    .string({ error: 'recipientUserId must be a string' })
    .describe('The user ID of the feedback provider')
    .optional(),
  responseText: z
    .string({ error: 'responseText must be a string' })
    .describe('The text content of the response (max 500 characters)')
    .max(500, 'responseText must be 500 characters or less')
    .optional(),
  responseType: z
    .string({ error: 'responseType must be a string' })
    .describe('The type of response: REPLY or FOLLOW_UP')
    .optional(),
});
