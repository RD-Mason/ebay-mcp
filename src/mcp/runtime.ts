import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { EbaySellerApi } from '@/api/ebaySellerApi.js';
import { getEbayConfig, mcpConfig } from '@/config/environment.js';
import { resolveToolGatingMode } from '@/config/toolFamilies.js';
import { guardMcpTransport } from '@/mcp/inputGuard.js';
import {
  assertSafeToolResult,
  createToolSecurityPolicy,
  isToolAllowed,
  type ToolSecurityPolicy,
} from '@/mcp/securityPolicy.js';
import {
  createToolGatingController,
  DYNAMIC_MODE_INSTRUCTIONS,
  registerMetaTools,
  toolNamesInFamilies,
} from '@/mcp/toolGating.js';
import { buildUiToolResult, createUiBridge, type UiBridge } from '@/mcp/uiBridge.js';
import { getToolEntries, type ToolEntry } from '@/tools/registry.js';
import { getEbayErrorDetails } from '@/utils/errors.js';
import { serverLogger, toolLogger } from '@/utils/logger.js';
import { sanitizeToolResultForModel } from '@/utils/privacy.js';
import { Effect } from 'effect';

type ToolArgs = Record<string, unknown>;

/**
 * Optional dependencies and metadata for constructing the eBay MCP runtime.
 */
export interface EbayMcpRuntimeOptions {
  /** Optional prebuilt API facade, mainly for tests. */
  api?: EbaySellerApi;
  /** Optional MCP implementation metadata advertised during initialize. */
  serverConfig?: Implementation;
  /** Enables debug/error logs for each tool call when true. */
  logToolExecution?: boolean;
}

/**
 * Initialized MCP server runtime and eBay API facade.
 */
export interface EbayMcpRuntime {
  /** eBay API facade shared by every registered tool handler. */
  api: EbaySellerApi;
  /** MCP server instance with eBay tools registered. */
  server: McpServer;
  /** Initializes credentials/token state before the server accepts real calls. */
  initializeApi(): Promise<void>;
}

function formatToolSuccess(handlerOutput: unknown) {
  // JSON.stringify(undefined) returns undefined (not a string), which produces an
  // invalid MCP content block and triggers client -32602 on empty-body 201/204s.
  const successDocument =
    handlerOutput === undefined || handlerOutput === null ? { status: 'success' } : handlerOutput;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(successDocument, null, 2),
      },
    ],
  };
}

function formatToolFailure(error: unknown) {
  const { message, status, errors } = getEbayErrorDetails(error);
  const failureDocument: Record<string, unknown> = { error: message };
  if (status !== undefined) {
    failureDocument.status = status;
  }
  if (errors !== undefined) {
    failureDocument.details = errors;
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(failureDocument, null, 2),
      },
    ],
    isError: true,
  };
}

function registerTool(
  server: McpServer,
  api: EbaySellerApi,
  entry: ToolEntry,
  logToolExecution: boolean,
  ui: UiBridge,
  policy: ToolSecurityPolicy,
): RegisteredTool {
  const { definition, handler } = entry;

  // Registered plainly (no UI `_meta`) so every host gets a working text tool by
  // default; the capability gate later flips `_meta.ui` on for UI-capable clients.
  const registered = server.registerTool(
    definition.name,
    {
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: definition.annotations,
    },
    async (args: ToolArgs) => {
      if (logToolExecution) {
        toolLogger.debug(`Executing tool: ${definition.name}`);
      }

      return await Effect.runPromise(
        Effect.tryPromise({
          try: async () => {
            if (!isToolAllowed(definition, policy)) {
              throw new Error(`Tool ${definition.name} is denied by the local security policy.`);
            }
            const handlerOutput = await handler(api, args);
            assertSafeToolResult(handlerOutput, policy);
            return handlerOutput;
          },
          catch: (error) => error,
        }).pipe(
          Effect.flatMap((handlerOutput) =>
            Effect.try({
              try: () => {
                if (logToolExecution) {
                  toolLogger.debug(`Tool ${definition.name} completed successfully`);
                }

                const toolResult = entry.formatResult
                  ? entry.formatResult(handlerOutput, args)
                  : ui.shouldRender(entry)
                    ? buildUiToolResult(entry.ui, sanitizeToolResultForModel(handlerOutput))
                    : formatToolSuccess(handlerOutput);
                assertSafeToolResult(toolResult, policy);
                return sanitizeToolResultForModel(toolResult);
              },
              catch: (error) => error,
            }),
          ),
          Effect.catchAll((error) => {
            if (logToolExecution) {
              toolLogger.error(`Tool ${definition.name} failed`, {
                status: getEbayErrorDetails(error).status,
              });
            }

            const failureResult = sanitizeToolResultForModel(formatToolFailure(error));
            try {
              assertSafeToolResult(failureResult, policy);
              return Effect.succeed(failureResult);
            } catch {
              return Effect.succeed(
                formatToolFailure(
                  new Error('Tool failed; error details exceeded the local output safety limit.'),
                ),
              );
            }
          }),
        ),
      );
    },
  );

  ui.register(entry, registered);
  return registered;
}

