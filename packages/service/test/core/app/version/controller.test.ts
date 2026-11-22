import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getHTTPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { getMCPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findOneMock,
  findMock,
  existsMock,
  aggregateMock,
  findAppByIdMock,
  updateVersionMock,
  updateAppMock
} = vi.hoisted(() => ({
  findOneMock: vi.fn(),
  findMock: vi.fn(),
  existsMock: vi.fn(),
  aggregateMock: vi.fn(),
  findAppByIdMock: vi.fn(),
  updateVersionMock: vi.fn(),
  updateAppMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    findOne: findOneMock,
    find: findMock,
    exists: existsMock,
    aggregate: aggregateMock,
    updateOne: updateVersionMock
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: findAppByIdMock,
    updateOne: updateAppMock
  }
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => {
  return importOriginal();
});

import type { ClientSession } from '@fastgpt/service/common/mongo';
import { MongoTransactionConflictError } from '@fastgpt/service/common/mongo/sessionRun';
import {
  getAppDraftVersion,
  getAppDraftWorkflow,
  getAppLatestVersion,
  getAppPublishedWorkflowMap,
  getAppVersionById,
  normalizeAppWorkflow,
  updateAppPublishedVersion
} from '@fastgpt/service/core/app/version/controller';

const createAgentVersion = (resources?: unknown) => ({
  _id: '507f1f77bcf86cd799439011',
  nodes: [
    {
      nodeId: 'agent-node',
      name: 'Agent',
      flowNodeType: FlowNodeTypeEnum.appModule,
      pluginId: 'legacy-agent-id',
      inputs: [],
      outputs: []
    }
  ],
  edges: [],
  chatConfig: undefined,
  ...(resources === undefined ? {} : { resources })
});

const createToolSetVersion = (toolConfig: Record<string, unknown>) => ({
  _id: '507f1f77bcf86cd799439011',
  versionName: 'Toolset version',
  nodes: [
    {
      nodeId: 'toolset-root',
      name: 'Toolset',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      inputs: [],
      outputs: [],
      toolConfig
    }
  ],
  edges: [],
  chatConfig: {},
  resources: []
});

const toolSetVersionCases = [
  {
    protocol: 'MCP',
    appType: AppTypeEnum.mcpToolSet,
    toolSetKey: 'mcpToolSet',
    createVersion: () => ({
      ...createToolSetVersion({}),
      nodes: [
        getMCPToolSetRuntimeNode({
          url: 'https://mcp.example.com/sse',
          toolList: [
            {
              name: 'search',
              description: 'Search tool',
              inputSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query']
              }
            }
          ]
        })
      ]
    })
  },
  {
    protocol: 'HTTP',
    appType: AppTypeEnum.httpToolSet,
    toolSetKey: 'httpToolSet',
    createVersion: () => ({
      ...createToolSetVersion({}),
      nodes: [
        getHTTPToolSetRuntimeNode({
          baseUrl: 'https://http.example.com',
          toolList: [
            {
              name: 'search',
              description: 'Search tool',
              path: '/search',
              method: 'POST',
              inputSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query']
              }
            }
          ]
        })
      ]
    })
  }
] as const;

