import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export const READ_ONLY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const CALLING_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const TOOL_TITLES = {
  list_nodit_api_categories: "List Nodit API Categories",
  list_nodit_node_apis: "List Nodit Node APIs",
  list_nodit_data_apis: "List Nodit Data APIs",
  list_nodit_webhook_apis: "List Nodit Webhook APIs",
  list_nodit_aptos_indexer_api_query_root: "List Nodit Aptos Indexer Query Roots",
  get_nodit_api_spec: "Get Nodit API Spec",
  get_nodit_aptos_indexer_api_spec: "Get Nodit Aptos Indexer API Spec",
  call_nodit_api: "Call Nodit API",
  call_nodit_aptos_indexer_api: "Call Nodit Aptos Indexer API",
} as const;

export const TOOL_DESCRIPTIONS = {
  list_nodit_api_categories:
    "Lists available Nodit API categories from Nodit Blockchain Context. To use the Nodit API tool, you must first call this tool.",
  list_nodit_node_apis: "Lists available Nodit API operations.",
  list_nodit_data_apis: "Lists available Nodit Data API operations.",
  list_nodit_webhook_apis: "Lists available Nodit Webhook API operations.",
  list_nodit_aptos_indexer_api_query_root:
    "Lists all query roots available in the Nodit Aptos Indexer GraphQL API.",
  get_nodit_api_spec:
    "Gets the fully resolved spec details for a Nodit Blockchain Context API operationId. Returns details as a JSON string.",
  get_nodit_aptos_indexer_api_spec:
    "Returns the GraphQL specification for a specific query root in the Nodit Aptos Indexer API.",
  call_nodit_api:
    "This function calls a specific Nodit Blockchain Context API using its operationId. Before making the call, it's recommended to verify the detailed API specifications using the 'get_nodit_api_spec' tool. API reference: https://developer.nodit.io/api/api-overview. Please note that using this tool will consume your API quota.",
  call_nodit_aptos_indexer_api:
    "Calls a Nodit Aptos Indexer API. Returns the API response. Before making the call, it's recommended to verify the detailed API specifications using the 'get_nodit_aptos_indexer_api_spec' tool. API reference: https://developer.nodit.io/api/api-overview. Please note that using this tool will consume your API quota.",
} as const;

export const TOOL_PARAM_DESCRIPTIONS = {
  CHAIN: "Nodit chain to call. e.g. 'ethereum' or 'polygon'.",
  NETWORK: "Nodit network to call. e.g. 'mainnet' or 'amoy'.",
  OPERATION_ID:
    "Nodit API operationId to call. Must include the chain prefix (e.g., 'ethereum-eth_blocknumber', 'polygon-eth_blocknumber', 'aptos-getAccount').",
  PATH_PARAMS:
    "Path parameters that fill {placeholders} in the request URL (e.g. {\"address\": \"0x...\"}). Map each 'path' parameter from get_nodit_api_spec to a key here.",
  QUERY_PARAMS:
    "Query string parameters appended to the request URL (e.g. {\"pagination.limit\": 10}). Map each 'query' parameter from get_nodit_api_spec to a key here.",
  REQUEST_BODY:
    "JSON request body for POST/PUT endpoints (JSON-RPC, etc.). Not for path/query parameters — use pathParams/queryParams for those.",
  APTOS_NETWORK: "Nodit network to call. e.g. 'mainnet' or 'testnet'.",
  APTOS_REQUEST_BODY: "Graphql request body matching the API's spec.",
  SPEC_OPERATION_ID:
    "The operationId to get the resolved specification for. Must include the chain prefix in `{chain}-{methodName}` format (e.g., 'ethereum-eth_blocknumber', 'aptos-getAccount', 'ethereum-createWebhook'). Method-name-only input (e.g., 'eth_blocknumber') is rejected with guidance on the available chains.",
  APTOS_QUERY_ROOT:
    "The name of the query root to get the specification for. Use list_nodit_aptos_indexer_api_query_root to see available query roots.",
} as const;
