# Nodit MCP Server

A Model Context Protocol (MCP) server that connects AI agents and developers to structured, context-ready blockchain data across multiple networks through Nodit's Web3 infrastructure.

<a href="https://glama.ai/mcp/servers/@noditlabs/nodit-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@noditlabs/nodit-mcp-server/badge" alt="Nodit Server MCP server" />
</a>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![smithery badge](https://smithery.ai/badge/@noditlabs/nodit-mcp-server)](https://smithery.ai/server/@noditlabs/nodit-mcp-server)

## Overview

Nodit MCP Server simplifies how AI models and applications interact with blockchain ecosystems.  
Instead of handling complex node RPCs, raw event logs, or chain-specific data structures, developers can access normalized, multi-chain blockchain data in a format optimized for AI reasoning and decision-making.

With Nodit's MCP, you can:
- Build AI agents that **query, analyze, and act on real-time blockchain data** across EVM-compatible and non-EVM networks.
- **Develope Web3-integrated applications** without requiring specialized blockchain development expertise.
- Leverage Nodit's **reliable node infrastructure, Web3 Data APIs, and GraphQL indexing services** through a unified access layer.
- Easily develop with blockchain MCP in **both local and remote integration**, depending on your workflow needs.

Supported networks include Ethereum, Base, Optimism, Arbitrum, Polygon, Aptos, Bitcoin, Dogecoin, TRON, XRPL, and more.

## Table of Contents
- [How Nodit MCP Tools Work](#how-nodit-mcp-tools-work)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Running Local Nodit MCP Server](#running-local-nodit-mcp-server)
- [Integrating Nodit Remote MCP Server](#integrating-nodit-remote-mcp-server)
- [Troubleshooting](#troubleshooting)
- [Example Prompts with Nodit MCP](#example-prompts-with-nodit-mcp)
- [Scope & Limitations](#scope--limitations)
- [License](#license)

## How Nodit MCP Tools Work

Nodit MCP Server provides tools enabling AI agents to dynamically discover, understand, and interact with Nodit's Web3 APIs and data infrastructure. The tools minimize token consumption and maintain a lightweight context by modularizing API interactions into distinct steps:

- **List API Categories (`list_nodit_api_categories`)**  
  Retrieve a list of high-level API categories available.

- **List API Operations (`list_nodit_node_apis`, `list_nodit_data_apis`, `list_nodit_aptos_indexer_api_query_root`,`list_nodit_webhook_apis`)**  
  Fetch available operations within a selected category (Node APIs, Data APIs, Aptos Indexer APIs, Webhook APIs).

- **Get API Specification (`get_nodit_api_spec`,`get_nodit_aptos_indexer_api_spec`)**  
  Obtain detailed information for a specific API operation (parameters, request/response schema).

- **Call API (`call_nodit_api`,`call_nodit_aptos_indexer_api`)**  
  Execute an API call using the operationId and validated parameters.
  
Nodit MCP Server communicates using the standard JSON-RPC over stdio protocol, following the Model Context Protocol (MCP) conventions.
Currently, only stdio-based communication is supported for server-client interactions.

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
  - EVM-Compatible: Ethereum, Arbitrum, Avalanche, Base, Chiliz, Kaia, Optimism, Polygon
  - Non-EVM: Aptos, Bitcoin, Dogecoin, TRON, XRPL


## Prerequisites

- Node.js 18+
- **Nodit API Key** (Sign up and get an API key at [Nodit Console](https://nodit.lambda256.io/))


## Running Local Nodit MCP Server

### Using npx (Recommended)

```bash
npx @noditlabs/nodit-mcp-server@latest
```

### Using local build

```bash
# Clone the repository
git clone --recurse-submodules https://github.com/noditlabs/nodit-mcp-server.git

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
node build/index.js
```

### Communicating with the Local Server

Once the Nodit MCP Server is running locally, you can communicate with it using **JSON-RPC over stdio**.  
Here’s how you can send a basic request to the server:

**Example: List available tools**

You can directly input the JSON-RPC payload:

```bash
{"method":"tools/list","params":{},"jsonrpc":"2.0","id":1}
```

Or, you can pipe the request using the `echo` command:

```bash
echo '{"method":"tools/list","params":{},"jsonrpc":"2.0","id":1}' | node build/index.js
```

**Example: Call a specific tool (list_nodit_api_categories)**

```bash
echo '{"method":"tools/call","params":{"name":"list_nodit_api_categories","arguments":{}},"jsonrpc":"2.0","id":1}' | node build/index.js
```

### Connecting to Cursor IDE or Claude Desktop

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

### Connecting to Claude CLI

You can also use Nodit MCP Server directly with Claude CLI for a quick setup.

Add Nodit MCP Server with the following commands:

```bash
# Add the Nodit MCP server
claude mcp add nodit-mcp-server npx @noditlabs/nodit-mcp-server

# Set API Key
export NODIT_API_KEY=your-api-key

# Start Claude with the Nodit MCP server enabled
claude
```
## Integrating Nodit Remote MCP Server
If you’re using an AI tool that supports Remote MCP integration, you can connect to Nodit’s Remote MCP Server without running a local MCP server.
This allows you to use Nodit MCP features directly within your AI environment.

### Endpoint
Use the following endpoint to connect to the Nodit Remote MCP Server. Make sure to replace INSERT_YOUR_API_KEY with your actual Nodit API Key.

```bash
https://mcp.nodit.io/sse?apiKey=INSERT_YOUR_API_KEY
```

### Connecting to Claude (Web)
If you’re on the Claude Enterprise, Pro, or Max plan, you can integrate the Remote MCP Server. 

1. Go to Settings > Integrations, click the [Add custom integration] button.
2. Click the [Add more] button to integrate the new Remote MCP.
3. Insert the endpoint provided above to complete the setup.

Once the integration is complete, you’ll see that Nodit MCP has been added under the Search and Tools section on the Claude main screen.

### Connecting to Cursor IDE
To connect Nodit MCP to Cursor IDE:
	1.	Open Preferences > Cursor Settings > MCP Tools.
	2.	Click [+ New MCP Server] to open the mcp.json configuration file.

You can also open and edit the mcp.json file directly at the following path:
  - MacOS: `~/.cursor/mcp.json`
  - Windows: `C:\Users\<Username>\.cursor\mcp.json`

Add the following configuration to the mcpServers object. If you already have other MCP servers configured, separate each entry with a comma.
```json
{
  "mcpServers": {
    "nodit": {
      "url": "https://mcp.nodit.io/sse?apiKey=INSERT_YOUR_API_KEY"
    }
  }
}
```
Once added, go back to MCP Tools in the Cursor interface and enable the nodit MCP by toggling it on. When the status shows “9 tools enabled” in green, the connection is complete.

## Troubleshooting
### Trouble running MCP via npx on Claude Desktop
If you are running the MCP server in combination with **Claude Desktop** or other tools that rely on a local Node.js installation, you may encounter issues due to:
* Multiple versions of Node.js installed (e.g., via Homebrew and package installer)
* Conflicting PATH environments
* Claude Desktop not recognizing the correct Node.js runtime

Follow the steps below to verify that **Node.js 18+** is properly installed and recognized on your system.

#### 1. Check your currently active Node.js version
Run the following command in your terminal to check the version:
```
node --version
```
You should see a version number starting with v18 or higher (e.g., v18.19.0).

If not, you may need to install a compatible version or switch to it.

> [!TIP] 
> Claude Desktop may not use the same Node.js version as your terminal. If you have multiple installations (e.g., via Homebrew, nvm, or direct installer), it may default to an unexpected version.
> To list all common installation paths:
> ```
> # Homebrew installation
> ls /usr/local/bin/node
> ls /opt/homebrew/bin/node
> 
> # nvm installations
> ls ~/.nvm/versions/node/
> 
> # System installation
> ls /usr/bin/node
> ```

#### 2. Install or switch to Node.js 18+ if needed
If you don’t have a compatible version, install Node.js using one of the following methods:

* Using Node.js official installer: Download from nodejs.org
* Using Homebrew (macOS):
```  
bashbrew install node@20
```
* Using nvm (recommended for version management):
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
nvm alias default 20
```

#### 3. Check which Node.js version Claude Desktop uses
Claude Desktop inherits the PATH from your system environment.
In your terminal, run:
```
which node
```
This displays the path of the Node.js binary currently active in your terminal. This is the path that Claude is likely to use when launched from that terminal.

#### 4. Force Claude Desktop to use the correct Node.js version
* If you’re using nvm:
```
nvm use 18  # Set proper version 
nvm alias default 18
```

* If you’re using Homebrew, ensure it’s prioritized in your PATH:
```
export PATH="/opt/homebrew/bin:$PATH"  # for Apple Silicon
# or
export PATH="/usr/local/bin:$PATH"     # for Intel Macs
```
We recommend sticking to a single installation method (e.g., either nvm or Homebrew) to avoid version conflicts.

#### 5. Restart Claude Desktop
After making changes, restart Claude Desktop to ensure it picks up the correct environment variables and Node.js version.

## Example Prompts with Nodit MCP
Once Nodit MCP is connected, you can use natural language to directly query blockchain data from multiple networks.
The examples below illustrate just a few of the many possibilities — feel free to go beyond them and explore your own use cases. 

### 📊 On-chain Activity Monitoring
```
Summarize the recent activity of 0xabc…def across Ethereum and Arbitrum. Include major transactions, token transfers, and NFT interactions over the past 7 days.
```
```
What fungible and non-fungible tokens does this wallet hold across Ethereum and Polygon? Include balances and token names.
```
```
Analyze the risk profile of wallet 0xabc… based on its recent on-chain behavior.
```

### 🧾 Smart Contract & Transaction Analysis
```
Analyze how users interacted with the contract at 0xcontract… on Ethereum over the last week.
```
```
Analyze the last 10 blocks on Arbitrum.
```

### 🧠 AI Agent Use Cases
```
Based on wallet 0xabc…’s holdings, recommend optimal DeFi strategies across Ethereum and Arbitrum.
```
```
Create a daily summary report for 0xdao… including token balances, inflow/outflow, and governance activity.
```

### ⚙️ Web3 DApp Development
```
Write TypeScript code using fetch to retrieve all ERC-20 transfers for 0xabc… from Ethereum using Nodit’s Node API.
```
```
Build a simple dashboard to visualize how assets have moved in recent XRPL transactions.
```
```
Build a dashboard that aggregates blockchain data across multiple chains using Nodit.
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

---
© Lambda256. All rights reserved.
