import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createErrorResponse,
  normalizeDescription,
  loadNoditDataApiSpec,
  NoditOpenApiSpecType
} from "../nodit-apidoc-helper.js";

export function registerDataApiTools(server: McpServer) {
  const noditDataApiSpec: NoditOpenApiSpecType = loadNoditDataApiSpec();
  server.tool("list_nodit_data_apis", "Lists available Nodit Data API operations.", {}, async () => {
    const toolName = "list_nodit_data_apis";
    try {
      const apiList = Object.entries(noditDataApiSpec.paths)
        .filter(([, pathItem]) => pathItem?.post?.operationId)
        .map(([pathKey, pathItem]) => {
          let supportedProtocols: string[] = [];
          if (pathItem?.post?.parameters) {
            const protocolParam = pathItem.post.parameters.find((param: any) => param.name === 'protocol');
            if (protocolParam?.schema?.enum) {
              supportedProtocols = protocolParam.schema.enum;
            }
          }

          return {
            operationId: pathItem!.post!.operationId!,
            description: normalizeDescription(pathItem!.post!.description),
            path: pathKey,
            supportedProtocols: supportedProtocols
          };
        });

      const formattedList = apiList
        .map(api => `  - operationId: ${api.operationId}, supported protocols: [${api.supportedProtocols.join(',')}], description: ${api.description}`)
        .join("\n");

      const content = `Nodit Blockchain Context data api has endpoints with patterns like https://web3.nodit.io/v1/{protocol}/{network}/getBlockByHashOrNumber. For example, Ethereum mainnet uses an endpoint like https://web3.nodit.io/v1/ethereum/mainnet/getBlockByHashOrNumber.
The API list is as follows. You can use the get_nodit_api_spec tool to get more detailed API specifications.
- baseUrl: ${noditDataApiSpec.servers[0].url}
- Available Nodit API Operations:
${formattedList}
`
      return { content: [{ type: "text", text: content }] };
    } catch (error) {
      return createErrorResponse(`Failed to list APIs: ${(error as Error).message}`, toolName);
    }
  });
}
