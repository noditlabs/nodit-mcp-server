import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createErrorResponse,
  findNoditDataApiDetails,
  isNodeApi,
  isValidNodeApi,
  findNoditNodeApiSpec,
  log,
  loadNoditNodeApiSpecMap,
  loadNoditDataApiSpec,
  NoditOpenApiSpecType
} from "../nodit-apidoc-helper.js";

export function registerCallNoditApiTool(server: McpServer) {
  const noditNodeApiSpecMap: Map<string, NoditOpenApiSpecType> = loadNoditNodeApiSpecMap();
  const noditDataApiSpec: NoditOpenApiSpecType = loadNoditDataApiSpec();

  server.tool(
    "call_nodit_api",
    "This function calls a specific Nodit Blockchain Context API using its operationId. Before making the call, it's recommended to verify the detailed API specifications using the 'get_nodit_api_spec' tool. Please note that using this tool will consume your API quota.",
    {
      protocol: z.string().describe("Nodit protocol to call. e.g. 'ethereum' or 'polygon'."),
      network: z.string().describe("Nodit network to call. e.g. 'mainnet' or 'amoy'."),
      operationId: z.string().describe("Nodit API operationId to call."),
      requestBody: z.record(z.any()).describe("JSON request body matching the API's spec."),
    },
    async ({ protocol, network, operationId, requestBody }) => {
      const toolName = "call_nodit_api";

      const apiKey = process.env.NODIT_API_KEY;
      if (!apiKey) {
          return createErrorResponse(`NODIT_API_KEY environment variable is not set. It is required to call nodit api. Please check your tool configuration.`, toolName);
      }

      const isNodeApiCall = isNodeApi(operationId);
      const canFindOperationId = isNodeApiCall ? isValidNodeApi(operationId, noditNodeApiSpecMap) : findNoditDataApiDetails(operationId, noditDataApiSpec)
      if (!canFindOperationId) {
        return createErrorResponse(`Invalid operationId '${operationId}'. Use 'list_nodit_data_apis' or 'list_nodit_node_apis' first.`, toolName);
      }

      const commonMistakeForOperationIdRules = isNodeApiCall && protocol !== "ethereum" && !operationId.includes("-")
      if (commonMistakeForOperationIdRules) {
        return createErrorResponse(`Invalid operationId '${operationId}'. For non-ethereum protocols, operationId must include the protocol prefix.`, toolName);
      }

      let apiUrl;
      if (isNodeApiCall) {
          const apiUrlTemplate = findNoditNodeApiSpec(operationId, noditNodeApiSpecMap)!.servers[0].url
          apiUrl = apiUrlTemplate.replace(`{${protocol}-network}`, `${protocol}-${network}`)
      } else {
          const noditDataApiPath = Object.entries(noditDataApiSpec.paths).find(([, spec]) => spec.post.operationId === operationId)
          if (!noditDataApiPath) {
              return createErrorResponse(`Invalid operationId '${operationId}'. No API URL found for operationId '${operationId}'.`, toolName);
          }
          const apiUrlTemplate = noditDataApiSpec.servers[0].url + noditDataApiPath[0];
          apiUrl = apiUrlTemplate.replace('{protocol}/{network}', `${protocol}/${network}`)
      }

      if (!apiUrl) {
        return createErrorResponse(`Invalid operationId '${operationId}'. No API URL found for operationId '${operationId}'.`, toolName);
      }

      try {
        const apiOptions = {
            method: 'POST',
            headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'nodit-mcp-server' },
            body: JSON.stringify(requestBody),
        }

        log(`Calling apiUrl: ${apiUrl}, apiOptions: ${JSON.stringify(apiOptions, null, 2)}`);

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
        return createErrorResponse(`Network/fetch error calling API: ${(error as Error).message}`, toolName);
      }
    }
  );
}