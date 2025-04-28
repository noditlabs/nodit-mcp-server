import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { log } from "./nodit-apidoc-helper.js";
import { registerAllTools } from "./tools/index.js";

async function main() {
  const server = new McpServer({
    name: "nodit-blockchain-context",
    version: "1.0.0",
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().then(() => {
  log("Nodit MCP Server started successfully.");
}).catch((error) => {
  log("Fatal error in main():", error);
  process.exit(1);
});
