import { z } from 'zod';

/**
 * Zod schemas for Negotiation API input validation.
 * OpenAPI spec: sell_negotiation_v1_oas3.json
 */

/** Optional positive page size accepted by Negotiation list endpoints. */
const limitSchema = z
  .number({ error: 'limit must be a number' })
  .describe('Maximum number of items to return (1-200)')
  .positive('limit must be a positive number')
  .optional();

/** Optional zero-based page offset accepted by Negotiation list endpoints. */
const offsetSchema = z
  .number({ error: 'offset must be a number' })
  .describe('Number of items to skip')
  .min(0, 'offset must be a non-negative number')
  .optional();

/** Schema for findEligibleItems input. */
export const findEligibleItemsSchema = z.object({
  limit: limitSchema,
  offset: offsetSchema,
  marketplaceId: z
    .string({ error: 'marketplaceId must be a string' })
    .describe('The eBay marketplace ID (X-EBAY-C-MARKETPLACE-ID header)')
    .optional(),
});

/** Schema for sendOfferToInterestedBuyers input. */
export const sendOfferToInterestedBuyersSchema = z.object({
  allowCounterOffer: z
    .boolean({ error: 'allowCounterOffer must be a boolean' })
    .describe('Whether to allow counter-offers (currently must be false)')
    .optional(),
  marketplaceId: z
    .string({ error: 'marketplaceId must be a string' })
    .describe('The eBay marketplace ID (X-EBAY-C-MARKETPLACE-ID header)')
    .optional(),
  message: z
    .string({ error: 'message must be a string' })
    .describe('Seller-defined message to buyers (max 2000 characters)')
    .max(2000, 'message must be 2000 characters or less')
    .optional(),
  offerDuration: z
    .object(
      {
        unit: z
          .string({ error: 'unit must be a string' })
          .describe('Time unit (currently must be DAY)')
          .optional(),
        value: z
          .number({ error: 'value must be a number' })
          .describe('Duration value (currently must be 2)')
          .int({
            message: 'value must be an integer',
          })
          .optional(),
      },
      { error: 'offerDuration must be an object' },
    )
    .describe('Duration the offer is valid (default: 2 days)')
    .optional(),
  offeredItems: z
    .array(
      z.object({
        discountPercentage: z
          .string({ error: 'discountPercentage must be a string' })
          .describe('Percentage discount (minimum 5)')
          .optional(),
        listingId: z
          .string({ error: 'listingId must be a string' })
          .describe('The unique eBay listing ID')
          .optional(),
        price: z
          .object(
            {
              currency: z
                .string({ error: 'currency must be a string' })
                .describe('3-letter ISO 4217 currency code')
                .optional(),
              value: z
                .string({ error: 'value must be a string' })
                .describe('The monetary amount')
                .optional(),
            },
            { error: 'price must be an object' },
          )
          .describe('The discounted price')
          .optional(),
        quantity: z
          .number({ error: 'quantity must be a number' })
          .describe('Number of items (all-or-nothing offer)')
          .int({
            message: 'quantity must be an integer',
          })
          .optional(),
      }),
      { error: 'offeredItems must be an array' },
    )
    .describe('Array of items to offer (currently limited to one item)')
    .optional(),
});
