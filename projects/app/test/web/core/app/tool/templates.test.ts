import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  getAppDetailById: vi.fn(),
  GET: vi.fn(),
  getMyApps: vi.fn()
}));

vi.mock('@/web/common/api/request', () => ({
  GET: mocks.GET,
  POST: vi.fn()
}));

vi.mock('@/web/core/app/api', () => ({
  getAppDetailById: mocks.getAppDetailById,
  getMyApps: mocks.getMyApps
}));

import { getTeamAppTemplates } from '@/web/core/app/api/tool';

describe('getTeamAppTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks MCP and HTTP toolset children as selectable tools', async () => {
    mocks.GET.mockResolvedValueOnce({
      type: AppTypeEnum.mcpToolSet,
      tools: [{ id: 'mcp-mcp-set/search', name: 'search', description: 'Search' }]
    });

    const mcpTemplates = await getTeamAppTemplates({
      parentId: 'mcp-set',
      parentType: AppTypeEnum.mcpToolSet
    });
    expect(mcpTemplates[0]).toMatchObject({
      id: 'mcp-mcp-set/search',
      flowNodeType: FlowNodeTypeEnum.tool,
      isTool: true
    });

    mocks.GET.mockResolvedValueOnce({
      type: AppTypeEnum.httpToolSet,
      tools: [
        { id: 'http-http-set/create', name: 'create', description: 'Create', avatar: 'avatar' }
      ]
    });

    const httpTemplates = await getTeamAppTemplates({
      parentId: 'http-set',
      parentType: AppTypeEnum.httpToolSet
    });
    expect(httpTemplates[0]).toMatchObject({
      id: 'http-http-set/create',
      flowNodeType: FlowNodeTypeEnum.tool,
      isTool: true
    });
    expect(mocks.GET).toHaveBeenNthCalledWith(1, '/core/app/tool/getToolSetChildren', {
      appId: 'mcp-set',
      searchKey: undefined
    });
    expect(mocks.GET).toHaveBeenNthCalledWith(2, '/core/app/tool/getToolSetChildren', {
      appId: 'http-set',
      searchKey: undefined
    });
    expect(mocks.getAppDetailById).not.toHaveBeenCalled();
    expect(mocks.getMyApps).not.toHaveBeenCalled();
  });

  it('lists normal folders directly and preserves filters without sending parentType', async () => {
    mocks.getMyApps.mockResolvedValueOnce([]);
    const query = {
      parentId: 'folder',
      parentType: AppTypeEnum.toolFolder,
      searchKey: 'search',
      type: [AppTypeEnum.workflowTool]
    };
    expect(await getTeamAppTemplates(query)).toEqual([]);
    expect(mocks.getMyApps).toHaveBeenCalledExactlyOnceWith({
      parentId: 'folder',
      searchKey: 'search',
      type: [AppTypeEnum.workflowTool]
    });
    expect(mocks.GET).not.toHaveBeenCalled();
    expect(mocks.getAppDetailById).not.toHaveBeenCalled();
  });

  it.each([undefined, AppTypeEnum.folder, AppTypeEnum.mcpToolSet])(
    'keeps Agent lists on list regardless of cached parent type: %j',
    async (parentType) => {
      mocks.getMyApps.mockResolvedValueOnce([]);
      const type = [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow];
      expect(await getTeamAppTemplates({ parentId: 'agent-folder', parentType, type })).toEqual([]);
      expect(mocks.getMyApps).toHaveBeenCalledExactlyOnceWith({ parentId: 'agent-folder', type });
      expect(mocks.GET).not.toHaveBeenCalled();
    }
  );

  it('preserves appType in root items so navigation can select its endpoint without detail', async () => {
    mocks.getMyApps.mockResolvedValueOnce([
      { _id: 'mcp-set', type: AppTypeEnum.mcpToolSet, name: 'MCP', avatar: '', intro: '' }
    ]);
    const [parent] = await getTeamAppTemplates();
    mocks.GET.mockResolvedValueOnce({ type: AppTypeEnum.mcpToolSet, tools: [] });
    await getTeamAppTemplates({ parentId: parent.id, parentType: parent.appType });
    expect(mocks.getMyApps).toHaveBeenCalledTimes(1);
    expect(mocks.GET).toHaveBeenCalledExactlyOnceWith('/core/app/tool/getToolSetChildren', {
      appId: 'mcp-set',
      searchKey: undefined
    });
    expect(mocks.getAppDetailById).not.toHaveBeenCalled();
  });

  it('loads root without fetching a parent resource', async () => {
    mocks.getMyApps.mockResolvedValueOnce([]);
    expect(await getTeamAppTemplates()).toEqual([]);
    expect(mocks.GET).not.toHaveBeenCalled();
  });

  it('does not fall back to folder listing for empty toolsets', async () => {
    mocks.GET.mockResolvedValueOnce({ type: AppTypeEnum.httpToolSet, tools: [] });
    expect(
      await getTeamAppTemplates({ parentId: 'empty', parentType: AppTypeEnum.httpToolSet })
    ).toEqual([]);
    expect(mocks.getMyApps).not.toHaveBeenCalled();
  });

  it('propagates denied access without requesting full details', async () => {
    mocks.GET.mockRejectedValueOnce(new Error('unAuthApp'));
    await expect(
      getTeamAppTemplates({ parentId: 'denied', parentType: AppTypeEnum.mcpToolSet })
    ).rejects.toThrow('unAuthApp');
    expect(mocks.getMyApps).not.toHaveBeenCalled();
    expect(mocks.getAppDetailById).not.toHaveBeenCalled();
  });
});
