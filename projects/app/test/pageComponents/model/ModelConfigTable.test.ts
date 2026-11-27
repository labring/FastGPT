import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelConfigListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import type DndDrag from '@fastgpt/web/components/common/DndDrag';

type DndProps = React.ComponentProps<typeof DndDrag<ModelConfigListItem>>;
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  deleteModel: vi.fn(),
  refresh: vi.fn(),
  onError: vi.fn(),
  dnd: undefined as DndProps | undefined,
  addModelDisabled: undefined as boolean | undefined,
  addModelOnSuccess: undefined as (() => Promise<void>) | undefined,
  confirmDelete: undefined as (() => void) | undefined,
  currentModels: [] as ModelConfigListItem[],
  setMockModels: undefined as ((next: ModelConfigListItem[]) => void) | undefined
}));

vi.mock('@chakra-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chakra-ui/react')>()),
  // 捕获异步事件错误，以便断言失败后的 UI 和草稿，而不产生未处理的 Promise。
  Button: ({
    children,
    isDisabled,
    isLoading,
    onClick
  }: React.PropsWithChildren<{
    isDisabled?: boolean;
    isLoading?: boolean;
    onClick?: () => unknown;
  }>) =>
    React.createElement(
      'button',
      {
        disabled: isDisabled || isLoading,
        'data-loading': Boolean(isLoading),
        onClick: () => {
          Promise.resolve(onClick?.()).catch(mocks.onError);
        }
      },
      children
    )
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { username: 'root' } })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: {} })
}));
vi.mock('@/web/core/ai/model/api', () => ({
  putUpdateModelOrder: mocks.save,
  deleteModel: mocks.deleteModel,
  deleteModels: vi.fn(),
  testModel: vi.fn(),
  putModelsStatus: vi.fn(),
  postUpdateModelChannels: vi.fn()
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: unknown) => ({ runAsync: request, loading: false })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: vi.fn(), ConfirmModal: () => null })
}));
vi.mock('@fastgpt/web/hooks/useTableMultipleSelect', () => ({
  useTableMultipleSelect: () => ({
    selectedItems: [],
    setSelectedItems: vi.fn(),
    isSelected: () => false,
    getRowSelectionProps: () => ({}),
    FloatingActionBar: () => null
  })
}));
vi.mock('@fastgpt/web/hooks/useVirtualList', () => ({
  useStaticVirtualList: ({ data }: { data: ModelConfigListItem[] }) => ({
    containerRef: React.useRef(null),
    virtualDataList: data.map((data, index) => ({ data, index })),
    topPlaceholderHeight: 0,
    bottomPlaceholderHeight: 0,
    scrollToTop: React.useCallback(() => {}, [])
  })
}));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableLayout: ({ renderBody }: { renderBody: () => React.ReactNode }) => renderBody()
}));
vi.mock('@fastgpt/web/components/common/DndDrag', () => ({
  default: (props: DndProps) => {
    mocks.dnd = props;
    return React.createElement(
      'tbody',
      null,
      props.dataList.map((model) =>
        React.createElement(
          'tr',
          { key: model.modelId },
          React.createElement('td', null, model.model)
        )
      )
    );
  },
  Draggable: () => null,
  getDraggableItemProps: vi.fn()
}));
vi.mock('@/components/core/ai/ModelTabHeader', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@/components/core/ai/ModelListFilters', () => ({ default: () => null }));
vi.mock('@/components/core/ai/ModelScopeCell', () => ({ default: () => null }));
vi.mock('@/components/core/ai/ModelCapabilityTags', () => ({ default: () => null }));
vi.mock('@/components/core/ai/TestModeBetaTag', () => ({ default: () => null }));
vi.mock('@/components/core/ai/PriceTiersLabel', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/String/CopyBox', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyPopover/PopoverConfirm', () => ({
  default: ({ onConfirm }: { onConfirm?: () => void }) => {
    mocks.confirmDelete = onConfirm;
    return null;
  }
}));
vi.mock('@/pageComponents/model/AddModel', () => ({
  default: ({
    isDisabled,
    onSuccess,
    onOpen
  }: {
    isDisabled?: boolean;
    onSuccess?: () => Promise<void>;
    onOpen?: () => void;
  }) => {
    const [open, setOpen] = React.useState(false);
    mocks.addModelDisabled = isDisabled;
    mocks.addModelOnSuccess = onSuccess;
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        {
          disabled: Boolean(isDisabled),
          onClick: () => {
            onOpen?.();
            setOpen(true);
          }
        },
        'config_model:create_model'
      ),
      open ? React.createElement('div', { 'data-testid': 'add-model-form' }, 'draft-form') : null
    );
  }
}));
vi.mock('@/pageComponents/model/ModelChannelCount', () => ({ default: () => null }));
vi.mock('@/pageComponents/model/ModelChannelModal', () => ({ default: () => null }));
vi.mock('@/pageComponents/model/ModelEditModal', () => ({ default: () => null }));
vi.mock('@/pageComponents/model/JsonModelConfigModal', () => ({ default: () => null }));
vi.mock('@/pageComponents/model/DefaultModelModal', () => ({ default: () => null }));

