import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createErrorResponse,
  loadNoditApiManifest,
  loadNoditWebhookApiSpecMap,
  HTTP_METHODS,
} from "../helper/nodit-apidoc-helper.js";

export function registerWebhookApiTools(server: McpServer) {
  const toolName = "list_nodit_webhook_apis";
  const manifest = loadNoditApiManifest();
  const webhookApiSpecMap = loadNoditWebhookApiSpecMap(manifest);

  type WebhookEntry = {
    operationId: string;
    description: string;
    chains: string[];
  };

  const opEntries = new Map<string, WebhookEntry>();
  let baseUrl = '';

  for (const [prefixedKey, spec] of webhookApiSpecMap.entries()) {
    const dashIdx = prefixedKey.indexOf('-');
    if (dashIdx < 0) continue;
    const chain = prefixedKey.slice(0, dashIdx);
    const opStem = prefixedKey.slice(dashIdx + 1);

    if (!baseUrl && spec.servers?.[0]?.url) {
      baseUrl = spec.servers[0].url;
    }

    for (const pathItem of Object.values(spec.paths)) {
      if (!pathItem) continue;
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op || op.operationId !== prefixedKey) continue;
        const description = op.description ?? '';
        const existing = opEntries.get(opStem);
        if (existing) {
          if (!existing.chains.includes(chain)) existing.chains.push(chain);
        } else {
          opEntries.set(opStem, {
            operationId: opStem,
            description,
            chains: [chain],
          });
        }
      }
    }
  }

  const apis = Array.from(opEntries.values()).sort((a, b) => (a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0));

  server.registerTool(
    toolName,
    {
      description: "Lists available Nodit Webhook API operations.",
    },
    () => {
      try {
        const formattedList = apis
          .map(api => `  - operationId: ${api.operationId}, supported chains: [${api.chains.sort().join(',')}], description: ${api.description}`)
          .join("\n");

        const content = `Nodit Blockchain Context Webhook api has endpoints with patterns like https://web3.nodit.io/v1/{chain}/{network}/webhooks. For example, Ethereum mainnet uses an endpoint like https://web3.nodit.io/v1/ethereum/mainnet/webhooks.
The API list is as follows. You can use the get_nodit_api_spec tool to get more detailed API specifications. However, the API cannot be invoked using the call_nodit_api tool.
The operationIds below show the methodName stem only — combine with a chain from \`supported chains\` as \`{chain}-{methodName}\` (e.g., \`ethereum-createWebhook\`) when calling \`get_nodit_api_spec\`.
- baseUrl: ${baseUrl}
- Available Nodit API Operations:
${formattedList}
`
        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        return createErrorResponse(`Failed to list webhook APIs: ${(error as Error).message}`, toolName)
      }
    }
  );
}
