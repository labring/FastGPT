// @vitest-environment jsdom

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createRequire } from 'node:module';
import { createInstance } from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientI18nGate from '@fastgpt/web/i18n/ClientI18nGate';
import { I18N_NAMESPACES } from '@fastgpt/web/i18n/constants';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { changeLanguageAtomically } from '@fastgpt/web/i18n/atomicLanguageChange';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { LocaleList } from '@fastgpt/global/common/i18n/type';
import * as languageUtils from '@fastgpt/web/i18n/utils';

const mocks = vi.hoisted(() => ({ loadBundle: vi.fn() }));
vi.mock('@fastgpt/web/i18n/resourceLoaders', () => ({
  loadLanguageBundleWithRetry: mocks.loadBundle
}));

// 与 next-i18next 使用相同的 CJS Provider，保证测试订阅的是同一个上下文。
const require = createRequire(import.meta.url);
const { I18nextProvider } = createRequire(require.resolve('next-i18next'))(
  'react-i18next'
) as typeof import('react-i18next');

describe('ClientI18nGate', () => {
  let i18n: ReturnType<typeof createInstance>;
  let root: Root;
  let container: HTMLDivElement;
  const backendRead = vi.fn();
  const mounted = vi.fn();
  const pending = new Map<
    localeType,
    {
      resolve: (resources: Record<string, Record<string, string>>) => void;
      reject: (error: Error) => void;
    }
  >();
  let storageKey: string;
  let caseNumber = 0;
  const resources = () =>
    Object.fromEntries(
      I18N_NAMESPACES.map((namespace) => [namespace, { Confirm: 'Confirm', greeting: 'Hello' }])
    );

  const Page = () => {
    const { t } = useSafeTranslation();
    useEffect(() => {
      mounted();
    }, []);
    return React.createElement('span', null, t('common:Confirm'), '|', t('app:greeting'));
  };
  const render = async () => {
    await act(async () =>
      root.render(
        React.createElement(
          I18nextProvider,
          { i18n },
          // eslint-disable-next-line react/no-children-prop
          React.createElement(ClientI18nGate, {
            defaultLanguage: 'en',
            storageKey,
            fallback: 'loading',
            children: React.createElement(Page)
          })
        )
      )
    );
  };
  const resolve = async (language: localeType) => {
    await act(async () => pending.get(language)!.resolve(resources()));
  };

  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    // web 的 Vitest 配置使用经典 JSX 转换，生产环境由 Next 自动提供 JSX runtime。
    vi.stubGlobal('React', React);
    vi.clearAllMocks();
    pending.clear();
    // Cookie 和模块内存偏好按 key 隔离，防止前一个成功事务影响后续用例。
    storageKey = `csr-gate-test-${++caseNumber}`;
    // 控制权威存储及首次访问偏好，不依赖运行测试的机器语言或 Node localStorage。
    vi.stubGlobal('navigator', { language: 'en' });
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
    mocks.loadBundle.mockImplementation(
      (language: localeType) =>
        new Promise((resolve, reject) => pending.set(language, { resolve, reject }))
    );
    backendRead.mockImplementation((_language, _namespace, callback) => callback(null, {}));
    i18n = createInstance();
    i18n.use({ type: 'backend', init() {}, read: backendRead });
    await i18n.init({
      lng: 'en',
      fallbackLng: 'zh-CN',
      supportedLngs: [...LocaleList],
      load: 'currentOnly',
      ns: [],
      defaultNS: 'common',
      partialBundledLanguages: true,
      react: { useSuspense: false }
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    // 结束尚未完成的事务，避免全局语言切换队列污染下一个测试。
    await act(async () => {
      for (const load of pending.values()) load.resolve(resources());
    });
    container.remove();
    document.cookie = `${storageKey}=; Max-Age=0; path=/`;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('等待目标语言和 fallback 全部 NS 就绪，前后均不触发单 NS 请求', async () => {
    vi.stubGlobal('navigator', undefined);
    await render();
    expect(container.textContent).toBe('loading');
    expect(mounted).not.toHaveBeenCalled();
    expect(mocks.loadBundle.mock.calls.map(([language]) => language)).toEqual(['en', 'zh-CN']);
    expect(backendRead).not.toHaveBeenCalled();

    await resolve('en');
    expect(container.textContent).toBe('loading');
    expect(mounted).not.toHaveBeenCalled();

    await resolve('zh-CN');
    expect(container.textContent).toBe('Confirm|Hello');
    expect(mounted).toHaveBeenCalledOnce();
    for (const language of ['en', 'zh-CN']) {
      expect(I18N_NAMESPACES.every((ns) => i18n.hasResourceBundle(language, ns))).toBe(true);
    }
    expect(backendRead).not.toHaveBeenCalled();
  });

  it('已有完整资源时直接放行，不再加载语言包或单 NS', async () => {
    for (const language of ['en', 'zh-CN']) {
      for (const [namespace, resource] of Object.entries(resources())) {
        i18n.addResourceBundle(language, namespace, resource);
      }
    }
    await render();
    expect(container.textContent).toBe('Confirm|Hello');
    expect(mocks.loadBundle).not.toHaveBeenCalled();
    expect(backendRead).not.toHaveBeenCalled();
  });

  it('语言包加载失败时显示错误，不挂载业务组件或单独补加载 NS', async () => {
    await render();
    await act(async () => pending.get('en')!.reject(new Error('bundle failed')));
    expect(container.querySelector('[role=alert]')?.textContent).toContain('bundle failed');
    expect(mounted).not.toHaveBeenCalled();
    expect(backendRead).not.toHaveBeenCalled();
  });

  it('普通父组件重渲染保留页面，不重新加载资源', async () => {
    await render();
    await resolve('en');
    await resolve('zh-CN');
    await render();
    expect(mounted).toHaveBeenCalledOnce();
    expect(mocks.loadBundle).toHaveBeenCalledTimes(2);
    expect(backendRead).not.toHaveBeenCalled();
  });

  it('已有资源但持久化语言失败时展示错误', async () => {
    for (const language of ['en', 'zh-CN']) {
      for (const [namespace, resource] of Object.entries(resources())) {
        i18n.addResourceBundle(language, namespace, resource);
      }
    }
    vi.spyOn(languageUtils, 'persistLanguagePreference').mockImplementation(() => {
      throw new Error('preference failed');
    });
    await render();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('preference failed');
    expect(backendRead).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])('卸载后忽略迟到的加载结果：%s', async (result) => {
    await render();
    await act(async () => root.render(null));
    await act(async () => {
      if (result === 'failure') pending.get('en')!.reject(new Error('late failure'));
      else pending.get('en')!.resolve(resources());
      pending.get('zh-CN')!.resolve(resources());
    });
    expect(container.textContent).toBe('');
    expect(mounted).not.toHaveBeenCalled();
    expect(backendRead).not.toHaveBeenCalled();
  });

  it('切换目标语言后不沿用旧语言的错误态', async () => {
    await render();
    await act(async () => pending.get('en')!.reject(new Error('old language failed')));
    localStorage.setItem(storageKey, 'ko-KR');
    await render();
    expect(container.textContent).toBe('loading');
    await resolve('ko-KR');
    await resolve('zh-CN');
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(container.textContent).toBe('Confirm|Hello');
    expect(backendRead).not.toHaveBeenCalled();
  });

  it('保留语言变化订阅，切换前加载完整 bundle 且不触发单 NS 请求', async () => {
    await render();
    await resolve('en');
    await resolve('zh-CN');
    let change: Promise<void>;
    await act(async () => {
      change = changeLanguageAtomically({ i18n, language: 'ko-KR', storageKey });
    });
    expect(container.textContent).toBe('Confirm|Hello');
    expect(i18n.language).toBe('en');
    await resolve('ko-KR');
    await act(async () => change);
    expect(i18n.language).toBe('ko-KR');
    expect(container.textContent).toBe('Confirm|Hello');
    expect(backendRead).not.toHaveBeenCalled();
  });
});
