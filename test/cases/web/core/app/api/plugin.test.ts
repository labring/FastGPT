import { describe, expect, it, vi } from 'vitest';
import {
  getTeamPlugTemplates,
  getSystemPlugTemplates,
  getPluginGroups,
  getSystemPluginPaths,
  getPreviewPluginNode,
  getToolVersionList,
  postCreateMCPTools,
  postUpdateMCPTools,
  getMCPTools,
  postRunMCPTool,
  getMcpChildren,
  postCreateHttpPlugin,
  putUpdateHttpPlugin,
  getApiSchemaByUrl
} from '@/web/core/app/api/plugin';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { defaultGroup } from '@fastgpt/web/core/workflow/constants';

// Mock API request functions
vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn()
}));

// Mock system store
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: {
    getState: vi.fn()
  }
}));

// Mock app APIs
vi.mock('@/web/core/app/api', () => ({
  getAppDetailById: vi.fn(),
  getMyApps: vi.fn()
}));

describe('plugin api', () => {
  it('should get team plugin templates with toolSet parent', async () => {
    const mockApp = {
      _id: 'app1',
      type: AppTypeEnum.toolSet,
      name: 'Test App',
      intro: 'Test Intro',
      avatar: 'test.png',
      sourceMember: 'member1'
    };

    const mockChildren = [
      {
        id: 'child1',
        name: 'Child 1'
      }
    ];

    const { getAppDetailById } = await import('@/web/core/app/api');
    const { GET } = await import('@/web/common/api/request');

    vi.mocked(getAppDetailById).mockResolvedValue(mockApp);
    vi.mocked(GET).mockResolvedValue(mockChildren);

    const result = await getTeamPlugTemplates({ parentId: 'app1' });

    expect(result).toEqual([
      {
        id: 'child1',
        name: 'Child 1',
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: FlowNodeTemplateTypeEnum.teamApp
      }
    ]);
  });

  it('should get team plugin templates without parent id', async () => {
    const mockApps = [
      {
        _id: 'app1',
        tmbId: 'tmb1',
        type: AppTypeEnum.workflow,
        name: 'Test App',
        intro: 'Test Intro',
        avatar: 'test.png',
        sourceMember: 'member1',
        pluginData: {
          nodeVersion: '1.0'
        }
      }
    ];

    const { getMyApps } = await import('@/web/core/app/api');
    vi.mocked(getMyApps).mockResolvedValue(mockApps);

    const result = await getTeamPlugTemplates();

    expect(result).toEqual([
      {
        tmbId: 'tmb1',
        id: 'app1',
        pluginId: 'app1',
        isFolder: false,
        templateType: FlowNodeTemplateTypeEnum.teamApp,
        flowNodeType: FlowNodeTypeEnum.appModule,
        avatar: 'test.png',
        name: 'Test App',
        intro: 'Test Intro',
        showStatus: false,
        version: '1.0',
        isTool: true,
        sourceMember: 'member1'
      }
    ]);
  });

  it('should get plugin groups when isPlus is true', async () => {
    const { useSystemStore } = await import('@/web/common/system/useSystemStore');
    const { GET } = await import('@/web/common/api/request');

    vi.mocked(useSystemStore.getState).mockReturnValue({
      feConfigs: { isPlus: true }
    });
    vi.mocked(GET).mockResolvedValue([{ id: 'group1' }]);

    const result = await getPluginGroups();
    expect(result).toEqual([{ id: 'group1' }]);
  });

  it('should get plugin groups when isPlus is false', async () => {
    const { useSystemStore } = await import('@/web/common/system/useSystemStore');

    vi.mocked(useSystemStore.getState).mockReturnValue({
      feConfigs: { isPlus: false }
    });

    const result = await getPluginGroups();
    expect(result).toEqual([defaultGroup]);
  });

  it('should get system plugin paths', async () => {
    const { GET } = await import('@/web/common/api/request');
    vi.mocked(GET).mockResolvedValue([{ id: 'path1' }]);

    const result = await getSystemPluginPaths({ sourceId: 'source1' });
    expect(result).toEqual([{ id: 'path1' }]);
  });

  it('should return empty array when sourceId is empty', async () => {
    const result = await getSystemPluginPaths({ sourceId: '' });
    expect(result).toEqual([]);
  });

  it('should make API calls correctly', async () => {
    const { POST } = await import('@/web/common/api/request');
    const mockPost = vi.mocked(POST);

    await getSystemPlugTemplates({ query: 'test' });
    expect(mockPost).toHaveBeenCalledWith('/core/app/plugin/getSystemPluginTemplates', {
      query: 'test'
    });

    await getToolVersionList({ id: 'test' });
    expect(mockPost).toHaveBeenCalledWith('/core/app/plugin/getVersionList', { id: 'test' });

    await postCreateMCPTools({ name: 'test' });
    expect(mockPost).toHaveBeenCalledWith('/core/app/mcpTools/create', { name: 'test' });

    await postUpdateMCPTools({ id: 'test' });
    expect(mockPost).toHaveBeenCalledWith('/core/app/mcpTools/update', { id: 'test' });

    await getMCPTools({ query: 'test' });
    expect(mockPost).toHaveBeenCalledWith('/support/mcp/client/getTools', { query: 'test' });

    await postRunMCPTool({ id: 'test' });
    expect(mockPost).toHaveBeenCalledWith(
      '/support/mcp/client/runTool',
      { id: 'test' },
      { timeout: 300000 }
    );

    await postCreateHttpPlugin({ name: 'test' });
    expect(mockPost).toHaveBeenCalledWith('/core/app/httpPlugin/create', { name: 'test' });

    await putUpdateHttpPlugin({ id: 'test' });
    expect(mockPost).toHaveBeenCalledWith('/core/app/httpPlugin/update', { id: 'test' });

    await getApiSchemaByUrl('test.com');
    expect(mockPost).toHaveBeenCalledWith(
      '/core/app/httpPlugin/getApiSchemaByUrl',
      { url: 'test.com' },
      { timeout: 30000 }
    );
  });
});
