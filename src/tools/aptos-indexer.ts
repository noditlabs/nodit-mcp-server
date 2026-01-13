import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import * as z from "zod/v4";
import {
  createErrorResponse,
  log,
  loadNoditAptosIndexerApiSpec,
  AptosIndexerApiSpec,
  Relationship,
  GraphQLSpec
} from "../helper/nodit-apidoc-helper.js";
import {
  createTimeoutSignal
} from "../helper/call-api-helper.js";

const TIMEOUT_MS = 60_000;

type TableType = NonNullable<NonNullable<NonNullable<AptosIndexerApiSpec['metadata']>['sources']>[0]['tables']>[0];

const getNoditAptosIndexerApiSpecInputSchema = {
  queryRoot: z.string().describe("The name of the query root to get the specification for. Use list_nodit_aptos_indexer_api_query_root to see available query roots."),
};

const callNoditAptosIndexerApiInputSchema = {
  network: z.string().describe("Nodit network to call. e.g. 'mainnet' or 'testnet'."),
  requestBody: z.record(z.string(), z.any()).describe("Graphql request body matching the API's spec."),
};

type GetNoditAptosIndexerApiSpecInput = z.infer<z.ZodObject<typeof getNoditAptosIndexerApiSpecInputSchema>>;
type CallNoditAptosIndexerApiInput = z.infer<z.ZodObject<typeof callNoditAptosIndexerApiInputSchema>>;