describe('normalizeAppWorkflow', () => {
  it('preserves the full MCP source definition from the legacy hidden input', () => {
    const tool = {
      name: 'search',
      description: 'Search documents',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
    };
    const workflow = {
      nodes: [
        {
          nodeId: 'legacy-root',
          name: 'Legacy MCP',
          flowNodeType: FlowNodeTypeEnum.toolSet,
          inputs: [
            {
              key: NodeInputKeyEnum.toolSetData,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              value: {
                url: 'https://example.com/mcp',
                headerSecret: { Authorization: { secret: 'encrypted', value: '' } },
                toolList: [tool]
              }
            },
            { key: 'option', label: 'Option', renderTypeList: [FlowNodeInputTypeEnum.input] }
          ],
          outputs: []
        }
      ],
      edges: []
    };
    const original = structuredClone(workflow);

    const result = normalizeAppWorkflow(workflow, AppTypeEnum.mcpToolSet);

    expect(result.nodes[0].toolConfig?.mcpToolSet).toEqual({
      url: 'https://example.com/mcp',
      // v2.4 RuntimeConfig 默认补全 authMode；headers 行为不变。
      authMode: 'headers',
      headerSecret: { Authorization: { secret: 'encrypted' } },
      toolList: [tool]
    });
    expect(result.nodes[0].inputs.map(({ key }) => key)).toEqual(['option']);
    expect(workflow).toEqual(original);
  });

  it.each([
    { key: 'other', renderTypeList: [FlowNodeInputTypeEnum.hidden], toolList: [] },
    {
      key: NodeInputKeyEnum.toolSetData,
      renderTypeList: [FlowNodeInputTypeEnum.input],
      toolList: []
    },
    {
      key: NodeInputKeyEnum.toolSetData,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      toolList: 'invalid'
    }
  ])(
    'keeps non-legacy or invalid source inputs untouched: %j',
    ({ key, renderTypeList, toolList }) => {
      const result = normalizeAppWorkflow(
        {
          nodes: [
            {
              nodeId: 'root',
              name: 'Toolset',
              flowNodeType: FlowNodeTypeEnum.toolSet,
              inputs: [
                { key, label: '', renderTypeList, value: { url: 'https://example.com', toolList } }
              ],
              outputs: []
            }
          ]
        },
        AppTypeEnum.mcpToolSet
      );

      expect(result.nodes[0].toolConfig?.mcpToolSet).toBeUndefined();
      expect(result.nodes[0].inputs[0]).toMatchObject({ key, value: { toolList } });
    }
  );
});

