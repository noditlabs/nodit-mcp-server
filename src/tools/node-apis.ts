import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createErrorResponse,
  loadNoditApiManifest,
  loadNoditNodeApiSpecMap,
  HTTP_METHODS,
} from "../helper/nodit-apidoc-helper.js";

export function registerNodeApiTools(server: McpServer) {
  const manifest = loadNoditApiManifest();
  const noditNodeApiSpecMap = loadNoditNodeApiSpecMap(manifest);

  server.registerTool(
    "list_nodit_node_apis",
    {
      description: "Lists available Nodit API operations.",
    },
    async () => {
      const toolName = "list_nodit_node_apis";
      try {
        const stemToChains = new Map<string, Set<string>>();

        for (const prefixedKey of noditNodeApiSpecMap.keys()) {
          const dashIdx = prefixedKey.indexOf('-');
          if (dashIdx < 0) continue;
          const chain = prefixedKey.slice(0, dashIdx);
          const stem = prefixedKey.slice(dashIdx + 1);
          if (!stemToChains.has(stem)) stemToChains.set(stem, new Set());
          stemToChains.get(stem)!.add(chain);
        }

        const groupByChainSet = new Map<string, { chains: string[]; stems: string[] }>();
        const chainSpecific: string[] = [];
        for (const [stem, chains] of stemToChains) {
          if (chains.size === 1) {
            const [onlyChain] = chains;
            chainSpecific.push(`${onlyChain}-${stem}`);
            continue;
          }
          const sorted = Array.from(chains).sort();
          const key = sorted.join(',');
          if (!groupByChainSet.has(key)) {
            groupByChainSet.set(key, { chains: sorted, stems: [] });
          }
          groupByChainSet.get(key)!.stems.push(stem);
        }

        const groups = Array.from(groupByChainSet.values())
          .map(g => ({ chains: g.chains, stems: g.stems.sort() }))
          .sort((a, b) => {
            if (b.chains.length !== a.chains.length) return b.chains.length - a.chains.length;
            return a.chains.join(',').localeCompare(b.chains.join(','));
          });
        chainSpecific.sort();

        const formattedGroups = groups
          .map(g => `  - supported chains: [${g.chains.join(',')}]\n    methods: ${g.stems.join(', ')}`)
          .join("\n");

        const formattedSpecificList = chainSpecific
          .map(op => `  - ${op}`)
          .join("\n");

        const content = `Nodit Blockchain Context has endpoints with patterns like https://{chain}-{network}.nodit.io. For example, Ethereum mainnet uses an endpoint like https://ethereum-mainnet.nodit.io
and accepts input in the form of widely known requestBody argument such as { "jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": [] }.
**Important: To ensure the tool 'call_nodit_api' works correctly and to avoid errors, you should first use the tool 'get_nodit_api_spec' to obtain detailed API specifications. Depending on the situation, you may omit using the get_nodit_api_spec tool, but it is recommended to use it on the first call.**
The API list is as follows.
**Important: Nodit Blockchain Context's operationId format rules**
- All chains use the format \`{chain}-{methodName}\` (e.g., \`ethereum-eth_blocknumber\`, \`polygon-eth_blocknumber\`, \`aptos-getAccount\`).
- Make sure to use 'call_nodit_api' with the correct chain, network, and operationId.
- The operationId format rules above are for the 'call_nodit_api' tool only — the actual JSON-RPC \`method\` field on the wire still follows the upstream RPC specification (e.g., \`eth_blockNumber\` in camelCase).
- Cosmos-based chains (e.g. cosmos, injective, celestia, sei) expose cometbft methods over JSON-RPC only; methods such as \`block\`/\`commit\`/\`validators\`/\`consensus_params\` require \`params\` (e.g. \`{ "height": "..." }\`) — omitting params returns an error, so check \`get_nodit_api_spec\` for the exact shape.
- Method groups (combine any chain from \`supported chains\` with a method from \`methods\` to form the operationId, e.g., \`ethereum-eth_blocknumber\`):
${formattedGroups}
- Chain-specific operations (use the operationId as shown):
${formattedSpecificList}
Note: Only call \`{chain}-{methodName}\` combinations where the chain appears in that group's \`supported chains\` list above.
`

        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        return createErrorResponse(`Failed to list APIs: ${(error as Error).message}`, toolName);
      }
    }
  );

}
