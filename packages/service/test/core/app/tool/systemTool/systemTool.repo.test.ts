import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listTools: vi.fn(),
  findSystemTools: vi.fn()
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    listTools: mocks.listTools,
    getTool: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/plugin/tool/systemToolSchema', () => ({
  MongoSystemTool: {
    find: mocks.findSystemTools,
    findOne: vi.fn()
  }
}));

import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';

const createPluginTool = ({
  pluginId,
  name,
  tags = []
}: {
  pluginId: string;
  name: string;
  tags?: string[];
}) => ({
  source: 'system',
  isToolset: false,
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
  tags
}: {
  pluginId: string;
  pluginOrder: number;
  tags: string[];
}) => ({
  pluginId: `systemTool-${pluginId}`,
  pluginOrder,
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
});