describe('getAppLatestVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockResolvedValue(null);
    findAppByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) });
  });

  it('normalizes a legacy published version before returning it', async () => {
    const scheduledTriggerConfig = {
      cronString: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      defaultPrompt: 'Run scheduled workflow'
    };
    const version = {
      _id: '507f1f77bcf86cd799439011',
      versionName: 'Legacy version',
      nodes: [
        {
          nodeId: 'userGuide',
          name: 'System config',
          flowNodeType: 'userGuide',
          inputs: [
            {
              key: NodeInputKeyEnum.scheduleTrigger,
              label: 'Schedule trigger',
              value: scheduledTriggerConfig,
              renderTypeList: [FlowNodeInputTypeEnum.hidden]
            }
          ],
          outputs: []
        },
        {
          nodeId: 'start',
          name: 'Start',
          flowNodeType: 'workflowStart',
          inputs: [
            {
              key: 'system_input_config',
              label: 'Config',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: null,
              inputList: [{ key: 'secret', label: 'Secret', inputType: 'secret', value: null }]
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'userGuide',
          target: 'start',
          sourceHandle: 'userGuide-source-right',
          targetHandle: 'start-target-left'
        }
      ],
      chatConfig: {},
      resources: []
    };
    const leanMock = vi.fn().mockResolvedValue(version);
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: leanMock })
    });

    const result = await getAppLatestVersion('app-id');

    expect(result.nodes.map((node) => node.nodeId)).toEqual(['start']);
    expect(result.edges).toEqual([]);
    expect(result.chatConfig.scheduledTriggerConfig).toEqual(scheduledTriggerConfig);
    expect(result.nodes[0].inputs[0].selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(result.nodes[0].inputs[0].inputList?.[0]).not.toHaveProperty('value');
  });

  it('reads the legacy App workflow when the App has no published Version', async () => {
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) })
    });

    const result = await getAppLatestVersion('app-id', {
      name: 'App without version',
      modules: createAgentVersion().nodes,
      edges: [],
      chatConfig: {}
    } as any);

    expect(result.nodes.map((node) => node.nodeId)).toEqual(['agent-node']);
    expect(result.resources).toEqual([{ type: 'agent', id: 'legacy-agent-id' }]);
  });

  it('returns an empty workflow when neither a Version nor legacy workflow exists', async () => {
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) })
    });

    const result = await getAppLatestVersion('app-id', {
      name: 'Empty app'
    } as any);

    expect(result.nodes).toEqual([]);
    expect(result.resources).toEqual([]);
  });

  it('still reads the legacy App workflow when only a draft Version exists', async () => {
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) })
    });
    existsMock.mockResolvedValue({ _id: '507f1f77bcf86cd799439011' });

    const result = await getAppLatestVersion('app-id', {
      name: 'App with draft only',
      modules: createAgentVersion().nodes,
      edges: [],
      chatConfig: {}
    } as any);

    expect(result.nodes.map((node) => node.nodeId)).toEqual(['agent-node']);
    expect(result.resources).toEqual([{ type: 'agent', id: 'legacy-agent-id' }]);
    expect(existsMock).not.toHaveBeenCalled();
  });

  it('preserves a legacy version config when the current app config differs', async () => {
    const version = {
      _id: '507f1f77bcf86cd799439011',
      versionName: 'Legacy version',
      nodes: [
        {
          nodeId: 'userGuide',
          name: 'System config',
          flowNodeType: 'userGuide',
          inputs: [
            {
              key: NodeInputKeyEnum.welcomeText,
              label: 'Welcome text',
              value: 'Legacy welcome',
              renderTypeList: [FlowNodeInputTypeEnum.hidden]
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: undefined,
      resources: []
    };
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(version) })
    });

    const result = await getAppLatestVersion('app-id', {
      chatConfig: {
        welcomeConfig: {
          welcomeText: 'Current welcome'
        },
        welcomeText: 'Current welcome'
      }
    } as any);

    expect(result.nodes).toEqual([]);
    expect(result.chatConfig.welcomeConfig?.welcomeText).toBe('Legacy welcome');
    expect(result.chatConfig.welcomeText).toBe('Legacy welcome');
  });

  it('reads the version pointed by publishedVersionId', async () => {
    const version = {
      _id: '507f1f77bcf86cd799439011',
      versionName: 'Pinned published',
      nodes: [],
      edges: [],
      chatConfig: {},
      resources: [{ type: 'skill', id: 'pinned-skill' }]
    };
    findOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(version)
    });

    const result = await getAppLatestVersion('app-id', {
      publishedVersionId: '507f1f77bcf86cd799439011'
    } as any);

    expect(findOneMock).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      appId: 'app-id'
    });
    expect(result.resources).toEqual([{ type: 'skill', id: 'pinned-skill' }]);
  });

  it('preserves full MCP tool definitions on the MCP toolset App root', async () => {
    const toolSetConfig = {
      toolId: '',
      url: 'https://mcp.example.com',
      toolList: [
        {
          name: 'search',
          description: 'Search documents',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } }
          }
        }
      ]
    };
    const version = createToolSetVersion({ mcpToolSet: toolSetConfig });
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(version) })
    });

    const result = await getAppLatestVersion('app-id', { type: AppTypeEnum.mcpToolSet } as any);

    expect(result.nodes[0].toolConfig?.mcpToolSet).toEqual({
      url: toolSetConfig.url,
      // v2.4 RuntimeConfig 默认补全 authMode；headers 行为不变。
      authMode: 'headers',
      toolList: toolSetConfig.toolList
    });
  });

  it('preserves full HTTP tool definitions and import config on the HTTP toolset App root', async () => {
    const toolSetConfig = {
      baseUrl: 'https://api.example.com',
      apiSchemaStr: '{"openapi":"3.0.0"}',
      customHeaders: '{}',
      toolList: [
        {
          name: 'search',
          description: 'Search documents',
          path: '/search',
          method: 'GET',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } }
          }
        }
      ]
    };
    const version = createToolSetVersion({ httpToolSet: toolSetConfig });
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(version) })
    });

    const result = await getAppLatestVersion('app-id', { type: AppTypeEnum.httpToolSet } as any);

    expect(result.nodes[0].toolConfig?.httpToolSet).toEqual(toolSetConfig);
  });
});

describe('getAppDraftVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always reads the latest Version by time instead of an App pointer', async () => {
    const version = createAgentVersion([]);
    const sortMock = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(version)
    });
    findOneMock.mockReturnValue({ sort: sortMock });

    const result = await getAppDraftVersion('app-id');

    expect(findOneMock).toHaveBeenCalledWith({ appId: 'app-id' });
    expect(sortMock).toHaveBeenCalledWith({ time: -1, _id: -1 });
    expect(findAppByIdMock).not.toHaveBeenCalled();
    expect(result).toBe(version);
  });

  it('uses the provided transaction session when reading the latest Version', async () => {
    const version = createAgentVersion([]);
    const session = {} as ClientSession;
    const sessionMock = vi.fn();
    const query = {
      session: sessionMock,
      lean: vi.fn().mockResolvedValue(version)
    };
    const sortMock = vi.fn().mockReturnValue(query);
    findOneMock.mockReturnValue({ sort: sortMock });

    const result = await getAppDraftVersion('app-id', session);

    expect(sessionMock).toHaveBeenCalledWith(session);
    expect(result).toBe(version);
  });
});