/**
 * Create an MCP server runtime and register all eBay tool handlers.
 *
 * @param options - Optional runtime dependencies and metadata overrides.
 * @returns Initialized runtime wrapper containing the MCP server and API facade.
 *
 * @example
 * ```ts
 * const runtime = createEbayMcpRuntime({ logToolExecution: true });
 * await runtime.initializeApi();
 * ```
 */
export const createEbayMcpRuntime = (options: EbayMcpRuntimeOptions = {}): EbayMcpRuntime => {
  const api = options.api ?? new EbaySellerApi(getEbayConfig());
  const serverInfo = options.serverConfig ?? mcpConfig;
  const mode = resolveToolGatingMode();
  const policy = createToolSecurityPolicy();

  // Instructions are set only in dynamic mode so the agent knows the catalogue is
  // hidden behind the discovery tools; default/static modes keep the handshake
  // byte-for-byte unchanged (a bare single-arg construction).
  const server =
    mode.kind === 'dynamic'
      ? new McpServer(serverInfo, { instructions: DYNAMIC_MODE_INSTRUCTIONS })
      : new McpServer(serverInfo);
  const connect = server.connect.bind(server);
  server.connect = (transport) => connect(guardMcpTransport(transport));

  const ui = createUiBridge(server, import.meta.url);

  // Static mode registers only the named families; all and dynamic register the
  // full catalogue (dynamic then disables it below, before the transport connects).
  const allEntries = getToolEntries();
  let entries =
    mode.kind === 'static'
      ? (() => {
          const names = toolNamesInFamilies(mode.families);
          return allEntries.filter((entry) => names.has(entry.definition.name));
        })()
      : allEntries;

  entries = entries.filter((entry) => isToolAllowed(entry.definition, policy));
  serverLogger.info(
    `Local security policy: ${entries.length} tools; writes ${policy.readOnly ? 'disabled' : 'allowlisted'}`,
  );

  const handles = new Map<string, RegisteredTool>();
  for (const entry of entries) {
    handles.set(
      entry.definition.name,
      registerTool(server, api, entry, options.logToolExecution ?? false, ui, policy),
    );
  }

  if (mode.kind === 'dynamic') {
    // Disable before `connect`: the SDK only emits `tools/listChanged` once the
    // transport is connected, so these flips are silent. The agent re-enables the
    // tools it needs via the meta-tools, which fire `listChanged` post-connect.
    for (const handle of handles.values()) {
      handle.disable();
    }
    registerMetaTools(server, createToolGatingController(handles));
    serverLogger.info(
      `Dynamic tool mode: ${handles.size} eBay tools hidden behind 3 discovery tools`,
    );
  } else if (mode.kind === 'static') {
    serverLogger.info(
      `Static tool mode: registered ${handles.size} tools from families: ${mode.families.join(', ')}`,
    );
  } else {
    serverLogger.info(`Registering ${handles.size} tools`);
  }

  // Install after registration so every UI-eligible tool is captured before the
  // gate can flip their metadata on a UI-capable client's `initialize`.
  ui.installCapabilityGate();

  return {
    api,
    server,
    async initializeApi() {
      await Effect.runPromise(api.initialize());
    },
  };
};
