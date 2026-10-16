import { createTimeoutSignal } from './call-api-helper.js';
import { log } from './nodit-apidoc-helper.js';
import { errorMessage, maskInternalError } from './tool-error.js';

const TIMEOUT_MS = 60_000;

export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export const TIMEOUT_MESSAGE =
  'The request took longer than expected and has been terminated. ' +
  'This may be due to high server load or because the requested data is taking longer to process. ' +
  'Please try again later.';

export type NoditHttpResult = { ok: true; text: string } | { ok: false; message: string };

export interface NoditHttpRequest {
  apiUrl: string;
  httpMethod: string;
  apiKey: string;
  toolName: string;
  requestBody?: Record<string, any>;
  outboundLog: string;
  successContext?: string;
}

export function oversizedResponseMessage(toolName: string): string {
  const megabytes = MAX_RESPONSE_BYTES / (1024 * 1024);
  return (
    `The Nodit API response for '${toolName}' was larger than the ${megabytes} MB this server can return ` +
    `in one result. Narrow the request — a smaller block range, fewer items per page, or a more specific ` +
    `filter — and call again.`
  );
}

export function statusGuidanceMessage(status: number, responseBodyText: string): string | null {
  const statusMessages: Record<number, string> = {
    400: `${responseBodyText}. Help the user identify what went wrong in their request. Explain the likely issue based on the error message, and provide a corrected example if possible.`,
    403: `${responseBodyText}. Let the user know that this API is only available to paid plan users. Explain that their current plan does not include access, and suggest upgrading to a paid tier via https://nodit.io/pricing .`,
    404: `${responseBodyText}. Let the user know that no data was found for the provided ID or address. This usually means the resource doesn't exist or hasn't been indexed yet. Suggest double-checking the input or trying again later.`,
    429: `${responseBodyText}. Inform the user that they've reached their current plan's usage limit. Recommend reviewing their usage or upgrading via https://nodit.io/pricing. Optionally mention the Referral Program: https://developer.nodit.io/docs/referral-program.`,
    500: `${responseBodyText}. This is not the user's fault. Let them know it's likely a temporary issue. Suggest retrying soon or contacting support at https://developer.nodit.io/discuss if the problem continues.`,
    503: `${responseBodyText}. Inform the user that the service may be under maintenance or experiencing high load. Suggest retrying shortly, and checking the Notice section in the Nodit Developer Portal (https://developer.nodit.io).`,
  };
  return statusMessages[status] ?? null;
}

const STATUS_REASONS: Record<number, string> = {
  400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 402: 'PAYMENT_REQUIRED', 403: 'FORBIDDEN',
  404: 'NOT_FOUND', 405: 'METHOD_NOT_ALLOWED', 406: 'NOT_ACCEPTABLE',
  407: 'PROXY_AUTHENTICATION_REQUIRED', 408: 'REQUEST_TIMEOUT', 409: 'CONFLICT', 410: 'GONE',
  411: 'LENGTH_REQUIRED', 412: 'PRECONDITION_FAILED', 413: 'CONTENT_TOO_LARGE', 414: 'URI_TOO_LONG',
  415: 'UNSUPPORTED_MEDIA_TYPE', 416: 'REQUESTED_RANGE_NOT_SATISFIABLE', 417: 'EXPECTATION_FAILED',
  418: 'I_AM_A_TEAPOT', 421: 'MISDIRECTED_REQUEST', 422: 'UNPROCESSABLE_CONTENT', 423: 'LOCKED',
  424: 'FAILED_DEPENDENCY', 425: 'TOO_EARLY', 426: 'UPGRADE_REQUIRED', 428: 'PRECONDITION_REQUIRED',
  429: 'TOO_MANY_REQUESTS', 431: 'REQUEST_HEADER_FIELDS_TOO_LARGE',
  451: 'UNAVAILABLE_FOR_LEGAL_REASONS', 500: 'INTERNAL_SERVER_ERROR', 501: 'NOT_IMPLEMENTED',
  502: 'BAD_GATEWAY', 503: 'SERVICE_UNAVAILABLE', 504: 'GATEWAY_TIMEOUT',
  505: 'HTTP_VERSION_NOT_SUPPORTED', 506: 'VARIANT_ALSO_NEGOTIATES', 507: 'INSUFFICIENT_STORAGE',
  508: 'LOOP_DETECTED', 509: 'BANDWIDTH_LIMIT_EXCEEDED', 510: 'NOT_EXTENDED',
  511: 'NETWORK_AUTHENTICATION_REQUIRED',
};

