import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./helper/nodit-apidoc-helper.js";
import { registerAllTools } from "./tools/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readServerVersion(): string {
  const packageJsonPath = path.resolve(__dirname, "../package.json");
  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const version = (JSON.parse(raw) as { version?: string }).version;
  if (!version) {
    throw new Error(`No version field in ${packageJsonPath}`);
  }
  return version;
}

async function main() {
  const server = new McpServer({
    name: "nodit-blockchain-context",
    version: readServerVersion(),
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
