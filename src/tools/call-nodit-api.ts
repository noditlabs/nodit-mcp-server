import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createErrorResponse,
  log,
  loadNoditNodeApiSpecMap,
  loadNoditDataApiSpec,
  NoditOpenApiSpecType
} from "../helper/nodit-apidoc-helper.js";
import {
  createTimeoutSignal
} from "../helper/call-api-helper.js";
import {
  validateApiRequest,
  getApiSpec,
  getApiUri
} from "../helper/api-validation.js";

const TIMEOUT_MS = 60_000;

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
      queryParams: z.record(z.any()).optional().describe("JSON query parameters matching the API's spec."),
      pathParams: z.record(z.any()).optional().describe("JSON path parameters matching the API's spec."),
      requestBody: z.record(z.any()).optional().describe("JSON request body matching the API's spec."),
    },
    async ({ protocol, network, operationId, queryParams, pathParams, requestBody }) => {
      const toolName = "call_nodit_api";

      const apiKey = process.env.NODIT_API_KEY;
      if (!apiKey) {
          return createErrorResponse(`NODIT_API_KEY environment variable is not set. It is required to call nodit api. Please check your tool configuration.`, toolName);
      }

      const validationError = validateApiRequest(protocol, operationId, noditNodeApiSpecMap, noditDataApiSpec);
      if (validationError) {
        return validationError;
      }

      let apiSpecDetails;
      try {
        apiSpecDetails = getApiSpec(operationId, noditNodeApiSpecMap, noditDataApiSpec);
      } catch (error: any) {
        return createErrorResponse(error.message, toolName);
      }

      const apiUrl = getApiUri(
        apiSpecDetails,
        protocol,
        network,
        pathParams,
        queryParams
      );

      const { signal, cleanup } = createTimeoutSignal(TIMEOUT_MS);
      try {
        const apiOptions: RequestInit = {
            method: apiSpecDetails.method.toUpperCase(),
            headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'nodit-mcp-server' },
            signal,
        };

        if (requestBody && ['POST', 'PUT', 'PATCH'].includes(apiSpecDetails.method.toUpperCase())) {
          apiOptions.body = JSON.stringify(requestBody);
        }

        log(`Calling apiUrl: ${apiUrl}, method: ${apiSpecDetails.method}, body: ${apiOptions.body || 'none'}`);

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
        let message = (error as Error).message;
        if (error instanceof Error && error.name === 'AbortError') {
          message = `The request took longer than expected and has been terminated. This may be due to high server load or because the requested data is taking longer to process. Please try again later.`;
        }
        return createErrorResponse(`Network/fetch error calling API: ${message}`, toolName);
      } finally {
        cleanup();
      }
    }
  );
}