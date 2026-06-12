import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPEC_REFERENCE_DIR = path.resolve(__dirname, '../spec/reference');
const CHAINS_DIR = path.join(SPEC_REFERENCE_DIR, 'chains');
const MANIFEST_PATH = path.join(SPEC_REFERENCE_DIR, 'manifest.json');

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
  servers: Array<{ url: string; variables?: Record<string, { default: string }> }>;
  paths: Record<string, OpenApiPathItem>;
  components: any;
  security: any[];
}

export interface NodeApiSubsection {
  apis?: string[];
  websocketApis?: string[];
}

export interface NodeApiSection {
  supported?: boolean;
  apis?: string[];
  evmJsonrpc?: NodeApiSubsection;
  cometbftJsonrpc?: NodeApiSubsection;
  cometbftRest?: NodeApiSubsection;
  cosmosRest?: NodeApiSubsection;
}

export interface Web3DataApiSection {
  supported?: boolean;
  apis?: string[];
}

export interface WebhookApiSection {
  supported?: boolean;
  type?: string;
  operations?: string[];
}

export interface ChainManifest {
  nodeApi?: NodeApiSection;
  web3DataApi?: Web3DataApiSection;
  webhookApi?: WebhookApiSection;
}

export interface NoditApiManifest {
  chains: Record<string, ChainManifest>;
}

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HttpMethod = typeof HTTP_METHODS[number];

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

export function loadNoditApiManifest(): NoditApiManifest {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as NoditApiManifest;
}

function existsSpec(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

// manifest 키와 실제 chains 디렉토리명의 대소문자가 어긋날 수 있다(예: manifest는
// worldchain, 디렉토리는 worldChain). case-sensitive 파일시스템에서도 스펙을 찾도록
// 디렉토리명을 한 번 스캔해 정확 매칭 우선, 없으면 소문자 매칭으로 resolve한다.
let chainDirMapCache: Map<string, string> | null = null;

function resolveChainDir(chain: string): string {
  if (!chainDirMapCache) {
    const map = new Map<string, string>();
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(CHAINS_DIR);
    } catch {
      entries = [];
    }
    for (const name of entries) map.set(name, name); // 정확 매칭 우선
    for (const name of entries) {
      const lc = name.toLowerCase();
      if (!map.has(lc)) map.set(lc, name); // 소문자 매칭(정확 매칭을 덮어쓰지 않음)
    }
    chainDirMapCache = map;
  }
  return chainDirMapCache.get(chain) ?? chainDirMapCache.get(chain.toLowerCase()) ?? chain;
}

function indexOperations(
  specMap: Map<string, NoditOpenApiSpecType>,
  spec: NoditOpenApiSpecType,
  chain: string,
  operationIdStemPrefix?: string,
) {
  // 체인 식별자는 소문자로 정규화한다. 디렉토리/manifest 키가 캐멀케이스인
  // 체인(예: worldChain)도 호스트네임/컨벤션과 동일하게 소문자(worldchain)로 노출되도록.
  const lcChain = chain.toLowerCase();
  const expectedPrefix = `${lcChain}-`;

  for (const [pathKey, pathItem] of Object.entries(spec.paths || {})) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || !operation.operationId) continue;

      const rawId = operation.operationId;
      // 체인 접두사만 소문자로 정규화하고 메서드 stem(대소문자 포함)은 보존한다.
      const dashIdx = rawId.indexOf("-");
      const stem =
        dashIdx > 0 && rawId.slice(0, dashIdx).toLowerCase() === lcChain ? rawId.slice(dashIdx + 1) : rawId;
      const registeredStem = operationIdStemPrefix ? `${operationIdStemPrefix}-${stem}` : stem;
      const prefixedId = `${expectedPrefix}${registeredStem}`;
      const opForRegistration =
        prefixedId === rawId ? operation : { ...operation, operationId: prefixedId };

      const singlePathItem: OpenApiPathItem = { [method]: opForRegistration };
      specMap.set(prefixedId, {
        ...spec,
        paths: { [pathKey]: singlePathItem },
      });
    }
  }
}

