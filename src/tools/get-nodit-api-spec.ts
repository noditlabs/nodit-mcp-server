import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import * as z from "zod/v4";
import {
  createErrorResponse,
  getApiSpecDetails,
  isNodeApi,
  isWebhookApi,
  knownOperationIds,
  loadNoditApiManifest,
  loadNoditDataApiSpecMap,
  loadNoditMultichainApiSpecMap,
  loadNoditNodeApiSpecMap,
  loadNoditWebhookApiSpecMap,
  log,
  suggestionSuffix,
} from "../helper/nodit-apidoc-helper.js";
import {
  createRefResolver,
  projectRequestBody,
  projectResponses,
  resolveSecurityRequirements,
} from "../helper/openapi-resolver.js";
import { READ_ONLY_TOOL_ANNOTATIONS, TOOL_DESCRIPTIONS, TOOL_PARAM_DESCRIPTIONS, TOOL_TITLES } from "./tool-metadata.js";

const getNoditApiSpecInputSchema = {
  operationId: z.string().describe(TOOL_PARAM_DESCRIPTIONS.SPEC_OPERATION_ID),
};

function collectChainsForStem(stem: string, specMap: Map<string, any>): string[] {
  const chains = new Set<string>();
  for (const k of specMap.keys()) {
    const dashIdx = k.indexOf('-');
    if (dashIdx < 0) continue;
    if (k.slice(dashIdx + 1) === stem) {
      chains.add(k.slice(0, dashIdx));
    }
  }
  return Array.from(chains).sort();
}

function missingChainPrefixError(operationId: string, chains: string[], toolName: string) {
  return createErrorResponse(
    `operationId '${operationId}' is missing a chain prefix. Use \`{chain}-${operationId}\` where {chain} is one of: ${chains.join(', ')}.`,
    toolName,
  );
}

function sanitizeSpec(value: any): any {
  if (typeof value === 'string') {
    return value
      .replace(/\\r/g, ' ')
      .replace(/\\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ');
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeSpec);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = sanitizeSpec(v);
    }
    return result;
  }
  return value;
}

type GetNoditApiSpecInput = z.infer<z.ZodObject<typeof getNoditApiSpecInputSchema>>;

export function registerGetNoditApiSpecTool(server: McpServer) {
  const manifest = loadNoditApiManifest();
  const noditNodeApiSpecMap = loadNoditNodeApiSpecMap(manifest);
  const noditDataApiSpecMap = loadNoditDataApiSpecMap(manifest);
  const noditWebhookApiSpecMap = loadNoditWebhookApiSpecMap(manifest);
  const noditMultichainApiSpecMap = loadNoditMultichainApiSpecMap(manifest);

  server.registerTool(
    "get_nodit_api_spec",
    {
      title: TOOL_TITLES.get_nodit_api_spec,
      description: TOOL_DESCRIPTIONS.get_nodit_api_spec,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      inputSchema: getNoditApiSpecInputSchema as unknown as ZodRawShapeCompat,
    },
    async (args) => {
      const { operationId } = args as GetNoditApiSpecInput;
      const toolName = "get_nodit_api_spec";
      log(`Tool (${toolName}): Request for operationId: ${operationId}`);

      let apiInfo: ReturnType<typeof getApiSpecDetails> = null;
      let specDocument: any = null;
      let postfix = '';

      if (isNodeApi(operationId, noditNodeApiSpecMap)) {
        const spec = noditNodeApiSpecMap.get(operationId);
        if (spec) { specDocument = spec; apiInfo = getApiSpecDetails(spec, operationId); }
      } else if (isWebhookApi(operationId, noditWebhookApiSpecMap)) {
        postfix = "\nThis API cannot be invoked using the call_nodit_api tool.";
        if (noditWebhookApiSpecMap.has(operationId)) {
          const spec = noditWebhookApiSpecMap.get(operationId);
          if (spec) { specDocument = spec; apiInfo = getApiSpecDetails(spec, operationId); }
        } else {
          const chains = collectChainsForStem(operationId, noditWebhookApiSpecMap);
          if (chains.length > 0) return missingChainPrefixError(operationId, chains, toolName);
        }
      } else if (noditMultichainApiSpecMap.has(operationId)) {
        postfix = "\nCall this API with the call_nodit_multichain_api tool.";
        const spec = noditMultichainApiSpecMap.get(operationId);
        if (spec) { specDocument = spec; apiInfo = getApiSpecDetails(spec, operationId); }
      } else if (noditDataApiSpecMap.has(operationId)) {
        const spec = noditDataApiSpecMap.get(operationId);
        if (spec) { specDocument = spec; apiInfo = getApiSpecDetails(spec, operationId); }
      } else {
        const chains = collectChainsForStem(operationId, noditDataApiSpecMap);
        if (chains.length > 0) return missingChainPrefixError(operationId, chains, toolName);
        const nodeChains = collectChainsForStem(operationId, noditNodeApiSpecMap);
        if (nodeChains.length > 0) return missingChainPrefixError(operationId, nodeChains, toolName);
        if (collectChainsForStem(operationId, noditMultichainApiSpecMap).length > 0) {
          return createErrorResponse(
            `'${operationId}' is a Multichain API operation and is not addressed per chain. Use the operationId 'multichain-${operationId}' here and in the call_nodit_multichain_api tool.`,
            toolName,
          );
        }
      }

      if (!apiInfo) {
        const suggestion = suggestionSuffix(
          operationId,
          knownOperationIds(noditNodeApiSpecMap, noditDataApiSpecMap, noditWebhookApiSpecMap, noditMultichainApiSpecMap),
        );
        return createErrorResponse(`Spec for operationId '${operationId}' not found.${suggestion}`, toolName);
      }

      const d = apiInfo.details as any;
      const resolveRefs = createRefResolver(specDocument);
      const resolvedParameters = resolveRefs(d.parameters);
      const parameters = Array.isArray(resolvedParameters)
        ? resolvedParameters.map((p: any) => ({
            name: p?.name,
            schema: {
              type: p?.schema?.type,
              enum: p?.schema?.enum,
              default: p?.schema?.default,
            },
            required: p?.required,
            description: p?.description,
            in: p?.in,
          }))
        : undefined;

      const hasPathOrQuery = Array.isArray(parameters)
        && parameters.some((p: any) => p.in === 'path' || p.in === 'query');
      if (!postfix && apiInfo.method?.toLowerCase() === 'get' && hasPathOrQuery) {
        postfix = "\nWhen calling this endpoint via call_nodit_api, map the 'path' parameters listed in `parameters` to the pathParams argument and the 'query' parameters to the queryParams argument (e.g. pathParams: { \"address\": \"...\" }, queryParams: { \"pagination.limit\": 10 }).";
      }

      const finalSpecDetails = {
        operationId,
        path: apiInfo.path,
        method: apiInfo.method,
        details: {
          operationId: d.operationId,
          description: `${d.description ?? ''}${postfix}`,
          requestBody: projectRequestBody(resolveRefs(d.requestBody)),
          responses: projectResponses(resolveRefs(d.responses)),
          summary: d.summary,
          security: resolveSecurityRequirements(d.security, specDocument, resolveRefs),
          tags: d.tags,
          parameters,
        },
      };

      return { content: [{ type: "text", text: JSON.stringify(sanitizeSpec(finalSpecDetails), null, 2) }] };
    }
  );
}
