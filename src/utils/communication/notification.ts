import { z } from 'zod';
import { idSchema } from '@/utils/schemaHelpers.js';

/**
 * Zod schemas for Notification API input validation.
 * OpenAPI spec: commerce_notification_v1_oas3.json
 */

/** Optional positive page size accepted by Notification list endpoints. */
const limitSchema = z
  .number({ error: 'limit must be a number' })
  .describe('Maximum number of items to return per page (10-100)')
  .positive('limit must be a positive number')
  .optional();

/** Optional continuation cursor accepted by Notification list endpoints. */
const continuationTokenSchema = z
  .string({ error: 'continuationToken must be a string' })
  .describe('Token for pagination')
  .optional();

/** Destination delivery configuration schema shared by destination write tools. */
const deliveryConfigSchema = z
  .object({
    endpoint: z
      .string({ error: 'endpoint must be a string' })
      .describe('HTTPS endpoint URL')
      .url({
        message: 'endpoint must be a valid URL',
      })
      .optional(),
    verificationToken: z
      .string({ error: 'verificationToken must be a string' })
      .describe('Verification token (32-80 alphanumeric, underscore, hyphen characters)')
      .min(32, 'verificationToken must be at least 32 characters')
      .max(80, 'verificationToken must be at most 80 characters')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'verificationToken can only contain alphanumeric, underscore, and hyphen characters',
      )
      .optional(),
  })
  .optional();

/** Subscription payload detail schema shared by subscription write tools. */
const payloadSchema = z
  .object({
    deliveryProtocol: z
      .string({ error: 'deliveryProtocol must be a string' })
      .describe('Delivery protocol')
      .optional(),
    format: z.string({ error: 'format must be a string' }).describe('Payload format').optional(),
    schemaVersion: z
      .string({ error: 'schemaVersion must be a string' })
      .describe('Schema version for the notification topic')
      .optional(),
  })
  .optional();

/** Schema for getPublicKey input. */
export const getPublicKeySchema = z.object({
  publicKeyId: idSchema('Public key ID', 'The unique identifier for the public key'),
});

/** Schema for getConfig input. */
export const getConfigSchema = z.object({});

/** Schema for updateConfig input. */
export const updateConfigSchema = z.object({
  alertEmail: z
    .string({ error: 'alertEmail must be a string' })
    .describe('Email address for Notification API alerts')
    .email({
      message: 'alertEmail must be a valid email address',
    })
    .optional(),
});

/** Schema for getDestinations input. */
export const getDestinationsSchema = z.object({
  continuationToken: continuationTokenSchema,
  limit: limitSchema,
});

/** Schema for getDestination input. */
export const getDestinationSchema = z.object({
  destinationId: idSchema('Destination ID', 'The unique identifier for the destination'),
});

/** Schema for createDestination input. */
export const createDestinationSchema = z.object({
  deliveryConfig: deliveryConfigSchema,
  name: z
    .string({ error: 'name must be a string' })
    .describe('Seller-specified name for the destination')
    .optional(),
  status: z
    .string({ error: 'status must be a string' })
    .describe('Status: ENABLED or DISABLED')
    .optional(),
});

/** Schema for updateDestination input. */
export const updateDestinationSchema = z.object({
  destinationId: idSchema('Destination ID', 'The unique identifier for the destination'),
  deliveryConfig: deliveryConfigSchema,
  name: z.string({ error: 'name must be a string' }).describe('Destination name').optional(),
  status: z
    .string({ error: 'status must be a string' })
    .describe('Status: ENABLED or DISABLED')
    .optional(),
});

/** Schema for deleteDestination input. */
export const deleteDestinationSchema = z.object({
  destinationId: idSchema('Destination ID', 'The unique identifier for the destination'),
});

/** Schema for getSubscriptions input. */
export const getSubscriptionsSchema = z.object({
  limit: limitSchema,
  continuationToken: continuationTokenSchema,
});

/** Schema for createSubscription input. */
export const createSubscriptionSchema = z.object({
  destinationId: z
    .string({ error: 'destinationId must be a string' })
    .describe('The unique identifier of the destination endpoint')
    .optional(),
  payload: payloadSchema,
  status: z
    .string({ error: 'status must be a string' })
    .describe('Status: ENABLED or DISABLED')
    .optional(),
  topicId: z
    .string({ error: 'topicId must be a string' })
    .describe('The unique identifier of the notification topic')
    .optional(),
});

/** Schema for getSubscription input. */
export const getSubscriptionSchema = z.object({
  subscriptionId: idSchema('Subscription ID', 'The unique identifier for the subscription'),
});

/** Schema for updateSubscription input. */
export const updateSubscriptionSchema = z.object({
  subscriptionId: idSchema('Subscription ID', 'The unique identifier for the subscription'),
  destinationId: z
    .string({ error: 'destinationId must be a string' })
    .describe('The unique identifier of the destination')
    .optional(),
  payload: payloadSchema,
  status: z
    .string({ error: 'status must be a string' })
    .describe('Status: ENABLED or DISABLED')
    .optional(),
});

/** Schema for deleteSubscription input. */
export const deleteSubscriptionSchema = z.object({
  subscriptionId: idSchema('Subscription ID', 'The unique identifier for the subscription'),
});

/** Schema for disableSubscription input. */
export const disableSubscriptionSchema = z.object({
  subscriptionId: idSchema('Subscription ID', 'The unique identifier for the subscription'),
});

/** Schema for enableSubscription input. */
export const enableSubscriptionSchema = z.object({
  subscriptionId: idSchema('Subscription ID', 'The unique identifier for the subscription'),
});

/** Schema for testSubscription input. */
export const testSubscriptionSchema = z.object({
  subscriptionId: idSchema('Subscription ID', 'The unique identifier for the subscription'),
});

/** Schema for getTopic input. */
export const getTopicSchema = z.object({
  topicId: idSchema('Topic ID', 'The unique identifier for the topic'),
});

/** Schema for getTopics input. */
export const getTopicsSchema = z.object({
  limit: limitSchema,
  continuationToken: continuationTokenSchema,
});

/** Schema for createSubscriptionFilter input. */
export const createSubscriptionFilterSchema = z.object({
  subscriptionId: idSchema('Subscription ID', 'The unique identifier for the subscription'),
  filterSchema: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Valid JSON Schema Core document (version 2020-12 or later) to filter notifications'),
});

/** Schema for getSubscriptionFilter input. */
export const getSubscriptionFilterSchema = z.object({
  subscriptionId: idSchema('Subscription ID', 'The unique identifier for the subscription'),
  filterId: idSchema('Filter ID', 'The unique identifier for the filter'),
});

/** Schema for deleteSubscriptionFilter input. */
export const deleteSubscriptionFilterSchema = z.object({
  subscriptionId: idSchema('Subscription ID', 'The unique identifier for the subscription'),
  filterId: idSchema('Filter ID', 'The unique identifier for the filter'),
});
