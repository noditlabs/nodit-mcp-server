import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ApiSpecDetails {
  baseUrl: string;
  pathMapper: string;
  method: string;
  operation: OpenApiOperation;
}

export interface OpenApiOperation {
  operationId: string;
  description: string;
  requestBody: any;
  responses: any;
  parameters: Array<{
    name: string;
    schema: {
      type: string;
      enum?: string[];
    }
  }>
}

export interface OpenApiPathItem {
  post?: OpenApiOperation;
  get?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
}

export interface NoditOpenApiSpecType {
  openapi: string;
  info: { title: string; version: string };
  servers: [{ url: string; variables?: Record<string, { default: string }> }];
  paths: Record<string, OpenApiPathItem>;
  components: any;
  security: any[];
}

export const BLOCKED_OPERATION_IDS = new Set([
  "solana-getProgramAccounts",
  "solana-getClusterNodes",
  "solana-getLeaderSchedule",
  "solana-getSignaturesForAddress",
  "solana-getBlock",
  "solana-getBlocks",
  "solana-getBlocksWithLimit",
  "solana-getVoteAccounts",
  "solana-getInflationGovernor",
  "solana-getInflationRate",
  "solana-getInflationReward",
  "solana-getSupply",
]);

export function log(message: string, ...args: any[]) {
  console.error(message, ...args);
}

export function loadNoditDataApiSpec(): NoditOpenApiSpecType {
  const specPath = path.resolve(__dirname, '../spec/reference/web3-data-api.yaml');
  return loadOpenapiSpecFile(specPath) as NoditOpenApiSpecType;
}

export function loadNoditWebhookApiSpec(): NoditOpenApiSpecType {
  const specPath = path.resolve(__dirname, '../spec/reference/webhook.yaml');
  return loadOpenapiSpecFile(specPath) as NoditOpenApiSpecType;
}

export function loadNoditNodeApiSpecMap(): Map<string, NoditOpenApiSpecType> {
  const noditApiSpecMap = new Map<string, NoditOpenApiSpecType>();
  const specDir = path.resolve(__dirname, '../spec/reference');

  try {
    const files = fs.readdirSync(specDir);

    const evmSpecFiles = files.filter(file => file.startsWith('evm-') && file.endsWith('.yaml'));

    for (const file of evmSpecFiles) {
      const parts = file.replace('.yaml', '').split('-');

      if (parts.length >= 2) {
        const protocol = parts[1];
        const filePath = path.join(specDir, file);

        try {
          const spec = loadOpenapiSpecFile(filePath) as NoditOpenApiSpecType;
          const operationId = spec.paths['/']!.post!.operationId;
          if (operationId) {
            const key = protocol === 'ethereum' ? `ethereum-${operationId}` : operationId;
            noditApiSpecMap.set(key, spec);
          } else {
            log(`Could not extract operationId from spec file ${file}`);
          }
        } catch (error) {
          log(`Error loading spec file ${file}:`, error);
        }
      }
    }

    const suiNodeApiSpecDir = path.resolve(__dirname, '../spec/reference/sui-node-api');
    const suiNodeApiSpecFiles = fs.readdirSync(suiNodeApiSpecDir);
    for (const file of suiNodeApiSpecFiles) {
      if (file.endsWith('.yaml')) {
        const filePath = path.join(suiNodeApiSpecDir, file);
        const suiNodeApiSpecMap = loadMultiPathApiSpec(filePath);
        suiNodeApiSpecMap.forEach((spec, operationId) => {
          noditApiSpecMap.set(operationId, spec);
        });
      }
    }

    const solanaNodeApiSpecDir = path.resolve(__dirname, '../spec/reference/solana-node-api/http-methods');
    const solanaNodeApiSpecFiles = fs.readdirSync(solanaNodeApiSpecDir);
    for (const file of solanaNodeApiSpecFiles) {
      if (file.endsWith('.yaml')) {
        const filePath = path.join(solanaNodeApiSpecDir, file);
        const solanaNodeApiSpecMap = loadMultiPathApiSpec(filePath);
        solanaNodeApiSpecMap.forEach((spec, operationId) => {
          noditApiSpecMap.set(operationId, spec);
        });
      }
    }

    const aptosNodeApiSpec = path.resolve(__dirname, '../spec/reference/aptos-node-api.yaml');
    if (fs.existsSync(aptosNodeApiSpec)) {
      const aptosNodeApiSpecMap = loadMultiPathApiSpec(aptosNodeApiSpec);
      aptosNodeApiSpecMap.forEach((spec, operationId) => {
        noditApiSpecMap.set(operationId, spec);
      });
    }

    return noditApiSpecMap;
  } catch (error) {
    log('Error reading spec directory:', error);
    return new Map();
  }
}

function loadMultiPathApiSpec(filePath: string): Map<string, NoditOpenApiSpecType> {
  const specMap = new Map<string, NoditOpenApiSpecType>();

  try {
    const spec = loadOpenapiSpecFile(filePath) as NoditOpenApiSpecType;

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      const methods: Array<keyof OpenApiPathItem> = ['get', 'post', 'put', 'patch', 'delete'];
      for (const method of methods) {
        const operation = pathItem[method];
        if (operation?.operationId) {
          const singleOperationSpec: NoditOpenApiSpecType = {
            ...spec,
            paths: { [path]: { [method]: operation } as OpenApiPathItem }
          };
          specMap.set(operation.operationId, singleOperationSpec);
        }
      }
    }
  } catch (error) {
    log(`Error loading spec file ${filePath}:`, error);
  }

  return specMap
}

