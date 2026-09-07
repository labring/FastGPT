import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { getUser } from '@test/datas/users';
import { ContentTypes } from '@fastgpt/global/core/workflow/constants';

const mocks = vi.hoisted(() => ({
  runHTTPTool: vi.fn(),
  toolCall: vi.fn(),
  getTools: vi.fn(),
  constructor: vi.fn()
}));
vi.mock('@fastgpt/service/core/app/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/app/http')>()),
  runHTTPTool: mocks.runHTTPTool
}));
vi.mock('@fastgpt/service/core/app/mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/app/mcp')>()),
  MCPClient: vi.fn(function (options) {
    mocks.constructor(options);
    return { toolCall: mocks.toolCall, getTools: mocks.getTools };
  })
}));
import runHTTP from '@/pages/api/core/app/httpTools/runTool';
import runMCP from '@/pages/api/core/app/mcpTools/runTool';
import getMCPTools from '@/pages/api/core/app/mcpTools/getTools';

describe('standalone toolset debug API compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps HTTP draft execution configuration and business values intact', async () => {
    const auth = await getUser('http-debug');
    const body = {
      baseUrl: 'https://203.0.113.10',
      toolPath: '/unsaved-draft',
      method: 'PUT',
      params: { query: 'debug', payload: { requestSchema: 'business-data' } },
      headerSecret: { Authorization: { value: 'fake-debug-token' } },
      customHeaders: { 'X-Number': 3 },
      staticParams: [{ key: 'fixed', value: 'value' }],
      staticHeaders: [{ key: 'X-Fixed', value: 'header' }],
      staticBody: { type: ContentTypes.json, content: '{"query":"{{query}}"}' }
    };
    mocks.runHTTPTool.mockResolvedValue({ data: { ok: true } });
    const result = await Call(runHTTP, { auth, body });
    expect(result.code).toBe(200);
    expect(result.data).toEqual({ data: { ok: true } });
    expect(mocks.runHTTPTool).toHaveBeenCalledWith({ ...body, customHeaders: { 'X-Number': '3' } });
  });

  it('retains complete MCP schemas when refreshing tools for the editor', async () => {
    const auth = await getUser('mcp-debug-refresh');
    const tool = {
      name: 'search',
      description: 'Search',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', enum: ['debug', 'production'] },
          count: { type: 'number', minimum: 1 }
        },
        required: ['query']
      }
    };
    mocks.getTools.mockResolvedValue([tool]);
    const result = await Call(getMCPTools, {
      auth,
      body: {
        url: 'https://203.0.113.10/mcp',
        headerSecret: { Authorization: { value: 'fake-debug-token' } }
      }
    });
    expect(result.code).toBe(200);
    expect(result.data).toEqual([tool]);
    expect(mocks.constructor).toHaveBeenCalledWith({
      url: 'https://203.0.113.10/mcp',
      headers: { Authorization: 'fake-debug-token' }
    });
  });

  it('runs unsaved MCP parameters using the editor URL and headers without requiring a toolId', async () => {
    const auth = await getUser('mcp-debug-run');
    const params = { query: 'debug', payload: { inputSchema: 'business-data' } };
    mocks.toolCall.mockResolvedValue({ content: [{ type: 'text', text: 'debug response' }] });
    const result = await Call(runMCP, {
      auth,
      body: {
        url: 'https://203.0.113.10/mcp',
        toolName: 'unsaved-tool',
        params,
        headerSecret: { Authorization: { value: 'fake-debug-token' } }
      }
    });
    expect(result.code).toBe(200);
    expect(mocks.toolCall).toHaveBeenCalledWith({ toolName: 'unsaved-tool', params });
    expect(mocks.constructor).toHaveBeenCalledWith({
      url: 'https://203.0.113.10/mcp',
      headers: { Authorization: 'fake-debug-token' }
    });
    expect(result.data).toEqual({ content: [{ type: 'text', text: 'debug response' }] });
  });
});
