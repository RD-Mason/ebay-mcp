/**
 * EBAY_READ_ONLY mode: classify and filter tools that are safe under a
 * read-only deployment (no create/update/delete side effects).
 *
 * Classification prefers MCP annotations when present, then falls back to a
 * conservative name heuristic so unannotated tools (many inventory/fulfillment
 * endpoints) still gate correctly.
 */

/**
 * Minimal definition shape needed for read-only classification.
 * Intentionally structural so callers can pass full {@link ToolDefinition}s
 * without this module importing the tools tree.
 */
import process from 'node:process';
export interface ReadOnlyToolDefinition {
  name: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  };
}

/**
 * Write action at the start of a tool name (after ebay_ and optional bulk_).
 * Later nouns such as get_transfer and get_listing_set are not write actions.
 *
 * Note: `bulk` and bare `offer` are intentionally omitted — `bulk_get_*` and
 * `get_offer(s)` are reads; bulk/write verbs still match via create/update/etc.
 */
const WRITE_NAME_PATTERN =
  /^(?:ebay_)?(?:bulk_)?(create|update|delete|issue|publish|end|revise|upload|accept|contest|send|mark|provide|appeal|escalate|close|add|remove|set|relish|withdraw|complete|confirm|cancel|void|replace|move|enable|disable|assign|unassign|transfer|relinquish|relist|promote|pause|resume|launch|clone)(_|$)/;

/** Common read-oriented name segments (whole underscore-delimited tokens). */
const READ_NAME_PATTERN =
  /^(?:ebay_)?(?:bulk_)?(get|list|find|search|fetch|check|read|view|describe|status|health)(_|$)/;

/**
 * Whether a tool is safe to expose when `EBAY_READ_ONLY` is enabled.
 *
 * @param definition - Tool name plus optional MCP annotations.
 * @returns `true` when the tool is classified as read-only.
 *
 * @example
 * ```ts
 * isReadOnlyTool({ name: 'ebay_get_orders' }); // true
 * isReadOnlyTool({ name: 'ebay_create_offer' }); // false
 * ```
 */
export const isReadOnlyTool = (definition: ReadOnlyToolDefinition): boolean => {
  if (definition.annotations?.readOnlyHint === false) return false;
  if (definition.annotations?.destructiveHint === true) return false;

  const name = definition.name.toLowerCase();

  if (WRITE_NAME_PATTERN.test(name)) return false;
  if (definition.annotations?.readOnlyHint === true) return true;
  if (READ_NAME_PATTERN.test(name)) return true;
  // Connector tools without the ebay_ prefix
  if (name === 'search' || name === 'fetch') return true;

  // Default: exclude from read-only mode (safer)
  return false;
};

/**
 * Whether `EBAY_READ_ONLY` is enabled in the given environment.
 *
 * Accepts `true`, `1`, and `yes` (case-insensitive). Any other value (including
 * unset or misspelled) keeps read-only mode on. Disabling this filter alone
 * does not grant write access: the runtime also requires explicit write opt-in
 * and an exact local tool allowlist.
 *
 * @param env - Environment map (defaults to `process.env`).
 * @returns `true` when read-only mode should filter registered tools.
 *
 * @example
 * ```ts
 * isReadOnlyModeEnabled({ EBAY_READ_ONLY: 'true' }); // true
 * isReadOnlyModeEnabled({ EBAY_READ_ONLY: '0' }); // false
 * ```
 */
export const isReadOnlyModeEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => {
  const raw = env.EBAY_READ_ONLY?.trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'no');
};