export function registerAptosIndexerTools(server: McpServer) {
  const noditAptosIndexerApiSpec: AptosIndexerApiSpec = loadNoditAptosIndexerApiSpec();

  server.registerTool(
    "list_nodit_aptos_indexer_api_query_root",
    {
      description: "Lists all query roots available in the Nodit Aptos Indexer GraphQL API.",
    },
    async () => {
      const toolName = "list_nodit_aptos_indexer_api_query_root";

      try {
        if (!noditAptosIndexerApiSpec || !noditAptosIndexerApiSpec.metadata || !noditAptosIndexerApiSpec.metadata.sources) {
          return createErrorResponse("Failed to load or parse the Aptos Indexer API schema", toolName);
        }

        const queryRoots: string[] = [];
        for (const source of noditAptosIndexerApiSpec.metadata.sources) {
          if (source.tables) {
            for (const tableInfo of source.tables) {
              if (tableInfo.configuration && tableInfo.configuration.custom_name) {
                queryRoots.push(tableInfo.configuration.custom_name);
              }
            }
          }
        }

        if (queryRoots.length === 0) {
          return createErrorResponse("No query roots found in the Aptos Indexer API schema", toolName);
        }

        queryRoots.sort();

        const resultText = `Available Aptos Indexer API query roots:\n\n${queryRoots.join('\n')}`;
        return { content: [{ type: "text", text: resultText }] };
      } catch (error) {
        return createErrorResponse(`Error processing Aptos Indexer API schema: ${(error as Error).message}`, toolName);
      }
    }
  );

  server.registerTool(
    "get_nodit_aptos_indexer_api_spec",
    {
      description: "Returns the GraphQL specification for a specific query root in the Nodit Aptos Indexer API.",
      inputSchema: getNoditAptosIndexerApiSpecInputSchema as unknown as ZodRawShapeCompat,
    },
    async (args) => {
      const { queryRoot } = args as GetNoditAptosIndexerApiSpecInput;
      const toolName = "get_nodit_aptos_indexer_api_spec";

      try {
        if (!noditAptosIndexerApiSpec || !noditAptosIndexerApiSpec.metadata || !noditAptosIndexerApiSpec.metadata.sources) {
          return createErrorResponse("Failed to load or parse the Aptos Indexer API schema", toolName);
        }

        let tableSpec: TableType | null = null;
        for (const source of noditAptosIndexerApiSpec.metadata.sources) {
          if (source.tables) {
            for (const tableInfo of source.tables) {
              if (tableInfo.configuration && tableInfo.configuration.custom_name === queryRoot) {
                tableSpec = tableInfo;
                break;
              }
            }
          }
          if (tableSpec) break;
        }

        if (!tableSpec) {
          return createErrorResponse(`Query root '${queryRoot}' not found in the Aptos Indexer API schema. Use list_nodit_aptos_indexer_api_query_root to see available query roots.`, toolName);
        }

        const spec: GraphQLSpec = {
          name: queryRoot,
          table: tableSpec.table,
          columns: tableSpec.select_permissions?.[0]?.permission?.columns || [],
          relationships: {
            object: [],
            array: []
          }
        };

        if (tableSpec.object_relationships) {
          spec.relationships.object = tableSpec.object_relationships.map((rel: Relationship) => {
            if (!rel || typeof rel !== 'object') return { name: 'unknown', remote_table: 'unknown', column_mapping: {} };
            return {
              name: rel.name ?? 'unknown',
              remote_table: rel.using?.manual_configuration?.remote_table?.name ?? 'unknown',
              column_mapping: rel.using?.manual_configuration?.column_mapping ?? {}
            };
          });
        }

        if (tableSpec.array_relationships) {
          spec.relationships.array = tableSpec.array_relationships.map((rel: Relationship) => {
            if (!rel || typeof rel !== 'object') return { name: 'unknown', remote_table: 'unknown', column_mapping: {} };
            return {
              name: rel.name ?? 'unknown',
              remote_table: rel.using?.manual_configuration?.remote_table?.name ?? 'unknown',
              column_mapping: rel.using?.manual_configuration?.column_mapping ?? {}
            };
          });
        }

        return {
          content: [{
            type: "text",
            text: `GraphQL specification for query root '${queryRoot}':\n\n${JSON.stringify(spec, null, 2)}`
          }]
        };
      } catch (error) {
        return createErrorResponse(`Error processing Aptos Indexer API schema: ${(error as Error).message}`, toolName);
      }
    }
  );

  server.registerTool(
    "call_nodit_aptos_indexer_api",
    {
      description: "Calls a Nodit Aptos Indexer API. Returns the API response. Before making the call, it's recommended to verify the detailed API specifications using the 'get_nodit_aptos_indexer_api_spec' tool. Please note that using this tool will consume your API quota.",
      inputSchema: callNoditAptosIndexerApiInputSchema as unknown as ZodRawShapeCompat,
    },
    async (args) => {
      const { network, requestBody } = args as CallNoditAptosIndexerApiInput;
      const toolName = "call_nodit_aptos_indexer_api";
      const apiKey = process.env.NODIT_API_KEY;
      if (!apiKey) {
        return createErrorResponse(`NODIT_API_KEY environment variable is not set. It is required to call nodit api. Please check your mcp server configuration.`, toolName);
      }

      const apiUrl = `https://aptos-${network}.nodit.io/v1/graphql`;
      const { signal, cleanup } = createTimeoutSignal(TIMEOUT_MS);

      try {
        const apiOptions: RequestInit = {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'nodit-mcp-server',
          },
          body: JSON.stringify(requestBody),
          signal,
        };

        log(`Calling Aptos Indexer GraphQL API: ${apiUrl}, apiOptions: ${JSON.stringify(apiOptions, null, 2)}`);

        const response = await fetch(apiUrl, apiOptions);
        const responseBodyText = await response.text();

        if (!response.ok) {
          const statusMessages: Record<number, string> = {
            400: `${responseBodyText}. Help the user identify what went wrong in their request. Explain the likely issue based on the error message, and provide a corrected example if possible.`,
            403: `${responseBodyText}. Let the user know that this API is only available to paid plan users. Explain that their current plan does not include access, and suggest upgrading to a paid tier via https://nodit.io/pricing .`,
            404: `${responseBodyText}. Let the user know that no data was found for the provided ID or address. This usually means the resource doesn't exist or hasn't been indexed yet. Suggest double-checking the input or trying again later.`,
            429: `${responseBodyText}. Inform the user that they've reached their current plan's usage limit. Recommend reviewing their usage or upgrading via https://nodit.io/pricing. Optionally mention the Referral Program: https://developer.nodit.io/docs/referral-program.`,
            500: `${responseBodyText}. This is not the user's fault. Let them know it's likely a temporary issue. Suggest retrying soon or contacting support at https://developer.nodit.io/discuss if the problem continues.`,
            503: `${responseBodyText}. Inform the user that the service may be under maintenance or experiencing high load. Suggest retrying shortly, and checking the Notice section in the Nodit Developer Portal (https://developer.nodit.io).`
          };

          if (statusMessages[response.status]) {
            return createErrorResponse(statusMessages[response.status], toolName);
          }

          let errorDetails = `Raw error response: ${responseBodyText}`;
          try {
            const errorJson = JSON.parse(responseBodyText);
            errorDetails = `Error Details (JSON):\n${JSON.stringify(errorJson, null, 2)}`;
          } catch (e) { /* ignore parsing error, use raw text */ }
          return createErrorResponse(`API Error (Status ${response.status}). ${errorDetails}`, toolName);
        }

        try {
          JSON.parse(responseBodyText);
          log(`Tool (${toolName}): API Success (${response.status})`);
          return { content: [{ type: "text", text: responseBodyText }] };
        } catch (parseError) {
          return createErrorResponse(`API returned OK status but body was not valid JSON. Raw response: ${responseBodyText}`, toolName);
        }

      } catch (error) {
        const message = error instanceof Error && error.name === 'AbortError'
          ? `The request took longer than expected and has been terminated. This may be due to high server load or because the requested data is taking longer to process. Please try again later.`
          : (error as Error).message;
        return createErrorResponse(`Network/fetch error calling API: ${message}`, toolName);
      } finally {
        cleanup()
      }
    }
  );
}
