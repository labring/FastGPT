import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MCP_OAUTH_MAX_RESPONSE_BYTES,
  requestMcpOAuthHttp,
  resetMcpOAuthFetchImpl,
  setMcpOAuthFetchImpl
} from '@fastgpt/service/core/app/mcpOAuth/httpRuntime';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';

const asOAuthError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as McpOAuthApiError;
  }
  throw new Error('Expected promise to reject');
};

const encoder = new TextEncoder();

/** 未声明 content-length 的 chunked 响应，用于验证运行时读取上限。 */
const chunkedResponse = (chunks: Uint8Array[], onCancel?: () => void) => {
  let index = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[index++]);
      },
      cancel() {
        onCancel?.();
      }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};

describe('mcpOAuth httpRuntime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetMcpOAuthFetchImpl();
  });

  it('refuses to override fetch in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    // 生产进程替换 fetch 会绕过 DNS pin，必须 fail fast。
    expect(() => setMcpOAuthFetchImpl(async () => new Response('{}'))).toThrow(
      /only available in tests/
    );
  });

  it('streams chunked responses instead of buffering before measuring', async () => {
    const body = JSON.stringify({ ok: true });
    setMcpOAuthFetchImpl(async () => chunkedResponse([encoder.encode(body), encoder.encode('')]));

    const response = await requestMcpOAuthHttp({ url: 'https://example.org/token' });
    expect(response.body).toBe(body);
  });

  it('rejects and cancels a chunked response that exceeds the byte limit', async () => {
    // 底层源可能已被流实现提前关闭，此时源 cancel 不会触发；这里验证 reader 确实被取消。
    const cancelSpy = vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel');
    const chunk = encoder.encode('a'.repeat(Math.floor(MCP_OAUTH_MAX_RESPONSE_BYTES / 2) + 1));
    setMcpOAuthFetchImpl(async () => chunkedResponse([chunk, chunk]));

    const error = await asOAuthError(requestMcpOAuthHttp({ url: 'https://example.org/token' }));

    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.responseTooLarge);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    cancelSpy.mockRestore();
  });

  it('rejects early when content-length already exceeds the limit', async () => {
    const cancel = vi.fn();
    setMcpOAuthFetchImpl(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull() {
              // 不应被读取
            },
            cancel
          }),
          {
            status: 200,
            headers: { 'content-length': String(MCP_OAUTH_MAX_RESPONSE_BYTES + 1) }
          }
        )
    );

    const error = await asOAuthError(requestMcpOAuthHttp({ url: 'https://example.org/token' }));
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.responseTooLarge);
  });
});
