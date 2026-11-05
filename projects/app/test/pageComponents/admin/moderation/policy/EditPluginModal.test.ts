// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  toast: vi.fn(),
  changeNumber: undefined as ((value?: number | string) => void) | undefined
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ i18n: { language: 'zh-CN' } })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (
    fn: () => Promise<void>,
    options: { onError?: (error: unknown) => void; errorToast?: string }
  ) => ({
    runAsync: async () => {
      try {
        await fn();
      } catch (error) {
        options.onError?.(error);
        throw error;
      }
    },
    loading: false
  })
}));
vi.mock('@/web/core/plugin/admin/moderation/api', () => ({
  postAdminSaveModerationConfig: mocks.save
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Flex: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Text: ({ children }: React.PropsWithChildren) => React.createElement('span', null, children),
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick: () => void }>) =>
    React.createElement('button', { onClick }, children),
  Input: () => React.createElement('input', { type: 'text' }),
  Switch: () => null
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children, footer }: React.PropsWithChildren<{ footer: React.ReactNode }>) =>
    React.createElement('div', null, children, footer)
}));
vi.mock('@fastgpt/web/components/common/Input/NumberInput', () => ({
  default: ({ onChange }: { onChange: (value?: number | string) => void }) => {
    mocks.changeNumber = onChange;
    return React.createElement('input', { type: 'number' });
  }
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({ default: () => null }));
vi.mock('@/components/common/HiddenInput', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
import EditPluginModal from '@/pageComponents/admin/moderation/policy/EditPluginModal';

const plugin: AdminModerationPluginItemType = {
  pluginId: 'baidu',
  source: 'system',
  name: 'Baidu',
  provider: 'baidu',
  secretSchema: {
    type: 'object',
    properties: { strategyId: { type: 'number', title: 'Strategy ID' } }
  }
};

describe('moderation numeric configuration', () => {
  afterEach(() => vi.clearAllMocks());
  it('shows a safe failure message and keeps the configuration dialog open', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.save.mockRejectedValueOnce(
      new Error('ProviderError: private-token runtime stack /app/index.js')
    );
    const host = document.createElement('div');
    const root = createRoot(host);
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    try {
      await act(async () =>
        root.render(React.createElement(EditPluginModal, { plugin, onClose, onSuccess }))
      );
      const button = Array.from(host.querySelectorAll('button')).find(
        (item) => item.textContent === '保存'
      );
      await act(async () => button?.click());
      expect(mocks.toast).toHaveBeenCalledWith({
        status: 'error',
        title: '配置保存失败',
        description: '未能完成配置检测或保存。请检查凭据、接口地址及服务权限，稍后重试。'
      });
      expect(JSON.stringify(mocks.toast.mock.calls)).not.toContain('private-token');
      expect(onClose).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
  it.each([123123213, 0, undefined, ''])(
    'submits numeric input %s without converting it to text',
    async (value) => {
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      const host = document.createElement('div');
      const root = createRoot(host);
      try {
        await act(async () =>
          root.render(
            React.createElement(EditPluginModal, { plugin, onClose: vi.fn(), onSuccess: vi.fn() })
          )
        );
        expect(host.querySelector('input[type="number"]')).not.toBeNull();
        expect(host.querySelector('input[type="text"]')).toBeNull();
        await act(async () => mocks.changeNumber?.(value));
        const saveButton = Array.from(host.querySelectorAll('button')).find(
          (button) => button.textContent === '保存'
        );
        await act(async () => saveButton?.click());
        expect(mocks.save).toHaveBeenCalledWith({
          pluginId: 'baidu',
          secretsVal: { strategyId: typeof value === 'number' ? value : undefined }
        });
      } finally {
        await act(async () => root.unmount());
        vi.unstubAllGlobals();
      }
    }
  );
});
