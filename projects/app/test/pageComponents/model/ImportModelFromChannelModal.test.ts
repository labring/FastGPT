import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { ModelConfigListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelImportPlan } from '@/pageComponents/model/ImportModelFromChannelModal/types';

const apiMocks = vi.hoisted(() => ({
  getImportPreviewFromChannel: vi.fn(),
  getModelTemplates: vi.fn(),
  postApplyChannelImportChanges: vi.fn(),
  testModelChannel: vi.fn(),
  toast: vi.fn()
}));

vi.mock('@chakra-ui/react', () => {
  const asTag = (tag: string) => {
    const MockTag = ({
      children,
      display,
      onClick
    }: React.PropsWithChildren<{
      display?: string;
      onClick?: React.MouseEventHandler;
    }>) => React.createElement(tag, { hidden: display === 'none', onClick }, children);
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

  const Checkbox = ({
    isChecked,
    isDisabled,
    onChange,
    'aria-label': ariaLabel
  }: {
    isChecked?: boolean;
    isDisabled?: boolean;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    'aria-label'?: string;
  }) =>
    React.createElement('input', {
      type: 'checkbox',
      checked: isChecked,
      disabled: isDisabled,
      onChange,
      'aria-label': ariaLabel
    });

  return {
    Box,
    Button,
    Checkbox,
    Flex: Box,
    Spinner: () => null,
    Switch: Checkbox,
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
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({
  default: ({
    onClick,
    'aria-label': ariaLabel,
    'aria-disabled': disabled
  }: Pick<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'onClick' | 'aria-label' | 'aria-disabled'
  >) =>
    React.createElement('button', { onClick, 'aria-label': ariaLabel, disabled: disabled === true })
}));
vi.mock('@fastgpt/web/components/common/Input/SearchInput', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: ({
    isDisabled,
    'aria-label': ariaLabel
  }: {
    isDisabled?: boolean;
    'aria-label'?: string;
  }) => React.createElement('select', { disabled: isDisabled, 'aria-label': ariaLabel })
}));
vi.mock('@fastgpt/web/components/common/MySelect/MultipleRowSelect', () => ({
  default: () => null
}));
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
  useSafeTranslation: () => ({
    t: (key: string, options?: { count: number }) => (options ? `${key}: ${options.count}` : key)
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: apiMocks.toast })
}));
vi.mock('@/pageComponents/model/ModelChannelModal', () => {
  const MockModelChannelSelector = ({ onChange }: { onChange: (channelIds: number[]) => void }) =>
    React.createElement('button', { onClick: () => onChange([1]) }, 'choose channel');
  MockModelChannelSelector.displayName = 'MockModelChannelSelector';
  return { ModelChannelSelector: MockModelChannelSelector };
});
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children, title }: React.PropsWithChildren<{ title: React.ReactNode }>) =>
    React.createElement('section', { role: 'dialog' }, title, children)
}));
vi.mock('@/web/core/ai/model/api', () => apiMocks);
vi.mock('@/pageComponents/model/useModelChannelTest', () => ({
  useModelChannelTest: () => ({
    testingChannelIds: new Set<number>(),
    testModelChannel: apiMocks.testModelChannel
  })
}));

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
  it.each([
    {
      title: 'shows an unsupported message with a back action',
      error: {
        message: 'model catalog is unsupported',
        statusText: ModelErrEnum.channelCatalogUnsupported
      },
      messageKey: 'config_model:channel_import_unsupported',
      buttonKey: 'common:back'
    },
    {
      title: 'keeps other load errors retryable',
      error: { message: 'upstream unavailable', status: 502 },
      messageKey: 'upstream unavailable',
      buttonKey: 'config_model:channel_import_retry'
    }
  ])('$title', async ({ error, messageKey, buttonKey }) => {
    apiMocks.getImportPreviewFromChannel.mockRejectedValue(error);
    const onClose = vi.fn();
    const props = {
      channels: [],
      installedModels: [],
      providers: [],
      createModelData: () => ({}) as AIModelDocumentDataType,
      onSuccess: vi.fn(async () => undefined),
      onClose
    };
    const getButton = (text: string) =>
      [...host.querySelectorAll('button')].find(
        (button) => button.textContent === text && !button.closest('[hidden]')
      )!;

    await act(async () => {
      root.render(React.createElement(ImportModelFromChannelModal, props));
      await flush();
    });
    await act(async () => getButton('choose channel').click());
    await act(async () => {
      getButton('config_model:next_step').click();
      await flush();
    });

    expect(host.textContent).toContain(messageKey);
    expect(getButton(buttonKey)).not.toBeUndefined();
  });

  it('retains selections across steps and closes with a toast after successful import', async () => {
    const installedModel = {
      modelId: 'installed-model-id',
      model: 'installed-model',
      name: 'Installed model',
      provider: 'openai',
      type: ModelTypeEnum.llm,
      scope: ModelScopeEnum.system,
      isActive: false
    } as ModelConfigListItem;
    const template: AIModelDocumentDataType = {
      model: 'preset',
      name: 'Preset',
      provider: 'openai',
      scope: ModelScopeEnum.system,
      type: ModelTypeEnum.llm,
      config: { maxContext: 1000, maxResponse: 100, quoteMaxToken: 800 }
    };
    apiMocks.getImportPreviewFromChannel.mockResolvedValue({
      items: [
        {
          providerModelSlug: installedModel.model,
          candidates: [
            {
              category: 'template',
              template: { type: ModelTypeEnum.llm, model: 'preset' },
              modelData: template
            }
          ]
        },
        ...Array.from({ length: 120 }, (_, index) => ({
          providerModelSlug: `upstream-model-${index}`,
          candidates: [
            {
              category: 'template',
              template: { type: ModelTypeEnum.llm, model: 'preset' },
              modelData: template
            }
          ]
        }))
      ]
    });
    apiMocks.getModelTemplates.mockResolvedValue({ models: [] });

    const props = {
      channels: [
        {
          id: 1,
          name: 'System channel',
          status: 1,
          protocol: { name: { en: 'OpenAI', 'zh-CN': 'OpenAI' }, avatar: 'model/openai' }
        }
      ],
      installedModels: [installedModel],
      providers: [],
      createModelData: () => template,
      onSuccess: vi.fn(() => new Promise<void>(() => {})),
      onClose: vi.fn(() => root.render(null))
    };
    const getButton = (text: string) =>
      [...host.querySelectorAll('button')].find(
        (button) => button.textContent === text && !button.closest('[hidden]')
      )!;
    const renderModal = async () => {
      await act(async () => {
        root.render(React.createElement(ImportModelFromChannelModal, props));
        await flush();
      });
    };

    await renderModal();
    const modal = host.querySelector('[role="dialog"]');
    expect(modal?.textContent).toContain('config_model:channel_import_import_step');
    expect(modal?.textContent).not.toContain('common:Cancel');
    await act(async () => getButton('choose channel').click());
    await act(async () => {
      getButton('config_model:next_step').click();
      await flush();
    });

    expect(host.querySelector('[role="dialog"]')).toBe(modal);
    expect(host.textContent).toContain('config_model:channel_import_new_models_only');
    expect(host.textContent).not.toContain('installed-model');
    const scrollContainer = host.querySelector<HTMLDivElement>('[data-testid="virtual-list"]')!;
    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 64 });

    const firstRowCheckbox = host.querySelector<HTMLInputElement>(
      'input[aria-label="config_model:channel_import_model upstream-model-0"]'
    )!;
    const row = firstRowCheckbox.closest('tr')!;
    const testButton = row.querySelector<HTMLButtonElement>(
      'button[aria-label="config_model:model.test_model"]'
    )!;
    await act(async () => row.cells[1].click());
    expect(firstRowCheckbox.checked).toBe(true);
    expect(host.textContent).toContain('config_model:channel_import_selected_count: 1');
    await act(async () => {
      row
        .querySelector<HTMLInputElement>('input[aria-label^="config_model:model.active"]')
        ?.click();
      testButton.click();
    });
    expect(apiMocks.testModelChannel).toHaveBeenCalledExactlyOnceWith(1);
    expect(firstRowCheckbox.checked).toBe(true);
    await act(async () => firstRowCheckbox.click());
    expect(firstRowCheckbox.checked).toBe(false);
    await act(async () => row.cells[1].click());

    await act(async () => {
      scrollContainer.scrollTop = 92 * 64.5;
      scrollContainer.dispatchEvent(new Event('scroll'));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    });
    expect(scrollContainer.textContent).not.toContain('upstream-model-0');

    await act(async () => getButton('config_model:next_step').click());
    expect(host.querySelector('[role="dialog"]')).toBe(modal);
    expect(getButton('common:Confirm')).toBeDefined();
    await act(async () => getButton('config_model:previous_step').click());
    expect(apiMocks.getImportPreviewFromChannel).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('config_model:channel_import_selected_count: 1');

    apiMocks.postApplyChannelImportChanges.mockResolvedValueOnce({
      results: [
        {
          providerModelSlug: 'upstream-model-0',
          action: 'create',
          status: 'success',
          modelId: 'created'
        }
      ]
    });
    await act(async () => getButton('config_model:next_step').click());
    await act(async () => getButton('common:Confirm').click());
    expect(apiMocks.postApplyChannelImportChanges).toHaveBeenCalledWith({
      channelId: 1,
      channelType: 'system',
      operations: [
        {
          action: 'create',
          providerModelSlug: 'upstream-model-0',
          modelData: { ...template, model: 'upstream-model-0' },
          isActive: false
        }
      ]
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(props.onSuccess).toHaveBeenCalledOnce();
    expect(apiMocks.toast).toHaveBeenCalledExactlyOnceWith({
      status: 'success',
      title: 'common:import_success'
    });
  });
});

