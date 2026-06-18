import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemToolSystemSecretStatusEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  listTools: vi.fn(),
  listPluginVersions: vi.fn(),
  getTool: vi.fn(),
  findSystemTools: vi.fn(),
  findSystemTool: vi.fn(),
  findAppVersions: vi.fn(),
  findAppById: vi.fn(),
  getAppLatestVersion: vi.fn(),
  getAppVersionById: vi.fn(),
  checkIsLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    listTools: mocks.listTools,
    listPluginVersions: mocks.listPluginVersions,
    getTool: mocks.getTool
  }
}));

vi.mock('@fastgpt/service/core/plugin/tool/systemToolSchema', () => ({
  MongoSystemTool: {
    find: mocks.findSystemTools,
    findOne: mocks.findSystemTool
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  AppCollectionName: 'apps',
  chatConfigType: {},
  MongoApp: {
    findById: mocks.findAppById
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion,
  getAppVersionById: mocks.getAppVersionById,
  checkIsLatestVersion: mocks.checkIsLatestVersion
}));

vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    find: mocks.findAppVersions
  }
}));

import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';

const createPluginTool = ({
  pluginId,
  name,
  tags = [],
  hasSecret = false
}: {
  pluginId: string;
  name: string;
  tags?: string[];
  hasSecret?: boolean;
}) => ({
  source: 'system',
  isToolset: false,
  hasSecret,
  type: 'tool',
  name: { en: name },
  description: { en: `${name} intro` },
  pluginId,
  version: '1.0.0',
  etag: `${pluginId}-etag`,
  icon: `${pluginId}.svg`,
  tags,
  toolDescription: `${name} description`
});

