# Nodit MCP Server

A Model Context Provider (MCP) server that connects AI agents and developers to structured, context-ready blockchain data across multiple networks through Nodit's Web3 infrastructure.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)


## Overview

Nodit MCP Server simplifies how AI models and applications interact with blockchain ecosystems.  
Instead of handling complex node RPCs, raw event logs, or chain-specific data structures, developers can access normalized, multi-chain blockchain data in a format optimized for AI reasoning and decision-making.

With Nodit's MCP, you can:
- Build AI agents that query, analyze, and act on real-time blockchain data across EVM-compatible and non-EVM networks.
- Create Web3-integrated applications without requiring specialized blockchain development expertise.
- Leverage Nodit's reliable node infrastructure, Web3 Data APIs, and GraphQL indexing services through a unified access layer.

Supported networks include Ethereum, Base, Optimism, Arbitrum, Polygon, Aptos, Bitcoin, Dogecoin, TRON, XRPL, and more.


## How Nodit MCP Tools Work

Nodit MCP Server provides tools enabling AI agents to dynamically discover, understand, and interact with Nodit's Web3 APIs and data infrastructure. The tools minimize token consumption and maintain a lightweight context by modularizing API interactions into distinct steps:

- **List API Categories (`list_nodit_api_categories`)**  
  Retrieve a list of high-level API categories available.

- **List API Operations (`list_nodit_node_apis`, `list_nodit_data_apis`, `list_nodit_aptos_indexer_api_query_root`)**  
  Fetch available operations within a selected category (Node APIs, Data APIs, Aptos Indexer APIs).

- **Get API Specification (`get_nodit_api_spec`)**  
  Obtain detailed information for a specific API operation (parameters, request/response schema).

- **Call API (`call_nodit_api`)**  
  Execute an API call using the operationId and validated parameters.


## Features

The following are the key features and supported blockchain networks provided through Nodit MCP Server for AI agents and LLMs.  
For detailed API specifications and usage guidelines, please refer to the [Nodit Developer Documentation](https://developer.nodit.io/).

- **RPC Node & Node APIs**  
  Access blockchain node endpoints through Nodit's professionally operated infrastructure.  
  Supports real-time network queries, transaction submissions, smart contract interactions, and more.

- **Web3 Data APIs**  
  High-level APIs for accessing meticulously indexed blockchain data.  
  Includes processed datasets such as block and transaction details, token transfer histories, account-level transaction summaries, and asset movement details — information that would be difficult to assemble directly through raw RPC calls.

- **GraphQL Indexer APIs (Aptos only)**  
  Query detailed Aptos blockchain activities through GraphQL endpoints.

- **Supported Networks**  
  - EVM-Compatible: Ethereum, Arbitrum, Avalanche, Base, Kaia, Optimism, Polygon
  - Non-EVM: Aptos, Bitcoin, Dogecoin, TRON, XRPL


## Prerequisites

- Node.js 18+
- **Nodit API Key** (Sign up and get an API key at [Nodit Console](https://developer.nodit.io/))


## Installation

### Using npx (Recommended)

```bash
npx @noditlabs/nodit-mcp-server@latest
```


### Using with Cursor IDE or Claude Desktop

Add the following configuration to your `.cursor/mcp.json` or `claude_desktop_config.json`:

- **Cursor**
  - MacOS: `~/.cursor/mcp.json`
  - Windows: `C:\Users\<Username>\.cursor\mcp.json`

- **Claude Desktop**
  - MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `C:\Users\<Username>\AppData\Roaming\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nodit": {
      "command": "npx",
      "args": ["@noditlabs/nodit-mcp-server@latest"],
      "env": {
        "NODIT_API_KEY": "****"
      }
    }
  }
}
```
> 🔔 **Important**  
> Replace `****` with your actual Nodit API key.  
> If the API key is not configured properly, API requests will fail due to authentication errors.

### Running Locally (Optional)

Clone and run the server locally:

```bash
# Clone the repository
git clone https://github.com/noditlabs/nodit-mcp-server.git

# Move into the project directory
cd nodit-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

Before starting, set your Nodit API key:

```bash
export NODIT_API_KEY=your-api-key
```

Then start the server:

```bash
npm start
```


## Scope & Limitations

Nodit MCP Server provides structured context to help LLM-based agents utilize Nodit's APIs effectively.  
Its responsibilities include:

- Structuring Nodit APIs (Node APIs, Web3 Data APIs) in an LLM-consumable format.
- Exposing endpoint details, input/output schemas, sample responses, and error handling guidelines.

However, the following are **outside the MCP's control**:

- API selection may vary depending on the LLM version (e.g., GPT-4, Claude 3), prompt engineering, or agent design.
- Interpretation of API responses or errors depends on the consuming LLM's reasoning capabilities.

Nodit MCP Server focuses on delivering accurate and structured API context,  
but does **not guarantee** the final reasoning outcomes or behavior of external LLMs.


## License

This project is licensed under the [Apache License 2.0](./LICENSE).  
Refer to the LICENSE file for full license terms.  
Relevant legal notices are provided in the [NOTICE](./NOTICE) file.

"Nodit" and the Nodit logo are trademarks of Lambda256.  
Use of the name or logo without prior written permission is prohibited.
