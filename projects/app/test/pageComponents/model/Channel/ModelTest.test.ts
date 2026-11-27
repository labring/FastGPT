import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  testModel: vi.fn(),
  availableModels: [] as { modelId: string; model: string; name: string; provider: string }[],
  loadingModels: false,
  toast: vi.fn(),
  getModelProvider: vi.fn(() => ({ avatar: 'model/openai' }))
}));

vi.mock('@/web/core/ai/model/api', () => ({
  testModel: mocks.testModel
}));
vi.mock('@/web/core/ai/model/useModelConfig', () => ({
  useModelConfig: () => ({
    models: mocks.availableModels,
    loading: mocks.loadingModels,
    getModelProvider: mocks.getModelProvider
  })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (fn: (...args: any[]) => Promise<unknown>) => {
    const [loading, setLoading] = React.useState(false);
    const fnRef = React.useRef(fn);
    React.useEffect(() => {
      fnRef.current = fn;
    }, [fn]);
    const runAsync = React.useCallback(async (...args: any[]) => {
      setLoading(true);
      try {
        return await fnRef.current(...args);
      } finally {
        setLoading(false);
      }
    }, []);
    const run = React.useCallback(
      (...args: any[]) => {
        void runAsync(...args).catch(() => {});
      },
      [runAsync]
    );
    return { run, runAsync, loading };
  }
}));
vi.mock('@chakra-ui/react', () => ({
  Table: ({ children }: React.PropsWithChildren) => React.createElement('table', null, children),
  Thead: ({ children }: React.PropsWithChildren) => React.createElement('thead', null, children),
  Tbody: ({ children }: React.PropsWithChildren) => React.createElement('tbody', null, children),
  Tr: ({ children }: React.PropsWithChildren) => React.createElement('tr', null, children),
  Th: ({ children }: React.PropsWithChildren) => React.createElement('th', null, children),
  Td: ({ children }: React.PropsWithChildren) => React.createElement('td', null, children),
  Box: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Flex: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  HStack: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Button: ({
    children,
    onClick,
    isLoading
  }: React.PropsWithChildren<{ onClick?: () => void; isLoading?: boolean }>) =>
    React.createElement('button', { 'data-loading': String(Boolean(isLoading)), onClick }, children)
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({
  default: ({ src }: { src?: string }) => React.createElement('img', { src })
}));
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({
  default: ({ onClick }: { onClick?: () => void }) =>
    React.createElement('button', { 'data-testid': 'single-test', onClick }, 'single')
}));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({
  default: () => null
}));
vi.mock('@fastgpt/web/components/common/Tag/index', () => ({
  default: ({ children }: React.PropsWithChildren) => React.createElement('span', null, children)
}));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableLayout: ({
    renderHeader,
    renderBody
  }: {
    renderHeader: (ctx: { headerTableWidth: string }) => React.ReactNode;
    renderBody: () => React.ReactNode;
  }) => React.createElement('div', null, renderHeader({ headerTableWidth: '100%' }), renderBody())
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) =>
    React.createElement('div', null, children, React.createElement('div', null, footer))
}));

import ModelTest from '@/pageComponents/model/Channel/ModelTest';

describe('Channel ModelTest auto-start', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.testModel.mockResolvedValue(undefined);
    mocks.loadingModels = false;
    mocks.availableModels = [
      { modelId: 'id-1', model: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
      { modelId: 'id-2', model: 'qwen-plus', name: 'Qwen Plus', provider: 'Aliyun' }
    ];

    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const renderModal = async (models: string[], modelMapping?: Record<string, string>) => {
    await act(async () => {
      root.render(
        React.createElement(ModelTest, {
          channelId: 12,
          models,
          modelMapping,
          channelType: 'system',
          onClose: vi.fn()
        })
      );
    });
  };

  it('automatically starts testing once models are ready, renders model ID and configured channel mapping verbatim, and allows manual re-test', async () => {
    const modelMapping = { 'gpt-4o': 'gpt-4o-upstream ' };
    mocks.loadingModels = true;
    await renderModal(['gpt-4o', 'qwen-plus'], modelMapping);
    expect(mocks.testModel).not.toHaveBeenCalled();

    mocks.loadingModels = false;
    await renderModal(['gpt-4o', 'qwen-plus'], modelMapping);
    expect(mocks.testModel).toHaveBeenCalledTimes(2);
    expect(mocks.testModel).toHaveBeenNthCalledWith(1, {
      modelId: 'id-1',
      channelId: 12,
      channelType: 'system'
    });
    expect(mocks.testModel).toHaveBeenNthCalledWith(2, {
      modelId: 'id-2',
      channelId: 12,
      channelType: 'system'
    });

    const headers = [...container.querySelectorAll('th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      'config_model:model.model_id',
      'config_model:channel_configured_mapping',
      'config_model:channel_status',
      ''
    ]);
    const bodyRows = [...container.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].slice(0, 2).map((td) => td.textContent)
    );
    expect(bodyRows).toEqual([
      ['gpt-4o', 'gpt-4o-upstream '],
      ['qwen-plus', 'qwen-plus']
    ]);

    // 重渲染不会重复触发自动测试。
    await renderModal(['gpt-4o', 'qwen-plus'], modelMapping);
    expect(mocks.testModel).toHaveBeenCalledTimes(2);

    // 点击底部按钮仍可手动重新批量测试。
    const startBtn = [...container.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('config_model:start_test')
    );
    await act(async () => {
      startBtn?.click();
    });
    expect(mocks.testModel).toHaveBeenCalledTimes(4);
  });

  it('skips auto-testing when the channel has no matched models', async () => {
    await renderModal([]);
    expect(mocks.testModel).not.toHaveBeenCalled();
  });
});
