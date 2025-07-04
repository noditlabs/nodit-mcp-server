import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApiCategoriesTools } from "./api-categories.js";
import { registerNodeApiTools } from "./node-apis.js";
import { registerDataApiTools } from "./data-apis.js";
import { registerWebhookApiTools } from "./webhook-apis.js";
import { registerAptosIndexerTools } from "./aptos-indexer.js";
import { registerGetNoditApiSpecTool } from "./get-nodit-api-spec.js";
import { registerCallNoditApiTool } from "./call-nodit-api.js";

export function registerAllTools(server: McpServer) {
  registerApiCategoriesTools(server);
  registerNodeApiTools(server);
  registerDataApiTools(server);
  registerWebhookApiTools(server);
  registerAptosIndexerTools(server);
  registerGetNoditApiSpecTool(server);
  registerCallNoditApiTool(server);
}
