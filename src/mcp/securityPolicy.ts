import {
  isReadOnlyModeEnabled,
  isReadOnlyTool,
  type ReadOnlyToolDefinition,
} from './readOnlyFilter.js';
import process from 'node:process';

/** Credential maintenance belongs in the local CLI, outside model-controlled calls. */
const LOCAL_ONLY_TOOLS = new Set([
  'ebay_set_user_tokens',
  'ebay_set_user_tokens_with_expiry',
  'ebay_clear_tokens',
  'ebay_display_credentials',
  'ebay_refresh_access_token',
  'ebay_exchange_authorization_code',
]);

const BINARY_TOOLS = new Set([
  'ebay_fetch_payment_dispute_evidence_content',
  'ebay_fetch_item_aspects',
  'ebay_download_post_order_document',
  'ebay_download_shipping_label_file',
  'ebay_get_feed_schedule_result_file',
  'ebay_get_feed_task_input_file',
  'ebay_get_feed_task_result_file',
]);

export interface ToolSecurityPolicy {
  readonly readOnly: boolean;
  readonly allowedWrites: ReadonlySet<string>;
  readonly allowBinaryExports: boolean;
  readonly maxResultBytes: number;
}

/** Capture once at startup so tools cannot expand their own permissions. */
export const createToolSecurityPolicy = (
  env: NodeJS.ProcessEnv = process.env,
): ToolSecurityPolicy => {
  const writesEnabled = env.EBAY_ALLOW_WRITES === 'true' && !isReadOnlyModeEnabled(env);
  const allowedWrites = new Set(
    (env.EBAY_MCP_ALLOWED_WRITE_TOOLS ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
  if ([...allowedWrites].some((name) => !/^ebay_[a-z0-9_]+$/.test(name))) {
    throw new Error(
      'EBAY_MCP_ALLOWED_WRITE_TOOLS requires exact tool names; wildcards are forbidden.',
    );
  }
  return Object.freeze({
    readOnly: !writesEnabled,
    allowedWrites,
    allowBinaryExports: env.EBAY_MCP_ALLOW_BINARY_EXPORTS === 'true',
    maxResultBytes: 1024 * 1024,
  });
};

/** Enforce independently of dynamic discovery and client approval settings. */
export const isToolAllowed = (
  definition: ReadOnlyToolDefinition,
  policy: ToolSecurityPolicy,
): boolean => {
  if (LOCAL_ONLY_TOOLS.has(definition.name)) return false;
  if (!policy.allowBinaryExports && BINARY_TOOLS.has(definition.name)) return false;
  return (
    isReadOnlyTool(definition) || (!policy.readOnly && policy.allowedWrites.has(definition.name))
  );
};

/** Opaque files cannot be reliably stripped of customer information. */
export const assertSafeToolResult = (toolResult: unknown, policy: ToolSecurityPolicy): void => {
  const checked = new WeakSet<object>();
  const rejectOpaqueBinary = (field: unknown): void => {
    if (!field || typeof field !== 'object' || checked.has(field)) return;
    checked.add(field);
    if (
      field instanceof ArrayBuffer ||
      ArrayBuffer.isView(field) ||
      (Reflect.get(field, 'type') === 'Buffer' && Array.isArray(Reflect.get(field, 'data')))
    ) {
      throw new Error(
        'Binary exports are disabled: raw attachments cannot be safely redacted for the AI client.',
      );
    }
    for (const nested of Object.values(field)) rejectOpaqueBinary(nested);
  };
  if (!policy.allowBinaryExports) rejectOpaqueBinary(toolResult);
  if (!policy.allowBinaryExports && toolResult && typeof toolResult === 'object') {
    const content = Reflect.get(toolResult, 'content');
    if (
      Array.isArray(content) &&
      content.some(
        (block) =>
          block &&
          typeof block === 'object' &&
          (block.type === 'image' ||
            block.type === 'audio' ||
            (block.type === 'resource' && typeof block.resource?.blob === 'string')),
      )
    ) {
      throw new Error(
        'Binary exports are disabled: files cannot be safely redacted for the AI client.',
      );
    }
  }
  if (Buffer.byteLength(JSON.stringify(toolResult) ?? '', 'utf8') > policy.maxResultBytes) {
    throw new Error(
      'Tool output exceeds the 1 MiB safety limit. Request a smaller page or date range.',
    );
  }
};
