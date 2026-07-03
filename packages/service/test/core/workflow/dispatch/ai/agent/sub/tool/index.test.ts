import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const { authAppByTmbIdMock, getAppVersionByIdMock, runHTTPToolMock, mcpToolCallMock } = vi.hoisted(
  () => ({
    authAppByTmbIdMock: vi.fn(),
    getAppVersionByIdMock: vi.fn(),
    runHTTPToolMock: vi.fn(),
    mcpToolCallMock: vi.fn()
  })
);

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: authAppByTmbIdMock
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppVersionById: getAppVersionByIdMock
}));

vi.mock('@fastgpt/service/core/app/http', () => ({
  runHTTPTool: runHTTPToolMock
}));

vi.mock('@fastgpt/service/core/app/mcp', () => ({
  assertMCPUrlNotInternal: vi.fn(),
  MCPClient: vi.fn().mockImplementation(() => ({
    toolCall: mcpToolCallMock
  }))
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  LogCategories: {
    MODULE: {
      APP: {
        TOOL: 'tool'
      },
      AI: {
        LLM: 'llm'
      }
    }
  },
  getLogger: vi.fn(() => ({
    error: vi.fn()
  }))
}));

vi.mock('@fastgpt/service/common/middle/tracks/utils', () => ({
  pushTrack: {
    runSystemTool: vi.fn()
  }
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    runToolStream: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: vi.fn(() => ({
      getSystemToolRuntime: vi.fn()
    }))
  }
}));

const createDispatchToolProps = (
  toolConfig: Record<string, any>,
  params: Record<string, any> = {
    keyword: 'fastgpt'
  }
) =>
  ({
    tool: {
      name: 'Agent tool',
      avatar: '',
      toolConfig
    },
    params,
    runningAppInfo: {
      id: 'attacker-app',
      teamId: 'attacker-team',
      tmbId: 'attacker-tmb',
      name: 'Attacker workflow'
    },
    runningUserInfo: {
      username: 'attacker',
      teamName: 'Attacker team',
      memberName: 'Attacker member',
      contact: '',
      teamId: 'attacker-team',
      tmbId: 'attacker-tmb'
    },
    chatId: 'chat',
    uid: 'uid',
    variableState: {
      get: vi.fn()
    }
  }) as any;

describe('dispatchTool runtime toolset auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authAppByTmbIdMock.mockResolvedValue({
      app: {
        _id: 'victim-toolset'
      }
    });
  });

  it('should reject HTTP agent tool execution when running app tmb has no parent toolset permission', async () => {
    authAppByTmbIdMock.mockRejectedValueOnce(new Error('unAuthApp'));

    const result = await dispatchTool(
      createDispatchToolProps({
        httpTool: {
          toolId: 'http-victim-toolset/sandbox_echo'
        }
      })
    );

    expect(authAppByTmbIdMock).toHaveBeenCalledWith({
      tmbId: 'attacker-tmb',
      appId: 'victim-toolset',
      per: ReadPermissionVal
    });
    expect(getAppVersionByIdMock).not.toHaveBeenCalled();
    expect(runHTTPToolMock).not.toHaveBeenCalled();
    expect(result.response).toBeTruthy();
  });

  it('should authorize HTTP parent toolset before agent tool execution', async () => {
    getAppVersionByIdMock.mockResolvedValueOnce({
      nodes: [
        {
          toolConfig: {
            httpToolSet: {
              baseUrl: 'https://example.com',
              toolList: [
                {
                  name: 'sandbox_echo',
                  path: '/echo',
                  method: 'post'
                }
              ]
            }
          }
        }
      ]
    });
    runHTTPToolMock.mockResolvedValueOnce({
      data: {
        ok: true
      }
    });

    const result = await dispatchTool(
      createDispatchToolProps({
        httpTool: {
          toolId: 'http-victim-toolset/sandbox_echo'
        }
      })
    );

    expect(authAppByTmbIdMock).toHaveBeenCalledWith({
      tmbId: 'attacker-tmb',
      appId: 'victim-toolset',
      per: ReadPermissionVal
    });
    expect(getAppVersionByIdMock).toHaveBeenCalledWith({
      appId: 'victim-toolset',
      versionId: undefined
    });
    expect(runHTTPToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://example.com',
        toolPath: '/echo',
        method: 'post'
      })
    );
    expect(result.response).toBe(JSON.stringify({ ok: true }));
  });

  it('should not pass FastGPT runtime system params to HTTP agent tool', async () => {
    getAppVersionByIdMock.mockResolvedValueOnce({
      nodes: [
        {
          toolConfig: {
            httpToolSet: {
              baseUrl: 'https://example.com',
              toolList: [
                {
                  name: 'sandbox_echo',
                  path: '/echo',
                  method: 'post'
                }
              ]
            }
          }
        }
      ]
    });
    runHTTPToolMock.mockResolvedValueOnce({
      data: {
        ok: true
      }
    });

    const result = await dispatchTool(
      createDispatchToolProps(
        {
          httpTool: {
            toolId: 'http-victim-toolset/sandbox_echo'
          }
        },
        {
          keyword: 'fastgpt',
          [NodeInputKeyEnum.forbidStream]: false,
          [NodeInputKeyEnum.systemInputConfig]: {
            type: 'system',
            value: {}
          }
        }
      )
    );

    expect(runHTTPToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          keyword: 'fastgpt'
        }
      })
    );
    expect(result.nodeResponse?.toolInput).toEqual({
      keyword: 'fastgpt'
    });
  });

  it('should reject MCP agent tool execution when running app tmb has no parent toolset permission', async () => {
    authAppByTmbIdMock.mockRejectedValueOnce(new Error('unAuthApp'));

    const result = await dispatchTool(
      createDispatchToolProps({
        mcpTool: {
          toolId: 'mcp-victim-toolset/search'
        }
      })
    );

    expect(authAppByTmbIdMock).toHaveBeenCalledWith({
      tmbId: 'attacker-tmb',
      appId: 'victim-toolset',
      per: ReadPermissionVal
    });
    expect(getAppVersionByIdMock).not.toHaveBeenCalled();
    expect(mcpToolCallMock).not.toHaveBeenCalled();
    expect(result.response).toBeTruthy();
  });
});
