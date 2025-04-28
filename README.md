# Nodit MCP Server
A Model Context Provider (MCP) server connects AI agents and developers to structured, context-ready blockchain data across multiple networks through Nodit's Web3 infrastructure.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)

## Overview
Nodit MCP Server simplifies how AI models and applications interact with blockchain ecosystems.  
Instead of dealing directly with complex node RPCs, raw event logs, or chain-specific data structures, developers can use the MCP to access normalized, multi-chain blockchain data in a format optimized for AI reasoning and decision-making.

With Nodit's MCP, you can:
- Build AI agents that query, analyze, and act on real-time blockchain data across EVM-compatible chains and major non-EVM networks.
- Create Web3-integrated applications without requiring specialized blockchain development knowledge.
- Leverage Nodit's reliable node infrastructure, real-time Web3 Data APIs, and GraphQL indexing services through a unified and consistent access layer.

Nodit MCP supports a wide range of blockchain networks, including Ethereum, Base, Optimism, Arbitrum, Polygon, Aptos, Bitcoin, Dogecoin, TRON, XRPL, and more.  
It abstracts the complexity of Web3 data interactions, providing a developer-friendly bridge between AI models and decentralized networks.

Whether you're building intelligent blockchain agents, enhancing AI-driven Web3 experiences, or creating new decentralized applications, Nodit MCP accelerates your ability to bring blockchain intelligence into your AI systems.

## How Nodit MCP Tools Work

Nodit MCP Server provides a set of tools that allow AI agents to dynamically discover, understand, and interact with Nodit's Web3 APIs and data infrastructure. These tools are designed to minimize token consumption and maintain a lightweight context by modularizing the API interaction process into distinct steps: listing available APIs, retrieving detailed specifications, and executing actual API calls.

The typical interaction flow is:

1. **List API Categories (`list_nodit_api_categories`)** – Retrieve the list of high-level API categories available.
2. **List API Operations (`list_nodit_node_apis`, `list_nodit_data_apis`, `list_nodit_aptos_indexer_api_query_root`)** – Fetch available operations within a selected category (Node APIs, Data APIs, Aptos Indexer APIs).
3. **Get API Specification (`get_nodit_api_spec`)** – Obtain detailed information for a specific API operation (parameters, request/response schema).
4. **Call API (`call_nodit_api`)** – Execute the API call using the operationId and validated parameters.


## Features

The following are the key features and supported blockchain networks provided through Nodit MCP Server for AI agents and LLMs.  
For detailed API specifications and usage guidelines, please refer to the [Nodit Developer Documentation](https://developer.nodit.io/).

- **RPC Node & Node APIs**  
  Direct access to blockchain node endpoints through Nodit's shared, professionally operated infrastructure.  
  Supports real-time network state queries, transaction submissions, smart contract interactions, and more.

- **Web3 Data APIs**  
  High-level query APIs that provide access to meticulously indexed blockchain data.  
  Includes processed datasets such as block and transaction details, token transfer histories, account-level transaction summaries, and asset movement details — information that would be difficult to assemble directly through raw RPC calls.

- **GraphQL Indexer APIs (Aptos only)**  
  GraphQL-based access to indexed Aptos blockchain data.  
  Designed for efficient querying of coin activities, token transfers, and other detailed on-chain activity records.

- **Supported Networks**  
  Nodit MCP currently supports major blockchain networks, including:  
  Ethereum, Arbitrum, Avalanche, Base, Kaia, Optimism, Polygon (EVM-compatible chains)  
  and Aptos, Bitcoin, Dogecoin, TRON, XRPL (non-EVM chains).

## Prerequisites

- **Nodit API Key** (Sign up and generate your API key at [Nodit Console](https://developer.nodit.io/))

## Installation

### Using npx (Recommended for Quick Start)
```bash
npx @noditlabs/nodit-mcp-server@latest
```

### Using with Cursor IDE or Claude Desktop
To use Nodit MCP Server with Cursor or Claude Desktop, add the following configuration to your `.cursor/mcp.json` or `claude_desktop_config.json`.

- **Cursor**
  - Config file (MacOS): `~/.cursor/mcp.json`
  - Config file (Windows): `C:\Users\<Username>\.cursor\mcp.json`

- **Claude Desktop**
  - Config file (MacOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Config file (Windows): `C:\Users\<Username>\AppData\Roaming\Claude\claude_desktop_config.json`


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
🔔 **Important:**
Replace **** with your actual Nodit API key.
If not configured correctly, API calls will fail due to authentication errors.

### Running Locally (Optional)
Alternatively, you can clone and run the server locally:

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
Before starting the server, set your Nodit API Key:

```bash
export NODIT_API_KEY=your-api-key
```
Then launch the server:
```bash
npm start
```

## Scope & Limitations

Nodit MCP Server is designed to help large language model (LLM)-based agents and applications effectively utilize Nodit's Web3 Data APIs and Node APIs.  
Its core functions include:

- Structuring and exposing Nodit's APIs in an LLM-consumable format, including endpoint details, input/output schemas, sample responses, and error handling guides.
- Delivering **API usage context** that enables AI agents to dynamically select and invoke appropriate APIs based on user queries.

However, the following are **outside the direct control of the MCP**:

## License

This project is licensed under the [Apache License 2.0](./LICENSE).  
Please see the LICENSE file for the full license text.

Relevant legal notices are provided in the [NOTICE](./NOTICE) file.

"Nodit" and the Nodit logo are trademarks of Lambda256.  
Use of the name or logo without prior written permission is prohibited.

- API selection may vary depending on the LLM version (e.g., GPT-4, Claude 3), prompt engineering, or agent design.
- Interpretation of API specifications, responses, or errors depends on the reasoning capabilities of the consuming LLM or agent.

Nodit MCP Server focuses on providing accurate, structured context to support effective API use,  
but it does **not guarantee** the reasoning outcomes or behaviors of external models.
