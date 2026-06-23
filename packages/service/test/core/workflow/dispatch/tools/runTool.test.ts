import { beforeEach, describe, it, expect, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  dispatchRunTool,
  parseToolId
} from '@fastgpt/service/core/workflow/dispatch/child/runTool';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

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

vi.mock('@fastgpt/service/core/workflow/utils/context', () => ({
  getWorkflowContext: vi.fn(() => ({}))
}));

const createRunToolProps = (toolConfig: Record<string, any>) =>
  ({
    params: {
      keyword: 'fastgpt'
    },
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
    variableState: {
      get: vi.fn()
    },
    node: {
      nodeId: 'tool-node',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'Tool node',
      avatar: '',
      toolConfig,
      inputs: [],
      outputs: []
    },
    uid: 'uid',
    chatId: 'chat',
    responseChatItemId: 'response',
    usagePush: vi.fn()
  }) as any;

describe('dispatchRunTool runtime toolset auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authAppByTmbIdMock.mockResolvedValue({
      app: {
        _id: 'victim-toolset'
      }
    });
  });

  it('should reject HTTP tool execution when running app tmb has no parent toolset permission', async () => {
    authAppByTmbIdMock.mockRejectedValueOnce(new Error('unAuthApp'));

    const result = await dispatchRunTool(
      createRunToolProps({
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
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toBeTruthy();
  });

  it('should authorize HTTP parent toolset before loading version and running tool', async () => {
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

    const result = await dispatchRunTool(
      createRunToolProps({
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
    expect(result.data).toEqual({
      [NodeOutputKeyEnum.rawResponse]: {
        ok: true
      },
      ok: true
    });
  });

  it('should reject MCP tool execution when running app tmb has no parent toolset permission', async () => {
    authAppByTmbIdMock.mockRejectedValueOnce(new Error('unAuthApp'));

    const result = await dispatchRunTool(
      createRunToolProps({
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
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toBeTruthy();
  });
});

describe('parseToolId', () => {
  describe('新版格式: source-appId/toolName', () => {
    it('should parse mcp tool format correctly', () => {
      const result = parseToolId('mcp-507f1f77bcf86cd799439011/apiTool');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('apiTool');
    });

    it('should parse http tool format correctly', () => {
      const result = parseToolId('http-507f1f77bcf86cd799439011/weatherAPI');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('weatherAPI');
    });

    it('should handle tool names with special characters', () => {
      const result = parseToolId('mcp-507f1f77bcf86cd799439011/api-tool_v2');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('api-tool_v2');
    });

    it('should handle tool names with numbers', () => {
      const result = parseToolId('http-507f1f77bcf86cd799439011/tool123');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('tool123');
    });
  });

  describe('旧版格式: source-appId/toolsetName/toolName', () => {
    it('should parse old mcp format correctly', () => {
      const result = parseToolId('mcp-507f1f77bcf86cd799439011/toolset/apiTool');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('apiTool');
    });

    it('should parse old http format correctly', () => {
      const result = parseToolId('http-507f1f77bcf86cd799439011/MyToolset/weatherAPI');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('weatherAPI');
    });

    it('should ignore toolset name in old format', () => {
      const result = parseToolId('mcp-507f1f77bcf86cd799439011/ignoredToolset/actualTool');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('actualTool');
    });

    it('should handle toolset names with special characters', () => {
      const result = parseToolId('http-507f1f77bcf86cd799439011/tool-set_v1/myTool');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('myTool');
    });
  });

  describe('边界情况', () => {
    it('should handle appId with hyphens', () => {
      const result = parseToolId('mcp-507f-1f77-bcf8-6cd7-99439011/tool');
      expect(result.parentId).toBe('507f-1f77-bcf8-6cd7-99439011');
      expect(result.toolName).toBe('tool');
    });

    it('should handle multiple hyphens in source prefix', () => {
      const result = parseToolId('custom-source-507f1f77bcf86cd799439011/tool');
      expect(result.parentId).toBe('source-507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('tool');
    });

    it('should handle tool names with slashes in old format', () => {
      const result = parseToolId('mcp-507f1f77bcf86cd799439011/toolset/tool/extra');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('tool/extra');
    });

    it('should preserve leading slash in tool name', () => {
      const result = parseToolId('http-69e20f48dbec7c6ece77556b//test');
      expect(result.parentId).toBe('69e20f48dbec7c6ece77556b');
      expect(result.toolName).toBe('/test');
    });

    it('should handle empty tool name', () => {
      const result = parseToolId('mcp-507f1f77bcf86cd799439011/');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('');
    });

    it('should handle empty toolset and tool name in old format', () => {
      const result = parseToolId('mcp-507f1f77bcf86cd799439011//');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('/');
    });
  });

  describe('向后兼容性', () => {
    it('should correctly identify new format vs old format', () => {
      // 新版格式: 只有两个部分(appId 和 toolName)
      const newFormat = parseToolId('mcp-507f1f77bcf86cd799439011/tool');
      expect(newFormat.toolName).toBe('tool');

      // 旧版格式: 有三个部分(appId, toolsetName, toolName)
      const oldFormat = parseToolId('mcp-507f1f77bcf86cd799439011/toolset/tool');
      expect(oldFormat.toolName).toBe('tool');

      // 两者的 toolName 应该相同
      expect(newFormat.toolName).toBe(oldFormat.toolName);
    });

    it('should handle migration from old to new format', () => {
      const oldId = 'mcp-507f1f77bcf86cd799439011/MyToolset/weatherAPI';
      const newId = 'mcp-507f1f77bcf86cd799439011/weatherAPI';

      const oldResult = parseToolId(oldId);
      const newResult = parseToolId(newId);

      expect(oldResult.parentId).toBe(newResult.parentId);
      expect(oldResult.toolName).toBe(newResult.toolName);
    });
  });

  describe('真实场景测试', () => {
    it('should parse real MCP tool ID', () => {
      const result = parseToolId('mcp-65f8a9b2c3d4e5f6a7b8c9d0/filesystem/readFile');
      expect(result.parentId).toBe('65f8a9b2c3d4e5f6a7b8c9d0');
      expect(result.toolName).toBe('readFile');
    });

    it('should parse real HTTP tool ID', () => {
      const result = parseToolId('http-65f8a9b2c3d4e5f6a7b8c9d0/WeatherAPI');
      expect(result.parentId).toBe('65f8a9b2c3d4e5f6a7b8c9d0');
      expect(result.toolName).toBe('WeatherAPI');
    });

    it('should handle Chinese tool names', () => {
      const result = parseToolId('mcp-507f1f77bcf86cd799439011/天气查询');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('天气查询');
    });

    it('should handle tool names with spaces', () => {
      const result = parseToolId('http-507f1f77bcf86cd799439011/Weather API');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBe('Weather API');
    });
  });

  describe('性能测试', () => {
    it('should parse tool IDs efficiently', () => {
      const iterations = 10000;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        parseToolId('mcp-507f1f77bcf86cd799439011/toolset/tool');
      }

      const duration = Date.now() - start;
      console.log(`Parsed ${iterations} tool IDs in ${duration}ms`);

      // 性能检查: 10000 次解析应该在 100ms 内完成
      expect(duration).toBeLessThan(100);
    });

    it('should handle batch parsing', () => {
      const toolIds = [
        'mcp-507f1f77bcf86cd799439011/tool1',
        'http-507f1f77bcf86cd799439011/tool2',
        'mcp-507f1f77bcf86cd799439011/toolset/tool3',
        'http-507f1f77bcf86cd799439011/toolset/tool4'
      ];

      const results = toolIds.map((id) => parseToolId(id));

      expect(results).toHaveLength(4);
      expect(results[0].toolName).toBe('tool1');
      expect(results[1].toolName).toBe('tool2');
      expect(results[2].toolName).toBe('tool3');
      expect(results[3].toolName).toBe('tool4');
    });
  });

  describe('错误处理', () => {
    it('should handle missing slash', () => {
      const result = parseToolId('mcp-507f1f77bcf86cd799439011');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
      expect(result.toolName).toBeUndefined();
    });

    it('should handle only source prefix', () => {
      const result = parseToolId('mcp-');
      expect(result.parentId).toBe('');
      expect(result.toolName).toBeUndefined();
    });

    it('should handle malformed ID gracefully', () => {
      // 虽然这些是无效的 ID,但函数应该不会崩溃
      expect(() => parseToolId('invalid')).not.toThrow();
      expect(() => parseToolId('')).not.toThrow();
      expect(() => parseToolId('/')).not.toThrow();
    });
  });
});
