import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { ModelConfigListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelImportPlan } from '@/pageComponents/model/ImportModelFromChannelModal/types';

const apiMocks = vi.hoisted(() => ({
  getImportPreviewFromChannel: vi.fn(),
  getModelTemplates: vi.fn(),
  postApplyChannelImportChanges: vi.fn(),
  deferResultModalMount: false
}));

vi.mock('@chakra-ui/react', () => {
  const asTag = (tag: string) => {
    const MockTag = ({ children }: React.PropsWithChildren) =>
      React.createElement(tag, null, children);
    MockTag.displayName = `Mock${tag}`;
    return MockTag;
  };
  const Box = asTag('div');
  const Button = ({
    children,
    onClick,
    isDisabled
  }: React.PropsWithChildren<{
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    isDisabled?: boolean;
  }>) => React.createElement('button', { onClick, disabled: isDisabled }, children);

  return {
    Box,
    Button,
    Checkbox: ({
      isChecked,
      onChange,
      'aria-label': ariaLabel
    }: {
      isChecked?: boolean;
      onChange?: React.ChangeEventHandler<HTMLInputElement>;
      'aria-label'?: string;
    }) =>
      React.createElement('input', {
        type: 'checkbox',
        checked: isChecked,
        onChange,
        'aria-label': ariaLabel
      }),
    Flex: Box,
    Spinner: () => null,
    Switch: () => null,
    Table: asTag('table'),
    Tbody: asTag('tbody'),
    Td: asTag('td'),
    Th: asTag('th'),
    Thead: asTag('thead'),
    Tooltip: Box,
    Tr: asTag('tr')
  };
});

vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Input/SearchInput', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Tag', () => ({
  default: ({ children }: React.PropsWithChildren) => React.createElement('span', null, children)
}));
vi.mock('@fastgpt/web/components/common/TagFilter', () => ({ SingleSelectFilter: () => null }));
vi.mock('@fastgpt/web/components/common/FixedTable', () => {
  type LayoutOptions = { headerTableWidth: string };
  type LayoutProps = {
    bodyRef?: React.Ref<HTMLDivElement>;
    renderHeader?: (options: LayoutOptions) => React.ReactNode;
    renderBody: (options: LayoutOptions) => React.ReactNode;
  };

  const FixedTableLayout = ({ bodyRef, renderHeader, renderBody }: LayoutProps) => {
    const options = { headerTableWidth: '100%' };
    return React.createElement(
      'div',
      null,
      renderHeader?.(options),
      React.createElement(
        'div',
        { ref: bodyRef, 'data-testid': 'virtual-list' },
        renderBody(options)
      )
    );
  };

  return { FixedTableLayout };
});
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/pageComponents/model/ModelChannelModal', () => {
  const MockModelChannelSelector = ({ onChange }: { onChange: (channelIds: number[]) => void }) =>
    React.createElement('button', { onClick: () => onChange([1]) }, 'choose channel');
  MockModelChannelSelector.displayName = 'MockModelChannelSelector';
  return { ModelChannelSelector: MockModelChannelSelector };
});
vi.mock('@/pageComponents/model/ImportModelFromChannelModal/StepModal', () => ({
  default: ({
    isOpen,
    children,
    footer
  }: React.PropsWithChildren<{
    isOpen: boolean;
    footer?: React.ReactNode;
  }>) => {
    const shouldDefer = apiMocks.deferResultModalMount;
    const [bodyMounted, setBodyMounted] = React.useState(!shouldDefer);

    React.useEffect(() => {
      if (!shouldDefer) return;
      // Modal portals can mount their body after the parent step's first layout effect.
      setBodyMounted(true);
    }, [shouldDefer]);

    return isOpen && bodyMounted ? React.createElement('section', null, children, footer) : null;
  }
}));
vi.mock('@/web/core/ai/model/api', () => apiMocks);

let dom: JSDOM;
let host: HTMLDivElement;
let root: import('react-dom/client').Root;
let createRoot: typeof import('react-dom/client').createRoot;
let ImportResultsStep: typeof import('@/pageComponents/model/ImportModelFromChannelModal/ImportResultsStep').default;
let ImportModelFromChannelModal: typeof import('@/pageComponents/model/ImportModelFromChannelModal').default;

beforeAll(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  for (const key of [
    'window',
    'document',
    'Element',
    'Node',
    'HTMLElement',
    'HTMLInputElement',
    'FileList',
    'Blob',
    'Event',
    'FocusEvent',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ] as const) {
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('React', React);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {}
  }));
  ({ createRoot } = await import('react-dom/client'));
  ({ default: ImportResultsStep } =
    await import('@/pageComponents/model/ImportModelFromChannelModal/ImportResultsStep'));
  ({ default: ImportModelFromChannelModal } =
    await import('@/pageComponents/model/ImportModelFromChannelModal'));
});

afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.deferResultModalMount = false;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const flush = async () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

describe('ImportModelFromChannelModal', () => {
  it('remounts and refreshes the preview after returning from results', async () => {
    const installedModel = {
      modelId: 'installed-model-id',
      model: 'installed-model',
      name: 'Installed model',
      provider: 'openai',
      type: ModelTypeEnum.llm,
      scope: ModelScopeEnum.system,
      isActive: true
    } as ModelConfigListItem;
    apiMocks.getImportPreviewFromChannel.mockResolvedValue({
      items: Array.from({ length: 120 }, (_, index) => ({
        providerModelSlug: `upstream-model-${index}`,
        candidates: [{ category: 'associated', modelId: installedModel.modelId }]
      }))
    });
    apiMocks.getModelTemplates.mockResolvedValue({ models: [] });

    const props = {
      channels: [],
      installedModels: [installedModel],
      providers: [],
      createModelData: () => installedModel as AIModelDocumentDataType,
      onSuccess: vi.fn(async () => undefined),
      onClose: vi.fn()
    };
    const getButton = (text: string) =>
      [...host.querySelectorAll('button')].find((button) => button.textContent === text)!;
    const renderModal = async () => {
      await act(async () => {
        root.render(React.createElement(ImportModelFromChannelModal, props));
        await flush();
      });
    };

    await renderModal();
    await act(async () => getButton('choose channel').click());
    await act(async () => {
      getButton('config_model:next_step').click();
      await flush();
    });

    expect(apiMocks.getImportPreviewFromChannel).toHaveBeenCalledOnce();
    const scrollContainer = host.querySelector<HTMLDivElement>('[data-testid="virtual-list"]')!;
    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 64 });
    expect(host.textContent).toContain('upstream-model-0');

    const firstRowCheckbox = host.querySelector<HTMLInputElement>(
      'input[aria-label="config_model:channel_import_model upstream-model-0"]'
    )!;
    await act(async () => firstRowCheckbox.click());
    await act(async () => {
      scrollContainer.scrollTop = 92 * 64.5;
      scrollContainer.dispatchEvent(new Event('scroll'));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    });
    expect(host.textContent).not.toContain('upstream-model-0');

    await act(async () => {
      getButton('config_model:next_step').click();
      await flush();
    });
    await act(async () => {
      getButton('config_model:previous_step').click();
      await flush();
    });

    expect(apiMocks.getImportPreviewFromChannel).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('upstream-model-0');
  });
});

describe('ImportResultsStep', () => {
  it('renders the initial row when modal content mounts after the parent layout effect', async () => {
    apiMocks.deferResultModalMount = true;
    const providerModelSlug = 'upstream-model';
    const plan: ChannelImportPlan = {
      rows: [
        {
          providerModelSlug,
          category: 'template',
          operation: {
            action: 'create',
            providerModelSlug,
            modelData: {} as AIModelDocumentDataType,
            isActive: true
          }
        }
      ]
    };

    await act(async () => {
      root.render(
        React.createElement(ImportResultsStep, {
          channelId: 1,
          plan,
          onClose: vi.fn(),
          onPrevious: vi.fn(),
          onSuccess: vi.fn(async () => undefined)
        })
      );
      await flush();
    });

    expect(host.textContent).toContain(providerModelSlug);
  });

  it.each([
    ['create', true],
    ['associate', false]
  ] as const)(
    'refreshes after a failed %s with a returned model ID only when it created the model',
    async (action, shouldRefresh) => {
      const providerModelSlug = 'upstream-model';
      const operation =
        action === 'create'
          ? {
              action,
              providerModelSlug,
              modelData: {} as AIModelDocumentDataType,
              isActive: true
            }
          : { action, providerModelSlug, modelId: 'installed-model-id', isActive: true };
      const plan: ChannelImportPlan = {
        rows: [{ providerModelSlug, category: 'template', operation }]
      };
      const onSuccess = vi.fn(async () => undefined);
      apiMocks.postApplyChannelImportChanges.mockResolvedValue({
        results: [
          {
            action,
            status: 'failed',
            providerModelSlug,
            modelId: 'persisted-model-id',
            error: 'Channel binding failed'
          }
        ]
      });

      await act(async () => {
        root.render(
          React.createElement(ImportResultsStep, {
            channelId: 1,
            plan,
            onClose: vi.fn(),
            onPrevious: vi.fn(),
            onSuccess
          })
        );
      });

      const applyButton = [...host.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('config_model:channel_import_apply')
      )!;

      await act(async () => {
        applyButton.click();
        await flush();
      });

      expect(apiMocks.postApplyChannelImportChanges).toHaveBeenCalledOnce();
      expect(onSuccess).toHaveBeenCalledTimes(shouldRefresh ? 1 : 0);
      expect(host.textContent).toContain('config_model:channel_import_result_failed');
    }
  );
});
