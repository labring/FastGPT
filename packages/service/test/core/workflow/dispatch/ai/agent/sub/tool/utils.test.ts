import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { getAgentRuntimeTools } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils';
import type { NodeToolConfigType } from '@fastgpt/global/core/workflow/type/node';

const { authAppByTmbIdMock, getAppVersionByIdMock, getMCPChildrenMock, getSystemToolDetailMock } =
  vi.hoisted(() => ({
    authAppByTmbIdMock: vi.fn(),
    getAppVersionByIdMock: vi.fn(),
    getMCPChildrenMock: vi.fn(),
    getSystemToolDetailMock: vi.fn()
  }));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: authAppByTmbIdMock
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppVersionById: getAppVersionByIdMock
}));

vi.mock('@fastgpt/service/core/app/mcp', () => ({
  getMCPChildren: getMCPChildrenMock
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: vi.fn(() => ({
      getSystemToolDetail: getSystemToolDetailMock
    }))
  }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  LogCategories: {
    MODULE: {
      AI: {
        AGENT: 'agent'
      }
    }
  },
  getLogger: vi.fn(() => ({
    warn: vi.fn()
  }))
}));

const mcpInputSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Search query',
      isToolParam: true
    }
  },
  required: ['query']
};

const strippedMcpInputSchema = {
  type: 'object'
};

const httpInputSchema = {
  type: 'object',
  properties: {
    keyword: {
      type: 'string',
      description: 'Keyword',
      'x-tool-description': 'Keyword',
      isToolParam: true
    }
  },
  required: ['keyword']
};

const httpRequestSchema = {
  type: 'object',
  properties: {
    body: {
      type: 'object',
      description: 'Raw request body',
      isToolParam: true
    }
  },
  required: ['body']
};

const systemToolInputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    payload: {
      type: 'object',
      description: 'Structured payload',
      isToolParam: true,
      properties: {
        keyword: {
          type: 'string',
          pattern: '^[a-z]+$'
        },
        count: {
          type: 'integer',
          minimum: 1
        }
      },
      required: ['keyword']
    }
  },
  required: ['payload']
};

const mcpTool = {
  name: 'search',
  description: 'Search docs',
  inputSchema: mcpInputSchema
};

const mcpToolWithLeadingSlash = {
  ...mcpTool,
  name: '/test'
};

const httpTool = {
  name: 'create',
  description: 'Create record',
  path: '/records',
  method: 'post',
  inputSchema: httpInputSchema,
  requestSchema: httpRequestSchema,
  outputSchema: {
    type: 'object',
    properties: {}
  }
};

const httpToolWithLeadingSlash = {
  ...httpTool,
  name: '/test'
};

const createToolsetApp = ({
  id,
  type,
  toolConfig
}: {
  id: string;
  type: AppTypeEnum.mcpToolSet | AppTypeEnum.httpToolSet;
  toolConfig?: NodeToolConfigType;
}) => ({
  _id: id,
  teamId: 'team_1',
  tmbId: 'tmb_1',
  type,
  name: `${id} name`,
  avatar: `${id}.png`,
  intro: `${id} intro`,
  updateTime: new Date(),
  modules: [
    {
      nodeId: 'toolset_node',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: `${id} node`,
      avatar: `${id}.png`,
      intro: `${id} intro`,
      inputs: [],
      outputs: [],
      ...(toolConfig ? { toolConfig } : {})
    }
  ],
  edges: [],
  chatConfig: {}
});

