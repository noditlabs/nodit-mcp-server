import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  post: OpenApiOperation;
}

export interface NoditOpenApiSpecType {
  openapi: string;
  info: { title: string; version: string };
  servers: [{ url: string; variables?: Record<string, { default: string }> }];
  paths: Record<string, OpenApiPathItem>;
  components: any;
  security: any[];
}

export function log(message: string, ...args: any[]) {
  console.error(message, ...args);
}

export function loadNoditDataApiSpec(): NoditOpenApiSpecType {
  const specPath = path.resolve(__dirname, './spec/reference/web3-data-api.yaml');
  return loadOpenapiSpecFile(specPath) as NoditOpenApiSpecType;
}

export function loadNoditNodeApiSpecMap(): Map<string, NoditOpenApiSpecType> {
  const noditApiSpecMap = new Map<string, NoditOpenApiSpecType>();
  const specDir = path.resolve(__dirname, './spec/reference');

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

    return noditApiSpecMap;
  } catch (error) {
    log('Error reading spec directory:', error);
    return new Map();
  }
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
  const schemaPath = path.resolve(__dirname, './nodit-aptos-indexer-api-schema.json');
  return loadOpenapiSpecFile(schemaPath) as AptosIndexerApiSpec;
}

export function isNodeApi(operationId: string): boolean {
  return operationId.includes("_");
}

export function isEthereumNodeApi(operationId: string): boolean {
  return !operationId.includes("-")
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

  if (!spec) {
    return null;
  }

  return {
    path: '/',
    method: 'post',
    details: spec.paths['/']?.post
  }
}

export function createErrorResponse(message: string, toolName: string): { content: { type: "text"; text: string }[] } {
  log(`Tool Error (${toolName}): ${message}`);
  return { content: [{ type: "text" as const, text: `Tool Error: ${message}` }] };
}
