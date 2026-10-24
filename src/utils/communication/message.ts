import { z } from 'zod';

/**
 * Zod schemas for Message API input validation.
 * OpenAPI spec: commerce_message_v1_oas3.json
 */

/** Optional positive page size accepted by Message list endpoints. */
const limitSchema = z
  .number({ error: 'limit must be a number' })
  .describe('Maximum number of items to return (25-50)')
  .positive('limit must be a positive number')
  .optional();

/** Optional zero-based page offset accepted by Message list endpoints. */
const offsetSchema = z
  .number({ error: 'offset must be a number' })
  .describe('Number of items to skip')
  .min(0, 'offset must be a non-negative number')
  .optional();

/** Schema for bulkUpdateConversation input. */
export const bulkUpdateConversationSchema = z.object({
  conversations: z
    .array(
      z.object({
        conversationId: z
          .string({ error: 'conversationId must be a string' })
          .describe('The unique identifier of the conversation')
          .optional(),
        conversationStatus: z
          .string({ error: 'conversationStatus must be a string' })
          .describe('The updated status: ACTIVE, ARCHIVE, DELETE, READ, UNREAD')
          .optional(),
        conversationType: z
          .string({ error: 'conversationType must be a string' })
          .describe('The existing type: FROM_MEMBERS or FROM_EBAY (required but cannot be updated)')
          .optional(),
      }),
      { error: 'conversations must be an array' },
    )
    .describe('Array of conversations to update')
    .optional(),
});

/** Schema for getConversations input. */
export const getConversationsSchema = z.object({
  conversationType: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'conversationType is required'
          : 'conversationType must be a string',
    })
    .describe('Type of conversation: FROM_EBAY or FROM_MEMBERS'),
  conversationStatus: z
    .string({ error: 'conversationStatus must be a string' })
    .describe('Filter by status: ACTIVE, ARCHIVE, DELETE, READ, UNREAD')
    .optional(),
  endTime: z
    .string({ error: 'endTime must be a string' })
    .describe('End time for retrieving conversations (ISO 8601 format)')
    .optional(),
  limit: limitSchema,
  offset: offsetSchema,
  otherPartyUsername: z
    .string({ error: 'otherPartyUsername must be a string' })
    .describe('Filter by specific eBay user')
    .optional(),
  referenceId: z
    .string({ error: 'referenceId must be a string' })
    .describe('Filter by reference ID (e.g., listing ID)')
    .optional(),
  referenceType: z
    .string({ error: 'referenceType must be a string' })
    .describe('Reference type (currently only LISTING is supported)')
    .optional(),
  startTime: z
    .string({ error: 'startTime must be a string' })
    .describe('Start time for retrieving conversations (ISO 8601 format)')
    .optional(),
});

/** Schema for getConversation input. */
export const getConversationSchema = z.object({
  conversationId: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'conversationId is required'
          : 'conversationId must be a string',
    })
    .describe('The unique identifier for the conversation'),
  conversationType: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'conversationType is required'
          : 'conversationType must be a string',
    })
    .describe('Type of conversation: FROM_EBAY or FROM_MEMBERS'),
  limit: limitSchema,
  offset: offsetSchema,
});

/** Schema for sendMessage input. */
export const sendMessageSchema = z.object({
  conversationId: z
    .string({ error: 'conversationId must be a string' })
    .describe('ID of existing conversation (required if sending in existing conversation)')
    .optional(),
  emailCopyToSender: z
    .boolean({ error: 'emailCopyToSender must be a boolean' })
    .describe('Whether to email a copy to the sender')
    .optional(),
  messageMedia: z
    .array(
      z.object({
        mediaName: z
          .string({ error: 'mediaName must be a string' })
          .describe('Name of the media')
          .optional(),
        mediaType: z
          .string({ error: 'mediaType must be a string' })
          .describe('Type of media: IMAGE, PDF, DOC, TXT')
          .optional(),
        mediaUrl: z
          .string({ error: 'mediaUrl must be a string' })
          .describe('HTTPS URL of the self-hosted media')
          .optional(),
      }),
      { error: 'messageMedia must be an array' },
    )
    .describe('Array of up to 5 media attachments')
    .max(5, 'Maximum 5 media attachments allowed')
    .optional(),
  messageText: z
    .string({ error: 'messageText must be a string' })
    .describe('The text of the message (max 2000 characters)')
    .max(2000, 'messageText must be 2000 characters or less')
    .optional(),
  otherPartyUsername: z
    .string({ error: 'otherPartyUsername must be a string' })
    .describe('eBay username to send message to (required for new conversations)')
    .optional(),
  reference: z
    .object(
      {
        referenceId: z
          .string({ error: 'referenceId must be a string' })
          .describe('The reference ID (e.g., item ID for LISTING)')
          .optional(),
        referenceType: z
          .string({ error: 'referenceType must be a string' })
          .describe('The reference type (currently only LISTING is supported)')
          .optional(),
      },
      { error: 'reference must be an object' },
    )
    .describe('Reference to associate with the conversation')
    .optional(),
});

/** Schema for updateConversation input. */
export const updateConversationSchema = z.object({
  conversationId: z
    .string({ error: 'conversationId must be a string' })
    .describe('The unique identifier of the conversation')
    .optional(),
  conversationStatus: z
    .string({ error: 'conversationStatus must be a string' })
    .describe('The updated status: ACTIVE, ARCHIVE, DELETE')
    .optional(),
  conversationType: z
    .string({ error: 'conversationType must be a string' })
    .describe('The existing type: FROM_MEMBERS or FROM_EBAY (required but cannot be updated)')
    .optional(),
  read: z
    .boolean({ error: 'read must be a boolean' })
    .describe('The read status to set (true = read, false = unread)')
    .optional(),
});