const models: ModelConfigListItem[] = ['A', 'B', 'C'].map((model, index) => ({
  modelId: `68ad85a7463006c963799a0${index}`,
  model,
  name: model,
  type: ModelTypeEnum.llm,
  provider: 'openai',
  scope: ModelScopeEnum.system,
  isActive: true,
  config: { maxContext: 8192, maxResponse: 4096, quoteMaxToken: 2048 },
  channels: []
}));
vi.mock('@/web/core/ai/model/useModelConfig', () => ({
  useModelConfig: () => {
    const [list, setList] = React.useState<ModelConfigListItem[]>(() => mocks.currentModels);
    mocks.setMockModels = setList;
    return {
      data: { models: list },
      models: list,
      channels: [],
      providers: [],
      getModelProvider: () => ({}),
      refresh: mocks.refresh,
      loading: false
    };
  }
}));

let dom: JSDOM;
let createRoot: typeof import('react-dom/client').createRoot;
let ChakraProvider: typeof import('@chakra-ui/react').ChakraProvider;
let ModelConfigTable: typeof import('@/pageComponents/model/ModelConfigTable').default;

let root: Root;
let host: HTMLDivElement;
const button = (label: string) => {
  const element = Array.from(host.querySelectorAll('button')).find(
    (item) => item.textContent === `config_model:model.${label}`
  );
  if (!element) throw new Error(`Button ${label} is not rendered`);
  return element;
};
const sortNames = () => Array.from(host.querySelectorAll('tbody tr'), (row) => row.textContent);

