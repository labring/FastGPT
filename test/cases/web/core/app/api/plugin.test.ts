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
  postCreateHttpPlugin,
  putUpdateHttpPlugin,
  getApiSchemaByUrl
} from '@/web/core/app/api/plugin';
import { POST, GET } from '@/web/common/api/request';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { defaultGroup } from '@fastgpt/web/core/workflow/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getMyApps } from '@/web/core/app/api';

vi.mock('@/web/common/api/request');
vi.mock('@/web/common/system/useSystemStore');
vi.mock('@/web/core/app/api');

describe('plugin api', () => {
  it('should get team plugin templates', async () => {
    const mockApp = {
      _id: '123',
      tmbId: 'tmb123',
      type: AppTypeEnum.workflow,
      avatar: 'avatar.png',
      name: 'Test App',
      intro: 'Test Intro',
      pluginData: {
        nodeVersion: '1.0'
      },
      sourceMember: 'member1'
    };

    vi.mocked(getMyApps).mockResolvedValue([mockApp]);

    const result = await getTeamPlugTemplates();

    expect(result).toEqual([
      {
        tmbId: 'tmb123',
        id: '123',
        pluginId: '123',
        isFolder: false,
        templateType: FlowNodeTemplateTypeEnum.teamApp,
        flowNodeType: FlowNodeTypeEnum.appModule,
        avatar: 'avatar.png',
        name: 'Test App',
        intro: 'Test Intro',
        showStatus: false,
        version: '1.0',
        isTool: true,
        sourceMember: 'member1'
      }
    ]);
  });

  it('should get system plugin templates', async () => {
    vi.mocked(POST).mockResolvedValue([]);
    const result = await getSystemPlugTemplates({});
    expect(result).toEqual([]);
  });

  it('should get plugin groups for plus users', async () => {
    vi.mocked(useSystemStore.getState).mockReturnValue({
      feConfigs: { isPlus: true }
    } as any);

    await getPluginGroups();
    expect(GET).toHaveBeenCalledWith('/proApi/core/app/plugin/getPluginGroups');
  });

  it('should get plugin groups for non-plus users', async () => {
    vi.mocked(useSystemStore.getState).mockReturnValue({
      feConfigs: { isPlus: false }
    } as any);

    const result = await getPluginGroups();
    expect(result).toEqual([defaultGroup]);
  });

  it('should get system plugin paths', async () => {
    await getSystemPluginPaths({ sourceId: '123' });
    expect(GET).toHaveBeenCalledWith('/core/app/plugin/path', { sourceId: '123' });
  });

  it('should get preview plugin node', async () => {
    await getPreviewPluginNode({ id: '123' });
    expect(GET).toHaveBeenCalledWith('/core/app/plugin/getPreviewNode', { id: '123' });
  });

  it('should get tool version list', async () => {
    await getToolVersionList({ toolId: '123' });
    expect(POST).toHaveBeenCalledWith('/core/app/plugin/getVersionList', { toolId: '123' });
  });

  it('should create MCP tools', async () => {
    await postCreateMCPTools({ tools: [] });
    expect(POST).toHaveBeenCalledWith('/core/app/mcpTools/create', { tools: [] });
  });

  it('should update MCP tools', async () => {
    await postUpdateMCPTools({ tools: [] });
    expect(POST).toHaveBeenCalledWith('/core/app/mcpTools/update', { tools: [] });
  });

  it('should get MCP tools', async () => {
    await getMCPTools({ tools: [] });
    expect(POST).toHaveBeenCalledWith('/support/mcp/client/getTools', { tools: [] });
  });

  it('should run MCP tool', async () => {
    await postRunMCPTool({ toolId: '123' });
    expect(POST).toHaveBeenCalledWith(
      '/support/mcp/client/runTool',
      { toolId: '123' },
      { timeout: 300000 }
    );
  });

  it('should create HTTP plugin', async () => {
    await postCreateHttpPlugin({} as any);
    expect(POST).toHaveBeenCalledWith('/core/app/httpPlugin/create', {});
  });

  it('should update HTTP plugin', async () => {
    await putUpdateHttpPlugin({} as any);
    expect(POST).toHaveBeenCalledWith('/core/app/httpPlugin/update', {});
  });

  it('should get API schema by URL', async () => {
    await getApiSchemaByUrl('http://test.com');
    expect(POST).toHaveBeenCalledWith(
      '/core/app/httpPlugin/getApiSchemaByUrl',
      { url: 'http://test.com' },
      { timeout: 30000 }
    );
  });
});
