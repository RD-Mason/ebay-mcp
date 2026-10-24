/** Default protection for data returned to an AI client. This is field-based
 * minimization, not a guarantee that arbitrary prose is free of personal data. */
import process from 'node:process';
const REDACTED = '[REDACTED]';
const SECRET_FIELD = /secret|password|token|authorization|cookie|api.?key|private.?key/i;
const PERSONAL_FIELD =
  /^(?:buyer(?:s|Id|Name|Username|UserId|RegistrationAddress)?|recipient(?:Name)?|addressee|fullName|firstName|lastName|email(?:Address)?|phone(?:Number)?|primaryPhone|secondaryPhone|username|userName|userId|address(?:Line[123])?|street(?:[123])?|shippingAddress|shipTo|billingAddress|contact(?:Info|Address|Name)?|postalCode|zipCode|birthDate|dateOfBirth|taxIdentifier|taxId|ssn|nationalId|deliveryInstructions|messageText|messageContent|messageBody|messageSubject|messages)$/i;
const EMAIL =
  /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9](?:[A-Z0-9.-]{0,251}[A-Z0-9])?\.[A-Z]{2,63}/gi;
const URL_CREDENTIALS = /\/\/[^\s/@]+@/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi;
const AUTHORIZATION = /(\bAuthorization\s*:\s*Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi;
const EBAY_TOKEN = /\bv\^1\.[^\s"'<>]+/g;
const SECRET_QUERY =
  /([?&](?:access_token|refresh_token|client_secret|code|api_key|password)=)[^&#\s]*/gi;

/** Redact recognizable secrets in free text, including URL user-info. */
export const sanitizeSecretText = (text: string): string =>
  text
    .replace(URL_CREDENTIALS, `//${REDACTED}@`)
    .replace(SECRET_QUERY, `$1${REDACTED}`)
    .replace(AUTHORIZATION, `$1${REDACTED}`)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(EBAY_TOKEN, REDACTED);

/**
 * Remove known credential and customer fields recursively without changing the
 * original object. JSON inside MCP text blocks is decoded before redaction.
 * EBAY_MCP_REDACT_PII=false is an explicit local opt-out for personal data;
 * credentials are always removed. IDs for orders, items, and SKUs remain usable.
 */
export const sanitizeToolResultForModel = <T>(
  toolResult: T,
  env: NodeJS.ProcessEnv = process.env,
): T => {
  const redactPersonal = env.EBAY_MCP_REDACT_PII !== 'false';
  const visited = new WeakSet<object>();
  const sanitize = (field: unknown): unknown => {
    if (typeof field === 'string') {
      // MCP formatters sometimes wrap a JSON response in content[].text.
      const trimmed = field.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return JSON.stringify(sanitize(JSON.parse(field)));
        } catch {
          // Non-JSON prose is still scanned for recognizable secrets/emails.
        }
      }
      const safeText = sanitizeSecretText(field);
      return redactPersonal && safeText.includes('@')
        ? safeText.replace(EMAIL, REDACTED)
        : safeText;
    }
    if (field === null || typeof field !== 'object') {
      return field;
    }
    if (field instanceof Uint8Array) {
      return '[REDACTED BINARY CONTENT]';
    }
    if (field instanceof Date) {
      return field;
    }
    if (visited.has(field)) {
      return '[REDACTED CIRCULAR REFERENCE]';
    }
    visited.add(field);
    if (Array.isArray(field)) {
      return field.map(sanitize);
    }
    const fields = Object.entries(field).map(([key, nested]) => [
      key,
      SECRET_FIELD.test(key) || (redactPersonal && PERSONAL_FIELD.test(key))
        ? REDACTED
        : sanitize(nested),
    ]);
    return Object.fromEntries(fields);
  };
  return sanitize(toolResult) as T;
};
