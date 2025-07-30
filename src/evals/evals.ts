//evals.ts

import { EvalConfig } from 'mcp-evals';
import { openai } from "@ai-sdk/openai";
import { grade, EvalFunction } from "mcp-evals";

const list_nodit_data_apisEval: EvalFunction = {
    name: "list_nodit_data_apis Evaluation",
    description: "Evaluates the functionality of tool list_nodit_data_apis",
    run: async () => {
        const result = await grade(openai("gpt-4"), "List the available Nodit Data API operations.");
        return JSON.parse(result);
    }
};

const call_nodit_apiEval: EvalFunction = {
    name: "call_nodit_api Tool Evaluation",
    description: "Evaluates the call_nodit_api tool's ability to call Nodit Blockchain Context API",
    run: async () => {
        const result = await grade(openai("gpt-4"), "Please use the call_nodit_api tool to call the ethereum mainnet with operationId 'eth_getBalance' and a request body {\"address\":\"0x1234567890abcdef\"} to retrieve the balance.");
        return JSON.parse(result);
    }
};

const get_nodit_api_specEval: EvalFunction = {
    name: "get_nodit_api_spec Evaluation",
    description: "Evaluates the get_nodit_api_spec tool by retrieving the resolved specification for a given operationId",
    run: async () => {
        const result = await grade(openai("gpt-4"), "What is the fully resolved specification for the operationId 'nodit_blockchain_op123' using get_nodit_api_spec?");
        return JSON.parse(result);
    }
};

const list_nodit_node_apis: EvalFunction = {
    name: 'list_nodit_node_apis',
    description: 'Evaluates the functionality of listing Nodit Node API operations',
    run: async () => {
        const result = await grade(openai("gpt-4"), "What are the available Nodit Node API operations?");
        return JSON.parse(result);
    }
};

const list_nodit_aptos_indexer_api_query_rootEval: EvalFunction = {
    name: "list_nodit_aptos_indexer_api_query_root",
    description: "Evaluates the listing of query roots from the Nodit Aptos Indexer GraphQL API",
    run: async () => {
        const result = await grade(openai("gpt-4"), "Which query roots are available in the Nodit Aptos Indexer GraphQL API?");
        return JSON.parse(result);
    }
};

const config: EvalConfig = {
    model: openai("gpt-4"),
    evals: [list_nodit_data_apisEval, call_nodit_apiEval, get_nodit_api_specEval, list_nodit_node_apis, list_nodit_aptos_indexer_api_query_rootEval]
};
  
export default config;
  
export const evals = [list_nodit_data_apisEval, call_nodit_apiEval, get_nodit_api_specEval, list_nodit_node_apis, list_nodit_aptos_indexer_api_query_rootEval];