describe('getAppDraftWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the legacy App workflow before the zero-Version migration completes', async () => {
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) })
    });
    findAppByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        name: 'Legacy draft',
        modules: createAgentVersion().nodes,
        edges: [],
        chatConfig: {},
        resourceRefs: { skillIds: ['legacy-skill'] }
      })
    });

    const result = await getAppDraftWorkflow('app-id');

    expect(result.nodes.map((node) => node.nodeId)).toEqual(['agent-node']);
    expect(result.resources).toEqual([
      { type: 'agent', id: 'legacy-agent-id' },
      { type: 'skill', id: 'legacy-skill' }
    ]);
  });

  it.each(toolSetVersionCases)(
    'loads App type dynamically for migrated $protocol draft Versions',
    async ({ appType, toolSetKey, createVersion }) => {
      const version = createVersion();
      findOneMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(version) })
      });
      findAppByIdMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ type: appType })
      });

      const result = await getAppDraftWorkflow('app-id');

      expect(findAppByIdMock).toHaveBeenCalledWith('app-id', 'type');
      expect(result.nodes[0]).toHaveProperty(`toolConfig.${toolSetKey}.toolList.0.inputSchema`);
    }
  );
});

describe('getAppVersionById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAppByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) });
  });

  it('extracts resources from a version that has not been migrated', async () => {
    findOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(createAgentVersion())
    });

    const result = await getAppVersionById({
      appId: 'app-id',
      versionId: '507f1f77bcf86cd799439011'
    });

    expect(result.resources).toEqual([{ type: 'agent', id: 'legacy-agent-id' }]);
  });

  it.each(toolSetVersionCases)(
    'loads App type dynamically for migrated $protocol requested Versions',
    async ({ appType, toolSetKey, createVersion }) => {
      findOneMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(createVersion()) });
      findAppByIdMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ type: appType })
      });

      const result = await getAppVersionById({
        appId: 'app-id',
        versionId: '507f1f77bcf86cd799439011'
      });

      expect(findAppByIdMock).toHaveBeenCalledWith('app-id', 'type');
      expect(result.nodes[0]).toHaveProperty(`toolConfig.${toolSetKey}.toolList.0.inputSchema`);
    }
  );
});

describe('getAppPublishedWorkflowMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the pointer version when it belongs to the same app', async () => {
    const versionId = '507f1f77bcf86cd799439011';
    findMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: versionId,
          appId: 'app-id',
          nodes: [{ nodeId: 'pointer-node' }]
        }
      ])
    });

    const result = await getAppPublishedWorkflowMap([
      {
        _id: 'app-id',
        publishedVersionId: versionId
      } as any
    ]);

    expect(aggregateMock).not.toHaveBeenCalled();
    expect(result.get('app-id')?.nodes.map((node) => node.nodeId)).toEqual(['pointer-node']);
  });

  it('ignores a pointer that belongs to another app and falls back to latest publish', async () => {
    const foreignVersionId = '507f1f77bcf86cd799439012';
    findMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: foreignVersionId,
          appId: 'other-app',
          nodes: [{ nodeId: 'foreign-node' }]
        }
      ])
    });
    aggregateMock.mockResolvedValue([
      {
        _id: 'app-id',
        doc: {
          _id: '507f1f77bcf86cd799439011',
          appId: 'app-id',
          nodes: [{ nodeId: 'own-node' }]
        }
      }
    ]);

    const result = await getAppPublishedWorkflowMap([
      {
        _id: 'app-id',
        publishedVersionId: foreignVersionId
      } as any
    ]);

    expect(aggregateMock).toHaveBeenCalled();
    expect(result.get('app-id')?.nodes.map((node) => node.nodeId)).toEqual(['own-node']);
  });

  it('normalizes legacy MCP nodes in the batch published workflow path', async () => {
    const versionId = '507f1f77bcf86cd799439011';
    findMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: versionId,
          appId: 'app-id',
          nodes: [
            {
              nodeId: 'legacy-mcp',
              name: 'Legacy MCP',
              flowNodeType: FlowNodeTypeEnum.toolSet,
              pluginId: 'mcp-app-id',
              inputs: [
                {
                  key: NodeInputKeyEnum.toolSetData,
                  label: 'Tool set',
                  renderTypeList: [FlowNodeInputTypeEnum.hidden],
                  value: { url: 'https://example.com/mcp', toolList: [] }
                }
              ],
              outputs: []
            }
          ],
          edges: [],
          chatConfig: {}
        }
      ])
    });

    const result = await getAppPublishedWorkflowMap([
      { _id: 'app-id', publishedVersionId: versionId } as any
    ]);

    expect(result.get('app-id')?.nodes[0].toolConfig?.mcpToolSet).toMatchObject({
      url: 'https://example.com/mcp',
      toolList: []
    });
    expect(result.get('app-id')?.nodes[0].inputs).toEqual([]);
  });

  it('preserves full HTTP tool definitions on a published toolset App root', async () => {
    const versionId = '507f1f77bcf86cd799439011';
    const toolSetConfig = {
      baseUrl: 'https://api.example.com',
      toolList: [
        { name: 'search', description: 'Search documents', path: '/search', method: 'GET' }
      ]
    };
    const version = {
      ...createToolSetVersion({ httpToolSet: toolSetConfig }),
      _id: versionId,
      appId: 'app-id'
    };
    findMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue([version])
    });

    const result = await getAppPublishedWorkflowMap([
      { _id: 'app-id', type: AppTypeEnum.httpToolSet, publishedVersionId: versionId } as any
    ]);

    expect(result.get('app-id')?.nodes[0].toolConfig?.httpToolSet).toEqual(toolSetConfig);
  });
});