export function loadNoditDataApiSpecMap(manifest: NoditApiManifest): Map<string, NoditOpenApiSpecType> {
  const specMap = new Map<string, NoditOpenApiSpecType>();

  for (const [chain, chainManifest] of Object.entries(manifest.chains)) {
    const web3Api = chainManifest.web3DataApi;
    if (!web3Api?.supported || !web3Api.apis?.length) continue;

    const sections = new Set(web3Api.apis.map(api => api.split('/')[0]));
    for (const section of sections) {
      const filePath = path.join(CHAINS_DIR, resolveChainDir(chain), 'web3-data-api', `${section}.yaml`);
      if (!existsSpec(filePath)) continue;
      try {
        const spec = loadOpenapiSpecFile(filePath) as NoditOpenApiSpecType;
        indexOperations(specMap, spec, chain);
      } catch (error) {
        log(`Could not load data API spec ${filePath}: ${(error as Error).message}`);
      }
    }
  }

  if (specMap.size === 0) {
    log('No data API yaml files loaded');
  }

  return specMap;
}

export function loadNoditWebhookApiSpecMap(manifest: NoditApiManifest): Map<string, NoditOpenApiSpecType> {
  const specMap = new Map<string, NoditOpenApiSpecType>();

  for (const [chain, chainManifest] of Object.entries(manifest.chains)) {
    const webhookApi = chainManifest.webhookApi;
    if (!webhookApi?.supported) continue;

    const filePath = path.join(CHAINS_DIR, resolveChainDir(chain), 'webhook-api', 'webhook.yaml');
    if (!existsSpec(filePath)) continue;
    try {
      const spec = loadOpenapiSpecFile(filePath) as NoditOpenApiSpecType;
      indexOperations(specMap, spec, chain);
    } catch (error) {
      log(`Could not load webhook spec ${filePath}: ${(error as Error).message}`);
    }
  }

  if (specMap.size === 0) {
    log('No webhook yaml files loaded');
  }

  return specMap;
}

export function loadNoditNodeApiSpecMap(manifest: NoditApiManifest): Map<string, NoditOpenApiSpecType> {
  const specMap = new Map<string, NoditOpenApiSpecType>();

  for (const [chain, chainManifest] of Object.entries(manifest.chains)) {
    const nodeApi = chainManifest.nodeApi;
    if (!nodeApi?.supported) continue;

    const sources: Array<{ apis: string[]; subDir: string; operationIdStemPrefix?: string }> = [
      { apis: nodeApi.apis ?? [], subDir: 'node-api' },
      { apis: nodeApi.evmJsonrpc?.apis ?? [], subDir: 'node-api' },
      { apis: nodeApi.cometbftJsonrpc?.apis ?? [], subDir: 'cometbft-api/json-rpc-api' },
      { apis: nodeApi.cometbftRest?.apis ?? [], subDir: 'cometbft-api/rest-api', operationIdStemPrefix: 'rest' },
      { apis: nodeApi.cosmosRest?.apis ?? [], subDir: 'cosmos-rest-api' },
    ];

    for (const { apis, subDir, operationIdStemPrefix } of sources) {
      if (apis.length === 0) continue;
      const baseDir = path.join(CHAINS_DIR, resolveChainDir(chain), subDir);

      for (const apiPath of apis) {
        const filePath = path.join(baseDir, `${apiPath}.yaml`);
        if (!existsSpec(filePath)) continue;
        try {
          const spec = loadOpenapiSpecFile(filePath) as NoditOpenApiSpecType;
          indexOperations(specMap, spec, chain, operationIdStemPrefix);
        } catch (error) {
          log(`Could not load node spec ${filePath}: ${(error as Error).message}`);
        }
      }
    }
  }

  return specMap;
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
  table?: { name?: string; schema?: string };
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
        table?: { name?: string; schema?: string };
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

export function isNodeApi(operationId: string, nodeApiSpecMap: Map<string, NoditOpenApiSpecType>): boolean {
  return nodeApiSpecMap.has(operationId);
}

export function isWebhookApi(operationId: string, webhookApiSpecMap: Map<string, NoditOpenApiSpecType>): boolean {
  if (webhookApiSpecMap.has(operationId)) return true;
  for (const k of webhookApiSpecMap.keys()) {
    if (k.endsWith(`-${operationId}`)) return true;
  }
  return false;
}

export function isValidNodeApi(operationId: string, nodeApiSpecMap: Map<string, NoditOpenApiSpecType>): boolean {
  return nodeApiSpecMap.has(operationId);
}

export function isBlockedOperationId(operationId: string): boolean {
  return BLOCKED_OPERATION_IDS.has(operationId);
}

export function loadOpenapiSpecFile(filePath: string): unknown {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.json')) {
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

export interface ApiSpecDetails {
  path: string;
  method: HttpMethod;
  details: OpenApiOperation;
}

export function getApiSpecDetails(
  spec: NoditOpenApiSpecType,
  operationId: string,
): ApiSpecDetails | null {
  if (!spec || !spec.paths) return null;

  for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation?.operationId === operationId) {
        return { path: pathKey, method, details: operation };
      }
    }
  }
  return null;
}

