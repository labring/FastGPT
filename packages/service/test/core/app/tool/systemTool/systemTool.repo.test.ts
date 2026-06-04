import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemToolSystemSecretStatusEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';

const mocks = vi.hoisted(() => ({
  listTools: vi.fn(),
  getTool: vi.fn(),
  findSystemTools: vi.fn(),
  findSystemTool: vi.fn(),
  findAppById: vi.fn(),
  getAppLatestVersion: vi.fn(),
  getAppVersionById: vi.fn(),
  checkIsLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    listTools: mocks.listTools,
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
      createPluginTool({ pluginId: 'configured-secret', name: 'Configured secret', hasSecret: true })
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
  it('returns saved author for workflow tools', async () => {
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
      nodes: []
    });
    mocks.checkIsLatestVersion.mockResolvedValue(true);

    const tool = await SystemToolRepo.getInstance().getSystemToolDetail({
      pluginId: 'systemTool-workflow-tool'
    });

    expect(tool.author).toBe('Custom Author');
    expect(tool.hasTokenFee).toBe(true);
  });
});
