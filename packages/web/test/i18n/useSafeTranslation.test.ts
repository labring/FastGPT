// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { createInstance, type ReadCallback } from 'i18next';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { I18nNsType } from '@fastgpt/web/i18n/i18next';
import accountTeamResource from '../../i18n/en/account_team.json';

// next-i18next 使用 CJS 版 react-i18next，测试 Provider 也使用同一模块，避免 ESM/CJS 上下文分离。
const require = createRequire(import.meta.url);
const { I18nextProvider } = createRequire(require.resolve('next-i18next'))(
  'react-i18next'
) as typeof import('react-i18next');

describe('useSafeTranslation', () => {
  let i18n: ReturnType<typeof createInstance>;

  beforeEach(async () => {
    i18n = createInstance();
    await i18n.init({
      lng: 'en',
      fallbackLng: false,
      defaultNS: 'common',
      ns: ['common', 'account'],
      resources: {
        en: {
          common: {},
          account: { personal_information: 'Personal information' }
        }
      },
      react: { useSuspense: false }
    });
  });

  it('读取现有 i18next 上下文', () => {
    function TestComponent() {
      const { i18n: contextI18n } = useSafeTranslation();
      expect(contextI18n).toBe(i18n);
      return null;
    }

    renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(TestComponent)));
  });

  it('完整语言包就绪后正常翻译', () => {
    function TestComponent() {
      const { t } = useSafeTranslation();
      return createElement('span', null, t('account:personal_information'));
    }

    expect(
      renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(TestComponent)))
    ).toContain('Personal information');
  });

  it('支持动态翻译 key，并对未知 namespace 或普通字符串原样返回', () => {
    function TestComponent() {
      const { t } = useSafeTranslation();
      const dynamicKey: string = 'account:personal_information';
      return createElement('span', null, `${t(dynamicKey)}|${t('09:30')}`);
    }

    expect(
      renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(TestComponent)))
    ).toContain('Personal information|09:30');
  });
});

describe('useSafeTranslation namespace loading on SSR pages', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it.each<{ namespace: I18nNsType[number] | I18nNsType }>([
    { namespace: 'account_team' },
    { namespace: ['common', 'account_team'] }
  ])(
    'loads the declared namespace $namespace when it was absent from SSR resources',
    async ({ namespace }) => {
      const i18n = createInstance();
      const read = vi.fn((_language: string, ns: string, callback: ReadCallback) => {
        callback(null, ns === 'account_team' ? accountTeamResource : {});
      });
      i18n.use({ type: 'backend', init() {}, read });
      await i18n.init({
        lng: 'en',
        fallbackLng: false,
        defaultNS: 'common',
        ns: ['common', 'price', 'file', 'app', 'chat', 'workflow', 'login', 'user'],
        partialBundledLanguages: true,
        resources: {
          en: Object.fromEntries(
            ['common', 'price', 'file', 'app', 'chat', 'workflow', 'login', 'user'].map((ns) => [
              ns,
              {}
            ])
          )
        },
        react: { useSuspense: false }
      });
      const MemberNameTitle = () => {
        const { t } = useSafeTranslation(namespace);
        return createElement('span', null, t('account_team:set_member_name_title'));
      };

      await act(async () => {
        root.render(createElement(I18nextProvider, { i18n }, createElement(MemberNameTitle)));
      });

      expect(read).toHaveBeenCalledExactlyOnceWith('en', 'account_team', expect.any(Function));
      expect(container.textContent).toBe(accountTeamResource.set_member_name_title);
      expect(i18n.hasResourceBundle('en', 'account_team')).toBe(true);

      await act(async () => {
        root.render(createElement(I18nextProvider, { i18n }, createElement(MemberNameTitle)));
      });
      expect(read).toHaveBeenCalledOnce();
    }
  );
});