const createToolConfig = ({
  pluginId,
  pluginOrder,
  tags,
  secretsVal
}: {
  pluginId: string;
  pluginOrder: number;
  tags: string[];
  secretsVal?: Record<string, unknown>;
}) => ({
  pluginId: `systemTool-${pluginId}`,
  pluginOrder,
  secretsVal,
  customConfig: {
    name: pluginId,
    version: '1.0.0',
    tags
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SystemToolRepo.getSystemToolList', () => {
  it('sorts by tag matched count before plugin order when tags are provided', async () => {
    mocks.listTools.mockResolvedValue([
      createPluginTool({ pluginId: 'low-order-single-match', name: 'Low order single match' }),
      createPluginTool({ pluginId: 'high-order-two-match', name: 'High order two match' }),
      createPluginTool({ pluginId: 'second-order-single-match', name: 'Second order single match' })
    ]);
    mocks.findSystemTools.mockResolvedValue([
      createToolConfig({
        pluginId: 'low-order-single-match',
        pluginOrder: 1,
        tags: ['search']
      }),
      createToolConfig({
        pluginId: 'high-order-two-match',
        pluginOrder: 100,
        tags: ['search', 'finance']
      }),
      createToolConfig({
        pluginId: 'second-order-single-match',
        pluginOrder: 2,
        tags: ['search']
      })
    ]);

    const tools = await SystemToolRepo.getInstance().getSystemToolList({
      tags: ['search', 'custom-tag', 'finance']
    });

    expect(mocks.listTools).toHaveBeenCalledWith({
      op: undefined,
      sources: undefined,
      tags: ['search', 'finance']
    });
    expect(tools.map((tool) => tool.id)).toEqual([
      'systemTool-high-order-two-match',
      'systemTool-low-order-single-match',
      'systemTool-second-order-single-match'
    ]);
  });

  it('keeps plugin order sorting when no tags are provided', async () => {
    mocks.listTools.mockResolvedValue([
      createPluginTool({ pluginId: 'third', name: 'Third' }),
      createPluginTool({ pluginId: 'first', name: 'First' }),
      createPluginTool({ pluginId: 'second', name: 'Second' })
    ]);
    mocks.findSystemTools.mockResolvedValue([
      createToolConfig({ pluginId: 'third', pluginOrder: 3, tags: [] }),
      createToolConfig({ pluginId: 'first', pluginOrder: 1, tags: [] }),
      createToolConfig({ pluginId: 'second', pluginOrder: 2, tags: [] })
    ]);

    const tools = await SystemToolRepo.getInstance().getSystemToolList({});

    expect(tools.map((tool) => tool.id)).toEqual([
      'systemTool-first',
      'systemTool-second',
      'systemTool-third'
    ]);
  });

  it('sets system secret status from list hasSecret and saved secrets', async () => {
    mocks.listTools.mockResolvedValue([
      createPluginTool({ pluginId: 'no-secret', name: 'No secret' }),
      createPluginTool({ pluginId: 'need-secret', name: 'Need secret', hasSecret: true }),
      createPluginTool({
        pluginId: 'configured-secret',
        name: 'Configured secret',
        hasSecret: true
      })
    ]);
    mocks.findSystemTools.mockResolvedValue([
      createToolConfig({ pluginId: 'no-secret', pluginOrder: 1, tags: [] }),
      createToolConfig({ pluginId: 'need-secret', pluginOrder: 2, tags: [] }),
      createToolConfig({
        pluginId: 'configured-secret',
        pluginOrder: 3,
        tags: [],
        secretsVal: { apiKey: 'configured' }
      })
    ]);

    const tools = await SystemToolRepo.getInstance().getSystemToolList({});
    const statusMap = new Map(tools.map((tool) => [tool.id, tool.systemSecretStatus]));

    expect(statusMap.get('systemTool-no-secret')).toBe(SystemToolSystemSecretStatusEnum.none);
    expect(statusMap.get('systemTool-need-secret')).toBe(
      SystemToolSystemSecretStatusEnum.unconfigured
    );
    expect(statusMap.get('systemTool-configured-secret')).toBe(
      SystemToolSystemSecretStatusEnum.configured
    );
    expect(mocks.getTool).not.toHaveBeenCalled();
  });
});

describe('SystemToolRepo.getSystemToolDetail', () => {
  it('returns app version id and label for workflow tools', async () => {
    mocks.findSystemTool.mockResolvedValue({
      pluginId: 'systemTool-workflow-tool',
      status: 'Normal',
      currentCost: 0,
      hasTokenFee: true,
      systemKeyCost: 0,
      pluginOrder: 0,
      originCost: 0,
      customConfig: {
        name: 'Workflow Tool',
        intro: 'Workflow intro',
        version: 'workflow-version',
        tags: [],
        associatedPluginId: 'app-id',
        author: 'Custom Author',
        userGuide: 'Guide'
      }
    });
    mocks.findAppById.mockReturnValue({
      lean: () => Promise.resolve({ _id: 'app-id', avatar: 'app.svg' })
    });
    mocks.getAppLatestVersion.mockResolvedValue({
      versionId: 'latest-version',
      versionName: 'Latest Version',
      nodes: [
        {
          nodeId: 'plugin-input',
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          name: 'Plugin Input',
          inputs: [
            {
              key: 'query',
              label: 'Query',
              valueType: WorkflowIOValueTypeEnum.string,
              toolDescription: 'Search query',
              required: true,
              renderTypeList: [FlowNodeInputTypeEnum.input]
            }
          ],
          outputs: []
        },
        {
          nodeId: 'plugin-output',
          flowNodeType: FlowNodeTypeEnum.pluginOutput,
          name: 'Plugin Output',
          inputs: [
            {
              key: 'result',
              label: 'Result',
              valueType: WorkflowIOValueTypeEnum.string,
              description: 'Search result',
              required: true,
              renderTypeList: [FlowNodeInputTypeEnum.input]
            }
          ],
          outputs: []
        }
      ]
    });
    mocks.checkIsLatestVersion.mockResolvedValue(true);

    const tool = await SystemToolRepo.getInstance().getSystemToolDetail({
      pluginId: 'systemTool-workflow-tool'
    });

    expect(tool.author).toBe('Custom Author');
    expect(tool.hasTokenFee).toBe(true);
    expect(tool.version).toBe('latest-version');
    expect(tool.versionLabel).toBe('Latest Version');
    expect(tool.inputSchema).toEqual({
      type: 'object',
      properties: {
        query: {
          type: 'string',
          title: 'Query',
          description: 'Search query',
          toolDescription: 'Search query'
        }
      },
      required: ['query']
    });
    expect(tool.outputSchema).toEqual({
      type: 'object',
      properties: {
        result: {
          type: 'string',
          title: 'Result',
          description: 'Search result'
        }
      },
      required: ['result']
    });
    expect(tool).not.toHaveProperty('inputs');
    expect(tool).not.toHaveProperty('outputs');
  });

  it('returns plugin client schemas directly for system tools', async () => {
    const inputSchema = {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' }
      },
      required: ['city']
    };
    const outputSchema = {
      type: 'object',
      properties: {
        weather: { type: 'string' }
      }
    };
    const secretSchema = {
      type: 'object',
      properties: {
        apiKey: { type: 'string', isSecret: true }
      },
      required: ['apiKey']
    };

    mocks.findSystemTool.mockResolvedValue({
      pluginId: 'systemTool-weather',
      status: 'Normal',
      currentCost: 1,
      hasTokenFee: false,
      systemKeyCost: 2,
      customConfig: {}
    });
    mocks.findSystemTools.mockResolvedValue([]);
    mocks.getTool.mockResolvedValue({
      source: 'system',
      isToolset: true,
      name: { en: 'Weather' },
      description: { en: 'Weather intro' },
      pluginId: 'weather',
      version: '1.0.0',
      icon: 'weather.svg',
      tags: [],
      toolDescription: 'Weather tool',
      inputSchema,
      outputSchema,
      secretSchema,
      children: [
        {
          id: 'forecast',
          name: { en: 'Forecast' },
          description: { en: 'Forecast intro' },
          toolDescription: 'Forecast tool',
          inputSchema,
          outputSchema
        }
      ]
    });

    const tool = await SystemToolRepo.getInstance().getSystemToolDetail({
      pluginId: 'systemTool-weather'
    });

    expect(tool.inputSchema).toBe(inputSchema);
    expect(tool.outputSchema).toBe(outputSchema);
    expect(tool.secretSchema).toBe(secretSchema);
    expect(tool.children?.[0]).toMatchObject({
      id: 'forecast',
      inputSchema,
      outputSchema
    });
    expect(tool).not.toHaveProperty('inputs');
    expect(tool).not.toHaveProperty('outputs');
    expect(tool).not.toHaveProperty('secrets');
  });
});

