import {
  isWebhookApi,
  isBlockedOperationId,
  isNodeApi,
  isValidNodeApi,
  findNoditDataApiDetails,
  getApiSpecDetails,
  NoditOpenApiSpecType,
  ApiSpecDetails,
  isEthereumNodeApi,
  log
} from "./nodit-apidoc-helper.js";

/**
 * Validates an API request
 * @returns Error message if validation fails, null if successful
 */
export function validateApiRequest(
  protocol: string,
  operationId: string,
  noditNodeApiSpecMap: Map<string, NoditOpenApiSpecType>,
  noditDataApiSpec: NoditOpenApiSpecType,
): { content: { type: "text"; text: string }[] } | null {
  try {
    validateNotWebhookApi(operationId);
    validateNotBlockedApi(operationId);
    validateOperationIdExists(operationId, noditNodeApiSpecMap, noditDataApiSpec);
    validateProtocolPrefix(protocol, operationId);
    return null;
  } catch (error: any) {
    return { content: [{ type: "text" as const, text: `Tool Error: ${error.message}` }] };
  }
}

function validateNotWebhookApi(operationId: string): void {
  if (isWebhookApi(operationId)) {
    throw new Error(`The Nodit Webhook APIs cannot be invoked via "call_nodit_api".`);
  }
}

function validateNotBlockedApi(operationId: string): void {
  if (isBlockedOperationId(operationId)) {
    throw new Error(`The operationId(${operationId}) cannot be invoked via "call_nodit_api".`);
  }
}

function validateOperationIdExists(
  operationId: string,
  noditNodeApiSpecMap: Map<string, NoditOpenApiSpecType>,
  noditDataApiSpec: NoditOpenApiSpecType
): void {
  const exists = isNodeApi(operationId)
    ? isValidNodeApi(operationId, noditNodeApiSpecMap)
    : findNoditDataApiDetails(operationId, noditDataApiSpec) !== null;

  if (!exists) {
    throw new Error(`Invalid operationId '${operationId}'. Use 'list_nodit_data_apis' or 'list_nodit_node_apis' first.`);
  }
}

function validateProtocolPrefix(protocol: string, operationId: string): void {
  const requiresPrefix = isNodeApi(operationId) &&
    !['ethereum', 'aptos'].includes(protocol) &&
    !operationId.includes('-');

  if (requiresPrefix) {
    throw new Error(`Invalid operationId '${operationId}'. For non-ethereum protocols, operationId must include the protocol prefix.`);
  }
}

/**
 * Gets API specification details for a given operation ID
 * @throws {Error} if spec is not found
 */
export function getApiSpec(
  operationId: string,
  noditNodeApiSpecMap: Map<string, NoditOpenApiSpecType>,
  noditDataApiSpec: NoditOpenApiSpecType
): ApiSpecDetails {
  const isNodeApiCall = isNodeApi(operationId);

  const spec = isNodeApiCall
    ? (isEthereumNodeApi(operationId)
      ? noditNodeApiSpecMap.get(`ethereum-${operationId}`)
      : noditNodeApiSpecMap.get(operationId))
    : noditDataApiSpec;

  if (!spec) {
    throw new Error(`No API spec found for operationId: ${operationId}`);
  }

  const apiSpecDetails = getApiSpecDetails(spec, operationId);
  if (!apiSpecDetails) {
    throw new Error(`No API spec details found for operationId: ${operationId}`);
  }

  return apiSpecDetails;
}

/**
 * Constructs the API URI with parameters
 */
export function getApiUri(
  apiSpecDetails: ApiSpecDetails,
  protocol: string,
  network: string,
  pathParams?: Record<string, any>,
  queryParams?: Record<string, any>
): string {
  log(`Base URL template: ${apiSpecDetails.baseUrl}, Path template: ${apiSpecDetails.pathMapper}`);

  let url = apiSpecDetails.baseUrl + apiSpecDetails.pathMapper;

  const templateVars = url.match(/{([^}]+)}/g) || [];
  const uniqueVars = new Set(templateVars.map(v => v.slice(1, -1)));

  const uriVariables: Record<string, any> = {};

  for (const varName of uniqueVars) {
    if (varName === 'protocol-network') {
      uriVariables[varName] = `${protocol}-${network}`;
    } else if (varName.endsWith('-network')) {
      const prefix = varName.replace('-network', '');
      uriVariables[varName] = `${prefix}-${network}`;
    } else if (varName === 'protocol') {
      uriVariables[varName] = protocol;
    } else if (varName === 'network') {
      uriVariables[varName] = network;
    }
  }

  if (pathParams) {
    Object.assign(uriVariables, pathParams);
  }

  for (const [key, value] of Object.entries(uriVariables)) {
    url = url.replaceAll(`{${key}}`, String(value));
  }
  if (queryParams && Object.keys(queryParams).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      params.append(key, String(value));
    }
    url = `${url}?${params.toString()}`;
  }

  return url;
}