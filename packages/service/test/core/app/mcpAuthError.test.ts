import { describe, expect, it } from 'vitest';
import { SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  McpAuthRequiredError,
  McpHttpStatusError,
  getMcpTransportHttpStatus,
  isMcpAuthRequiredError
} from '@fastgpt/service/core/app/mcpAuthError';

/** SDK 的 `SseError` 构造函数要求 EventEvent；单测只关心 code/cause，事件对象可留空。 */
const createSseError = (code: number | undefined, cause?: unknown) => {
  const error = new SseError(code, 'SSE stream failed', {} as ErrorEvent);
  if (cause !== undefined) {
    (error as { cause?: unknown }).cause = cause;
  }
  return error;
};

describe('getMcpTransportHttpStatus', () => {
  it('returns 403 directly for StreamableHTTPError', () => {
    expect(getMcpTransportHttpStatus(new StreamableHTTPError(403, 'Forbidden'))).toBe(403);
  });

  it('returns the numeric code for SseError', () => {
    expect(getMcpTransportHttpStatus(createSseError(401))).toBe(401);
  });

  it('continues along the cause chain when SseError has no code', () => {
    // SDK 的 SseError.code 类型为 number | undefined；无 code 时不能丢掉 cause 上的状态。
    const error = createSseError(undefined, { status: 401 });
    expect(getMcpTransportHttpStatus(error)).toBe(401);
  });

  it('reads nested transport status through wrapped Error instances', () => {
    const error = createSseError(undefined, new StreamableHTTPError(401, 'Invalid credentials'));
    expect(getMcpTransportHttpStatus(error)).toBe(401);

    const wrapped = new Error('wrapped', { cause: new McpHttpStatusError(403, 'Forbidden') });
    expect(getMcpTransportHttpStatus(wrapped)).toBe(403);
  });

  it('recognizes McpAuthRequiredError through the cause chain', () => {
    const error = createSseError(undefined, new McpAuthRequiredError(401));
    expect(getMcpTransportHttpStatus(error)).toBe(401);
  });

  it('does not treat a tool-level plain {status:401} as transport', () => {
    // 工具级业务错误：顶层普通对象上的 status 不参与 transport 判定。
    const toolError = Object.assign(new Error('tool returned 401 payload'), { status: 401 });
    expect(getMcpTransportHttpStatus(toolError)).toBeUndefined();
    expect(getMcpTransportHttpStatus({ status: 401 })).toBeUndefined();
    expect(isMcpAuthRequiredError(toolError)).toBe(true);
  });

  it('returns undefined for SseError without code and without a status-bearing cause', () => {
    expect(getMcpTransportHttpStatus(createSseError(undefined))).toBeUndefined();
    expect(getMcpTransportHttpStatus(createSseError(undefined, new Error('network down')))).toBe(
      undefined
    );
  });

  it('does not loop on circular cause chains', () => {
    const error = createSseError(undefined);
    (error as { cause?: unknown }).cause = error;
    expect(getMcpTransportHttpStatus(error)).toBeUndefined();
  });
});
