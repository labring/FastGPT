import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const mocks = vi.hoisted(() => ({
  getTeamAppTemplates: vi.fn(),
  getAppToolTemplates: vi.fn(),
  requests: [] as ((...args: any[]) => Promise<any>)[]
}));
vi.mock('@/web/core/app/api/tool', () => ({
  getTeamAppTemplates: mocks.getTeamAppTemplates,
  getAppToolTemplates: mocks.getAppToolTemplates
}));
vi.mock('@/web/core/plugin/toolTag/api', () => ({ getPluginToolTags: vi.fn() }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: (...args: any[]) => unknown, options: any = {}) => {
    const runAsync = async (...args: any[]) => {
      const result = await request(...args);
      options.onSuccess?.(result, args);
      return result;
    };
    mocks.requests.push(runAsync);
    return { runAsync, data: undefined, loading: false };
  }
}));
vi.mock('ahooks', () => ({ useDebounceEffect: vi.fn() }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (context: any, selector: (value: any) => unknown) => selector(context.value)
}));
vi.mock('@/pageComponents/app/detail/context', () => ({
  AppContext: { value: { appDetail: { _id: 'current-app' } } }
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', () => ({
  WorkflowBufferDataContext: {
    value: { basicNodeTemplates: [], getNodeList: () => [], nodeAmount: 0 }
  }
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/components/NodeTemplates/header',
  () => ({
    TemplateTypeEnum: {
      basic: 'basic',
      systemTools: 'systemTools',
      myTools: 'myTools',
      agent: 'agent'
    }
  })
);
import { useNodeTemplates } from '@/pageComponents/app/detail/WorkflowComponents/Flow/components/NodeTemplates/useNodeTemplates';

describe('useNodeTemplates parent type routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requests = [];
  });
  const getLoader = () => {
    const Component = () => {
      useNodeTemplates();
      return null;
    };
    renderToStaticMarkup(React.createElement(Component));
    return mocks.requests[2];
  };

  it('retains loaded parent types across nested navigation, searches and breadcrumb returns', async () => {
    const load = getLoader();
    mocks.getTeamAppTemplates
      .mockResolvedValueOnce([{ id: 'folder', appType: AppTypeEnum.toolFolder }])
      .mockResolvedValueOnce([
        { id: 'mcp-set', appType: AppTypeEnum.mcpToolSet },
        { id: 'http-set', appType: AppTypeEnum.httpToolSet }
      ])
      .mockResolvedValue([]);
    await load({ type: 'myTools' });
    await load({ type: 'myTools', parentId: 'folder' });
    expect(mocks.getTeamAppTemplates.mock.lastCall?.[0]).toMatchObject({
      parentId: 'folder',
      parentType: AppTypeEnum.toolFolder
    });
    await load({ type: 'myTools', parentId: 'mcp-set', searchVal: 'search' });
    expect(mocks.getTeamAppTemplates.mock.lastCall?.[0]).toMatchObject({
      parentType: AppTypeEnum.mcpToolSet,
      searchKey: 'search'
    });
    await load({ type: 'myTools', parentId: 'http-set' });
    expect(mocks.getTeamAppTemplates.mock.lastCall?.[0]).toMatchObject({
      parentType: AppTypeEnum.httpToolSet
    });
    await load({ type: 'myTools', parentId: 'folder' });
    expect(mocks.getTeamAppTemplates.mock.lastCall?.[0]).toMatchObject({
      parentType: AppTypeEnum.toolFolder
    });
    await load({ type: 'myTools', parentId: '' });
    expect(mocks.getTeamAppTemplates.mock.lastCall?.[0].parentType).toBeUndefined();
  });

  it('never passes a toolset parent type for the Agent tab', async () => {
    const load = getLoader();
    mocks.getTeamAppTemplates
      .mockResolvedValueOnce([{ id: 'parent', appType: AppTypeEnum.mcpToolSet }])
      .mockResolvedValue([]);
    await load({ type: 'myTools' });
    await load({ type: 'agent', parentId: 'parent' });
    expect(mocks.getTeamAppTemplates.mock.lastCall?.[0]).toEqual({
      parentId: 'parent',
      searchKey: undefined,
      type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow]
    });
  });

  it('keeps system tools on the existing template interface', async () => {
    const load = getLoader();
    mocks.getAppToolTemplates.mockResolvedValue([]);
    await load({
      type: 'systemTools',
      parentId: 'system-set',
      source: 'debug:tmbId:member',
      tags: ['search']
    });
    expect(mocks.getAppToolTemplates).toHaveBeenCalledWith({
      parentId: 'system-set',
      source: 'debug:tmbId:member',
      searchKey: undefined,
      tags: ['search']
    });
    expect(mocks.getTeamAppTemplates).not.toHaveBeenCalled();
  });
});
