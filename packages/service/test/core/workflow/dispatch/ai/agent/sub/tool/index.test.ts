import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';

const {
  authAppByTmbIdMock,
  getAppVersionByIdMock,
  getHTTPToolListMock,
  getMCPChildrenMock,
  runHTTPToolMock,
  mcpToolCallMock,
  runToolStreamMock,
  getSystemToolRuntimeMock
} = vi.hoisted(() => ({
  authAppByTmbIdMock: vi.fn(),
  getAppVersionByIdMock: vi.fn(),
  getHTTPToolListMock: vi.fn(),
  getMCPChildrenMock: vi.fn(),
  runHTTPToolMock: vi.fn(),
  mcpToolCallMock: vi.fn(),
  runToolStreamMock: vi.fn(),
  getSystemToolRuntimeMock: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: authAppByTmbIdMock
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppVersionById: getAppVersionByIdMock
}));

vi.mock('@fastgpt/service/core/app/http', () => ({
  getHTTPToolList: getHTTPToolListMock,
  runHTTPTool: runHTTPToolMock
}));

vi.mock('@fastgpt/service/core/app/mcp', () => ({
  assertMCPUrlNotInternal: vi.fn(),
  getMCPChildren: getMCPChildrenMock,
  MCPClient: vi.fn(function () {
    return { toolCall: mcpToolCallMock };
  })
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
      // 工具加载和执行都必须使用应用创建者，而不是当前调用者。
      tmbId: 'caller-without-toolset-permission'
    },
    chatId: 'chat',
    uid: 'uid',
    variableState: {
      get: vi.fn()
    }
  }) as any;

