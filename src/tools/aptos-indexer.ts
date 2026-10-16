import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import * as z from "zod/v4";
import {
  createErrorResponse,
  loadNoditAptosIndexerApiSpec,
  AptosIndexerApiSpec,
  Relationship,
  GraphQLSpec
} from "../helper/nodit-apidoc-helper.js";
import { callNoditHttp } from "../helper/nodit-http-client.js";
import { maskInternalError } from "../helper/tool-error.js";
import { CALLING_TOOL_ANNOTATIONS, READ_ONLY_TOOL_ANNOTATIONS, TOOL_DESCRIPTIONS, TOOL_PARAM_DESCRIPTIONS, TOOL_TITLES } from "./tool-metadata.js";

type TableType = NonNullable<NonNullable<NonNullable<AptosIndexerApiSpec['metadata']>['sources']>[0]['tables']>[0];

// Resolves the GraphQL query root field name for a Hasura table, mirroring Hasura's
// default naming: custom_name when set; otherwise table.name for the "public" schema,
// or `{schema}_{name}` for other schemas (e.g. nft_metadata_crawler_parsed_asset_uris).
// legacy_migration_v1 tables are not exposed on the live endpoint, so they are excluded.
function getQueryRootName(tableInfo: TableType): string | null {
  const schema = tableInfo.table?.schema;
  if (schema === 'legacy_migration_v1') return null;
  const customName = tableInfo.configuration?.custom_name;
  if (customName && customName.trim()) return customName;
  const name = tableInfo.table?.name;
  if (!name) return null;
  return schema && schema !== 'public' ? `${schema}_${name}` : name;
}

function formatColumnMapping(mapping: Record<string, any> | undefined): string {
  if (!mapping || Object.keys(mapping).length === 0) return "{}";
  const entries = Object.entries(mapping)
    .map(([k, v]) => `"${k}": "${v}"`)
    .join(", ");
  return `{${entries}}`;
}

function formatRelationships(relationships: Array<{ name: string; remote_table: string; column_mapping: Record<string, any> }>): string {
  return relationships
    .map(rel => `{
      "name": "${rel.name}",
      "remote_table": "${rel.remote_table}",
      "column_mapping": ${formatColumnMapping(rel.column_mapping)}
    }`)
    .join(",\n    ");
}

function formatGraphQLTable(table: { name?: string | null; schema?: string | null } | null | undefined): string {
  if (!table) return "null";
  return `{
    "name": "${table.name ?? "null"}",
    "schema": "${table.schema ?? "null"}"
  }`;
}

function formatGraphQLSpec(spec: GraphQLSpec): string {
  const columns = spec.columns.map(c => `"${c}"`).join(",\n    ");
  return `{
  "name": "${spec.name}",
  "table": ${formatGraphQLTable(spec.table)},
  "columns": [${columns}],
  "relationships": {
    "object": [${formatRelationships(spec.relationships.object)}],
    "array": [${formatRelationships(spec.relationships.array)}]
  }
}`;
}

const getNoditAptosIndexerApiSpecInputSchema = {
  queryRoot: z.string().describe(TOOL_PARAM_DESCRIPTIONS.APTOS_QUERY_ROOT),
};

const callNoditAptosIndexerApiInputSchema = {
  network: z.string().describe(TOOL_PARAM_DESCRIPTIONS.APTOS_NETWORK),
  requestBody: z.record(z.string(), z.any()).describe(TOOL_PARAM_DESCRIPTIONS.APTOS_REQUEST_BODY),
};

type GetNoditAptosIndexerApiSpecInput = z.infer<z.ZodObject<typeof getNoditAptosIndexerApiSpecInputSchema>>;
type CallNoditAptosIndexerApiInput = z.infer<z.ZodObject<typeof callNoditAptosIndexerApiInputSchema>>;

function mapRelationships(relationships: Relationship[] | undefined) {
  if (!relationships) return [];
  return relationships.map((rel: Relationship) => {
    if (!rel || typeof rel !== 'object') return { name: 'unknown', remote_table: 'unknown', column_mapping: {} };
    return {
      name: rel.name ?? 'unknown',
      remote_table: rel.using?.manual_configuration?.remote_table?.name ?? 'unknown',
      column_mapping: rel.using?.manual_configuration?.column_mapping ?? {}
    };
  });
}

type SourcedSpec = AptosIndexerApiSpec & {
  metadata: NonNullable<AptosIndexerApiSpec['metadata']> & {
    sources: NonNullable<NonNullable<AptosIndexerApiSpec['metadata']>['sources']>;
  };
};

