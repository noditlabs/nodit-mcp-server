import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadNoditWebhookApiSpec, NoditOpenApiSpecType } from "../helper/nodit-apidoc-helper.js";

export function registerWebhookApiTools(server: McpServer) {
    const toolName = "list_webhook_data_apis";
    const noditWebhookApiSpec: NoditOpenApiSpecType = loadNoditWebhookApiSpec()

    const apis = Object.values(noditWebhookApiSpec.paths).flatMap((pathItem) => {
        return [pathItem.get, pathItem.post, pathItem.put, pathItem.patch, pathItem.delete].filter((item) => item !== undefined).map((item) => {
            if (item && item.operationId) {
                const operationId = item.operationId;
                const description = item.description;
                const protocols = item.parameters?.find((param) => param.name === "protocol")?.schema?.enum ?? ["aptos"];

                return {
                    operationId,
                    description,
                    protocols
                }
            }
        })
    }).filter((api) => api !== undefined);
    
    server.tool(toolName, "Lists available Nodit Webhook API operations.", {}, () => {
        const formattedList = apis
            .map(api => `  - operationId: ${api.operationId}, supported protocols: [${api.protocols.join(',')}], description: ${api.description}`)
            .join("\n");

        const content = `Nodit Blockchain Context data api has endpoints with patterns like https://web3.nodit.io/v1/{protocol}/{network}/getBlockByHashOrNumber. For example, Ethereum mainnet uses an endpoint like https://web3.nodit.io/v1/ethereum/mainnet/getBlockByHashOrNumber.
The API list is as follows. You can use the get_nodit_api_spec tool to get more detailed API specifications.
- baseUrl: ${noditWebhookApiSpec.servers[0].url}
- Available Nodit API Operations:
${formattedList}
`
        return { content: [{ type: "text", text: content }] };
    });
}