beforeAll(async () => {
  // 仓库的全局 setup 包含服务端初始化，完成后再建立组件测试所需的浏览器环境。
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  for (const key of [
    'window',
    'document',
    'Element',
    'Node',
    'HTMLElement',
    'HTMLInputElement',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ] as const) {
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {}
  });
  ({ createRoot } = await import('react-dom/client'));
  ({ ChakraProvider } = await import('@chakra-ui/react'));
  ({ default: ModelConfigTable } = await import('@/pageComponents/model/ModelConfigTable'));
});

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.dnd = undefined;
  mocks.addModelDisabled = undefined;
  mocks.addModelOnSuccess = undefined;
  mocks.confirmDelete = undefined;
  mocks.currentModels = [...models];
  mocks.setMockModels = undefined;
  mocks.refresh.mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(ModelConfigTable, { Tab: null, channelType: 'system' })
      )
    )
  );
  await act(async () => button('custom_sort').click());
  await act(async () => mocks.dnd!.onDragEndCb([models[1], models[0], models[2]]));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('ModelConfigTable sorting', () => {
  it('submits the complete dragged model order', async () => {
    expect(sortNames()).toEqual(['B', 'A', 'C']);
    await act(async () => button('save_sort').click());
    expect(mocks.save).toHaveBeenCalledWith({
      channelType: 'system',
      modelIds: [models[1].modelId, models[0].modelId, models[2].modelId]
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain('config_model:model.cancel_sort');
  });

  it('never disables custom sort or create model buttons while deleting a model', async () => {
    // 退出排序态，回到包含自定义排序、新增模型和行删除按钮的主列表视图。
    await act(async () => button('cancel_sort').click());

    let resolveDelete!: () => void;
    mocks.deleteModel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );

    const customSortBtn = button('custom_sort');
    expect(customSortBtn.disabled).toBe(false);
    expect(mocks.addModelDisabled).toBeUndefined();

    // 触发删除请求并停留在请求进行中状态，校验两个按钮均保持可用。
    await act(async () => {
      mocks.confirmDelete?.();
    });
    expect(mocks.deleteModel).toHaveBeenCalledOnce();
    expect(button('custom_sort').disabled).toBe(false);
    expect(mocks.addModelDisabled).toBeUndefined();

    await act(async () => {
      resolveDelete();
    });
  });

  it('waits for in-flight deletion and catalog refresh before snapshotting sort draft so saving excludes deleted IDs', async () => {
    await act(async () => button('cancel_sort').click());

    let resolveDelete!: () => void;
    let resolveRefresh!: () => void;
    mocks.deleteModel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );
    mocks.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = () => {
            mocks.setMockModels?.([models[1], models[2]]);
            resolve();
          };
        })
    );

    // 发起单条删除后在请求完成前点击自定义排序：按钮可用但暂不按旧列表进入排序草稿。
    await act(async () => {
      mocks.confirmDelete?.();
    });
    expect(button('custom_sort').disabled).toBe(false);
    expect(mocks.addModelDisabled).toBeUndefined();

    await act(async () => {
      button('custom_sort').click();
    });
    expect(host.textContent).not.toContain('config_model:model.save_sort');

    // 删除完成但目录刷新尚未完成前仍等待刷新快照。
    await act(async () => {
      resolveDelete();
    });
    expect(host.textContent).not.toContain('config_model:model.save_sort');

    // 刷新完成后自动按剩余模型进入排序并可成功保存完整顺序。
    await act(async () => {
      resolveRefresh();
    });
    expect(sortNames()).toEqual(['B', 'C']);

    await act(async () => mocks.dnd!.onDragEndCb([models[2], models[1]]));
    await act(async () => button('save_sort').click());
    expect(mocks.save).toHaveBeenCalledWith({
      channelType: 'system',
      modelIds: [models[2].modelId, models[1].modelId]
    });
  });

  it('unblocks sort when a concurrent AddModel refresh supersedes a hanging delete refresh and retries after failed refresh', async () => {
    await act(async () => button('cancel_sort').click());

    const addedModel: ModelConfigListItem = {
      ...models[0],
      modelId: '68ad85a7463006c963799a09',
      model: 'D',
      name: 'D'
    };

    // 1. 删除成功后首路刷新被后续 AddModel 刷新取代（模拟 ahooks runAsync 返回永不落定 Promise），锁不卡死且排序按最新目录放行。
    mocks.deleteModel.mockResolvedValueOnce(undefined);
    mocks.refresh.mockImplementationOnce(() => new Promise<void>(() => {}));
    let resolveSupersedingRefresh!: () => void;
    mocks.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSupersedingRefresh = () => {
            mocks.setMockModels?.([models[1], models[2], addedModel]);
            resolve();
          };
        })
    );

    await act(async () => {
      mocks.confirmDelete?.();
    });
    await act(async () => {
      button('custom_sort').click();
    });
    expect(host.textContent).not.toContain('config_model:model.save_sort');

    await act(async () => {
      void mocks.addModelOnSuccess?.();
    });
    await act(async () => {
      resolveSupersedingRefresh();
    });
    expect(sortNames()).toEqual(['B', 'C', 'D']);

    // 2. 删除成功但目录刷新失败时，首次退出等待且不按旧快照建草稿；再次点击排序应重拉目录后再进入排序。
    await act(async () => button('cancel_sort').click());
    mocks.deleteModel.mockResolvedValueOnce(undefined);
    mocks.refresh.mockRejectedValueOnce(new Error('network error'));
    let resolveRetryRefresh!: () => void;
    mocks.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRetryRefresh = () => {
            mocks.setMockModels?.([models[2], addedModel]);
            resolve();
          };
        })
    );

    await act(async () => {
      mocks.confirmDelete?.();
    });
    expect(host.textContent).not.toContain('config_model:model.save_sort');

    await act(async () => {
      button('custom_sort').click();
    });
    expect(host.textContent).not.toContain('config_model:model.save_sort');

    await act(async () => {
      resolveRetryRefresh();
    });
    expect(sortNames()).toEqual(['C', 'D']);
  });

  it('cancels queued sort when opening AddModel during deletion so background refresh keeps the add form mounted', async () => {
    await act(async () => button('cancel_sort').click());

    let resolveDelete!: () => void;
    let resolveRefresh!: () => void;
    mocks.deleteModel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );
    mocks.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = () => {
            mocks.setMockModels?.([models[1], models[2]]);
            resolve();
          };
        })
    );

    // 1. 删除进行中先点击自定义排序进入排队态。
    await act(async () => {
      mocks.confirmDelete?.();
    });
    await act(async () => {
      button('custom_sort').click();
    });
    expect(button('custom_sort').getAttribute('data-loading')).toBe('true');

    // 2. 用户转而点击“添加模型”打开有状态的新增表单：排队的排序应立即撤销。
    const createBtn = Array.from(host.querySelectorAll('button')).find(
      (item) => item.textContent === 'config_model:create_model'
    );
    await act(async () => {
      createBtn?.click();
    });
    expect(host.querySelector('[data-testid="add-model-form"]')?.textContent).toBe('draft-form');
    expect(button('custom_sort').getAttribute('data-loading')).toBe('false');

    // 3. 后台删除和目录刷新相继完成后，不应自动切入排序态或卸载已打开的新增表单。
    await act(async () => {
      resolveDelete();
    });
    await act(async () => {
      resolveRefresh();
    });
    expect(host.querySelector('[data-testid="add-model-form"]')?.textContent).toBe('draft-form');
    expect(host.textContent).not.toContain('config_model:model.save_sort');
  });
});
