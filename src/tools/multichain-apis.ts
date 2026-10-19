import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import * as z from "zod/v4";
import {
  createErrorResponse,
  getApiSpecDetails,
  isBlockedOperationId,
  isWebhookApi,
  knownOperationIds,
  loadNoditApiManifest,
  loadNoditDataApiSpecMap,
  loadNoditMultichainApiSpecMap,
  loadNoditNodeApiSpecMap,
  loadNoditWebhookApiSpecMap,
  multichainTargets,
  NoditOpenApiSpecType,
  normalizeDescription,
  suggestionSuffix,
} from "../helper/nodit-apidoc-helper.js";
import { joinBaseAndPath } from "../helper/call-api-helper.js";
import { callNoditHttp } from "../helper/nodit-http-client.js";
import { maskInternalError } from "../helper/tool-error.js";
import {
  ApiTarget,
  SpecMaps,
  blockedOperationRefusalMessage,
  webhookRefusalMessage,
} from "./call-nodit-api.js";
import {
  CALLING_TOOL_ANNOTATIONS,
  READ_ONLY_TOOL_ANNOTATIONS,
  TOOL_DESCRIPTIONS,
  TOOL_PARAM_DESCRIPTIONS,
  TOOL_TITLES,
} from "./tool-metadata.js";

const callNoditMultichainApiInputSchema = {
  operationId: z.string().describe(TOOL_PARAM_DESCRIPTIONS.MULTICHAIN_OPERATION_ID),
  requestBody: z.record(z.string(), z.any()).describe(TOOL_PARAM_DESCRIPTIONS.MULTICHAIN_REQUEST_BODY),
};

type CallNoditMultichainApiInput = z.infer<z.ZodObject<typeof callNoditMultichainApiInputSchema>>;

export function multichainOperationRefusal(
  operationId: string,
  toolName: string,
  maps: SpecMaps,
): string | null {
  if (isWebhookApi(operationId, maps.webhook)) {
    return webhookRefusalMessage(toolName);
  }
  if (isBlockedOperationId(operationId)) {
    return blockedOperationRefusalMessage(operationId, toolName);
  }
  if (maps.multichain.has(operationId)) {
    return null;
  }
  const suggestion = suggestionSuffix(
    operationId,
    knownOperationIds(maps.node, maps.data, maps.webhook, maps.multichain),
  );
  const available = Array.from(maps.multichain.keys()).sort().join(', ');
  return `Invalid operationId '${operationId}' for the Multichain API.${suggestion} Available: ${available}.`;
}

export function resolveMultichainTarget(spec: NoditOpenApiSpecType, operationId: string): ApiTarget {
  const noUrl = `Invalid operationId '${operationId}'. No API URL found for operationId '${operationId}'.`;
  const pathInfo = getApiSpecDetails(spec, operationId);
  if (!pathInfo) return { error: noUrl };
  const baseUrl = spec.servers?.[0]?.url;
  if (!baseUrl) {
    return { error: `Invalid operationId '${operationId}'. No server URL found.` };
  }
  return { apiUrl: joinBaseAndPath(baseUrl, pathInfo.path), httpMethod: pathInfo.method.toLowerCase() };
}

export function buildMultichainApiList(specMap: Map<string, NoditOpenApiSpecType>): string {
  const formattedList = Array.from(specMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([operationId, spec]) => {
      const details = getApiSpecDetails(spec, operationId);
      if (!details) return null;
      const baseUrl = spec.servers?.[0]?.url;
      const url = baseUrl ? joinBaseAndPath(baseUrl, details.path) : details.path;
      const targets = multichainTargets(specMap, operationId);
      return `  - operationId: ${operationId}, method: ${details.method.toLowerCase()}, url: ${url}, target chains: [${targets.join(',')}], description: ${normalizeDescription(details.details.description)}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  if (formattedList.length === 0) {
    return "No Nodit Multichain API operations are available.";
  }

  return `Nodit Multichain API operations address several chains in one request. The target chains are named inside the request body as \`{chain}-{network}\` values (see \`target chains\` below), so there is no chain prefix to combine: pass the operationId exactly as listed to \`get_nodit_api_spec\` for the request body shape and to \`call_nodit_multichain_api\` to invoke it.
- Available Nodit Multichain API Operations:
${formattedList}
`;
}

export function registerMultichainApiTools(server: McpServer) {
  const manifest = loadNoditApiManifest();
  const maps: SpecMaps = {
    node: loadNoditNodeApiSpecMap(manifest),
    data: loadNoditDataApiSpecMap(manifest),
    webhook: loadNoditWebhookApiSpecMap(manifest),
    multichain: loadNoditMultichainApiSpecMap(manifest),
  };

  server.registerTool(
    "list_nodit_multichain_apis",
    {
      title: TOOL_TITLES.list_nodit_multichain_apis,
      description: TOOL_DESCRIPTIONS.list_nodit_multichain_apis,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async () => {
      const toolName = "list_nodit_multichain_apis";
      try {
        return { content: [{ type: "text" as const, text: buildMultichainApiList(maps.multichain) }] };
      } catch (error) {
        return createErrorResponse(maskInternalError(error, toolName), toolName);
      }
    }
  );

  server.registerTool(
    "call_nodit_multichain_api",
    {
      title: TOOL_TITLES.call_nodit_multichain_api,
      description: TOOL_DESCRIPTIONS.call_nodit_multichain_api,
      annotations: CALLING_TOOL_ANNOTATIONS,
      inputSchema: callNoditMultichainApiInputSchema as unknown as ZodRawShapeCompat,
    },
    async (args) => {
      const { operationId, requestBody } = args as CallNoditMultichainApiInput;
      const toolName = "call_nodit_multichain_api";

      const refusal = multichainOperationRefusal(operationId, toolName, maps);
      if (refusal) {
        return createErrorResponse(refusal, toolName);
      }

      let target: ApiTarget;
      try {
        target = resolveMultichainTarget(maps.multichain.get(operationId)!, operationId);
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
