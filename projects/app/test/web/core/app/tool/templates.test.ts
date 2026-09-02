import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  getAppDetailById: vi.fn(),
  getMcpChildren: vi.fn(),
  getHttpChildren: vi.fn()
}));

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn()
}));

vi.mock('@/web/core/app/api', () => ({
  getAppDetailById: mocks.getAppDetailById,
  getMyApps: vi.fn()
}));

vi.mock('@/web/core/app/api/mcpTools', () => ({
  getMcpChildren: mocks.getMcpChildren
}));

vi.mock('@/web/core/app/api/httpTools', () => ({
  getHttpChildren: mocks.getHttpChildren
}));

import { getTeamAppTemplates } from '@/web/core/app/api/tool';

describe('getTeamAppTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      _id: 'http-set'
    });
    mocks.getHttpChildren.mockResolvedValueOnce([
      { id: 'http-http-set/create', avatar: 'avatar', name: 'create', description: 'Create' }
    ]);

    const httpTemplates = await getTeamAppTemplates({ parentId: 'http-set' });
    expect(httpTemplates[0]).toMatchObject({
      id: 'http-http-set/create',
      flowNodeType: FlowNodeTypeEnum.tool,
      isTool: true
    });
  });
});
