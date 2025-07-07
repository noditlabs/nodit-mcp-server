import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
    createErrorResponse,
    findNoditDataApiDetails,
    isNodeApi,
    findNoditNodeApiDetails,
    findNoditWebhookApiDetails,
    log,
    loadNoditNodeApiSpecMap,
    loadNoditDataApiSpec,
    NoditOpenApiSpecType,
    isWebhookApi,
    loadNoditWebhookApiSpec
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

      let apiInfo;
        if (isNodeApi(operationId)) {
            apiInfo = findNoditNodeApiDetails(operationId, noditNodeApiSpecMap);
        } else if (isWebhookApi(operationId)) {
            const postfix = "\nThis API cannot be invoked using the call_nodit_api tool."
            apiInfo = findNoditWebhookApiDetails(operationId, noditWebhookApiSpec);
            if (apiInfo && !apiInfo.details.description?.endsWith(postfix)) {
                apiInfo.details.description = apiInfo.details.description + postfix;
            }
        } else {
            apiInfo = findNoditDataApiDetails(operationId, noditDataApiSpec);
        }
      if (!apiInfo) {
        return createErrorResponse(`Spec for operationId '${operationId}' not found.`, toolName);
      }

      const finalSpecDetails = {
        operationId: operationId,
        path: apiInfo.path,
        method: apiInfo.method,
        details: apiInfo.details,
      };

      return { content: [{ type: "text", text: JSON.stringify(finalSpecDetails, null, 2) }] };
    }
  );
}