describe('dispatchTool runtime toolset auth', () => {
  it.each([
    { name: 'scalar string', requestSchema: { type: 'string' } },
    { name: 'scalar number', requestSchema: { type: 'number' } },
    { name: 'missing', requestSchema: undefined },
    { name: 'empty object', requestSchema: { type: 'object', properties: {} } }
  ])('normalizes a $name HTTP requestSchema before final execution', async ({ requestSchema }) => {
    const tool = {
      name: 'legacy_search',
      description: 'Legacy search',
      path: '/search',
      method: 'GET',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', pattern: '^allowed$' } },
        required: ['query']
      },
      requestSchema
    };
    const original = structuredClone(tool);
    authAppByTmbIdMock.mockResolvedValue({
      app: {
        _id: 'victim-toolset',
        modules: [
          {
            toolConfig: {
              httpToolSet: {
                baseUrl: 'https://example.com',
                toolList: [tool],
                apiSchemaStr: '{"openapi":"3.0.0","paths":{}}'
              }
            }
          }
        ]
      }
    });
    getHTTPToolListMock.mockResolvedValue([tool]);
    runHTTPToolMock.mockResolvedValue({ data: { ok: true } });
    const toolConfig = { httpTool: { toolId: 'http-victim-toolset/legacy_search' } };

    const accepted = await dispatchTool(createDispatchToolProps(toolConfig, { query: 'allowed' }));
    expect(accepted.errorMessage).toBeUndefined();
    expect(runHTTPToolMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        toolPath: '/search',
        method: 'GET',
        apiSchemaStr: '{"openapi":"3.0.0","paths":{}}',
        params: { query: 'allowed' }
      })
    );

    runHTTPToolMock.mockClear();
    for (const params of [{}, { query: 123 }, { query: 'blocked' }]) {
      const rejected = await dispatchTool(createDispatchToolProps(toolConfig, params));
      expect(rejected.errorMessage).toContain('validation failed');
    }
    expect(runHTTPToolMock).not.toHaveBeenCalled();
    expect(getAppVersionByIdMock).not.toHaveBeenCalled();
    expect(tool).toEqual(original);
  });

  it.each(['mcp', 'http'] as const)(
    'validates %s Agent params against freshly loaded definitions instead of stale snapshots',
    async (source) => {
      const latestSchema = {
        type: 'object',
        properties: { query: { type: 'string', pattern: '^latest$' } },
        required: ['query']
      };
      const tool = {
        name: 'search',
        description: 'Search',
        path: '/latest',
        method: 'POST',
        inputSchema: latestSchema,
        requestSchema: latestSchema,
        staticHeaders: [{ key: 'X-Version', value: 'latest' }]
      };
      const key = source === 'mcp' ? 'mcpToolSet' : 'httpToolSet';
      authAppByTmbIdMock.mockResolvedValue({
        app: {
          _id: 'victim-toolset',
          modules: [
            {
              toolConfig: {
                [key]: {
                  url: 'https://latest.example.com/mcp',
                  baseUrl: 'https://latest.example.com',
                  toolList: [tool]
                }
              }
            }
          ]
        }
      });
      getMCPChildrenMock.mockResolvedValue([tool]);
      getHTTPToolListMock.mockResolvedValue([tool]);
      mcpToolCallMock.mockResolvedValue({ ok: true });
      runHTTPToolMock.mockResolvedValue({ data: { ok: true } });
      const config = {
        [source === 'mcp' ? 'mcpTool' : 'httpTool']: { toolId: `${source}-victim-toolset/search` },
        [key]: {
          url: 'https://stale.example.com',
          toolList: [
            { ...tool, inputSchema: { type: 'object' }, requestSchema: { type: 'object' } }
          ]
        }
      };
      const rejected = await dispatchTool(createDispatchToolProps(config, { query: 'stale' }));
      expect(rejected.errorMessage).toContain('validation failed');
      expect(mcpToolCallMock).not.toHaveBeenCalled();
      expect(runHTTPToolMock).not.toHaveBeenCalled();
      const accepted = await dispatchTool(createDispatchToolProps(config, { query: 'latest' }));
      expect(accepted.errorMessage).toBeUndefined();
      if (source === 'http') {
        expect(runHTTPToolMock).toHaveBeenCalledWith(
          expect.objectContaining({
            baseUrl: 'https://latest.example.com',
            toolPath: '/latest',
            staticHeaders: tool.staticHeaders,
            params: { query: 'latest' }
          })
        );
      } else {
        expect(mcpToolCallMock).toHaveBeenCalledWith({
          toolName: 'search',
          params: { query: 'latest' }
        });
      }
      expect(getAppVersionByIdMock).not.toHaveBeenCalled();
      expect(authAppByTmbIdMock).toHaveBeenCalledWith({
        tmbId: 'attacker-tmb',
        appId: 'victim-toolset',
        per: ReadPermissionVal
      });
    }
  );

  beforeEach(() => {
    vi.clearAllMocks();
    authAppByTmbIdMock.mockResolvedValue({
      app: {
        _id: 'victim-toolset',
        modules: []
      }
    });
    getHTTPToolListMock.mockResolvedValue([]);
    getMCPChildrenMock.mockResolvedValue([]);
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
    expect(getAppVersionByIdMock).not.toHaveBeenCalled();
    expect(runHTTPToolMock).not.toHaveBeenCalled();
    expect(result.response).toBeTruthy();
  });

  it('should authorize HTTP parent toolset before agent tool execution', async () => {
    authAppByTmbIdMock.mockResolvedValueOnce({
      app: {
        _id: 'victim-toolset',
        modules: [
          {
            toolConfig: {
              httpToolSet: {
                baseUrl: 'https://example.com',
                toolList: [
                  {
                    name: 'sandbox_echo',
                    description: 'Sandbox echo',
                    path: '/echo',
                    method: 'post'
                  }
                ]
              }
            }
          }
        ]
      }
    });
    getHTTPToolListMock.mockResolvedValueOnce([
      {
        name: 'sandbox_echo',
        path: '/echo',
        method: 'post'
      }
    ]);
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
    expect(getAppVersionByIdMock).not.toHaveBeenCalled();
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
    expect(getAppVersionByIdMock).not.toHaveBeenCalled();
    expect(mcpToolCallMock).not.toHaveBeenCalled();
    expect(result.response).toBeTruthy();
  });
});