describe('updateAppPublishedVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the pointed version and guards the App pointer with CAS', async () => {
    const session = {} as ClientSession;
    const appQuery = {
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: 'app-id',
        publishedVersionId: '507f1f77bcf86cd799439011'
      })
    };
    const versionQuery = {
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' })
    };
    findAppByIdMock.mockReturnValue(appQuery);
    findOneMock.mockReturnValue(versionQuery);
    updateVersionMock.mockResolvedValue({ matchedCount: 1 });
    updateAppMock.mockResolvedValue({ matchedCount: 1 });

    await updateAppPublishedVersion({
      appId: 'app-id',
      nodes: [],
      resources: [],
      session
    });

    expect(appQuery.session).toHaveBeenCalledWith(session);
    expect(versionQuery.session).toHaveBeenCalledWith(session);
    expect(updateVersionMock).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', appId: 'app-id' },
      { $set: { nodes: [], resources: [] } },
      { session }
    );
    expect(updateAppMock).toHaveBeenCalledWith(
      { _id: 'app-id', publishedVersionId: '507f1f77bcf86cd799439011' },
      {
        $set: expect.objectContaining({
          updateTime: expect.any(Date)
        })
      },
      { session }
    );
  });

  it('falls back to the latest published version and repairs a missing pointer', async () => {
    const session = {} as ClientSession;
    const appQuery = {
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ _id: 'app-id' })
    };
    const sortMock = vi.fn();
    const versionQuery = {
      sort: sortMock,
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ _id: 'published-version' })
    };
    sortMock.mockReturnValue(versionQuery);
    findAppByIdMock.mockReturnValue(appQuery);
    findOneMock.mockReturnValue(versionQuery);
    updateVersionMock.mockResolvedValue({ matchedCount: 1 });
    updateAppMock.mockResolvedValue({ matchedCount: 1 });

    await updateAppPublishedVersion({
      appId: 'app-id',
      nodes: [],
      resources: [],
      session
    });

    expect(findOneMock).toHaveBeenCalledWith({ appId: 'app-id', isPublish: true }, '_id');
    expect(sortMock).toHaveBeenCalledWith({ time: -1, _id: -1 });
    expect(updateAppMock).toHaveBeenCalledWith(
      {
        _id: 'app-id',
        $or: [{ publishedVersionId: null }, { publishedVersionId: { $exists: false } }]
      },
      {
        $set: expect.objectContaining({
          publishedVersionId: 'published-version',
          updateTime: expect.any(Date)
        })
      },
      { session }
    );
  });

  it('repairs a pointer whose version no longer belongs to the App', async () => {
    const session = {} as ClientSession;
    const appQuery = {
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: 'app-id',
        publishedVersionId: '507f1f77bcf86cd799439011'
      })
    };
    const pointerQuery = {
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(undefined)
    };
    const sortMock = vi.fn();
    const fallbackQuery = {
      sort: sortMock,
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ _id: 'published-version' })
    };
    sortMock.mockReturnValue(fallbackQuery);
    findAppByIdMock.mockReturnValue(appQuery);
    findOneMock.mockReturnValueOnce(pointerQuery).mockReturnValueOnce(fallbackQuery);
    updateVersionMock.mockResolvedValue({ matchedCount: 1 });
    updateAppMock.mockResolvedValue({ matchedCount: 1 });

    await updateAppPublishedVersion({
      appId: 'app-id',
      nodes: [],
      resources: [],
      session
    });

    expect(updateAppMock).toHaveBeenCalledWith(
      {
        _id: 'app-id',
        publishedVersionId: '507f1f77bcf86cd799439011'
      },
      {
        $set: expect.objectContaining({
          publishedVersionId: 'published-version',
          updateTime: expect.any(Date)
        })
      },
      { session }
    );
  });

  it('raises a transaction conflict when the App pointer changed', async () => {
    const session = {} as ClientSession;
    findAppByIdMock.mockReturnValue({
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: 'app-id',
        publishedVersionId: '507f1f77bcf86cd799439011'
      })
    });
    findOneMock.mockReturnValue({
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' })
    });
    updateVersionMock.mockResolvedValue({ matchedCount: 1 });
    updateAppMock.mockResolvedValue({ matchedCount: 0 });

    await expect(
      updateAppPublishedVersion({
        appId: 'app-id',
        nodes: [],
        resources: [],
        session
      })
    ).rejects.toBeInstanceOf(MongoTransactionConflictError);
  });

  it('fences whole-node writes by credentialSeq and bumps nodesRevision', async () => {
    const session = {} as ClientSession;
    findAppByIdMock.mockReturnValue({
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: 'app-id',
        publishedVersionId: '507f1f77bcf86cd799439011'
      })
    });
    findOneMock.mockReturnValue({
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' })
    });
    updateVersionMock.mockResolvedValue({ matchedCount: 1 });
    updateAppMock.mockResolvedValue({ matchedCount: 1 });

    await updateAppPublishedVersion({
      appId: 'app-id',
      nodes: [],
      resources: [],
      session,
      nodeFence: { nodeId: 'toolset-root', credentialSeq: 0 }
    });

    expect(updateVersionMock).toHaveBeenCalledWith(
      {
        _id: '507f1f77bcf86cd799439011',
        appId: 'app-id',
        nodes: {
          $elemMatch: {
            nodeId: 'toolset-root',
            'toolConfig.mcpToolSet.authMode': 'oauth',
            $and: [
              {
                $or: [
                  { 'toolConfig.mcpToolSet.oauth.credentialSeq': 0 },
                  { 'toolConfig.mcpToolSet.oauth.credentialSeq': { $exists: false } }
                ]
              }
            ]
          }
        }
      },
      {
        $set: { nodes: [], resources: [] },
        $inc: { nodesRevision: 1 }
      },
      { session }
    );
  });

  it('does not fence the first oauth enable (node has no oauth credentialSeq yet)', async () => {
    const session = {} as ClientSession;
    findAppByIdMock.mockReturnValue({
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: 'app-id',
        publishedVersionId: '507f1f77bcf86cd799439011'
      })
    });
    findOneMock.mockReturnValue({
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' })
    });
    updateVersionMock.mockResolvedValue({ matchedCount: 1 });
    updateAppMock.mockResolvedValue({ matchedCount: 1 });

    // 首次启用 oauth：handler 不传 nodeFence，过滤条件不得包含 nodes/authMode，
    // 也不得 bump nodesRevision，否则存库节点尚未带 oauth 字段会永远匹配失败。
    await updateAppPublishedVersion({
      appId: 'app-id',
      nodes: [],
      resources: [],
      session
    });

    const [filter, update, options] = updateVersionMock.mock.calls[0];
    expect(filter).toEqual({ _id: '507f1f77bcf86cd799439011', appId: 'app-id' });
    expect(update.$inc).toBeUndefined();
    expect(options).toEqual({ session });
  });

  it('raises a transaction conflict when the node fence does not match', async () => {
    const session = {} as ClientSession;
    findAppByIdMock.mockReturnValue({
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: 'app-id',
        publishedVersionId: '507f1f77bcf86cd799439011'
      })
    });
    findOneMock.mockReturnValue({
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' })
    });
    updateVersionMock.mockResolvedValue({ matchedCount: 0 });

    await expect(
      updateAppPublishedVersion({
        appId: 'app-id',
        nodes: [],
        resources: [],
        session,
        nodeFence: { nodeId: 'toolset-root', credentialSeq: 7 }
      })
    ).rejects.toBeInstanceOf(MongoTransactionConflictError);
  });
});
