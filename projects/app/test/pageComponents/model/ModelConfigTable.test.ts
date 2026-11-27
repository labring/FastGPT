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
  activeDragRubric: undefined as { draggableId: string; index: number } | undefined,
  addModelDisabled: undefined as boolean | undefined,
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
  useRequest: (
    request: (...args: any[]) => Promise<unknown>,
    options?: { onSuccess?: () => void }
  ) => ({
    runAsync: async (...args: any[]) => {
      const res = await request(...args);
      options?.onSuccess?.();
      return res;
    },
    loading: false
  })
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
    const clone =
      mocks.activeDragRubric && props.renderClone
        ? props.renderClone(
            {
              innerRef: () => {},
              draggableProps: {
                'data-rbd-draggable-context-id': '0',
                'data-rbd-draggable-id': mocks.activeDragRubric.draggableId
              },
              dragHandleProps: null
            },
            {
              isDragging: true,
              isDropAnimating: false,
              draggingOver: 'droppable',
              combineWith: null,
              combineTargetFor: null,
              mode: 'SNAP'
            },
            {
              draggableId: mocks.activeDragRubric.draggableId,
              type: 'DEFAULT',
              source: {
                droppableId: 'droppable',
                index: mocks.activeDragRubric.index
              }
            }
          )
        : null;
    return React.createElement(
      'tbody',
      null,
      props.dataList.map((model) =>
        React.createElement(
          'tr',
          { key: model.modelId },
          React.createElement('td', null, model.model)
        )
      ),
      clone
    );
  },
  Draggable: () => null,
  getDraggableItemProps: () => ({ draggableItemProps: {}, dragHandleProps: {} })
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
  default: ({ isDisabled }: { isDisabled?: boolean }) => {
    const [open, setOpen] = React.useState(false);
    mocks.addModelDisabled = isDisabled;
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        {
          disabled: Boolean(isDisabled),
          onClick: () => setOpen(true)
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
  mocks.activeDragRubric = undefined;
  mocks.addModelDisabled = undefined;
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

  it('never disables custom sort or create model buttons while deleting and keeps AddModel form mounted after refresh', async () => {
    await act(async () => button('cancel_sort').click());

    let resolveDelete!: () => void;
    mocks.deleteModel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );
    mocks.refresh.mockImplementationOnce(async () => {
      mocks.setMockModels?.([models[1], models[2]]);
    });

    expect(button('custom_sort').disabled).toBe(false);
    expect(mocks.addModelDisabled).toBeUndefined();

    // 删除进行中两个按钮均可用，打开新增表单后后台删除与刷新完成不会卸载表单。
    await act(async () => {
      mocks.confirmDelete?.();
    });
    expect(mocks.deleteModel).toHaveBeenCalledOnce();
    expect(button('custom_sort').disabled).toBe(false);
    expect(mocks.addModelDisabled).toBeUndefined();

    const createBtn = Array.from(host.querySelectorAll('button')).find(
      (item) => item.textContent === 'config_model:create_model'
    );
    await act(async () => {
      createBtn?.click();
    });
    expect(host.querySelector('[data-testid="add-model-form"]')?.textContent).toBe('draft-form');

    await act(async () => {
      resolveDelete();
    });
    expect(host.querySelector('[data-testid="add-model-form"]')?.textContent).toBe('draft-form');
  });

  it('reconciles sort draft automatically when deletion or concurrent creation refreshes modelItems and preserves dragged order', async () => {
    await act(async () => button('cancel_sort').click());

    let resolveDelete!: () => void;
    mocks.deleteModel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );
    mocks.refresh.mockImplementationOnce(async () => {
      mocks.setMockModels?.([models[1], models[2]]);
    });

    // 删除进行中进入排序并拖拽最后一行 C；拖拽尚未放下时删除刷新到达，克隆预览与索引保持在本次拖拽快照上不越界，放下后再按 ID 与最新目录合并。
    await act(async () => {
      mocks.confirmDelete?.();
    });
    await act(async () => {
      button('custom_sort').click();
    });
    expect(sortNames()).toEqual(['A', 'B', 'C']);

    await act(async () => {
      mocks.activeDragRubric = { draggableId: models[2].modelId, index: 2 };
      mocks.dnd!.onBeforeCapture?.({ draggableId: models[2].modelId });
    });

    // 删除刷新在拖拽中途将 modelItems 缩短为 [B, C]，renderClone 仍按 source.index = 2 渲染 C 而不报错。
    await act(async () => {
      resolveDelete();
    });
    expect(mocks.dnd!.dataList.map((item) => item.model)).toEqual(['A', 'B', 'C']);
    expect(sortNames().at(-1)).toBe('C');

    // 模拟 DndDrag.handleDragEnd：按本次拖拽快照将 index 2 的 C 移至 index 0，并触发 onDragEnd + onDragEndCb。
    await act(async () => {
      const nextList = Array.from(mocks.dnd!.dataList);
      const [moved] = nextList.splice(2, 1);
      nextList.splice(0, 0, moved);
      mocks.activeDragRubric = undefined;
      mocks.dnd!.onDragEnd?.();
      mocks.dnd!.onDragEndCb(nextList);
    });
    expect(sortNames()).toEqual(['C', 'B']);

    await act(async () => button('save_sort').click());
    expect(mocks.save).toHaveBeenCalledWith({
      channelType: 'system',
      modelIds: [models[2].modelId, models[1].modelId]
    });
  });

  it('self-heals stale sort draft via catalog refresh after save failure so retry succeeds', async () => {
    // 若提交时服务端已删除模型 A 导致保存拒绝，自动刷新剔除 A 并保留 B/C 拖拽顺序，再次保存即可成功。
    mocks.save.mockRejectedValueOnce(new Error('model not exist')).mockResolvedValueOnce(undefined);
    mocks.refresh.mockImplementationOnce(async () => {
      mocks.setMockModels?.([models[1], models[2]]);
    });

    await act(async () => mocks.dnd!.onDragEndCb([models[0], models[2], models[1]]));
    await act(async () => button('save_sort').click());
    expect(mocks.onError).toHaveBeenCalledOnce();
    expect(sortNames()).toEqual(['C', 'B']);

    await act(async () => button('save_sort').click());
    expect(mocks.save).toHaveBeenLastCalledWith({
      channelType: 'system',
      modelIds: [models[2].modelId, models[1].modelId]
    });
  });
});
