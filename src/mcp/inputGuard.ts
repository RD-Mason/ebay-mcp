import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ErrorCode, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/** Limits apply before the SDK evaluates a tool's Zod schema. */
export const MAX_MCP_INPUT_BYTES = 256 * 1024;
export const MCP_INPUT_LIMITS = Object.freeze({
  bytes: MAX_MCP_INPUT_BYTES,
  nodes: 4096,
  depth: 20,
  entries: 100,
});

const REJECTION_MESSAGE = 'MCP input exceeds the local size or complexity safety budget.';

/**
 * Iteratively inspect a JSON-shaped graph. Bytes are a conservative upper
 * bound for its JSON representation (undefined values count as null). Reject
 * accessors, cycles, shared object references, and non-JSON values rather than
 * invoking toJSON/getters or recursively traversing attacker-controlled input.
 */
export const isWithinMcpInputBudget = (message: unknown): boolean => {
  const pending: { field: unknown; depth: number }[] = [{ field: message, depth: 0 }];
  const seen = new WeakSet<object>();
  let nodes = 0;
  let bytes = 0;
  const addBytes = (additional: number): boolean => {
    bytes += additional;
    return bytes <= MCP_INPUT_LIMITS.bytes;
  };
  const stringBytes = (text: string): number =>
    text.length > MCP_INPUT_LIMITS.bytes
      ? MCP_INPUT_LIMITS.bytes + 1
      : Buffer.byteLength(JSON.stringify(text), 'utf8');

  try {
    while (pending.length > 0) {
      const next = pending.pop()!;
      if (++nodes > MCP_INPUT_LIMITS.nodes || next.depth > MCP_INPUT_LIMITS.depth) return false;
      const field = next.field;
      if (field === null || field === undefined) {
        if (!addBytes(4)) return false;
      } else if (typeof field === 'string') {
        if (!addBytes(stringBytes(field))) return false;
      } else if (typeof field === 'boolean') {
        if (!addBytes(field ? 4 : 5)) return false;
      } else if (typeof field === 'number') {
        if (!(Number.isFinite(field) && addBytes(String(field).length))) return false;
      } else if (typeof field === 'object') {
        if (seen.has(field)) return false;
        seen.add(field);
        if (Array.isArray(field)) {
          if (
            field.length > MCP_INPUT_LIMITS.entries ||
            !addBytes(2 + Math.max(0, field.length - 1))
          ) {
            return false;
          }
          for (let index = 0; index < field.length; index++) {
            const descriptor = Object.getOwnPropertyDescriptor(field, String(index));
            if (descriptor && !('value' in descriptor)) return false;
            pending.push({ field: descriptor?.value, depth: next.depth + 1 });
          }
        } else {
          const prototype = Object.getPrototypeOf(field);
          if (prototype !== Object.prototype && prototype !== null) return false;
          const keys = Object.getOwnPropertyNames(field);
          if (
            keys.length > MCP_INPUT_LIMITS.entries ||
            Object.getOwnPropertySymbols(field).length > 0
          ) {
            return false;
          }
          if (!addBytes(2 + Math.max(0, keys.length - 1))) return false;
          for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(field, key)!;
            if (
              !('value' in descriptor && descriptor.enumerable && addBytes(stringBytes(key) + 1))
            ) {
              return false;
            }
            pending.push({ field: descriptor.value, depth: next.depth + 1 });
          }
        }
      } else {
        return false;
      }
    }
    return true;
  } catch {
    // No original message or property contents enter diagnostics.
    return false;
  }
};

/** Reply only to requests, never to notifications or responses. */
const rejectInput = (transport: Transport, message: unknown): void => {
  if (typeof message !== 'object' || message === null) return;
  const method = Object.getOwnPropertyDescriptor(message, 'method');
  const requestId = Object.getOwnPropertyDescriptor(message, 'id');
  if (typeof method?.value !== 'string' || !requestId || !('value' in requestId)) return;
  const id = requestId.value;
  const safeId =
    (typeof id === 'number' && Number.isFinite(id)) || (typeof id === 'string' && id.length <= 256);
  const rejection: JSONRPCMessage = {
    jsonrpc: '2.0',
    ...(safeId ? { id } : {}),
    error: { code: ErrorCode.InvalidParams, message: REJECTION_MESSAGE },
  };
  void transport.send(rejection, safeId ? { relatedRequestId: id } : undefined).catch(() => {
    transport.onerror?.(new Error('Unable to send the MCP input-budget rejection.'));
  });
};

/**
 * Intercept callback assignment at the public Transport boundary. SDK protocol
 * dispatch and tool-schema validation cannot see an over-budget message. All
 * other properties, session IDs, and callbacks remain on the original transport;
 * methods are bound to it so classes with private fields keep working.
 */
export const guardMcpTransport = (transport: Transport): Transport =>
  new Proxy(transport, {
    get(target, property) {
      const member = Reflect.get(target, property, target);
      return typeof member === 'function' ? member.bind(target) : member;
    },
    set(target, property, assigned) {
      if (property !== 'onmessage' || typeof assigned !== 'function') {
        return Reflect.set(target, property, assigned, target);
      }
      const handler = assigned as NonNullable<Transport['onmessage']>;
      const guarded: NonNullable<Transport['onmessage']> = (message, extra) => {
        if (!isWithinMcpInputBudget(message)) {
          rejectInput(target, message);
          return;
        }
        handler(message, extra);
      };
      return Reflect.set(target, property, guarded, target);
    },
  });