describe('ImportResultsStep', () => {
  it('renders the initial result row on mount', async () => {
    const providerModelSlug = 'upstream-model';
    const plan: ChannelImportPlan = {
      rows: [
        {
          providerModelSlug,
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
          onSubmittingChange: vi.fn(),
          onPrevious: vi.fn(),
          onRefresh: vi.fn(async () => undefined),
          onImportSuccess: vi.fn()
        })
      );
      await flush();
    });

    expect(host.textContent).toContain(providerModelSlug);
  });

  it.each([undefined, 'persisted-model-id'])(
    'refreshes after a failed import when a model was created (%s)',
    async (modelId) => {
      const providerModelSlug = 'upstream-model';
      const plan: ChannelImportPlan = {
        rows: [
          {
            providerModelSlug,
            operation: {
              action: 'create',
              providerModelSlug,
              modelData: {} as AIModelDocumentDataType,
              isActive: true
            }
          }
        ]
      };
      const onRefresh = vi.fn(async () => undefined);
      apiMocks.postApplyChannelImportChanges.mockResolvedValue({
        results: [
          {
            action: 'create',
            status: 'failed',
            providerModelSlug,
            modelId,
            error: 'Channel binding failed'
          }
        ]
      });
      await act(async () => {
        root.render(
          React.createElement(ImportResultsStep, {
            channelId: 1,
            plan,
            onSubmittingChange: vi.fn(),
            onPrevious: vi.fn(),
            onRefresh,
            onImportSuccess: vi.fn()
          })
        );
      });
      const applyButton = [...host.querySelectorAll('button')].find(
        (button) => button.textContent === 'common:Confirm'
      )!;
      await act(async () => applyButton.click());

      expect(onRefresh).toHaveBeenCalledTimes(modelId ? 1 : 0);
      expect(host.textContent).toContain('config_model:channel_import_result_failed');
      expect(host.textContent).toContain('Channel binding failed');
    }
  );

  it.each([
    {
      error: undefined,
      response: {
        results: [
          {
            action: 'create',
            status: 'success',
            providerModelSlug: 'second-model',
            modelId: 'created'
          }
        ]
      },
      expected: [
        'config_model:channel_import_result_unknown',
        'config_model:channel_import_result_success'
      ]
    },
    {
      error: new Error('ECONNRESET'),
      response: undefined,
      expected: ['config_model:channel_import_result_unknown', 'ECONNRESET']
    },
    {
      error: undefined,
      response: {
        results: [
          {
            action: 'create',
            status: 'failed',
            providerModelSlug: 'upstream-model',
            error: ModelErrEnum.channelModelMappingConflict
          },
          {
            action: 'create',
            status: 'success',
            providerModelSlug: 'second-model',
            modelId: 'created'
          }
        ]
      },
      expected: [
        'config_model:channel_import_result_failed',
        'config_model:channel_import_mapping_conflict'
      ]
    }
  ])(
    'keeps the results open when some outcomes fail or are unknown',
    async ({ error, response, expected }) => {
      const plan: ChannelImportPlan = {
        rows: ['upstream-model', 'second-model'].map((providerModelSlug) => ({
          providerModelSlug,
          operation: {
            action: 'create',
            providerModelSlug,
            isActive: true,
            modelData: {} as AIModelDocumentDataType
          }
        }))
      };
      const onImportSuccess = vi.fn();
      if (error) apiMocks.postApplyChannelImportChanges.mockRejectedValueOnce(error);
      else apiMocks.postApplyChannelImportChanges.mockResolvedValueOnce(response);

      await act(async () =>
        root.render(
          React.createElement(ImportResultsStep, {
            channelId: 1,
            plan,
            onSubmittingChange: vi.fn(),
            onPrevious: vi.fn(),
            onRefresh: vi.fn(async () => undefined),
            onImportSuccess
          })
        )
      );
      const button = [...host.querySelectorAll('button')].find(
        (button) => button.textContent === 'common:Confirm'
      );
      await act(async () => button?.click());

      expect(apiMocks.postApplyChannelImportChanges).toHaveBeenCalledOnce();
      expect(onImportSuccess).not.toHaveBeenCalled();
      for (const text of expected) expect(host.textContent).toContain(text);
    }
  );
});
