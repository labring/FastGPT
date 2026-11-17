import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  save: vi.fn(),
  testWebhook: vi.fn(),
  secretProps: undefined as
    | { value: string; isConfigured: boolean; onChange: (value: string) => void }
    | undefined
}));

vi.mock('@/web/core/ai/model/statusApi', () => ({
  getModelStatus: mocks.getStatus,
  postModelStatusProbe: vi.fn(),
  putModelStatusProbeConfig: mocks.save,
  postTestModelStatusWebhook: mocks.testWebhook
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: (...args: any[]) => unknown) => ({
    data:
      request === mocks.getStatus
        ? {
            config: {
              enabled: false,
              intervalMinutes: 5,
              webhookUrl: 'https://example.com/hook',
              webhookTokenConfigured: true
            },
            models: []
          }
        : undefined,
    loading: false,
    runAsync: request
  })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: any) => React.createElement('div', null, children);
  return {
    Badge: Container,
    Box: Container,
    Flex: Container,
    FormControl: Container,
    FormHelperText: Container,
    FormLabel: Container,
    Grid: Container,
    HStack: Container,
    Stack: Container,
    Text: Container,
    Button: ({ children, onClick }: any) => React.createElement('button', { onClick }, children),
    Input: ({ name, value, onChange }: any) =>
      React.createElement('input', { name, value, onChange }),
    Switch: () => null
  };
});
vi.mock('@/components/common/secret/SecretValueInput', () => ({
  default: (props: typeof mocks.secretProps) => {
    mocks.secretProps = props;
    return null;
  }
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children, footer }: any) => React.createElement('div', null, children, footer)
}));
vi.mock('@/components/core/ai/ModelTabHeader', () => ({
  default: ({ children }: any) => React.createElement('div', null, children)
}));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ children }: any) => React.createElement('div', null, children)
}));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Input/NumberInput', () => ({ default: () => null }));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({ useUserModelStore: () => () => ({}) }));

import ModelStatus from '@/pageComponents/model/ModelStatus';

describe('model status webhook secret form', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    mocks.secretProps = undefined;
    mocks.save.mockReset().mockResolvedValue({});
    mocks.testWebhook.mockReset().mockResolvedValue({ success: true });
    await act(async () => root.render(React.createElement(ModelStatus, { Tab: null })));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('preserves an untouched token and submits explicit clear or replacement for saves and tests', async () => {
    const click = async (label: string) => {
      const button = [...container.querySelectorAll('button')].find(
        (item) => item.textContent === label
      );
      expect(button).toBeDefined();
      await act(async () => button?.click());
    };
    const updateSecret = async (value: string) => {
      await act(async () => mocks.secretProps?.onChange(value));
    };

    await click('config_model:model_status_config');
    expect(mocks.secretProps).toMatchObject({ value: '', isConfigured: true });
    await click('config_model:model_status_test_webhook');
    expect(mocks.testWebhook).toHaveBeenLastCalledWith({ webhookUrl: 'https://example.com/hook' });
    await click('common:Confirm');
    expect(mocks.save).toHaveBeenLastCalledWith({
      enabled: false,
      intervalMinutes: 5,
      webhookUrl: 'https://example.com/hook',
      clearWebhookToken: false
    });

    await updateSecret('');
    expect(mocks.secretProps).toMatchObject({ value: '', isConfigured: false });
    await click('config_model:model_status_test_webhook');
    expect(mocks.testWebhook).toHaveBeenLastCalledWith({
      webhookUrl: 'https://example.com/hook',
      webhookToken: ''
    });
    await click('common:Confirm');
    expect(mocks.save).toHaveBeenLastCalledWith({
      enabled: false,
      intervalMinutes: 5,
      webhookUrl: 'https://example.com/hook',
      clearWebhookToken: true
    });

    await updateSecret('replacement-token');
    await click('config_model:model_status_test_webhook');
    expect(mocks.testWebhook).toHaveBeenLastCalledWith({
      webhookUrl: 'https://example.com/hook',
      webhookToken: 'replacement-token'
    });
    await click('common:Confirm');
    expect(mocks.save).toHaveBeenLastCalledWith({
      enabled: false,
      intervalMinutes: 5,
      webhookUrl: 'https://example.com/hook',
      webhookToken: 'replacement-token',
      clearWebhookToken: false
    });
  });
});