describe('SystemToolRepo.getSystemToolDisplayInfo', () => {
  it('returns workflow tool display metadata without loading app version schemas', async () => {
    mocks.findSystemTool.mockResolvedValue({
      pluginId: 'systemTool-workflow-tool',
      status: 'Normal',
      currentCost: 3,
      hasTokenFee: true,
      systemKeyCost: 4,
      pluginOrder: 5,
      originCost: 6,
      hideTags: ['hidden-user'],
      promoteTags: ['vip'],
      customConfig: {
        name: 'Workflow Tool',
        avatar: 'workflow.svg',
        intro: 'Workflow intro',
        toolDescription: 'Workflow description',
        version: 'workflow-version',
        tags: ['workflow'],
        associatedPluginId: 'app-id',
        author: 'Custom Author',
        userGuide: 'Guide'
      }
    });

    const tool = await SystemToolRepo.getInstance().getSystemToolDisplayInfo({
      pluginId: 'systemTool-workflow-tool'
    });

    expect(tool).toMatchObject({
      id: 'systemTool-workflow-tool',
      name: 'Workflow Tool',
      avatar: 'workflow.svg',
      intro: 'Workflow intro',
      toolDescription: 'Workflow description',
      version: 'workflow-version',
      currentCost: 3,
      systemKeyCost: 4,
      hasTokenFee: true
    });
    expect(tool).not.toHaveProperty('inputSchema');
    expect(tool).not.toHaveProperty('outputSchema');
    expect(tool).not.toHaveProperty('secretSchema');
    expect(mocks.findAppById).not.toHaveBeenCalled();
    expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
    expect(mocks.getTool).not.toHaveBeenCalled();
    expect(mocks.listTools).not.toHaveBeenCalled();
  });

  it('returns toolset child display metadata without child schemas', async () => {
    const inputSchema = {
      type: 'object',
      properties: {
        city: { type: 'string' }
      }
    };
    const outputSchema = {
      type: 'object',
      properties: {
        weather: { type: 'string' }
      }
    };

    mocks.findSystemTool.mockResolvedValue(undefined);
    mocks.listTools.mockResolvedValue([
      {
        source: 'system',
        isToolset: true,
        name: { en: 'Weather' },
        description: { en: 'Weather intro' },
        pluginId: 'weather',
        version: '1.0.0',
        icon: 'weather.svg',
        tags: ['life'],
        toolDescription: 'Weather tool',
        hasSecret: false,
        children: [
          {
            id: 'forecast',
            name: { en: 'Forecast' },
            description: { en: 'Forecast intro' },
            toolDescription: 'Forecast tool',
            icon: 'forecast.svg',
            inputSchema,
            outputSchema
          }
        ]
      }
    ]);
    mocks.findSystemTools.mockResolvedValue([
      {
        pluginId: 'systemTool-weather/forecast',
        currentCost: 2,
        systemKeyCost: 1,
        customConfig: {
          name: 'Forecast',
          version: '1.0.0',
          toolDescription: 'Configured forecast'
        }
      }
    ]);

    const tool = await SystemToolRepo.getInstance().getSystemToolDisplayInfo({
      pluginId: 'systemTool-weather/forecast'
    });

    expect(tool).toMatchObject({
      id: 'systemTool-weather/forecast',
      name: 'Forecast',
      intro: 'Forecast intro',
      avatar: 'forecast.svg',
      toolDescription: 'Configured forecast',
      currentCost: 2,
      systemKeyCost: 1
    });
    expect(tool).not.toHaveProperty('inputSchema');
    expect(tool).not.toHaveProperty('outputSchema');
    expect(tool).not.toHaveProperty('secretSchema');
    expect(mocks.getTool).not.toHaveBeenCalled();
  });

  it('returns parent toolset children without schemas', async () => {
    const inputSchema = {
      type: 'object',
      properties: {
        city: { type: 'string' }
      }
    };
    const outputSchema = {
      type: 'object',
      properties: {
        weather: { type: 'string' }
      }
    };

    mocks.findSystemTool.mockResolvedValue(undefined);
    mocks.listTools.mockResolvedValue([
      {
        source: 'system',
        isToolset: true,
        name: { en: 'Weather' },
        description: { en: 'Weather intro' },
        pluginId: 'weather',
        version: '1.0.0',
        icon: 'weather.svg',
        tags: ['life'],
        toolDescription: 'Weather tool',
        hasSecret: false,
        children: [
          {
            id: 'forecast',
            name: { en: 'Forecast' },
            description: { en: 'Forecast intro' },
            toolDescription: 'Forecast tool',
            icon: 'forecast.svg',
            inputSchema,
            outputSchema
          }
        ]
      }
    ]);
    mocks.findSystemTools.mockResolvedValue([]);

    const tool = await SystemToolRepo.getInstance().getSystemToolDisplayInfo({
      pluginId: 'systemTool-weather'
    });

    expect(tool.children?.[0]).toMatchObject({
      id: 'forecast',
      name: 'Forecast',
      description: 'Forecast intro',
      toolDescription: 'Forecast tool',
      icon: 'forecast.svg'
    });
    expect(tool.children?.[0]).not.toHaveProperty('inputSchema');
    expect(tool.children?.[0]).not.toHaveProperty('outputSchema');
    expect(mocks.getTool).not.toHaveBeenCalled();
  });

  it('keeps parent toolset display lightweight when list omits child icons', async () => {
    mocks.findSystemTool.mockResolvedValue(undefined);
    mocks.listTools.mockResolvedValue([
      {
        source: 'system',
        isToolset: true,
        name: { en: 'Weather' },
        description: { en: 'Weather intro' },
        pluginId: 'weather',
        version: '1.0.0',
        icon: 'weather.svg',
        tags: ['life'],
        toolDescription: 'Weather tool',
        hasSecret: false,
        children: [
          {
            id: 'forecast',
            name: { en: 'Forecast' },
            description: { en: 'Forecast intro' },
            toolDescription: 'Forecast tool'
          }
        ]
      }
    ]);
    mocks.findSystemTools.mockResolvedValue([]);

    const tool = await SystemToolRepo.getInstance().getSystemToolDisplayInfo({
      pluginId: 'systemTool-weather'
    });

    expect(tool.children?.[0]).toMatchObject({
      id: 'forecast',
      icon: undefined
    });
    expect(tool.children?.[0]).not.toHaveProperty('inputSchema');
    expect(tool.children?.[0]).not.toHaveProperty('outputSchema');
    expect(mocks.getTool).not.toHaveBeenCalled();
  });

  it('fills parent toolset children icons from detail for expanded child templates', async () => {
    const inputSchema = {
      type: 'object',
      properties: {
        city: { type: 'string' }
      }
    };
    const outputSchema = {
      type: 'object',
      properties: {
        weather: { type: 'string' }
      }
    };

    mocks.findSystemTool.mockResolvedValue(undefined);
    mocks.listTools.mockResolvedValue([
      {
        source: 'system',
        isToolset: true,
        name: { en: 'Weather' },
        description: { en: 'Weather intro' },
        pluginId: 'weather',
        version: '1.0.0',
        icon: 'weather.svg',
        tags: ['life'],
        toolDescription: 'Weather tool',
        hasSecret: false,
        children: [
          {
            id: 'forecast',
            name: { en: 'Forecast' },
            description: { en: 'Forecast intro' },
            toolDescription: 'Forecast tool'
          }
        ]
      }
    ]);
    mocks.getTool.mockResolvedValue({
      source: 'system',
      isToolset: true,
      name: { en: 'Weather' },
      description: { en: 'Weather intro' },
      pluginId: 'weather',
      version: '1.0.0',
      icon: 'weather.svg',
      tags: ['life'],
      toolDescription: 'Weather tool',
      hasSecret: false,
      children: [
        {
          id: 'forecast',
          name: { en: 'Forecast' },
          description: { en: 'Forecast intro' },
          toolDescription: 'Forecast tool',
          icon: 'forecast.svg',
          inputSchema,
          outputSchema
        }
      ]
    });
    mocks.findSystemTools.mockResolvedValue([]);

    const tool = await SystemToolRepo.getInstance().getSystemToolDisplayInfoWithChildIcons({
      pluginId: 'systemTool-weather'
    });

    expect(tool.children?.[0]).toMatchObject({
      id: 'forecast',
      icon: 'forecast.svg'
    });
    expect(tool.children?.[0]).not.toHaveProperty('inputSchema');
    expect(tool.children?.[0]).not.toHaveProperty('outputSchema');
    expect(mocks.getTool).toHaveBeenCalledWith({
      pluginId: 'weather',
      source: 'system'
    });
  });
});