function findTableSpec(spec: SourcedSpec, queryRoot: string): TableType | null {
  for (const source of spec.metadata.sources) {
    if (!source.tables) continue;
    for (const tableInfo of source.tables) {
      if (getQueryRootName(tableInfo) === queryRoot) return tableInfo;
    }
  }
  return null;
}

function hasSources(spec: AptosIndexerApiSpec | null | undefined): spec is SourcedSpec {
  return !!spec && !!spec.metadata && !!spec.metadata.sources;
}

function registerQueryRootListTool(server: McpServer, noditAptosIndexerApiSpec: AptosIndexerApiSpec) {
  server.registerTool(
    "list_nodit_aptos_indexer_api_query_root",
    {
      title: TOOL_TITLES.list_nodit_aptos_indexer_api_query_root,
      description: TOOL_DESCRIPTIONS.list_nodit_aptos_indexer_api_query_root,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async () => {
      const toolName = "list_nodit_aptos_indexer_api_query_root";

      try {
        if (!hasSources(noditAptosIndexerApiSpec)) {
          return createErrorResponse("Failed to load or parse the Aptos Indexer API schema", toolName);
        }

        const queryRoots: string[] = [];
        for (const source of noditAptosIndexerApiSpec.metadata.sources) {
          if (source.tables) {
            for (const tableInfo of source.tables) {
              const name = getQueryRootName(tableInfo);
              if (name) queryRoots.push(name);
            }
          }
        }

        if (queryRoots.length === 0) {
          return createErrorResponse("No query roots found in the Aptos Indexer API schema", toolName);
        }

        queryRoots.sort();

        const resultText = `Available Aptos Indexer API query roots:\n\n${queryRoots.join('\n')}`;
        return { content: [{ type: "text" as const, text: resultText }] };
      } catch (error) {
        return createErrorResponse(maskInternalError(error, toolName), toolName);
      }
    }
  );
}

function registerAptosIndexerSpecTool(server: McpServer, noditAptosIndexerApiSpec: AptosIndexerApiSpec) {
  server.registerTool(
    "get_nodit_aptos_indexer_api_spec",
    {
      title: TOOL_TITLES.get_nodit_aptos_indexer_api_spec,
      description: TOOL_DESCRIPTIONS.get_nodit_aptos_indexer_api_spec,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      inputSchema: getNoditAptosIndexerApiSpecInputSchema as unknown as ZodRawShapeCompat,
    },
    async (args) => {
      const { queryRoot } = args as GetNoditAptosIndexerApiSpecInput;
      const toolName = "get_nodit_aptos_indexer_api_spec";

      try {
        if (!hasSources(noditAptosIndexerApiSpec)) {
          return createErrorResponse("Failed to load or parse the Aptos Indexer API schema", toolName);
        }

        const tableSpec = findTableSpec(noditAptosIndexerApiSpec, queryRoot);
        if (!tableSpec) {
          return createErrorResponse(`Query root '${queryRoot}' not found in the Aptos Indexer API schema. Use list_nodit_aptos_indexer_api_query_root to see available query roots.`, toolName);
        }

        const spec: GraphQLSpec = {
          name: queryRoot,
          table: tableSpec.table,
          columns: tableSpec.select_permissions?.[0]?.permission?.columns || [],
          relationships: {
            object: mapRelationships(tableSpec.object_relationships),
            array: mapRelationships(tableSpec.array_relationships)
          }
        };

        return {
          content: [{
            type: "text" as const,
            text: `GraphQL specification for query root '${queryRoot}':\n\n${formatGraphQLSpec(spec)}`
          }]
        };
      } catch (error) {
        return createErrorResponse(maskInternalError(error, toolName), toolName);
      }
    }
  );
}

function registerAptosIndexerCallTool(server: McpServer) {
  server.registerTool(
    "call_nodit_aptos_indexer_api",
    {
      title: TOOL_TITLES.call_nodit_aptos_indexer_api,
      description: TOOL_DESCRIPTIONS.call_nodit_aptos_indexer_api,
      annotations: CALLING_TOOL_ANNOTATIONS,
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

      const result = await callNoditHttp({
        apiUrl,
        httpMethod: 'post',
        apiKey,
        toolName,
        requestBody,
        outboundLog: `Calling Aptos Indexer GraphQL API: ${apiUrl}`,
      });

      if (!result.ok) {
        return createErrorResponse(result.message, toolName);
      }
      return { content: [{ type: "text" as const, text: result.text }] };
    }
  );
}

export function registerAptosIndexerTools(server: McpServer) {
  const noditAptosIndexerApiSpec: AptosIndexerApiSpec = loadNoditAptosIndexerApiSpec();

  registerQueryRootListTool(server, noditAptosIndexerApiSpec);
  registerAptosIndexerSpecTool(server, noditAptosIndexerApiSpec);
  registerAptosIndexerCallTool(server);
}
