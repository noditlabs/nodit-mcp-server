import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
    createErrorResponse,
    getApiSpecDetails,
    isNodeApi,
    isEthereumNodeApi,
    isWebhookApi,
    log,
    loadNoditNodeApiSpecMap,
    loadNoditDataApiSpec,
    NoditOpenApiSpecType,
    loadNoditWebhookApiSpec,
    ApiSpecDetails
} from "../helper/nodit-apidoc-helper.js";

export function registerGetNoditApiSpecTool(server: McpServer) {
  const noditNodeApiSpecMap: Map<string, NoditOpenApiSpecType> = loadNoditNodeApiSpecMap();
  const noditDataApiSpec: NoditOpenApiSpecType = loadNoditDataApiSpec();
  const noditWebhookApiSpec: NoditOpenApiSpecType = loadNoditWebhookApiSpec();

  server.tool(
    "get_nodit_api_spec",
    "Gets the fully resolved spec details for a Nodit Blockchain Context API operationId. Returns details as a JSON string.",
    { operationId: z.string().describe("The operationId to get the resolved specification for.") },
    async ({ operationId }) => {
      const toolName = "get_nodit_api_spec";
      log(`Tool (${toolName}): Request for operationId: ${operationId}`);

      let apiInfo: ApiSpecDetails | null = null;
      let postfix = "";

      if (isNodeApi(operationId)) {
        const spec = isEthereumNodeApi(operationId)
          ? noditNodeApiSpecMap.get(`ethereum-${operationId}`)
          : noditNodeApiSpecMap.get(operationId);

        if (spec) {
          apiInfo = getApiSpecDetails(spec, operationId);
        }
      } else if (isWebhookApi(operationId)) {
        postfix = "\nThis API cannot be invoked using the call_nodit_api tool.";
        apiInfo = getApiSpecDetails(noditWebhookApiSpec, operationId);
      } else {
        apiInfo = getApiSpecDetails(noditDataApiSpec, operationId);
      }

      if (!apiInfo) {
        return createErrorResponse(`Spec for operationId '${operationId}' not found.`, toolName);
      }

      const finalSpecDetails = {
        operationId: operationId,
        path: apiInfo.pathMapper,
        method: apiInfo.method,
        details: {
          ...apiInfo.operation,
          description: apiInfo.operation.description + postfix
        }
      };

      return { content: [{ type: "text", text: JSON.stringify(finalSpecDetails, null, 2) }] };
    }
  );
}