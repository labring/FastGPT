import React, { act, useEffect, useState } from 'react';
import { JSDOM } from 'jsdom';
import type { Root } from 'react-dom/client';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDomainConfig, updateDomainConfigApi } from '@/web/common/system/useDomainConfig';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: vi.fn(),
  clientInitData: vi.fn().mockResolvedValue({ feConfigs: {} }),
  subPlans: undefined as Record<string, unknown> | undefined
}));
vi.mock('@/web/common/api/request', () => ({ GET: mocks.get, POST: mocks.post }));
vi.mock('@/web/common/system/staticData', () => ({
  clientInitData: mocks.clientInitData
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: Object.assign(() => ({ feConfigs: { isProService: false } }), {
    getState: () => ({ subPlans: mocks.subPlans })
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('useDomainConfig', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  let config: ReturnType<typeof useDomainConfig<'site'>>;
  let providerConfig: ReturnType<typeof useDomainConfig<'providers'>>;
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

  /** 密钥只存在于本地草稿；真实 hook 发布新快照后清除草稿，状态从字段内标记读取。 */
  const ProviderForm = () => {
    const current = useDomainConfig('providers');
    providerConfig = current;
    const [draft, setDraft] = useState('');
    edit = setDraft;
    useEffect(() => setDraft(''), [current.effectiveConfig]);
    return React.createElement('input', { value: draft, readOnly: true });
  };

  const providerSnapshot = (revision: number, configured = true, price = 0) => ({
    domain: 'providers',
    revision,
    overrides: {
      documentParse: {
        customPdf: {
          url: 'https://pdf.example.com',
          ...(configured ? { key: { isSecret: true } } : {}),
          ...(price ? { price } : {})
        }
      }
    },
    effectiveConfig: {
      documentParse: {
        customPdf: {
          url: 'https://pdf.example.com',
          key: configured ? { isSecret: true } : '',
          price
        }
      }
    }
  });

  const render = async (Component: React.ComponentType = Form) => {
    await act(async () => {
      root.render(
        React.createElement(QueryClientProvider, { client }, React.createElement(Component))
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(Component === Form ? config.isLoading : providerConfig.isLoading).toBe(false);
  };

  beforeEach(async () => {
    // 共享 setup 先在 Node 环境加载服务端 ENV，再为当前用例安装 DOM。
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { createRoot } = await import('react-dom/client');
    vi.clearAllMocks();
    mocks.subPlans = undefined;
    mocks.clientInitData.mockResolvedValue({ feConfigs: {} });
    mocks.get.mockResolvedValue({
      revision: 3,
      overrides: { name: 'Original' },
      effectiveConfig: { name: 'Original' }
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
    dom.window.close();
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
      effectiveConfig: { name: 'Changed elsewhere' }
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
      effectiveConfig: { name: 'Latest' }
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

  it('keeps empty fallback object references stable across re-renders before data loads', async () => {
    mocks.get.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Form)));
    });
    const firstEffective = config.effectiveConfig;
    const firstOverrides = config.overrides;
    await act(async () => {
      root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Form)));
    });
    expect(config.effectiveConfig).toBe(firstEffective);
    expect(config.overrides).toBe(firstOverrides);
  });

  it('publishes a new form snapshot when a secret-only save advances the revision', async () => {
    mocks.get.mockResolvedValue(providerSnapshot(3));
    await render(ProviderForm);
    const previousSnapshot = providerConfig.effectiveConfig;
    await act(async () => edit('Local plaintext draft'));
    mocks.post.mockResolvedValue({ results: [] });
    // 密钥替换后标记仍为 true；revision 必须让只含公开字段的表单快照更新。
    mocks.get.mockResolvedValue(providerSnapshot(4));

    await act(async () => {
      await providerConfig.patchConfig({
        documentParse: { customPdf: { key: 'synthetic-secret' } }
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.post.mock.calls[0][1].items[0]).toMatchObject({
      domain: 'providers',
      expectedRevision: 3,
      overrides: { documentParse: { customPdf: { key: 'synthetic-secret' } } }
    });
    expect(providerConfig.effectiveConfig.documentParse.customPdf.url).toBe(
      previousSnapshot.documentParse.customPdf.url
    );
    expect(providerConfig.effectiveConfig).toEqual(previousSnapshot);
    expect(providerConfig.effectiveConfig).not.toHaveProperty('documentParse.customPdf.key');
    expect(providerConfig.isSecretConfigured('documentParse.customPdf.key')).toBe(true);
    expect(providerConfig.effectiveConfig).not.toBe(previousSnapshot);
    expect(container.querySelector('input')?.value).toBe('');

    const savedSnapshot = providerConfig.effectiveConfig;
    await act(async () => edit('New unsaved plaintext draft'));
    await act(async () => {
      await providerConfig.refetch();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(providerConfig.effectiveConfig).toBe(savedSnapshot);
    expect(container.querySelector('input')?.value).toBe('New unsaved plaintext draft');
  });

  it('round-trips a configured marker but lets explicit clear and replacement override it', async () => {
    mocks.get.mockResolvedValue(providerSnapshot(3));
    mocks.post.mockResolvedValue({ results: [] });
    await render(ProviderForm);
    expect(providerConfig.isSecretConfigured('documentParse.customPdf.key')).toBe(true);
    expect(providerConfig.effectiveConfig).not.toHaveProperty('documentParse.customPdf.key');

    mocks.get.mockResolvedValue(providerSnapshot(4, true, 2));
    await act(async () => {
      await providerConfig.patchConfig({ documentParse: { customPdf: { price: 2 } } });
    });
    expect(mocks.post.mock.calls[0][1].items[0]).toEqual({
      domain: 'providers',
      expectedRevision: 3,
      overrides: {
        documentParse: {
          customPdf: { url: 'https://pdf.example.com', key: { isSecret: true }, price: 2 }
        }
      }
    });

    mocks.get.mockResolvedValue(providerSnapshot(5, true, 2));
    await act(async () => {
      await providerConfig.patchConfig({
        documentParse: { customPdf: { key: 'synthetic-replacement' } }
      });
    });
    expect(mocks.post.mock.calls[1][1].items[0]).toEqual({
      domain: 'providers',
      expectedRevision: 4,
      overrides: {
        documentParse: {
          customPdf: { url: 'https://pdf.example.com', key: 'synthetic-replacement', price: 2 }
        }
      }
    });
    expect(providerConfig.isSecretConfigured('documentParse.customPdf.key')).toBe(true);

    mocks.get.mockResolvedValue(providerSnapshot(6, false, 2));
    await act(async () => {
      await providerConfig.patchConfig({ documentParse: { customPdf: { key: '' } } });
    });
    expect(mocks.post.mock.calls[2][1].items[0]).toEqual({
      domain: 'providers',
      expectedRevision: 5,
      overrides: {
        documentParse: { customPdf: { url: 'https://pdf.example.com', key: '', price: 2 } }
      }
    });
    expect(providerConfig.isSecretConfigured('documentParse.customPdf.key')).toBe(false);
    expect(providerConfig.effectiveConfig).not.toHaveProperty('documentParse.customPdf.key');
  });

  it('triggers clientInitData after successful save and passes includeSubPlans when subPlans are updated or cached', async () => {
    mocks.post.mockResolvedValue({ results: [] });

    await updateDomainConfigApi({
      items: [{ domain: 'site', expectedRevision: 1, overrides: { name: 'Updated' } }]
    });
    expect(mocks.clientInitData).toHaveBeenLastCalledWith({ retry: 0 });

    await updateDomainConfigApi({
      items: [{ domain: 'commercial', expectedRevision: 1, overrides: {} }],
      subPlans: {},
      subPlansExpectedRevision: 1
    });
    expect(mocks.clientInitData).toHaveBeenLastCalledWith({ retry: 0, includeSubPlans: true });

    mocks.subPlans = { standard: {} };
    await updateDomainConfigApi({
      items: [{ domain: 'site', expectedRevision: 2, overrides: { name: 'Updated 2' } }]
    });
    expect(mocks.clientInitData).toHaveBeenLastCalledWith({ retry: 0, includeSubPlans: true });

    mocks.clientInitData.mockClear();
    mocks.post.mockRejectedValueOnce(new Error('Save failed'));
    await expect(
      updateDomainConfigApi({
        items: [{ domain: 'site', expectedRevision: 2, overrides: { name: 'Fail' } }]
      })
    ).rejects.toThrow('Save failed');
    expect(mocks.clientInitData).not.toHaveBeenCalled();
  });
});
