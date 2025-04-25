import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createErrorResponse,
  loadNoditNodeApiSpecMap,
  NoditOpenApiSpecType
} from "../nodit-apidoc-helper.js";

export function registerNodeApiTools(server: McpServer) {
  const noditNodeApiSpecMap: Map<string, NoditOpenApiSpecType> = loadNoditNodeApiSpecMap();
  server.tool("list_nodit_node_apis", "Lists available Nodit API operations.", {}, async () => {
    const toolName = "list_nodit_node_apis";
    try {
      const apiList = Array.from(noditNodeApiSpecMap.entries())
        .filter(([, spec]) => spec?.paths)
        .flatMap(([, spec]) =>
          Object.entries(spec.paths)
            .filter(([, pathItem]) => pathItem?.post?.operationId)
            .map(([pathKey, pathItem]) => ({
              operationId: pathItem!.post!.operationId!,
              path: pathKey
            }))
        )

      const commonMethods: typeof apiList = [];
      const protocolSpecificMethods: typeof apiList = [];
      const protocolsWithCommonMethods = new Set<string>();

      apiList.forEach(api => {
        const operationId = api.operationId;
        const methodName = operationId.includes('-') ? operationId.split('-')[1] : operationId;

        let protocol = 'ethereum';
        if (operationId.includes('-')) {
          protocol = operationId.split('-')[0];
        }

        if (methodName.startsWith('eth_') || methodName.startsWith('net_') || methodName.startsWith('web3_')) {
          protocolsWithCommonMethods.add(protocol);

          if (!commonMethods.some(item => {
            const itemMethod = item.operationId.includes('-') ? item.operationId.split('-')[1] : item.operationId;
            return itemMethod === methodName;
          })) {
            commonMethods.push(api);
          }
        } else {
          protocolSpecificMethods.push(api);
        }
      });

      const formattedCommonList = commonMethods
        .map(api => {
          const methodName = api.operationId.includes('-') ? api.operationId.split('-')[1] : api.operationId;
          return `  - operationId: ${methodName}`;
        })
        .join("\n");

      const formattedSpecificList = protocolSpecificMethods
        .map(api => `  - operationId: ${api.operationId}`)
        .join("\n");

      const supportedProtocols = Array.from(protocolsWithCommonMethods).sort().join(', ');

      const content = `Nodit Blockchain Context has endpoints with patterns like https://{protocol}-{network}.nodit.io. For example, Ethereum mainnet uses an endpoint like https://ethereum-mainnet.nodit.io
and accepts input in the form of widely known requestBody argument such as { "jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": [] }.
**Important: To ensure the tool 'call_nodit_api' works correctly and to avoid errors, you should first use the tool 'get_nodit_api_spec' to obtain detailed API specifications. Depending on the situation, you may omit using the get_nodit_api_spec tool, but it is recommended to use it on the first call.**
The API list is as follows.
**Important: Nodit Blockchain Context's operationId format rules**
- Ethereum network: No prefix (e.g., operationId="eth_blockNumber")
- All other protocols: Use the format {protocol}-{operationId} (e.g., operationId="polygon-eth_blockNumber")
- Make sure to use 'call_nodit_api' with the correct protocol, network, and operationId.
- These operationId format rules are relevant only when using the tool, not when directly using the API.
- Common Methods (supported by most protocols, use with appropriate protocol name):
${formattedCommonList}
- Protocols supporting common methods: ${supportedProtocols}
- Protocol-Specific Methods (use with the specified protocol):
${formattedSpecificList}
Note: You can use these APIs with any supported protocol by simply replacing the protocol name in the endpoint URL.
`

      return { content: [{ type: "text", text: content }] };
    } catch (error) {
      return createErrorResponse(`Failed to list APIs: ${(error as Error).message}`, toolName);
    }
  });

}
