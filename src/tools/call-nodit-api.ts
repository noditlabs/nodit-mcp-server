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
  knownOperationIds,
  NoditOpenApiSpecType,
  loadNoditApiManifest,
  loadNoditDataApiSpecMap,
  loadNoditNodeApiSpecMap,
  loadNoditWebhookApiSpecMap,
  suggestionSuffix,
} from "../helper/nodit-apidoc-helper.js";
import {
  bodyMethodMismatch,
  resolvePathAndQuery,
} from "../helper/call-api-helper.js";
import { callNoditHttp } from "../helper/nodit-http-client.js";
import { maskInternalError } from "../helper/tool-error.js";
import { CALLING_TOOL_ANNOTATIONS, TOOL_DESCRIPTIONS, TOOL_PARAM_DESCRIPTIONS, TOOL_TITLES } from "./tool-metadata.js";

const callNoditApiInputSchema = {
  chain: z.string().describe(TOOL_PARAM_DESCRIPTIONS.CHAIN),
  network: z.string().describe(TOOL_PARAM_DESCRIPTIONS.NETWORK),
  operationId: z.string().describe(TOOL_PARAM_DESCRIPTIONS.OPERATION_ID),
  pathParams: z.record(z.string(), z.any()).optional().describe(TOOL_PARAM_DESCRIPTIONS.PATH_PARAMS),
  queryParams: z.record(z.string(), z.any()).optional().describe(TOOL_PARAM_DESCRIPTIONS.QUERY_PARAMS),
  requestBody: z.record(z.string(), z.any()).optional().describe(TOOL_PARAM_DESCRIPTIONS.REQUEST_BODY),
};

type CallNoditApiInput = z.infer<z.ZodObject<typeof callNoditApiInputSchema>>;

export function webhookRefusalMessage(toolName: string): string {
  return (
    `The Nodit Webhook APIs cannot be invoked via "${toolName}". ` +
    `Manage webhooks in the Nodit console or call the Webhook API directly with your API key.`
  );
}

export function blockedOperationRefusalMessage(operationId: string, toolName: string): string {
  return (
    `The operationId(${operationId}) cannot be invoked via "${toolName}": its response is too ` +
    `large for a tool result. Use a narrower operation, e.g. one that takes an address or a signature.`
  );
}

export function nodeApiBaseUrl(serverUrls: string[], chain: string, network: string): string | null {
  const chainNetwork = `${chain}-${network}`;
  const direct = serverUrls.find(u => u.toLowerCase().includes(chainNetwork.toLowerCase()));
  if (direct) return direct;
  const templated = serverUrls.find(u => u.includes('{'));
  if (templated) return templated.replace(/\{[^}]+}/g, chainNetwork);
  return null;
}

type ApiTarget = { apiUrl: string; httpMethod: string } | { error: string };

interface SpecMaps {
  node: Map<string, NoditOpenApiSpecType>;
  data: Map<string, NoditOpenApiSpecType>;
  webhook: Map<string, NoditOpenApiSpecType>;
}

export function operationRefusal(
  operationId: string,
  chain: string,
  toolName: string,
  maps: SpecMaps,
  requestBody: Record<string, any> | undefined,
): string | null {
  if (isWebhookApi(operationId, maps.webhook)) {
    return webhookRefusalMessage(toolName);
  }
  if (isBlockedOperationId(operationId)) {
    return blockedOperationRefusalMessage(operationId, toolName);
  }
  const isNodeApiCall = isNodeApi(operationId, maps.node);
  const canFindOperationId = isNodeApiCall
    ? isValidNodeApi(operationId, maps.node)
    : maps.data.has(operationId);
  if (!canFindOperationId) {
    const suggestion = suggestionSuffix(operationId, knownOperationIds(maps.node, maps.data, maps.webhook));
    return `Invalid operationId '${operationId}' for chain '${chain}'.${suggestion} Use 'list_nodit_data_apis' or 'list_nodit_node_apis' first.`;
  }
  if (isNodeApiCall && !operationId.includes('-')) {
    return `Invalid operationId '${operationId}'. operationId must include the chain prefix (e.g., 'ethereum-${operationId}').`;
  }
  if (isNodeApiCall) {
    return bodyMethodMismatch(operationId, requestBody);
  }
  return null;
}

