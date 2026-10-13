import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const mocks = vi.hoisted(() => ({
  getTeamAppTemplatesV2: vi.fn(),
  getAppToolTemplates: vi.fn(),
  paginationCalls: [] as { api: unknown; params: Record<string, unknown> }[],
  teamTemplates: [] as { id: string; appType?: AppTypeEnum }[]
}));
const hookRuntime = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: [] as (() => void)[]
}));

vi.mock('@/web/core/app/api/tool', () => ({
  getTeamAppTemplatesV2: mocks.getTeamAppTemplatesV2,
  getAppToolTemplates: mocks.getAppToolTemplates
}));
vi.mock('@/web/core/plugin/toolTag/api', () => ({ getPluginToolTags: vi.fn() }));
vi.mock('react', () => ({
  useState: (initialValue: unknown) => {
    const index = hookRuntime.cursor++;
    if (!(index in hookRuntime.slots)) hookRuntime.slots[index] = initialValue;

    return [
      hookRuntime.slots[index],
      (value: unknown | ((previous: unknown) => unknown)) => {
        hookRuntime.slots[index] =
          typeof value === 'function'
            ? (value as (previous: unknown) => unknown)(hookRuntime.slots[index])
            : value;
      }
    ];
  },
  useRef: (initialValue: unknown) => {
    const index = hookRuntime.cursor++;
    if (!(index in hookRuntime.slots)) hookRuntime.slots[index] = { current: initialValue };
    return hookRuntime.slots[index];
  },
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => hookRuntime.effects.push(effect)
}));
vi.mock('@fastgpt/web/hooks/useScrollPagination', () => ({
  useScrollPagination: (api: unknown, options: { params: Record<string, unknown> }) => {
    mocks.paginationCalls.push({ api, params: options.params });
    return {
      data: mocks.teamTemplates,
      isLoading: false,
      ScrollData: vi.fn()
    };
  }
}));
vi.mock('@fastgpt/web/hooks/useRequest', async () => {
  return {
    useRequest: (request: (...args: any[]) => unknown, options: any = {}) => {
      const runAsync = async (...args: any[]) => {
        const result = await request(...args);
        options.onSuccess?.(result, args);
        return result;
      };
      return { runAsync, data: undefined, loading: false };
    }
  };
});
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
import { TemplateTypeEnum } from '@/pageComponents/app/detail/WorkflowComponents/Flow/components/NodeTemplates/header';

type HookState = ReturnType<typeof useNodeTemplates>;

const renderHook = () => {
  hookRuntime.cursor = 0;
  hookRuntime.effects = [];
  const state = useNodeTemplates();
  hookRuntime.effects.forEach((effect) => effect());
  return state;
};

const updateState = (state: HookState, callback: () => void) => {
  callback();
  return renderHook();
};

const getLatestPaginationParams = () => mocks.paginationCalls.at(-1)?.params;

describe('useNodeTemplates parent type routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookRuntime.cursor = 0;
    hookRuntime.slots = [];
    hookRuntime.effects = [];
    mocks.paginationCalls = [];
    mocks.teamTemplates = [];
  });

  it('retains loaded parent types across nested navigation, searches and breadcrumb returns', () => {
    let state = renderHook();

    state = updateState(state, () => state.onUpdateTemplateType(TemplateTypeEnum.myTools));
    expect(getLatestPaginationParams()).toMatchObject({
      parentId: '',
      parentType: undefined,
      type: [
        AppTypeEnum.toolFolder,
        AppTypeEnum.workflowTool,
        AppTypeEnum.mcpToolSet,
        AppTypeEnum.httpToolSet
      ]
    });
    expect(mocks.paginationCalls.at(-1)?.api).toBe(mocks.getTeamAppTemplatesV2);

    mocks.teamTemplates = [{ id: 'folder', appType: AppTypeEnum.toolFolder }];
    state = renderHook();
    state = updateState(state, () => state.onUpdateParentId('folder'));
    expect(getLatestPaginationParams()).toMatchObject({
      parentId: 'folder',
      parentType: AppTypeEnum.toolFolder
    });

    mocks.teamTemplates = [
      { id: 'mcp-set', appType: AppTypeEnum.mcpToolSet },
      { id: 'http-set', appType: AppTypeEnum.httpToolSet }
    ];
    state = renderHook();
    state = updateState(state, () => state.onUpdateParentId('mcp-set'));
    state = updateState(state, () => state.setSearchKey('search'));
    expect(getLatestPaginationParams()).toMatchObject({
      parentId: 'mcp-set',
      parentType: AppTypeEnum.mcpToolSet,
      searchKey: 'search'
    });

    mocks.teamTemplates = [{ id: 'http-set', appType: AppTypeEnum.httpToolSet }];
    state = renderHook();
    state = updateState(state, () => state.onUpdateParentId('http-set'));
    expect(getLatestPaginationParams()).toMatchObject({
      parentId: 'http-set',
      parentType: AppTypeEnum.httpToolSet,
      searchKey: undefined
    });

    state = updateState(state, () => state.onUpdateParentId('folder'));
    expect(getLatestPaginationParams()).toMatchObject({
      parentId: 'folder',
      parentType: AppTypeEnum.toolFolder
    });

    state = updateState(state, () => state.onUpdateParentId(''));
    expect(getLatestPaginationParams()).toMatchObject({
      parentId: '',
      parentType: undefined
    });
  });

  it('never passes a toolset parent type for the Agent tab', () => {
    mocks.teamTemplates = [{ id: 'parent', appType: AppTypeEnum.mcpToolSet }];
    let state = renderHook();

    state = updateState(state, () => state.onUpdateTemplateType(TemplateTypeEnum.agent));
    state = updateState(state, () => state.onUpdateParentId('parent'));

    expect(getLatestPaginationParams()).toEqual({
      parentId: 'parent',
      searchKey: undefined,
      type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow],
      parentType: undefined,
      excludeAppId: 'current-app'
    });
  });

  it('clears the cached parent type when switching template tabs', () => {
    mocks.teamTemplates = [{ id: 'tool-set', appType: AppTypeEnum.mcpToolSet }];
    let state = renderHook();

    state = updateState(state, () => state.onUpdateTemplateType(TemplateTypeEnum.myTools));
    state = updateState(state, () => state.onUpdateParentId('tool-set'));
    expect(getLatestPaginationParams()).toMatchObject({
      parentId: 'tool-set',
      parentType: AppTypeEnum.mcpToolSet
    });

    state = updateState(state, () => state.onUpdateTemplateType(TemplateTypeEnum.agent));
    expect(getLatestPaginationParams()).toMatchObject({
      parentId: '',
      parentType: undefined
    });
  });

  it('keeps system tools on the existing template interface', () => {
    mocks.getAppToolTemplates.mockResolvedValue([]);
    let state = renderHook();

    state = updateState(state, () => state.onUpdateTemplateType(TemplateTypeEnum.systemTools));
    state = updateState(state, () => state.onUpdateParentId('system-set', 'debug:tmbId:member'));
    state = updateState(state, () => state.setSelectedTagIds(['search']));

    expect(mocks.getAppToolTemplates).toHaveBeenCalledWith({
      parentId: 'system-set',
      source: 'debug:tmbId:member',
      searchKey: '',
      tags: ['search']
    });
    expect(mocks.getTeamAppTemplatesV2).not.toHaveBeenCalled();
  });
});
