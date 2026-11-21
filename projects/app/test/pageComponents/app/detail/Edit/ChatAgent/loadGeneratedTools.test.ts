import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { getNewToolPreviewNodeMock } = vi.hoisted(() => ({
  getNewToolPreviewNodeMock: vi.fn()
}));

vi.mock('@/web/core/app/api/tool', () => ({
  getNewToolPreviewNode: getNewToolPreviewNodeMock
}));

import { loadGeneratedTools } from '@/pageComponents/app/detail/Edit/ChatAgent/utils';

describe('loadGeneratedTools V2 & legacy compatibility', () => {
  beforeEach(() => {
    getNewToolPreviewNodeMock.mockReset();
  });

  it('loads V2 canonical plugin/team/app keys and reuses existing tools without duplicate fetch', async () => {
    getNewToolPreviewNodeMock.mockImplementation(async ({ appId, source }) => ({
      id: appId,
      pluginId: appId,
      source,
      name: `Tool ${appId}`,
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.tool,
      templateType: 'tools',
      inputs: [],
      outputs: []
    }));

    const existingTeamTool = {
      id: 'systemTool-metaso',
      pluginId: 'systemTool-metaso',
      source: 'teamId:67a100000000000000000001',
      name: '团队秘塔(已配置)',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.tool,
      templateType: 'tools',
      inputs: [],
      outputs: []
    } as any;

    const result = await loadGeneratedTools({
      newToolIds: [
        'plugin:system:metaso',
        'plugin:team:67a100000000000000000001:metaso',
        'app:team:66f100000000000000000011',
        'builtin:read_files'
      ],
      existsTools: [existingTeamTool]
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: 'systemTool-metaso', source: 'system' });
    expect(result[1]).toBe(existingTeamTool);
    expect(result[2]).toMatchObject({ id: '66f100000000000000000011', source: undefined });
    expect(getNewToolPreviewNodeMock).toHaveBeenCalledTimes(2);
    expect(getNewToolPreviewNodeMock).toHaveBeenCalledWith({
      appId: 'systemTool-metaso',
      source: 'system'
    });
    expect(getNewToolPreviewNodeMock).toHaveBeenCalledWith({
      appId: '66f100000000000000000011',
      source: undefined
    });
  });

  it('preserves canonical mcp-/http- ids returned by preview lookup for unselected V2 child tools', async () => {
    const mcpParentId = '66f100000000000000000021';
    const httpParentId = '66f100000000000000000022';
    getNewToolPreviewNodeMock
      .mockResolvedValueOnce({
        id: 'preview-node-id-1',
        pluginId: `mcp-${mcpParentId}/search`,
        name: 'search',
        avatar: '',
        intro: '',
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: 'tools',
        inputs: [],
        outputs: []
      })
      .mockResolvedValueOnce({
        id: 'preview-node-id-2',
        pluginId: `http-${httpParentId}//api/v1/users`,
        name: '/api/v1/users',
        avatar: '',
        intro: '',
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: 'tools',
        inputs: [],
        outputs: []
      });

    const result = await loadGeneratedTools({
      newToolIds: [`app:team:${mcpParentId}/search`, `app:team:${httpParentId}//api/v1/users`]
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: `mcp-${mcpParentId}/search` });
    expect(result[1]).toMatchObject({ id: `http-${httpParentId}//api/v1/users` });
  });

  it('validates MCP/HTTP child tools via live preview before reusing existing config, rejecting stale deleted tools', async () => {
    const mcpParentId = '66f100000000000000000031';
    const stalePreDeletionTool = {
      id: `mcp-${mcpParentId}/catalog/search`,
      pluginId: `mcp-${mcpParentId}/catalog/search`,
      name: 'catalog/search',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.tool,
      templateType: 'tools',
      inputs: [],
      outputs: [],
      toolConfig: {
        mcpTool: {
          toolId: `mcp-${mcpParentId}/catalog/search`
        }
      }
    } as any;
    const reloadedFallbackTool = {
      id: `mcp-${mcpParentId}/catalog/search`,
      pluginId: `mcp-${mcpParentId}/catalog/search`,
      name: 'search',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.tool,
      templateType: 'tools',
      inputs: [],
      outputs: [],
      toolConfig: {
        mcpTool: {
          toolId: `mcp-${mcpParentId}/search`
        }
      }
    } as any;

    getNewToolPreviewNodeMock.mockRejectedValueOnce(new Error('unExist')).mockResolvedValueOnce({
      id: 'preview-search',
      pluginId: `mcp-${mcpParentId}/search`,
      name: 'search',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.tool,
      templateType: 'tools',
      inputs: [],
      outputs: [],
      toolConfig: {
        mcpTool: {
          toolId: `mcp-${mcpParentId}/search`
        }
      }
    });

    // 即使本地 existsTools 仍持有删除前的旧配置，也要经实时精确预览拒绝
    await expect(
      loadGeneratedTools({
        newToolIds: [`app:team:${mcpParentId}/catalog/search`],
        existsTools: [stalePreDeletionTool]
      })
    ).rejects.toThrow('unExist');
    expect(getNewToolPreviewNodeMock).toHaveBeenCalledWith({
      appId: `${mcpParentId}/catalog/search`,
      source: undefined
    });

    const reusedResult = await loadGeneratedTools({
      newToolIds: [`app:team:${mcpParentId}/search`],
      existsTools: [reloadedFallbackTool]
    });
    expect(reusedResult).toEqual([reloadedFallbackTool]);
  });
});
