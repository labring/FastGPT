// @vitest-environment jsdom
import React, { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: vi.fn() }));
vi.mock('@/web/common/api/request', () => ({ GET: mocks.get, POST: mocks.post }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isProService: false } })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('useDomainConfig', () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  let config: ReturnType<typeof useDomainConfig<'site'>>;
  let edit: (value: string) => void;
  let save: () => Promise<unknown>;

  /** 模拟配置页收到新快照后 reset 表单；自动 refetch 会真实覆盖此草稿。 */
  const Form = () => {
    const current = useDomainConfig('site');
    config = current;
    const [draft, setDraft] = useState('');
    edit = setDraft;
    save = () => current.patchConfig({ name: draft });
    useEffect(() => {
      if (current.effectiveConfig.name) setDraft(current.effectiveConfig.name);
    }, [current.effectiveConfig]);
    return React.createElement('input', { value: draft, readOnly: true });
  };

  const render = async () => {
    await act(async () => {
      root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Form)));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(config.isLoading).toBe(false);
  };

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({
      revision: 3,
      overrides: { name: 'Original' },
      effectiveConfig: { name: 'Original' },
      secretKeys: []
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    onlineManager.setOnline(true);
    vi.unstubAllGlobals();
  });

  it('blocks saving before the initial snapshot is loaded without a duplicate error toast', async () => {
    mocks.get.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Form)));
    });
    await act(async () => {
      await expect(config.patchConfig({ name: 'Draft' })).rejects.toThrow('not loaded yet');
    });
    expect(config.revision).toBe(0);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: 'admin:loading',
      status: 'warning'
    });
  });

  it('preserves the draft and revision on conflict, including after reconnect', async () => {
    await render();
    await act(async () => edit('Unsaved draft'));
    mocks.get.mockResolvedValue({
      revision: 4,
      overrides: { name: 'Changed elsewhere' },
      effectiveConfig: { name: 'Changed elsewhere' },
      secretKeys: []
    });
    mocks.post.mockRejectedValue(new Error('Revision conflict: current revision is 4'));

    await act(async () => {
      await expect(save()).rejects.toThrow('Revision conflict');
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(config.revision).toBe(3);
    expect(container.querySelector('input')?.value).toBe('Unsaved draft');
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: 'admin:revision_conflict_refresh_required',
      status: 'warning'
    });

    // 再次人工点击保存仍使用旧 revision，不通过“只换版本号”让旧表单覆盖别人的更新。
    await act(async () => {
      await expect(save()).rejects.toThrow('Revision conflict');
    });
    expect(mocks.post.mock.calls.map(([, body]) => body.items[0].expectedRevision)).toEqual([3, 3]);
  });

  it('loads the new revision only after an explicit refresh and refreshes after a successful save', async () => {
    await render();
    mocks.get.mockResolvedValue({
      revision: 4,
      overrides: { name: 'Latest' },
      effectiveConfig: { name: 'Latest' },
      secretKeys: []
    });
    await act(async () => {
      await config.refetch();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(config.revision).toBe(4);
    expect(container.querySelector('input')?.value).toBe('Latest');

    await act(async () => edit('Reviewed changes'));
    mocks.post.mockResolvedValue({ results: [] });
    await act(async () => {
      await save();
    });
    expect(mocks.post.mock.calls[0][1].items[0]).toMatchObject({
      expectedRevision: 4,
      overrides: { name: 'Reviewed changes' }
    });
    expect(mocks.get).toHaveBeenCalledTimes(3);
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: 'admin:settings_saved',
      status: 'success'
    });
  });
});