export function resolveNodeApiTarget(
  spec: NoditOpenApiSpecType,
  operationId: string,
  chain: string,
  network: string,
  pathParams: Record<string, any> | undefined,
  queryParams: Record<string, any> | undefined,
): ApiTarget {
  const noUrl = `Invalid operationId '${operationId}'. No API URL found for operationId '${operationId}'.`;
  const pathInfo = getApiSpecDetails(spec, operationId);
  if (!pathInfo) return { error: noUrl };

  const serverUrls = (spec.servers ?? []).map(s => s.url).filter((u): u is string => !!u);
  if (serverUrls.length === 0) return { error: noUrl };

  const baseUrl = nodeApiBaseUrl(serverUrls, chain, network);
  if (!baseUrl) {
    return { error: `Invalid network '${network}' for chain '${chain}' and operationId '${operationId}'.` };
  }

  const resolved = resolvePathAndQuery(baseUrl.replace(/\/$/, '') + pathInfo.path, pathParams, queryParams);
  if ('error' in resolved) return { error: resolved.error };
  return { apiUrl: resolved.url, httpMethod: pathInfo.method.toLowerCase() };
}

export function resolveDataApiTarget(
  spec: NoditOpenApiSpecType,
  operationId: string,
  chain: string,
  network: string,
): ApiTarget {
  const pathInfo = getApiSpecDetails(spec, operationId);
  if (!pathInfo) {
    return { error: `Invalid operationId '${operationId}' for chain '${chain}'. No API URL found.` };
  }
  const baseUrl = spec.servers?.[0]?.url;
  if (!baseUrl) {
    return { error: `Invalid operationId '${operationId}' for chain '${chain}'. No server URL found.` };
  }
  const apiUrlTemplate = baseUrl.replace(/\/$/, '') + pathInfo.path;
  return {
    apiUrl: apiUrlTemplate.replace('{chain}/{network}', `${chain}/${network}`),
    httpMethod: pathInfo.method.toLowerCase(),
  };
}

export function registerCallNoditApiTool(server: McpServer) {
  const manifest = loadNoditApiManifest();
  const noditNodeApiSpecMap = loadNoditNodeApiSpecMap(manifest);
  const noditDataApiSpecMap = loadNoditDataApiSpecMap(manifest);
  const noditWebhookApiSpecMap = loadNoditWebhookApiSpecMap(manifest);
  const maps: SpecMaps = {
    node: noditNodeApiSpecMap,
    data: noditDataApiSpecMap,
    webhook: noditWebhookApiSpecMap,
  };

  server.registerTool(
    "call_nodit_api",
    {
      title: TOOL_TITLES.call_nodit_api,
      description: TOOL_DESCRIPTIONS.call_nodit_api,
      annotations: CALLING_TOOL_ANNOTATIONS,
      inputSchema: callNoditApiInputSchema as unknown as ZodRawShapeCompat,
    },
    async (args) => {
      const { chain, network, operationId, pathParams, queryParams, requestBody } = args as CallNoditApiInput;
      const toolName = "call_nodit_api";

      const refusal = operationRefusal(operationId, chain, toolName, maps, requestBody);
      if (refusal) {
        return createErrorResponse(refusal, toolName);
      }

      const isNodeApiCall = isNodeApi(operationId, noditNodeApiSpecMap);
      let target: ApiTarget;
      try {
        target = isNodeApiCall
          ? resolveNodeApiTarget(noditNodeApiSpecMap.get(operationId)!, operationId, chain, network, pathParams, queryParams)
          : resolveDataApiTarget(noditDataApiSpecMap.get(operationId)!, operationId, chain, network);
      } catch (error) {
        return createErrorResponse(maskInternalError(error, toolName), toolName);
      }
      if ('error' in target) {
        return createErrorResponse(target.error, toolName);
      }
      const { apiUrl, httpMethod } = target;

      const apiKey = process.env.NODIT_API_KEY;
      if (!apiKey) {
        return createErrorResponse(`NODIT_API_KEY environment variable is not set. It is required to call nodit api. Please check your tool configuration.`, toolName);
      }

      const result = await callNoditHttp({
        apiUrl,
        httpMethod,
        apiKey,
        toolName,
        requestBody,
        outboundLog: `Calling ${httpMethod.toUpperCase()} ${apiUrl}`,
        successContext: operationId,
      });

      if (!result.ok) {
        return createErrorResponse(result.message, toolName);
      }
      return { content: [{ type: "text" as const, text: result.text }] };
    }
  );
}