export function extractDataApiChains(manifest: NoditApiManifest): string[] {
  return Object.entries(manifest.chains)
    .filter(([, c]) => c.web3DataApi?.supported && (c.web3DataApi.apis?.length ?? 0) > 0)
    .map(([chain]) => chain.toLowerCase());
}

export function extractNodeApiChains(manifest: NoditApiManifest): string[] {
  return Object.entries(manifest.chains)
    .filter(([, c]) => c.nodeApi?.supported)
    .map(([chain]) => chain.toLowerCase());
}

export function extractWebhookApiChains(manifest: NoditApiManifest): string[] {
  return Object.entries(manifest.chains)
    .filter(([, c]) => c.webhookApi?.supported)
    .map(([chain]) => chain.toLowerCase());
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addNetworksFromServerUrls(
  result: Map<string, Set<string>>,
  chain: string,
  spec: NoditOpenApiSpecType,
) {
  const chainLower = chain.toLowerCase();
  const re = new RegExp(`${escapeRegex(chainLower)}-([a-z0-9]+)\\.nodit\\.io`);
  for (const server of spec.servers ?? []) {
    if (!server.url) continue;
    const m = server.url.toLowerCase().match(re);
    if (!m) continue;
    if (!result.has(chain)) result.set(chain, new Set());
    result.get(chain)!.add(m[1]);
  }
}

function addNetworksFromParameters(
  result: Map<string, Set<string>>,
  chain: string,
  spec: NoditOpenApiSpecType,
) {
  for (const pathItem of Object.values(spec.paths ?? {})) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op?.parameters) continue;
      for (const param of op.parameters) {
        if (param?.name !== 'network') continue;
        const values = param.schema?.enum;
        if (!Array.isArray(values)) continue;
        for (const v of values) {
          if (typeof v !== 'string') continue;
          if (!result.has(chain)) result.set(chain, new Set());
          result.get(chain)!.add(v);
        }
      }
    }
  }
}

export function extractChainNetworks(
  specMaps: Array<Map<string, NoditOpenApiSpecType>>,
): Map<string, string[]> {
  const collected = new Map<string, Set<string>>();

  for (const specMap of specMaps) {
    for (const [prefixedKey, spec] of specMap.entries()) {
      const dashIdx = prefixedKey.indexOf('-');
      if (dashIdx < 0) continue;
      const chain = prefixedKey.slice(0, dashIdx);
      addNetworksFromServerUrls(collected, chain, spec);
      addNetworksFromParameters(collected, chain, spec);
    }
  }

  const sorted = new Map<string, string[]>();
  for (const [chain, set] of collected) {
    sorted.set(chain, Array.from(set).sort());
  }
  return sorted;
}

export function createErrorResponse(message: string, toolName: string): { content: { type: "text"; text: string }[] } {
  log(`Tool Error (${toolName}): ${message}`);
  return { content: [{ type: "text" as const, text: `Tool Error: ${message}` }] };
}
