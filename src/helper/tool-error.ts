import { randomUUID } from 'node:crypto';

export class ToolException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolException';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function newErrorId(): string {
  return randomUUID().substring(0, 8);
}

export function internalErrorMessage(toolName: string, errorId: string): string {
  return (
    `INTERNAL_SERVER_ERROR: the Nodit MCP server could not complete '${toolName}' (reference: ${errorId}). ` +
    `This is not the user's fault. Suggest retrying shortly, and contacting support at ` +
    `https://developer.nodit.io/discuss with the reference id if the problem continues.`
  );
}

export function maskInternalError(error: unknown, toolName: string): string {
  if (error instanceof ToolException) {
    return error.message;
  }
  const errorId = newErrorId();
  console.error(`Internal error in tool '${toolName}' [errorId=${errorId}]`, error);
  return internalErrorMessage(toolName, errorId);
}
