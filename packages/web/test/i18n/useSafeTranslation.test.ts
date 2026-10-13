// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { createInstance } from 'i18next';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import enAccountTeam from '../../i18n/en/account_team.json';
import zhCNAccountTeam from '../../i18n/zh-CN/account_team.json';
import zhHantAccountTeam from '../../i18n/zh-Hant/account_team.json';
import koKRAccountTeam from '../../i18n/ko-KR/account_team.json';

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

describe('useSafeTranslation with SSR member-name resources', () => {
  it.each([
    { language: 'en', resource: enAccountTeam },
    { language: 'zh-CN', resource: zhCNAccountTeam },
    { language: 'zh-Hant', resource: zhHantAccountTeam },
    { language: 'ko-KR', resource: koKRAccountTeam }
  ])(
    'renders member-name text from preloaded $language resources',
    async ({ language, resource }) => {
      const i18n = createInstance();
      await i18n.init({
        lng: language,
        fallbackLng: false,
        defaultNS: 'common',
        ns: ['common', 'account_team'],
        resources: { [language]: { common: {}, account_team: resource } },
        react: { useSuspense: false }
      });
      const MemberNameText = () => {
        const { t } = useSafeTranslation();
        return createElement(
          'span',
          null,
          [
            t('account_team:set_member_name_title'),
            t('account_team:invite_member_name_placeholder'),
            t('account_team:confirm_member_name'),
            t('account_team:member_name_required'),
            t('account_team:member_name_limit')
          ].join('|')
        );
      };

      expect(
        renderToStaticMarkup(
          createElement(I18nextProvider, { i18n }, createElement(MemberNameText))
        )
      ).toBe(
        `<span>${[
          resource.set_member_name_title,
          resource.invite_member_name_placeholder,
          resource.confirm_member_name,
          resource.member_name_required,
          resource.member_name_limit
        ].join('|')}</span>`
      );
    }
  );
});
