import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createErrorResponse,
  normalizeDescription,
  loadNoditApiManifest,
  loadNoditDataApiSpecMap,
  HTTP_METHODS,
} from "../helper/nodit-apidoc-helper.js";

interface DataApiInfo {
  operationId: string;
  description: string;
  path: string;
  supportedChains: string[];
}

export function registerDataApiTools(server: McpServer) {
  const manifest = loadNoditApiManifest();
  const dataApiSpecMap = loadNoditDataApiSpecMap(manifest);

  server.registerTool(
    "list_nodit_data_apis",
    {
      description: "Lists available Nodit Data API operations.",
    },
    async () => {
      const toolName = "list_nodit_data_apis";
      try {
        const opToChains = new Map<string, Set<string>>();
        const opToInfo = new Map<string, DataApiInfo>();
        let baseUrl = '';

        for (const [prefixedKey, spec] of dataApiSpecMap.entries()) {
          const dashIdx = prefixedKey.indexOf('-');
          if (dashIdx < 0) continue;
          const chain = prefixedKey.slice(0, dashIdx);
          const opStem = prefixedKey.slice(dashIdx + 1);

          if (!opToChains.has(opStem)) opToChains.set(opStem, new Set());
          opToChains.get(opStem)!.add(chain);

          if (!baseUrl && spec.servers?.[0]?.url) {
            baseUrl = spec.servers[0].url;
          }

          if (!opToInfo.has(opStem)) {
            for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
              if (!pathItem) continue;
              const op = HTTP_METHODS.map(m => pathItem[m]).find(o => o);
              if (!op) continue;
              opToInfo.set(opStem, {
                operationId: opStem,
                description: normalizeDescription(op.description),
                path: pathKey,
                supportedChains: [],
              });
              break;
            }
          }
        }

        const apiList = Array.from(opToInfo.values())
          .map(info => ({
            ...info,
            supportedChains: Array.from(opToChains.get(info.operationId) ?? []).sort(),
          }))
          .sort((a, b) => (a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0));

        const formattedList = apiList
          .map(api => `  - operationId: ${api.operationId}, supported chains: [${api.supportedChains.join(',')}], description: ${api.description}`)
          .join("\n");

        const content = `Nodit Blockchain Context data api has endpoints with patterns like https://web3.nodit.io/v1/{chain}/{network}/getBlockByHashOrNumber. For example, Ethereum mainnet uses an endpoint like https://web3.nodit.io/v1/ethereum/mainnet/getBlockByHashOrNumber.
The API list is as follows. You can use the get_nodit_api_spec tool to get more detailed API specifications.
The operationIds below show the methodName stem only — combine with a chain from \`supported chains\` as \`{chain}-{methodName}\` (e.g., \`ethereum-getBlockByHashOrNumber\`) when calling \`get_nodit_api_spec\` or \`call_nodit_api\`.
- baseUrl: ${baseUrl}
- Available Nodit API Operations:
${formattedList}
`
        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        return createErrorResponse(`Failed to list APIs: ${(error as Error).message}`, toolName);
      }
    }
  );
}