export interface Relationship {
  name?: string;
  using?: {
    manual_configuration?: {
      remote_table?: {
        name?: string;
      };
      column_mapping?: Record<string, any>;
    };
  };
}

export interface GraphQLSpec {
  name: string;
  table?: string;
  columns: string[];
  relationships: {
    object: Array<{
      name: string;
      remote_table: string;
      column_mapping: Record<string, any>;
    }>;
    array: Array<{
      name: string;
      remote_table: string;
      column_mapping: Record<string, any>;
    }>;
  };
}

export interface AptosIndexerApiSpec {
  metadata?: {
    sources?: Array<{
      tables?: Array<{
        table?: string;
        configuration?: {
          custom_name?: string;
        };
        select_permissions?: Array<{
          permission?: {
            columns?: string[];
          };
        }>;
        object_relationships?: Array<Relationship>;
        array_relationships?: Array<Relationship>;
      }>;
    }>;
  };
}

export function loadNoditAptosIndexerApiSpec(): AptosIndexerApiSpec {
  const schemaPath = path.resolve(__dirname, '../nodit-aptos-indexer-api-schema.json');
  return loadOpenapiSpecFile(schemaPath) as AptosIndexerApiSpec;
}

export function isNodeApi(operationId: string): boolean {
  return operationId.includes("_") || operationId.startsWith("solana-");
}

export function isEthereumNodeApi(operationId: string): boolean {
  return !operationId.includes("-") && !operationId.startsWith("aptos_")
}

export function isWebhookApi(operationId: string): boolean {
  return operationId.includes("Webhook");
}

export function isBlockedOperationId(operationId: string): boolean {
  return BLOCKED_OPERATION_IDS.has(operationId);
}

export function findNoditNodeApiSpec(operationId: string, noditNodeApiSpecMap: Map<string, NoditOpenApiSpecType>): NoditOpenApiSpecType | undefined {
  let key = operationId;
  if (isEthereumNodeApi(operationId)) {
    key = `ethereum-${operationId}`;
  }
  return noditNodeApiSpecMap.get(key);
}

export function isValidNodeApi(operationId: string, noditNodeApiSpecMap: Map<string, NoditOpenApiSpecType>): boolean { 
  return findNoditNodeApiSpec(operationId, noditNodeApiSpecMap) !== undefined;
}

export function loadOpenapiSpecFile(path: string): unknown {
  const fileContents = fs.readFileSync(path, 'utf8');
  if (path.endsWith('.json')) {
    return JSON.parse(fileContents);
  }
  return yaml.load(fileContents);
}

export function normalizeDescription(description: string | undefined): string {
  if (!description) {
    return "No description available."
  }

  const lines = description.split('\n');
  const filteredLines = lines.filter(line => !line.trimStart().startsWith('>'));

  return filteredLines.join('\n').trim();
}

export function findNoditDataApiDetails(operationId: string, spec: NoditOpenApiSpecType): {
  path: string;
  method: string;
  details: OpenApiOperation
} | null {
  if (!spec || !spec.paths) {
    log("findApiDetails: Invalid spec object or missing paths.");
    return null;
  }
  for (const pathKey in spec.paths) {
    if (Object.prototype.hasOwnProperty.call(spec.paths, pathKey)) {
      const pathItem = spec.paths[pathKey];
      if (pathItem?.post?.operationId === operationId) {
        return {
          path: pathKey,
          method: 'post',
          details: pathItem.post
        };
      }
    }
  }
  return null;
}

export function findNoditNodeApiDetails(operationId: string, specMap: Map<string, NoditOpenApiSpecType>): {
  path: string;
  method: string;
  details: OpenApiOperation
} | null {
  const spec = findNoditNodeApiSpec(operationId, specMap);

  if (spec && spec.paths['/']?.post) {
    return {
      path: '/',
      method: 'post',
      details: spec.paths['/']?.post
    }
  }

  return null;
}

export function findNoditWebhookApiDetails(operationId: string, spec: NoditOpenApiSpecType): {
  path: string;
  method: string;
  details: OpenApiOperation
} | null {
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods: Array<{ method: string; operation?: OpenApiOperation }> = [
      { method: 'get', operation: pathItem.get },
      { method: 'post', operation: pathItem.post },
      { method: 'put', operation: pathItem.put },
      { method: 'patch', operation: pathItem.patch },
      { method: 'delete', operation: pathItem.delete }
    ];

    for (const { method, operation } of methods) {
      if (operation?.operationId === operationId) {
        return {
          path,
          method,
          details: operation
        };
      }
    }
  }
  
  return null;
}

export function getApiSpecDetails(spec: NoditOpenApiSpecType, operationId: string): ApiSpecDetails | null {
  const baseUrl = spec.servers[0]?.url;
  if (!baseUrl) {
    return null;
  }

  for (const [pathMapper, pathItem] of Object.entries(spec.paths)) {
    const methods: Array<keyof OpenApiPathItem> = ['get', 'post', 'put', 'patch', 'delete'];
    for (const method of methods) {
      const operation = pathItem[method];
      if (operation?.operationId === operationId) {
        return {
          baseUrl,
          pathMapper,
          method,
          operation
        };
      }
    }
  }
  return null;
}

export function createErrorResponse(message: string, toolName: string): { content: { type: "text"; text: string }[] } {
  log(`Tool Error (${toolName}): ${message}`);
  return { content: [{ type: "text" as const, text: `Tool Error: ${message}` }] };
}
