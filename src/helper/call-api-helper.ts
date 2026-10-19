import { methodStem } from './nodit-apidoc-helper.js';

export function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return {
        signal: controller.signal,
        cleanup: () => clearTimeout(timeoutId)
    };
}

export const JSON_RPC_METHOD = 'method';

export function bodyMethodMismatch(
  operationId: string,
  requestBody: Record<string, any> | undefined,
): string | null {
  const bodyMethod = requestBody?.[JSON_RPC_METHOD];
  if (typeof bodyMethod !== 'string') return null;
  const expected = methodStem(operationId);
  if (bodyMethod.toLowerCase() === expected.toLowerCase()) return null;
  return (
    `requestBody.method '${bodyMethod}' does not match operationId '${operationId}', whose method is ` +
    `'${expected}'. The operationId decides what is called: set it to the operation for '${bodyMethod}' ` +
    `(see 'list_nodit_node_apis'), or fix the body.`
  );
}

const FORM_UNRESERVED = /^[A-Za-z0-9.\-*_]$/;
const UTF8_ENCODER = new TextEncoder();

function percentEncodeUtf8(character: string): string {
  let encoded = '';
  for (const byte of UTF8_ENCODER.encode(character)) {
    encoded += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return encoded;
}

export function formUrlEncode(value: string): string {
  let encoded = '';
  for (const character of value) {
    if (character === ' ') {
      encoded += '+';
    } else if (character.length === 1 && FORM_UNRESERVED.test(character)) {
      encoded += character;
    } else {
      encoded += percentEncodeUtf8(character);
    }
  }
  return encoded;
}

// Fills `{name}` path placeholders from pathParams and appends queryParams as the
// query string. Works for GET endpoints (cosmos-rest, aptos node) and POST endpoints
// that also take query parameters.
export function resolvePathAndQuery(
  url: string,
  pathParams: Record<string, any> | undefined,
  queryParams: Record<string, any> | undefined,
): { url: string } | { error: string } {
  const resolvedPath = url.replace(/\{([^}]+)}/g, (match, name: string) => {
    const value = pathParams?.[name];
    if (value === undefined || value === null) return match;
    return formUrlEncode(String(value));
  });

  if (resolvedPath.includes('{')) {
    return { error: `Missing required path parameter in '${url}'. Provide it in pathParams.` };
  }

  const entries = Object.entries(queryParams ?? {}).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  if (entries.length === 0) return { url: resolvedPath };

  const queryString = entries
    .map(([key, value]) => `${formUrlEncode(key)}=${formUrlEncode(String(value))}`)
    .join('&');
  return { url: `${resolvedPath}?${queryString}` };
}

export function joinBaseAndPath(baseUrl: string, pathKey: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const afterScheme = base.includes('://') ? base.slice(base.indexOf('://') + 3) : '';
  const basePath = afterScheme.includes('/') ? afterScheme.slice(afterScheme.indexOf('/') + 1) : '';
  const lastSegment = basePath.slice(basePath.lastIndexOf('/') + 1);
  const relative = pathKey.replace(/^\/+/, '');
  const firstSegment = relative.includes('/') ? relative.slice(0, relative.indexOf('/')) : relative;
  if (lastSegment.length > 0 && lastSegment === firstSegment) {
    return base + relative.slice(firstSegment.length);
  }
  return `${base}/${relative}`;
}
