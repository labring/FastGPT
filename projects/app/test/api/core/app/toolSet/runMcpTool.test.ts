import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { RunMcpToolBodyType } from '@fastgpt/global/openapi/core/app/mcpTools/api';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  toolCall: vi.fn(),
  assertMCPUrlNotInternal: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({ authCert: mocks.authCert }));
vi.mock('@fastgpt/service/common/secret/utils', () => ({ getSecretValue: () => ({}) }));
vi.mock('@fastgpt/service/core/app/mcp', () => ({
  assertMCPUrlNotInternal: mocks.assertMCPUrlNotInternal,
  MCPClient: vi.fn(function () {
    return { toolCall: mocks.toolCall };
  })
}));

import runMcpTool from '@/pages/api/core/app/mcpTools/runTool';

describe('MCP tool debug handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.toolCall.mockResolvedValue({ content: [] });
  });

  it('forwards request metadata separately from business params', async () => {
    const requestMeta = { 'example/context': { locale: 'zh-CN' } };
    const params = { _meta: 'business parameter', query: 'hello' };
    await runMcpTool({
      body: { url: 'https://example.com/mcp', toolName: 'search', params, requestMeta }
    } as ApiRequestProps<RunMcpToolBodyType>);
    expect(mocks.toolCall).toHaveBeenCalledWith({ toolName: 'search', params, requestMeta });
  });

  it('rejects metadata that is not a JSON object before calling the server', async () => {
    await expect(
      runMcpTool({
        body: { url: 'https://example.com/mcp', toolName: 'search', params: {}, requestMeta: [] }
      } as unknown as ApiRequestProps<RunMcpToolBodyType>)
    ).rejects.toThrow();
    expect(mocks.toolCall).not.toHaveBeenCalled();
  });
});
