import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getToolConfigStatus } from '@fastgpt/global/core/app/formEdit/utils';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  find: vi.fn(),
  getAppVersionById: vi.fn(),
  getSystemToolDetail: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: mocks.findById,
    find: mocks.find
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppVersionById: mocks.getAppVersionById,
  checkIsLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: vi.fn(() => ({
      getSystemToolDetail: mocks.getSystemToolDetail
    }))
  }
}));

import { getClientToolPreviewNode } from '@fastgpt/service/core/app/tool/utils/client';

const runtimeSchemaFieldNames = new Set([
  'inputSchema',
  'outputSchema',
  'requestSchema',
  'responseSchema',
  'secretSchema',
  'jsonSchema',
  'customJsonSchema',
  'apiSchemaStr'
]);

const getRuntimeSchemaFieldPaths = (value: unknown, path = '$'): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => getRuntimeSchemaFieldPaths(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, item]) => [
    ...(runtimeSchemaFieldNames.has(key) ? [`${path}.${key}`] : []),
    ...getRuntimeSchemaFieldPaths(item, `${path}.${key}`)
  ]);
};

describe('getClientToolPreviewNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['mcp', 'http'] as const)(
    'preserves schema-named business defaults in a %s child preview',
    async (source) => {
      const appId = '507f1f77bcf86cd799439011';
      const businessValue = {
        inputSchema: { title: 'business value' },
        nested: [{ requestSchema: 'payload', customJsonSchema: false, jsonSchema: null }],
        outputSchema: 0,
        responseSchema: '',
        secretSchema: [],
        apiSchemaStr: 'data'
      };
      const tool = {
        name: 'search',
        description: 'Search',
        path: '/search',
        method: 'POST',
        inputSchema: {
          type: 'object',
          properties: {
            payload: { type: 'object', default: businessValue }
          }
        }
      };
      const app = {
        _id: appId,
        teamId: '507f1f77bcf86cd799439012',
        type: source === 'mcp' ? AppTypeEnum.mcpToolSet : AppTypeEnum.httpToolSet,
        name: 'Tools',
        avatar: 'tools.svg',
        intro: '',
        modules: [
          {
            toolConfig: {
              [source === 'mcp' ? 'mcpToolSet' : 'httpToolSet']: {
                url: 'https://mcp.example.com',
                toolList: [tool]
              }
            }
          }
        ]
      };
      const original = structuredClone(app);
      mocks.findById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(app) });

      const preview = await getClientToolPreviewNode({ appId: `${source}-${appId}/search` });
      expect(preview.inputs[0].defaultValue).toEqual(businessValue);
      expect(preview.inputs[0]).not.toHaveProperty('customJsonSchema');
      expect(preview).not.toHaveProperty('jsonSchema');
      expect(preview.toolConfig).toEqual({
        [source === 'mcp' ? 'mcpTool' : 'httpTool']: { toolId: `${source}-${appId}/search` }
      });
      expect(app).toEqual(original);
    }
  );

  it.each(['mcp', 'http'] as const)(
    'projects %s toolset definitions without traversing IO business values',
    async (source) => {
      const appId = '507f1f77bcf86cd799439011';
      const businessValue = { requestSchema: { nested: [{ customJsonSchema: 'data' }] } };
      const toolSetKey = source === 'mcp' ? 'mcpToolSet' : 'httpToolSet';
      mocks.findById.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          teamId: '507f1f77bcf86cd799439012',
          type: source === 'mcp' ? AppTypeEnum.mcpToolSet : AppTypeEnum.httpToolSet,
          name: 'Tools',
          avatar: 'tools.svg',
          intro: '',
          modules: [
            {
              flowNodeType: 'toolSet',
              inputs: [
                {
                  key: 'payload',
                  label: 'Payload',
                  renderTypeList: ['input'],
                  value: businessValue,
                  defaultValue: businessValue,
                  customJsonSchema: { type: 'object' }
                }
              ],
              outputs: [
                {
                  id: 'result',
                  key: 'result',
                  label: 'Result',
                  type: 'static',
                  value: businessValue,
                  defaultValue: businessValue
                }
              ],
              toolConfig: {
                [toolSetKey]: {
                  url: 'https://mcp.example.com',
                  apiSchemaStr: 'raw-schema',
                  toolList: [
                    {
                      name: 'search',
                      description: 'Search',
                      path: '/search',
                      method: 'POST',
                      inputSchema: { type: 'object' },
                      outputSchema: { type: 'object' },
                      requestSchema: { type: 'object' },
                      responseSchema: { type: 'object' },
                      customJsonSchema: { type: 'object' }
                    }
                  ]
                }
              }
            }
          ]
        })
      });

      const preview = await getClientToolPreviewNode({ appId });
      expect(preview.inputs[0]).not.toHaveProperty('customJsonSchema');
      expect(preview.inputs[0].value).toEqual(businessValue);
      expect(preview.inputs[0].defaultValue).toEqual(businessValue);
      expect(preview.outputs[0].value).toEqual(businessValue);
      expect(preview.outputs[0].defaultValue).toEqual(businessValue);
      expect(getRuntimeSchemaFieldPaths(preview.toolConfig)).toEqual([]);
      expect(preview.toolConfig).toEqual({
        [toolSetKey]: { toolId: appId, toolList: [{ name: 'search', description: 'Search' }] }
      });
    }
  );

  it('uses explicit debug source for system tool preview without encoding appId', async () => {
    const businessValue = { requestSchema: 'payload', jsonSchema: { customJsonSchema: false } };
    mocks.getSystemToolDetail.mockResolvedValueOnce({
      id: 'systemTool-weather',
      version: '1.0.0',
      status: 1,
      source: 'debug:tmbId:tmb-1',
      isToolSet: false,
      avatar: 'weather.svg',
      name: 'Weather',
      intro: 'Weather query',
      author: 'FastGPT',
      tags: [],
      toolDescription: 'Weather query',
      currentCost: 0,
      systemKeyCost: 0,
      hasTokenFee: false,
      hasSystemSecret: false,
      inputSchema: {
        type: 'object',
        properties: { payload: { type: 'object', default: businessValue } }
      }
    });

    const result = await getClientToolPreviewNode({
      appId: 'systemTool-weather',
      versionId: '',
      lang: 'en',
      source: 'debug:tmbId:tmb-1'
    });

    expect(mocks.getSystemToolDetail).toHaveBeenCalledWith({
      pluginId: 'systemTool-weather',
      version: undefined,
      lang: 'en',
      source: 'debug:tmbId:tmb-1'
    });
    expect(result.pluginId).toBe('systemTool-weather');
    expect(result.source).toBe('debug:tmbId:tmb-1');
    expect(result.inputs[0].defaultValue).toEqual(businessValue);
    expect(result.inputs[0].customJsonSchema).toMatchObject({
      type: 'object',
      default: businessValue
    });
  });

  it('omits runtime schema fields from client preview response', async () => {
    mocks.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        teamId: '507f1f77bcf86cd799439012',
        type: AppTypeEnum.httpToolSet,
        name: 'HTTP Tools',
        avatar: 'http.svg',
        intro: 'HTTP toolset',
        modules: [
          {
            toolConfig: {
              httpToolSet: {
                apiSchemaStr: '{"openapi":"3.1.0"}',
                toolList: [
                  {
                    name: 'search',
                    description: 'Search tool',
                    requestSchema: { type: 'object', properties: { q: { type: 'string' } } },
                    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
                    outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
                    path: '/search',
                    method: 'GET'
                  }
                ]
              }
            }
          }
        ]
      })
    });

    const result = await getClientToolPreviewNode({
      appId: 'http-507f1f77bcf86cd799439011/search',
      lang: 'en'
    });

    expect(result).not.toHaveProperty('jsonSchema');
    expect(result).not.toHaveProperty('inputSchema');
    expect(result).not.toHaveProperty('outputSchema');
    expect(result).not.toHaveProperty('secretSchema');
    expect(result.inputs[0]).not.toHaveProperty('customJsonSchema');
    expect(result.toolConfig?.httpTool).toEqual({
      toolId: 'http-507f1f77bcf86cd799439011/search'
    });
    expect(result.inputs[0]?.key).toBe('q');
    expect((result as any).jsonSchema).toBeUndefined();
    expect(getRuntimeSchemaFieldPaths(result)).toEqual([]);
  });

  it.each([undefined, {}])(
    'removes only legacy MCP hidden configuration when adding a node (toolConfig: %j)',
    async (toolConfig) => {
      const appId = '507f1f77bcf86cd799439031';
      const tool = {
        name: 'search',
        description: 'Search',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
      };
      const headers = { Authorization: { value: 'legacy-token' } };
      const businessValue = { requestSchema: 'business-data' };
      const app = {
        _id: appId,
        teamId: '507f1f77bcf86cd799439032',
        type: AppTypeEnum.mcpToolSet,
        name: 'Legacy',
        avatar: 'mcp.svg',
        modules: [
          {
            flowNodeType: 'toolSet',
            toolConfig,
            inputs: [
              {
                key: NodeInputKeyEnum.toolSetData,
                label: 'Old config',
                renderTypeList: ['hidden'],
                value: { url: 'https://example.com/mcp', headerSecret: headers, toolList: [tool] }
              },
              { key: 'options', label: 'Options', renderTypeList: ['input'], value: businessValue },
              {
                key: NodeInputKeyEnum.toolSetData,
                label: 'User field',
                renderTypeList: ['input'],
                value: 'ordinary-value'
              }
            ],
            outputs: []
          }
        ]
      };
      const original = structuredClone(app);
      mocks.findById.mockReturnValueOnce({ lean: async () => app });
      mocks.find.mockReturnValueOnce({
        lean: async () => [
          {
            name: tool.name,
            modules: [
              {
                inputs: [
                  { value: { ...tool, url: 'https://example.com/mcp', headerSecret: headers } }
                ]
              }
            ]
          }
        ]
      });
      const preview = await getClientToolPreviewNode({ appId, versionId: '' });
      expect(preview.toolConfig).toEqual({
        mcpToolSet: { toolId: appId, toolList: [{ name: 'search', description: 'Search' }] }
      });
      expect(preview.inputs).toHaveLength(2);
      expect(preview.inputs[0]).toMatchObject({ key: 'options', value: businessValue });
      expect(preview.inputs[1]).toMatchObject({
        key: NodeInputKeyEnum.toolSetData,
        value: 'ordinary-value'
      });
      expect(JSON.stringify(preview)).not.toContain('inputSchema');
      expect(app).toEqual(original);
    }
  );

  it.each([
    { toolList: [] },
    { toolList: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }] }
  ])('adds an inline MCP toolset with an empty legacy id: %j', async ({ toolList }) => {
    const appId = '507f1f77bcf86cd799439031';
    const app = {
      _id: appId,
      teamId: '507f1f77bcf86cd799439032',
      type: AppTypeEnum.mcpToolSet,
      name: 'Legacy',
      avatar: 'mcp.svg',
      modules: [
        {
          flowNodeType: 'toolSet',
          toolConfig: { mcpToolSet: { toolId: '', url: 'https://example.com/mcp', toolList } },
          inputs: [],
          outputs: []
        }
      ]
    };
    const original = structuredClone(app);
    mocks.findById.mockReturnValueOnce({ lean: async () => app });
    const preview = await getClientToolPreviewNode({ appId, versionId: '' });
    expect(preview.toolConfig?.mcpToolSet).toMatchObject({ toolId: appId });
    expect(getRuntimeSchemaFieldPaths(preview)).toEqual([]);
    expect(app).toEqual(original);
  });

  it('hydrates legacy MCP toolset data under toolConfig', async () => {
    const appId = '507f1f77bcf86cd799439031';
    mocks.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: appId,
        teamId: '507f1f77bcf86cd799439032',
        type: AppTypeEnum.mcpToolSet,
        name: 'Legacy MCP Tools',
        avatar: 'mcp.svg',
        intro: 'Legacy MCP toolset',
        modules: [{ flowNodeType: 'toolSet', inputs: [] }]
      })
    });
    mocks.find.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue([
        {
          name: 'search',
          modules: [
            {
              inputs: [
                {
                  value: {
                    name: 'search',
                    description: 'Search tool',
                    inputSchema: { type: 'object' },
                    url: 'https://mcp.example.com'
                  }
                }
              ]
            }
          ]
        }
      ])
    });

    const result = await getClientToolPreviewNode({ appId, lang: 'en' });

    expect(result.toolConfig?.mcpToolSet).toMatchObject({
      toolId: appId,
      toolList: [{ name: 'search', description: 'Search tool' }]
    });
    expect(JSON.stringify(result.toolConfig)).not.toContain('inputSchema');
    expect(getRuntimeSchemaFieldPaths(result)).toEqual([]);
  });

  it('applies defaultToAgentGenerated over a workflow plugin input selection', async () => {
    const appId = '507f1f77bcf86cd799439011';
    mocks.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: appId,
        teamId: '507f1f77bcf86cd799439012',
        type: AppTypeEnum.workflowTool,
        name: 'Workflow plugin',
        avatar: 'plugin.svg',
        intro: 'Workflow plugin'
      })
    });
    mocks.getAppVersionById.mockResolvedValueOnce({
      nodes: [
        {
          flowNodeType: 'pluginInput',
          inputs: [
            {
              key: 'test',
              label: 'test',
              valueType: 'string',
              selectedType: 'input',
              renderTypeList: ['input', 'reference'],
              defaultToAgentGenerated: true
            },
            {
              key: 'referenceOnly',
              label: 'referenceOnly',
              valueType: 'string',
              selectedType: 'reference',
              renderTypeList: ['reference']
            },
            {
              key: 'legacyToolParam',
              label: 'legacyToolParam',
              valueType: 'string',
              renderTypeList: ['input', 'reference'],
              toolDescription: 'AI parameter',
              defaultToAgentGenerated: true
            },
            {
              key: 'explicitManual',
              label: 'explicitManual',
              valueType: 'string',
              renderTypeList: ['input', 'reference'],
              toolDescription: 'Parameter description',
              defaultToAgentGenerated: false
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {},
      versionId: 'version-id',
      versionName: 'Version 1'
    });

    const result = await getClientToolPreviewNode({
      appId,
      versionId: ''
    });
    const input = result.inputs.find((item) => item.key === 'test');

    expect(input).toMatchObject({
      selectedType: 'agentGenerated',
      renderTypeList: ['agentGenerated', 'input', 'reference'],
      defaultToAgentGenerated: true
    });

    expect(result.inputs.find((item) => item.key === 'referenceOnly')).toMatchObject({
      selectedType: 'agentGenerated',
      renderTypeList: ['agentGenerated', 'reference']
    });

    expect(result.inputs.find((item) => item.key === 'legacyToolParam')).toMatchObject({
      selectedType: 'agentGenerated',
      renderTypeList: ['agentGenerated', 'input', 'reference'],
      defaultToAgentGenerated: true
    });

    expect(result.inputs.find((item) => item.key === 'explicitManual')).toMatchObject({
      renderTypeList: ['agentGenerated', 'input', 'reference'],
      defaultToAgentGenerated: false,
      selectedType: 'input'
    });
  });

  it('defaults an ordinary workflow user question to Agent generation', async () => {
    const appId = '507f1f77bcf86cd799439021';
    mocks.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: appId,
        teamId: '507f1f77bcf86cd799439022',
        type: AppTypeEnum.workflow,
        name: 'Workflow',
        avatar: 'workflow.svg',
        intro: ''
      })
    });
    mocks.getAppVersionById.mockResolvedValueOnce({
      nodes: [],
      edges: [],
      chatConfig: {},
      versionId: 'version-id',
      versionName: 'Version 1'
    });

    const result = await getClientToolPreviewNode({ appId, versionId: '' });

    expect(result.flowNodeType).toBe('appModule');
    expect(result.inputs.find((item) => item.key === 'userChatInput')).toMatchObject({
      selectedType: 'agentGenerated',
      renderTypeList: ['agentGenerated', 'reference', 'textarea'],
      defaultToAgentGenerated: true
    });
    expect(getToolConfigStatus({ tool: result }).status).not.toBe('waitingForConfig');
  });

  it('defaults an ordinary workflow user question to Agent generation', async () => {
    const appId = '507f1f77bcf86cd799439021';
    mocks.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: appId,
        teamId: '507f1f77bcf86cd799439022',
        type: AppTypeEnum.workflow,
        name: 'Workflow',
        avatar: 'workflow.svg',
        intro: ''
      })
    });
    mocks.getAppVersionById.mockResolvedValueOnce({
      nodes: [],
      edges: [],
      chatConfig: {},
      versionId: 'version-id',
      versionName: 'Version 1'
    });

    const result = await getClientToolPreviewNode({ appId, versionId: '' });

    expect(result.flowNodeType).toBe('appModule');
    expect(result.inputs.find((item) => item.key === 'userChatInput')).toMatchObject({
      selectedType: 'agentGenerated',
      renderTypeList: ['agentGenerated', 'reference', 'textarea'],
      defaultToAgentGenerated: true
    });
    expect(getToolConfigStatus({ tool: result }).status).not.toBe('waitingForConfig');
  });
});
