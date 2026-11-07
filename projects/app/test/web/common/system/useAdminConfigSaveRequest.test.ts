import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastHandledError } from '@fastgpt/global/common/error/utils';
import { useAdminConfigSaveRequest } from '@/web/common/system/useAdminConfigSaveRequest';

const mocks = vi.hoisted(() => ({ save: vi.fn(), toast: vi.fn(), onSuccess: vi.fn() }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('useAdminConfigSaveRequest', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  let submit: ReturnType<typeof useAdminConfigSaveRequest>['runAsync'];
  const Form = () => {
    submit = useAdminConfigSaveRequest(mocks.save, {
      onSuccess: mocks.onSuccess,
      successToast: 'admin:settings_saved',
      errorToast: 'admin:failed_to_save_settings'
    }).runAsync;
    return null;
  };

  beforeEach(async () => {
    // 共享 setup 先在 Node 环境加载服务端 ENV，再为当前用例安装 DOM。
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { createRoot } = await import('react-dom/client');
    vi.clearAllMocks();
    container = document.createElement('div');
    root = createRoot(container);
    await act(async () => root.render(React.createElement(Form)));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it.each([
    new Error('Revision conflict for domain "auth"'),
    'Revision conflict for domain "commercial"'
  ])('only prompts for manual refresh on a batch conflict: %s', async (error) => {
    const payload = {
      items: [
        { domain: 'auth', expectedRevision: 2, overrides: { passwordExpiredMonth: 3 } },
        { domain: 'security', expectedRevision: 5, overrides: { maxLoginSession: 6 } }
      ],
      subPlans: { extraDatasetSizePrice: 8 }
    };
    const draft = structuredClone(payload);
    mocks.save.mockRejectedValue(error);
    await act(async () => {
      await expect(submit(payload)).rejects.toBe(error);
    });

    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(payload);
    expect(payload).toEqual(draft);
    expect(mocks.onSuccess).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: 'admin:revision_conflict_refresh_required',
      status: 'warning'
    });
  });

  it('keeps successful saves and generic error handling', async () => {
    mocks.save.mockResolvedValue('saved');
    await act(async () => {
      expect(await submit({})).toBe('saved');
    });
    expect(mocks.onSuccess).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'admin:settings_saved', status: 'success' });

    mocks.toast.mockClear();
    mocks.save.mockRejectedValue(new Error('Network unavailable'));
    await act(async () => {
      await expect(submit({})).rejects.toThrow('Network unavailable');
    });
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: 'Network unavailable',
      status: 'error'
    });
  });

  it('does not repeat a toast that the caller has already handled', async () => {
    mocks.save.mockRejectedValue(new ToastHandledError('Already shown'));
    await act(async () => {
      await expect(submit({})).rejects.toThrow('Already shown');
    });
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
