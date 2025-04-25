import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createErrorResponse,
  findNoditDataApiDetails,
  isNodeApi,
  findNoditNodeApiDetails,
  log,
  loadNoditNodeApiSpecMap,
  loadNoditDataApiSpec,
  NoditOpenApiSpecType
} from "../nodit-apidoc-helper.js";

export function registerGetNoditApiSpecTool(server: McpServer) {
  const noditNodeApiSpecMap: Map<string, NoditOpenApiSpecType> = loadNoditNodeApiSpecMap();
  const noditDataApiSpec: NoditOpenApiSpecType = loadNoditDataApiSpec();

  server.tool(
    "get_nodit_api_spec",
    "Gets the fully resolved spec details for a Nodit Blockchain Context API operationId. Returns details as a JSON string.",
    { operationId: z.string().describe("The operationId to get the resolved specification for.") },
    async ({ operationId }) => {
      const toolName = "get_nodit_api_spec";
      log(`Tool (${toolName}): Request for operationId: ${operationId}`);

      const isNodeApiCall = isNodeApi(operationId);
      const apiInfo = isNodeApiCall ? findNoditNodeApiDetails(operationId, noditNodeApiSpecMap) : findNoditDataApiDetails(operationId, noditDataApiSpec);
      if (!apiInfo) {
        return createErrorResponse(`Spec for operationId '${operationId}' not found.`, toolName);
      }

      const finalSpecDetails = {
        operationId: operationId,
        path: apiInfo.path,
        details: apiInfo.details,
      };

      return { content: [{ type: "text", text: JSON.stringify(finalSpecDetails, null, 2) }] };
    }
  );
}