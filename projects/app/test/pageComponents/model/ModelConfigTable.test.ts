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
  refresh: vi.fn(),
  onError: vi.fn(),
  dnd: undefined as DndProps | undefined
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
  deleteModel: vi.fn(),
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
vi.mock('@fastgpt/web/components/common/MyPopover/PopoverConfirm', () => ({ default: () => null }));
vi.mock('@/pageComponents/model/AddModel', () => ({ default: () => null }));
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
  useModelConfig: () => ({
    data: { models },
    models,
    channels: [],
    providers: [],
    getModelProvider: () => ({}),
    refresh: mocks.refresh,
    loading: false
  })
}));

let dom: JSDOM;
let createRoot: typeof import('react-dom/client').createRoot;
let ChakraProvider: typeof import('@chakra-ui/react').ChakraProvider;
let ModelConfigTable: typeof import('@/pageComponents/model/ModelConfigTable').default;

/** 分开控制 API 和刷新完成时机，验证整个保存周期都占用排序草稿。 */
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

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

/** 检查父组件传给真实拖拽行的禁用状态，不在 fixture 中复制 busy 判断。 */
const expectDraggingDisabled = (disabled: boolean) => {
  const props = mocks.dnd;
  if (!props) throw new Error('Sort list is not mounted');
  const body = props.children({
    provided: {
      droppableProps: {
        'data-rbd-droppable-context-id': 'test',
        'data-rbd-droppable-id': 'droppable'
      },
      innerRef: vi.fn(),
      placeholder: null
    },
    snapshot: {
      isDraggingOver: false,
      draggingOverWith: null,
      draggingFromThisWith: null,
      isUsingPlaceholder: false
    }
  });
  const rows = React.Children.toArray(body.props.children).filter(
    (child): child is React.ReactElement => React.isValidElement(child)
  );
  expect(rows).toHaveLength(models.length);
  for (const row of rows) {
    const draggable = React.Children.toArray(row.props.children)[0] as React.ReactElement;
    expect(draggable.props.isDragDisabled).toBe(disabled);
  }
};

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
  expect(sortNames()).toEqual(['B', 'A', 'C']);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('ModelConfigTable sorting busy state', () => {
  it('locks the draft through saving and refreshing, then allows a new sort session', async () => {
    const save = deferred();
    const refresh = deferred();
    mocks.save.mockReturnValueOnce(save.promise);
    mocks.refresh.mockReturnValueOnce(refresh.promise);
    await act(async () => button('save_sort').click());

    const expectBusy = async () => {
      expect(button('save_sort').disabled).toBe(true);
      expect(button('save_sort').dataset.loading).toBe('true');
      expect(button('cancel_sort').disabled).toBe(true);
      expectDraggingDisabled(true);
      await act(async () => {
        button('cancel_sort').click();
        button('save_sort').click();
        // 模拟保存前开始的拖拽在保存期间结束，回调也不能改写草稿。
        mocks.dnd!.onDragEndCb([models[2], models[1], models[0]]);
      });
      expect(sortNames()).toEqual(['B', 'A', 'C']);
      expect(mocks.save).toHaveBeenCalledOnce();
      expect(host.textContent).not.toContain('config_model:model.custom_sort');
    };

    await expectBusy();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledWith({
      channelType: 'system',
      moves: [{ modelId: models[1].modelId, beforeModelId: models[0].modelId }]
    });
    await act(async () => save.resolve());
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await expectBusy();

    await act(async () => refresh.resolve());
    expect(button('custom_sort').disabled).toBe(false);
    expect(host.textContent).not.toContain('config_model:model.cancel_sort');
    await act(async () => button('custom_sort').click());
    expect(sortNames()).toEqual(['A', 'B', 'C']);
    expect(button('cancel_sort').disabled).toBe(false);
    expectDraggingDisabled(false);
  });

  it.each(['save', 'refresh'] as const)(
    'keeps the draft and unlocks editing after %s fails',
    async (stage) => {
      const pending = deferred();
      const error = new Error(`${stage} failed`);
      mocks.save.mockResolvedValue(undefined);
      mocks.refresh.mockResolvedValue(undefined);
      mocks[stage].mockReturnValueOnce(pending.promise);
      await act(async () => button('save_sort').click());
      expectDraggingDisabled(true);

      await act(async () => pending.reject(error));
      expect(mocks.onError).toHaveBeenCalledWith(error);
      expect(sortNames()).toEqual(['B', 'A', 'C']);
      expect(button('cancel_sort').disabled).toBe(false);
      expect(button('save_sort').disabled).toBe(false);
      expect(button('save_sort').dataset.loading).toBe('false');
      expectDraggingDisabled(false);
      if (stage === 'save') expect(mocks.refresh).not.toHaveBeenCalled();

      await act(async () => mocks.dnd!.onDragEndCb([models[2], models[1], models[0]]));
      expect(sortNames()).toEqual(['C', 'B', 'A']);
      await act(async () => button('save_sort').click());
      expect(mocks.save).toHaveBeenCalledTimes(2);
      expect(button('custom_sort').disabled).toBe(false);
    }
  );
});
