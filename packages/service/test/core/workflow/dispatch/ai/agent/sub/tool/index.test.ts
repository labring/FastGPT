import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';

const {
  authAppByTmbIdMock,
  mongoAppFindByIdMock,
  runHTTPToolMock,
  mcpToolCallMock,
  runToolStreamMock,
  getSystemToolRuntimeMock
} = vi.hoisted(() => ({
  authAppByTmbIdMock: vi.fn(),
  mongoAppFindByIdMock: vi.fn(),
  runHTTPToolMock: vi.fn(),
  mcpToolCallMock: vi.fn(),
  runToolStreamMock: vi.fn(),
  getSystemToolRuntimeMock: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: authAppByTmbIdMock
}));

vi.mock('@fastgpt/service/core/app/schema', async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/core/app/schema')>(
    '@fastgpt/service/core/app/schema'
  );

  return {
    ...actual,
    MongoApp: {
      ...actual.MongoApp,
      findById: mongoAppFindByIdMock
    }
  };
});

vi.mock('@fastgpt/service/core/app/http', async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/core/app/http')>(
    '@fastgpt/service/core/app/http'
  );

  return {
    ...actual,
    runHTTPTool: runHTTPToolMock
  };
});

vi.mock('@fastgpt/service/core/app/mcp', () => ({
  assertMCPUrlNotInternal: vi.fn(),
  MCPClient: vi.fn().mockImplementation(() => ({
    toolCall: mcpToolCallMock
  }))
}));

vi.mock('@fastgpt/service/common/logger', async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/common/logger')>(
    '@fastgpt/service/common/logger'
  );

  return {
    ...actual,
    getLogger: vi.fn(() => ({
      log: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  };
});

vi.mock('@fastgpt/service/common/middle/tracks/utils', () => ({
  pushTrack: {
    runSystemTool: vi.fn()
  }
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    runToolStream: runToolStreamMock
  }
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: vi.fn(() => ({
      getSystemToolRuntime: getSystemToolRuntimeMock
    }))
  }
}));

const createDispatchToolProps = (
  toolConfig: Record<string, any>,
  params: Record<string, any> = { keyword: 'fastgpt' }
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
    getSystemToolRuntimeMock.mockResolvedValue({
      id: 'search',
      version: '1.0.0',
      currentCost: 0,
      systemKeyCost: 0,
      secretsVal: {}
    });
    runToolStreamMock.mockResolvedValue({ output: { ok: true } });
  });

  it.each([
    {
      keyType: SystemToolSecretInputTypeEnum.system,
      expectedPoints: 5,
      title: 'system key'
    },
    {
      keyType: SystemToolSecretInputTypeEnum.manual,
      expectedPoints: 2,
      title: 'manual key'
    }
  ])(
    'charges call cost and key-dependent cost for $title in Agent execution',
    async ({ keyType, expectedPoints }) => {
      getSystemToolRuntimeMock.mockResolvedValueOnce({
        id: 'search',
        version: '1.0.0',
        currentCost: 2,
        systemKeyCost: 3,
        secretsVal: {}
      });

      const result = await dispatchTool(
        createDispatchToolProps(
          {
            systemTool: {
              toolId: 'systemTool-search'
            }
          },
          {
            keyword: 'fastgpt',
            system_input_config: {
              type: keyType,
              value: {}
            }
          }
        )
      );

      expect(result.usages).toEqual([
        {
          moduleName: 'Agent tool',
          totalPoints: expectedPoints
        }
      ]);
    }
  );

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
    expect(runHTTPToolMock).not.toHaveBeenCalled();
    expect(result.response).toBeTruthy();
  });

  it('should authorize HTTP parent toolset before agent tool execution', async () => {
    mongoAppFindByIdMock.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: 'victim-toolset',
        modules: [
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
      })
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
    expect(mongoAppFindByIdMock).toHaveBeenCalledWith('victim-toolset');
    expect(runHTTPToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://example.com',
        toolPath: '/echo',
        method: 'post'
      })
    );
    expect(result.response).toBe(JSON.stringify({ ok: true }));
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
    expect(mcpToolCallMock).not.toHaveBeenCalled();
    expect(result.response).toBeTruthy();
  });
});