export function statusLabel(status: number): string {
  const reason = STATUS_REASONS[status];
  return reason ? `${status} ${reason}` : String(status);
}

export function jacksonPretty(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[ ]';
    return `[ ${value.map((item) => jacksonPretty(item, indent)).join(', ')} ]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{ }';
    const inner = indent + '  ';
    const body = entries
      .map(([key, item]) => `${inner}${JSON.stringify(key)} : ${jacksonPretty(item, inner)}`)
      .join(',\n');
    return `{\n${body}\n${indent}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function errorDetailsFor(responseBodyText: string): string {
  try {
    const errorJson = JSON.parse(responseBodyText);
    return `Error Details (JSON):\n${jacksonPretty(errorJson)}`;
  } catch (e) { /* ignore parsing error, use raw text */
    return `Raw error response: ${responseBodyText}`;
  }
}

export function failedResponseMessage(status: number, responseBodyText: string): string {
  const guidance = statusGuidanceMessage(status, responseBodyText);
  if (guidance) return guidance;
  return `API call failed with status ${statusLabel(status)}\n\n${errorDetailsFor(responseBodyText)}`;
}

export function connectionErrorMessage(toolName: string): string {
  return (
    `Could not reach the Nodit API (${toolName}). ` +
    `This is likely a temporary network issue; suggest retrying shortly.`
  );
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function isConnectionError(error: unknown): boolean {
  return error instanceof TypeError && error.message === 'fetch failed';
}

export function exceedsResponseCap(declaredLength: string | null, readSoFar: number): boolean {
  const declared = declaredLength === null ? NaN : Number(declaredLength);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) return true;
  return readSoFar > MAX_RESPONSE_BYTES;
}

async function readBodyWithinCap(response: Response): Promise<string | null> {
  if (exceedsResponseCap(response.headers.get('content-length'), 0)) {
    return null;
  }
  const body = response.body;
  if (!body) {
    return await response.text();
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (exceedsResponseCap(null, total)) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function buildRequestInit(request: NoditHttpRequest, signal: AbortSignal): RequestInit {
  const method = request.httpMethod.toUpperCase();
  const headers: Record<string, string> = {
    'X-API-KEY': request.apiKey,
    'Accept': 'application/json',
    'User-Agent': 'nodit-mcp-server',
  };
  const options: RequestInit = { method, headers, signal, redirect: 'manual' };
  if (request.httpMethod.toLowerCase() !== 'get') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(request.requestBody ?? {});
  }
  return options;
}

export async function callNoditHttp(request: NoditHttpRequest): Promise<NoditHttpResult> {
  const { signal, cleanup } = createTimeoutSignal(TIMEOUT_MS);
  try {
    log(request.outboundLog);

    const response = await fetch(request.apiUrl, buildRequestInit(request, signal));
    const responseBodyText = await readBodyWithinCap(response);
    if (responseBodyText === null) {
      return { ok: false, message: oversizedResponseMessage(request.toolName) };
    }

    if (response.status >= 400) {
      return { ok: false, message: failedResponseMessage(response.status, responseBodyText) };
    }

    try {
      JSON.parse(responseBodyText);
    } catch {
      return {
        ok: false,
        message: `API returned OK status but body was not valid JSON. Raw response: ${responseBodyText}`,
      };
    }

    const suffix = request.successContext ? ` for ${request.successContext}` : '';
    log(`Tool (${request.toolName}): API Success (${response.status})${suffix}`);
    return { ok: true, text: responseBodyText };
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, message: `Network/fetch error calling API: ${TIMEOUT_MESSAGE}` };
    }
    if (isConnectionError(error)) {
      log(`Connection error (${request.toolName}): ${errorMessage(error)}`);
      return { ok: false, message: connectionErrorMessage(request.toolName) };
    }
    return { ok: false, message: maskInternalError(error, request.toolName) };
  } finally {
    cleanup();
  }
}
