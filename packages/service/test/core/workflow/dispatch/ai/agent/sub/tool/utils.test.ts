import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getAgentRuntimeTools } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils';
import type { NodeToolConfigType } from '@fastgpt/global/core/workflow/type/node';

const { authAppByTmbIdMock, getAppVersionByIdMock } = vi.hoisted(() => ({
  authAppByTmbIdMock: vi.fn(),
  getAppVersionByIdMock: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: authAppByTmbIdMock
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppVersionById: getAppVersionByIdMock
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: vi.fn(() => ({
      getSystemToolDetail: vi.fn()
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
      description: 'Search query'
    }
  },
  required: ['query']
};

const httpInputSchema = {
  type: 'object',
  properties: {
    keyword: {
      type: 'string',
      description: 'Keyword',
      'x-tool-description': 'Keyword'
    }
  },
  required: ['keyword']
};

const httpRequestSchema = {
  type: 'object',
  properties: {
    body: {
      type: 'object',
      description: 'Raw request body'
    }
  },
  required: ['body']
};

const mcpTool = {
  name: 'search',
  description: 'Search docs',
  inputSchema: mcpInputSchema
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

const createToolsetApp = ({
  id,
  type,
  toolConfig
}: {
  id: string;
  type: AppTypeEnum.mcpToolSet | AppTypeEnum.httpToolSet;
  toolConfig: NodeToolConfigType;
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
      toolConfig
    }
  ],
  edges: [],
  chatConfig: {}
});

describe('getAgentRuntimeTools schema loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
    })
  };

  it('loads MCP toolset children with their input schema', async () => {
    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'mcp_app', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].requestSchema.function.name).toBe('mcp_app0');
    expect(tools[0].requestSchema.function.parameters).toEqual(mcpInputSchema);
    expect(tools[0].toolConfig?.mcpTool?.toolId).toBe('mcp-mcp_app/search');
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
    expect(tools[0].requestSchema.function.parameters).toEqual(mcpInputSchema);
    expect(tools[0].toolConfig?.mcpTool?.toolId).toBe('mcp-mcp_app/search');
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

  it('loads HTTP toolset children with their request schema', async () => {
    const tools = await getAgentRuntimeTools({
      tmbId: 'tmb_1',
      tools: [{ id: 'http_app', config: {} }]
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].requestSchema.function.name).toBe('http_app0');
    expect(tools[0].requestSchema.function.parameters).toEqual(httpRequestSchema);
    expect(tools[0].requestSchema.function.parameters).not.toEqual(httpInputSchema);
    expect(tools[0].toolConfig?.httpTool?.toolId).toBe('http-http_app/create');
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
    expect(tools[0].requestSchema.function.parameters).toEqual(httpRequestSchema);
    expect(tools[0].requestSchema.function.parameters).not.toEqual(httpInputSchema);
    expect(tools[0].toolConfig?.httpTool?.toolId).toBe('http-http_app/create');
  });
});
