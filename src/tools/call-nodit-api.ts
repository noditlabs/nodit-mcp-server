import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import * as z from "zod/v4";
import {
  createErrorResponse,
  getApiSpecDetails,
  isBlockedOperationId,
  isNodeApi,
  isValidNodeApi,
  isWebhookApi,
  loadNoditApiManifest,
  loadNoditDataApiSpecMap,
  loadNoditNodeApiSpecMap,
  loadNoditWebhookApiSpecMap,
  log,
} from "../helper/nodit-apidoc-helper.js";
import {
  createTimeoutSignal
} from "../helper/call-api-helper.js";

const TIMEOUT_MS = 60_000;

// Fills `{name}` path placeholders from pathParams and appends queryParams as the
// query string. Works for GET endpoints (cosmos-rest, aptos node) and POST endpoints
// that also take query parameters.
function resolvePathAndQuery(
  urlPath: string,
  pathParams: Record<string, any> | undefined,
  queryParams: Record<string, any> | undefined,
): { path: string } | { error: string } {
  const resolvedPath = urlPath.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = pathParams?.[name];
    if (value === undefined || value === null) return `{${name}}`;
    return encodeURIComponent(String(value));
  });

  const missing = [...resolvedPath.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
  if (missing.length > 0) {
    return { error: `Missing required path parameter(s) [${missing.join(', ')}] for this operation. Pass them in pathParams.` };
  }

  const query = Object.entries(queryParams ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  if (query.length > 0) {
    return { path: `${resolvedPath}?${query.join('&')}` };
  }
  return { path: resolvedPath };
}

const callNoditApiInputSchema = {
  chain: z.string().describe("Nodit chain to call. e.g. 'ethereum' or 'polygon'."),
  network: z.string().describe("Nodit network to call. e.g. 'mainnet' or 'amoy'."),
  operationId: z.string().describe("Nodit API operationId to call. Must include the chain prefix (e.g., 'ethereum-eth_blocknumber', 'polygon-eth_blocknumber', 'aptos-getAccount')."),
  pathParams: z.record(z.string(), z.any()).optional().describe("Path parameters that fill {placeholders} in the request URL (e.g. { address: '0x...' }). Map each 'path' parameter from get_nodit_api_spec to a key here."),
  queryParams: z.record(z.string(), z.any()).optional().describe("Query string parameters appended to the request URL (e.g. { 'pagination.limit': 10 }). Map each 'query' parameter from get_nodit_api_spec to a key here."),
  requestBody: z.record(z.string(), z.any()).optional().describe("JSON request body for POST/PUT endpoints (JSON-RPC, etc.). Not for path/query parameters — use pathParams/queryParams for those."),
};

type CallNoditApiInput = z.infer<z.ZodObject<typeof callNoditApiInputSchema>>;

export function registerCallNoditApiTool(server: McpServer) {
  const manifest = loadNoditApiManifest();
  const noditNodeApiSpecMap = loadNoditNodeApiSpecMap(manifest);
  const noditDataApiSpecMap = loadNoditDataApiSpecMap(manifest);
  const noditWebhookApiSpecMap = loadNoditWebhookApiSpecMap(manifest);

  server.registerTool(
    "call_nodit_api",
    {
      description: "This function calls a specific Nodit Blockchain Context API using its operationId. Before making the call, it's recommended to verify the detailed API specifications using the 'get_nodit_api_spec' tool. Please note that using this tool will consume your API quota.",
      inputSchema: callNoditApiInputSchema as unknown as ZodRawShapeCompat,
    },
    async (args) => {
      const { chain, network, operationId, pathParams, queryParams, requestBody } = args as CallNoditApiInput;
      const toolName = "call_nodit_api";

      if (isWebhookApi(operationId, noditWebhookApiSpecMap)) {
        return createErrorResponse(
          `The Nodit Webhook APIs cannot be invoked via "${toolName}".`,
          toolName,
        );
      }

      if (isBlockedOperationId(operationId)) {
        return createErrorResponse(
          `The operationId(${operationId}) cannot be invoked via "${toolName}".`,
          toolName,
        );
      }

      const apiKey = process.env.NODIT_API_KEY;
      if (!apiKey) {
        return createErrorResponse(`NODIT_API_KEY environment variable is not set. It is required to call nodit api. Please check your tool configuration.`, toolName);
      }

      const isNodeApiCall = isNodeApi(operationId, noditNodeApiSpecMap);
      const canFindOperationId = isNodeApiCall
        ? isValidNodeApi(operationId, noditNodeApiSpecMap)
        : noditDataApiSpecMap.has(operationId);

      if (!canFindOperationId) {
        return createErrorResponse(`Invalid operationId '${operationId}' for chain '${chain}'. Use 'list_nodit_data_apis' or 'list_nodit_node_apis' first.`, toolName);
      }

      if (isNodeApiCall && !operationId.includes('-')) {
        return createErrorResponse(`Invalid operationId '${operationId}'. operationId must include the chain prefix (e.g., 'ethereum-${operationId}').`, toolName);
      }

      let apiUrl: string;
      let httpMethod: string;
      try {
        if (isNodeApiCall) {
          const spec = noditNodeApiSpecMap.get(operationId)!;
          const pathInfo = getApiSpecDetails(spec, operationId);
          if (!pathInfo) {
            return createErrorResponse(`Invalid operationId '${operationId}'. No API URL found for operationId '${operationId}'.`, toolName);
          }

          const serverUrls = (spec.servers ?? []).map(s => s.url).filter((u): u is string => !!u);
          if (serverUrls.length === 0) {
            return createErrorResponse(`Invalid operationId '${operationId}'. No API URL found for operationId '${operationId}'.`, toolName);
          }

          const chainNetwork = `${chain}-${network}`;
          let baseUrl = serverUrls.find(u => u.toLowerCase().includes(chainNetwork.toLowerCase()));
          if (!baseUrl) {
            const templated = serverUrls.find(u => u.includes('{'));
            if (templated) {
              baseUrl = templated.replace(/\{[^}]+}/g, chainNetwork);
            }
          }
          if (!baseUrl) {
            return createErrorResponse(`Invalid network '${network}' for chain '${chain}' and operationId '${operationId}'.`, toolName);
          }

          httpMethod = pathInfo.method.toLowerCase();
          const resolved = resolvePathAndQuery(pathInfo.path, pathParams, queryParams);
          if ('error' in resolved) {
            return createErrorResponse(resolved.error, toolName);
          }
          apiUrl = baseUrl.replace(/\/$/, '') + resolved.path;
        } else {
          const spec = noditDataApiSpecMap.get(operationId)!;
          const pathInfo = getApiSpecDetails(spec, operationId);
          if (!pathInfo) {
            return createErrorResponse(`Invalid operationId '${operationId}' for chain '${chain}'. No API URL found.`, toolName);
          }
          const baseUrl = spec.servers?.[0]?.url;
          if (!baseUrl) {
            return createErrorResponse(`Invalid operationId '${operationId}' for chain '${chain}'. No server URL found.`, toolName);
          }
          const apiUrlTemplate = baseUrl.replace(/\/$/, '') + pathInfo.path;
          apiUrl = apiUrlTemplate.replace('{chain}/{network}', `${chain}/${network}`);
          httpMethod = pathInfo.method.toLowerCase();
        }
      } catch (error) {
        return createErrorResponse(`Failed to resolve API URL: ${(error as Error).message}`, toolName);
      }

      const { signal, cleanup } = createTimeoutSignal(TIMEOUT_MS);
      try {
        const headers: Record<string, string> = {
          'X-API-KEY': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'nodit-mcp-server',
        };

        const apiOptions: RequestInit = {
          method: httpMethod.toUpperCase(),
          headers,
          signal,
        };

        if (httpMethod !== 'get') {
          headers['Content-Type'] = 'application/json';
          apiOptions.body = JSON.stringify(requestBody ?? {});
        }

        log(`Calling ${httpMethod.toUpperCase()} ${apiUrl}`);

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
          log(`Tool (${toolName}): API Success (${response.status}) for ${operationId}`);
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
        cleanup();
      }
    }
  );
}
