import { sanitizeSecretText, sanitizeToolResultForModel } from './privacy.js';

export const redactSecrets = (text: string): string =>
  sanitizeSecretText(text).replace(
    /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9](?:[A-Z0-9.-]{0,251}[A-Z0-9])?\.[A-Z]{2,63}/gi,
    '[REDACTED]',
  );

export const redactSecretFields = (value: unknown): unknown =>
  sanitizeToolResultForModel(value, { EBAY_MCP_REDACT_PII: 'true' });