describe('SystemToolRepo.getVersions', () => {
  it('returns app version ids and names for workflow tools', async () => {
    const sortedAppVersions = [
      {
        _id: '507f1f77bcf86cd799439012',
        versionName: 'Workflow v2'
      },
      {
        _id: '507f1f77bcf86cd799439013',
        versionName: 'Workflow v1'
      }
    ];
    const sortAppVersions = vi.fn().mockResolvedValue(sortedAppVersions);

    mocks.findSystemTool.mockResolvedValue({
      pluginId: 'commercial-workflow-tool',
      customConfig: {
        associatedPluginId: '507f1f77bcf86cd799439011'
      }
    });
    mocks.findAppVersions.mockReturnValue({
      sort: sortAppVersions
    });

    const versions = await SystemToolRepo.getInstance().getVersions({
      pluginId: 'commercial-workflow-tool'
    });

    expect(versions).toEqual([
      {
        version: '507f1f77bcf86cd799439012',
        versionDescription: 'Workflow v2'
      },
      {
        version: '507f1f77bcf86cd799439013',
        versionDescription: 'Workflow v1'
      }
    ]);
    expect(sortAppVersions).toHaveBeenCalledWith({ time: -1, _id: -1 });
  });

  it('lists commercial plugin versions from commercial source', async () => {
    mocks.findSystemTool.mockResolvedValue(undefined);
    mocks.listPluginVersions.mockResolvedValue([{ version: '2.0.0' }, { version: '1.0.0' }]);

    const versions = await SystemToolRepo.getInstance().getVersions({
      pluginId: 'commercial-search'
    });

    expect(mocks.listPluginVersions).toHaveBeenCalledWith({
      pluginId: 'search',
      source: 'commercial'
    });
    expect(versions).toEqual([{ version: '2.0.0' }, { version: '1.0.0' }]);
  });
});
