import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  getAppDetailById: vi.fn(),
  getMcpChildren: vi.fn(),
  getAllApps: vi.fn()
}));

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn()
}));

vi.mock('@/web/core/app/api', () => ({
  getAppDetailById: mocks.getAppDetailById,
  getAllApps: mocks.getAllApps
}));

vi.mock('@/web/core/app/api/mcpTools', () => ({
  getMcpChildren: mocks.getMcpChildren
}));

import { getTeamAppTemplates } from '@/web/core/app/api/tool';

describe('getTeamAppTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes root type filters and maps root team apps', async () => {
    mocks.getAllApps.mockResolvedValueOnce([
      {
        _id: 'tool-folder',
        type: AppTypeEnum.toolFolder,
        avatar: 'folder-avatar',
        name: 'My tools',
        intro: 'Tool folder'
      },
      {
        _id: 'workflow-tool',
        type: AppTypeEnum.workflowTool,
        avatar: 'tool-avatar',
        name: 'My tool',
        intro: 'Tool app'
      }
    ]);

    const templates = await getTeamAppTemplates({
      parentId: null,
      type: [AppTypeEnum.toolFolder, AppTypeEnum.workflowTool]
    });

    expect(mocks.getAllApps).toHaveBeenCalledWith({
      parentId: null,
      type: [AppTypeEnum.toolFolder, AppTypeEnum.workflowTool]
    });
    expect(templates).toMatchObject([
      {
        id: 'tool-folder',
        pluginId: 'tool-folder',
        isFolder: true,
        appType: AppTypeEnum.toolFolder
      },
      {
        id: 'workflow-tool',
        pluginId: 'workflow-tool',
        isFolder: false,
        appType: AppTypeEnum.workflowTool
      }
    ]);

    mocks.getAllApps.mockResolvedValueOnce([
      {
        _id: 'agent-folder',
        type: AppTypeEnum.folder,
        avatar: 'agent-folder-avatar',
        name: 'My agents',
        intro: 'Agent folder'
      },
      {
        _id: 'workflow-agent',
        type: AppTypeEnum.workflow,
        avatar: 'agent-avatar',
        name: 'My agent',
        intro: 'Agent app'
      }
    ]);

    const agentTemplates = await getTeamAppTemplates({
      parentId: null,
      type: [AppTypeEnum.folder, AppTypeEnum.workflow]
    });

    expect(mocks.getAllApps).toHaveBeenNthCalledWith(2, {
      parentId: null,
      type: [AppTypeEnum.folder, AppTypeEnum.workflow]
    });
    expect(agentTemplates).toMatchObject([
      {
        id: 'agent-folder',
        pluginId: 'agent-folder',
        isFolder: true,
        appType: AppTypeEnum.folder
      },
      {
        id: 'workflow-agent',
        pluginId: 'workflow-agent',
        isFolder: false,
        appType: AppTypeEnum.workflow
      }
    ]);
  });

  it('marks MCP and HTTP toolset children as selectable tools', async () => {
    mocks.getAppDetailById.mockResolvedValueOnce({
      type: AppTypeEnum.mcpToolSet,
      _id: 'mcp-set'
    });
    mocks.getMcpChildren.mockResolvedValueOnce([
      { id: 'mcp-set/search', name: 'search', description: 'Search' }
    ]);

    const mcpTemplates = await getTeamAppTemplates({ parentId: 'mcp-set' });
    expect(mcpTemplates[0]).toMatchObject({
      id: 'mcp-set/search',
      flowNodeType: FlowNodeTypeEnum.tool,
      isTool: true
    });

    mocks.getAppDetailById.mockResolvedValueOnce({
      type: AppTypeEnum.httpToolSet,
      _id: 'http-set',
      avatar: 'avatar',
      modules: [
        {
          toolConfig: {
            httpToolSet: {
              toolList: [{ name: 'create', description: 'Create' }]
            }
          }
        }
      ]
    });

    const httpTemplates = await getTeamAppTemplates({ parentId: 'http-set' });
    expect(httpTemplates[0]).toMatchObject({
      id: 'http-http-set/create',
      flowNodeType: FlowNodeTypeEnum.tool,
      isTool: true
    });
  });
});