describe('getAgentRuntimeTools schema loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMCPChildrenMock.mockResolvedValue([]);
    getSystemToolDetailMock.mockReset();

    authAppByTmbIdMock.mockImplementation(async ({ appId }: { appId: string }) => {
      const app = appMap[appId];
      if (!app) throw new Error(`missing app ${appId}`);
      return { app };
    });

    getAppVersionByIdMock.mockImplementation(async ({ app }: { app: any }) => ({
      versionId: '',
      versionName: app.name,
      nodes: app.modules,
      edges: app.edges,
      chatConfig: app.chatConfig
    }));
  });

  const appMap: Record<string, any> = {
    mcp_app: createToolsetApp({
      id: 'mcp_app',
      type: AppTypeEnum.mcpToolSet,
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example.com',
          headerSecret: {},
          toolList: [mcpTool]
        }
      }
    }),
    mcp_slash_app: createToolsetApp({
      id: 'mcp_slash_app',
      type: AppTypeEnum.mcpToolSet,
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example.com',
          headerSecret: {},
          toolList: [mcpToolWithLeadingSlash]
        }
      }
    }),
    '123_app': createToolsetApp({
      id: '123_app',
      type: AppTypeEnum.mcpToolSet,
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example.com',
          headerSecret: {},
          toolList: [mcpTool]
        }
      }
    }),
    legacy_mcp_app: createToolsetApp({
      id: 'legacy_mcp_app',
      type: AppTypeEnum.mcpToolSet
    }),
    stripped_mcp_app: createToolsetApp({
      id: 'stripped_mcp_app',
      type: AppTypeEnum.mcpToolSet,
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example.com',
          headerSecret: {},
          toolList: [
            {
              ...mcpTool,
              inputSchema: strippedMcpInputSchema
            }
          ]
        }
      }
    }),
    http_app: createToolsetApp({
      id: 'http_app',
      type: AppTypeEnum.httpToolSet,
      toolConfig: {
        httpToolSet: {
          baseUrl: 'https://api.example.com',
          headerSecret: {},
          toolList: [httpTool]
        }
      }
    }),
    http_slash_app: createToolsetApp({
      id: 'http_slash_app',
      type: AppTypeEnum.httpToolSet,
      toolConfig: {
        httpToolSet: {
          baseUrl: 'https://api.example.com',
          headerSecret: {},
          toolList: [httpToolWithLeadingSlash]
        }
      }
    })
  };

  it('loads MCP toolset children with their input schema', async () => {
    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'mcp_app', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].requestSchema.function.name).toBe('mcp_app0');
    expect(tools[0].requestSchema.function.description).toBe('mcp_app name/search: Search docs');
    expect(tools[0].requestSchema.function.parameters).toEqual(mcpInputSchema);
    expect(tools[0].toolConfig?.mcpTool?.toolId).toBe('mcp-mcp_app/search');
    expect(tools[0].promptReference).toEqual({
      id: 'mcp_app',
      name: 'mcp_app name'
    });
  });

  it('loads a selected MCP tool with its input schema', async () => {
    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'mcp-mcp_app/search', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe('mcp_appsearch');
    expect(tools[0].name).toBe('search');
    expect(tools[0].requestSchema.function.name).toBe('mcp_appsearch');
    expect(tools[0].requestSchema.function.description).toBe('search: Search docs');
    expect(tools[0].requestSchema.function.parameters).toEqual(mcpInputSchema);
    expect(tools[0].toolConfig?.mcpTool?.toolId).toBe('mcp-mcp_app/search');
  });

  it('preserves legacy selectedTypeIndex 0 tool inputs at runtime', async () => {
    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [
        {
          id: 'mcp-mcp_app/search',
          config: {
            query: 'manual value'
          },
          inputs: [
            {
              key: 'query',
              renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
              selectedTypeIndex: 0
            }
          ]
        }
      ]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].inputs[0]).toMatchObject({
      key: 'query',
      selectedType: FlowNodeInputTypeEnum.input,
      selectedTypeIndex: 0,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    });
    expect(tools[0].requestSchema.function.parameters).toEqual({
      type: 'object',
      properties: {},
      required: []
    });
  });

  it('loads a selected MCP tool whose name starts with slash', async () => {
    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'mcp-mcp_slash_app//test', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe('mcp_slash_apptest');
    expect(tools[0].name).toBe('/test');
    expect(tools[0].toolConfig?.mcpTool?.toolId).toBe('mcp-mcp_slash_app//test');
  });

  it('prefixes tool function name only when the runtime tool id starts with a number', async () => {
    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'mcp-123_app/search', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe('123_appsearch');
    expect(tools[0].requestSchema.function.name).toBe('t123_appsearch');
    expect(tools[0].requestSchema.function.parameters).toEqual(mcpInputSchema);
  });

  it('fills stripped MCP toolset child schema from runtime children', async () => {
    getMCPChildrenMock.mockResolvedValue([
      {
        avatar: 'mcp_app.png',
        id: 'mcp-mcp_app/search',
        ...mcpTool
      }
    ]);

    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [
        {
          id: 'mcp_app',
          config: {},
          toolConfig: {
            mcpToolSet: {
              url: '',
              toolList: [
                {
                  ...mcpTool,
                  inputSchema: strippedMcpInputSchema
                }
              ]
            }
          }
        }
      ]
    });

    expect(getMCPChildrenMock).toHaveBeenCalledWith(appMap.mcp_app);
    expect(tools).toHaveLength(1);
    expect(tools[0].requestSchema.function.parameters).toEqual(mcpInputSchema);
  });

  it('fills stripped selected MCP tool schema from runtime children', async () => {
    getMCPChildrenMock.mockResolvedValue([
      {
        avatar: 'stripped_mcp_app.png',
        id: 'mcp-stripped_mcp_app/search',
        ...mcpTool
      }
    ]);

    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'mcp-stripped_mcp_app/search', config: {} }]
    });

    expect(getMCPChildrenMock).toHaveBeenCalledWith(appMap.stripped_mcp_app);
    expect(tools).toHaveLength(1);
    expect(tools[0].requestSchema.function.parameters).toEqual(mcpInputSchema);
  });

  it('loads legacy MCP toolset children from stored child tool data', async () => {
    getMCPChildrenMock.mockResolvedValue([
      {
        avatar: 'legacy_mcp_app.png',
        id: 'mcp-legacy_mcp_app/search',
        ...mcpTool
      }
    ]);

    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'legacy_mcp_app', config: {} }]
    });

    expect(getMCPChildrenMock).toHaveBeenCalledWith(appMap.legacy_mcp_app);
    expect(tools).toHaveLength(1);
    expect(tools[0].requestSchema.function.name).toBe('legacy_mcp_app0');
    expect(tools[0].requestSchema.function.parameters).toEqual(mcpInputSchema);
    expect(tools[0].toolConfig?.mcpTool?.toolId).toBe('mcp-legacy_mcp_app/search');
  });

  it('loads a selected legacy MCP tool with its input schema', async () => {
    getMCPChildrenMock.mockResolvedValue([
      {
        avatar: 'legacy_mcp_app.png',
        id: 'mcp-legacy_mcp_app/search',
        ...mcpTool
      }
    ]);

    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'mcp-legacy_mcp_app/search', config: {} }]
    });

    expect(getMCPChildrenMock).toHaveBeenCalledWith(appMap.legacy_mcp_app);
    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe('legacy_mcp_appsearch');
    expect(tools[0].name).toBe('search');
    expect(tools[0].requestSchema.function.parameters).toEqual(mcpInputSchema);
    expect(tools[0].toolConfig?.mcpTool?.toolId).toBe('mcp-legacy_mcp_app/search');
  });

  it('loads HTTP toolset children with their request schema', async () => {
    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'http_app', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].requestSchema.function.name).toBe('http_app0');
    expect(tools[0].requestSchema.function.description).toBe('http_app name/create: Create record');
    expect(tools[0].requestSchema.function.parameters).toEqual(httpRequestSchema);
    expect(tools[0].requestSchema.function.parameters).not.toEqual(httpInputSchema);
    expect(tools[0].toolConfig?.httpTool?.toolId).toBe('http-http_app/create');
    expect(tools[0].promptReference).toEqual({
      id: 'http_app',
      name: 'http_app name'
    });
  });

  it('loads a selected HTTP tool with its request schema', async () => {
    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'http-http_app/create', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe('http_appcreate');
    expect(tools[0].name).toBe('create');
    expect(tools[0].requestSchema.function.name).toBe('http_appcreate');
    expect(tools[0].requestSchema.function.description).toBe('create: Create record');
    expect(tools[0].requestSchema.function.parameters).toEqual(httpRequestSchema);
    expect(tools[0].requestSchema.function.parameters).not.toEqual(httpInputSchema);
    expect(tools[0].toolConfig?.httpTool?.toolId).toBe('http-http_app/create');
  });

  it('loads a selected HTTP tool whose name starts with slash', async () => {
    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'http-http_slash_app//test', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe('http_slash_apptest');
    expect(tools[0].name).toBe('/test');
    expect(tools[0].toolConfig?.httpTool?.toolId).toBe('http-http_slash_app//test');
  });

  it('loads system toolset children with parent prompt reference name', async () => {
    getSystemToolDetailMock.mockResolvedValue({
      id: 'systemTool-metaso',
      name: '秘塔搜索',
      avatar: 'metaso.png',
      intro: '搜索工具集',
      toolDescription: '搜索工具集',
      status: 'active',
      source: 'system',
      isToolSet: true,
      hasSystemSecret: false,
      systemSecretStatus: 'none',
      currentCost: 0,
      systemKeyCost: 0,
      hasTokenFee: false,
      tags: [],
      author: '',
      version: '1.0.0',
      isLatestVersion: true,
      children: [
        {
          id: 'search',
          name: '搜索网页',
          description: '搜索网页内容',
          currentCost: 0,
          systemKeyCost: 0
        }
      ]
    });

    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'systemTool-metaso', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('搜索网页');
    expect(tools[0].promptReference).toEqual({
      id: 'systemTool-metaso',
      name: '秘塔搜索'
    });
  });

  it('loads system tool params from its original input schema', async () => {
    getSystemToolDetailMock.mockResolvedValue({
      id: 'systemTool-gpjj5s',
      name: '热榜工具',
      avatar: 'hot-list.png',
      intro: '获取热榜信息，支持36氪、知乎、微博、掘金、头条等多个平台',
      toolDescription: '获取热榜信息',
      status: 'active',
      source: 'system',
      isToolSet: false,
      hasSystemSecret: false,
      systemSecretStatus: 'none',
      currentCost: 0,
      systemKeyCost: 0,
      hasTokenFee: false,
      tags: [],
      author: '',
      version: '1.0.0',
      isLatestVersion: true,
      inputSchema: systemToolInputSchema
    });

    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'systemTool-gpjj5s', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].requestSchema.function.name).toBe('gpjj5s');
    expect(tools[0].requestSchema.function.parameters).toEqual(systemToolInputSchema);
  });

  it('keeps debug source in selected system tool config', async () => {
    getSystemToolDetailMock.mockResolvedValue({
      id: 'systemTool-gpjj5s',
      name: '热榜工具',
      avatar: 'hot-list.png',
      intro: '获取热榜信息',
      toolDescription: '获取热榜信息',
      status: 'active',
      source: 'debug:tmbId:tmb-1',
      isToolSet: false,
      hasSystemSecret: false,
      systemSecretStatus: 'none',
      currentCost: 0,
      systemKeyCost: 0,
      hasTokenFee: false,
      tags: [],
      author: '',
      version: '1.0.0',
      isLatestVersion: true,
      inputSchema: systemToolInputSchema
    });

    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [
        {
          id: 'systemTool-gpjj5s',
          source: 'debug:tmbId:tmb-1',
          toolConfig: {
            systemTool: {
              toolId: 'systemTool-gpjj5s',
              source: 'debug:tmbId:tmb-1'
            }
          },
          config: {}
        }
      ]
    });

    expect(getSystemToolDetailMock).toHaveBeenCalledWith({
      pluginId: 'systemTool-gpjj5s',
      lang: undefined,
      source: 'debug:tmbId:tmb-1'
    });
    expect(tools[0].toolConfig?.systemTool).toEqual({
      toolId: 'systemTool-gpjj5s',
      source: 'debug:tmbId:tmb-1'
    });
  });

  it('does not rebuild system tool params from node inputs when input schema is missing', async () => {
    getSystemToolDetailMock.mockResolvedValue({
      id: 'systemTool-gpjj5s',
      name: '热榜工具',
      avatar: 'hot-list.png',
      intro: '获取热榜信息，支持36氪、知乎、微博、掘金、头条等多个平台',
      toolDescription: '获取热榜信息',
      status: 'active',
      source: 'system',
      isToolSet: false,
      hasSystemSecret: false,
      systemSecretStatus: 'none',
      currentCost: 0,
      systemKeyCost: 0,
      hasTokenFee: false,
      tags: [],
      author: '',
      version: '1.0.0',
      isLatestVersion: true
    });

    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'systemTool-gpjj5s', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].requestSchema.function.name).toBe('gpjj5s');
    expect(tools[0].requestSchema.function.parameters).toEqual({
      type: 'object',
      properties: {}
    });
  });
});
