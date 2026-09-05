import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useTranslation } from 'next-i18next';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';

vi.mock('next-i18next', () => ({
  useTranslation: vi.fn()
}));

describe('useClientTranslation', () => {
  beforeEach(() => {
    vi.mocked(useTranslation).mockReturnValue({
      t: ((key: string) => key) as never,
      i18n: { language: 'en' } as never,
      ready: false
    });
  });

  it('loads business namespaces without Suspense', () => {
    function TestComponent() {
      useClientTranslation('account');
      return null;
    }

    renderToStaticMarkup(createElement(TestComponent));

    expect(useTranslation).toHaveBeenCalledWith(['common', 'account'], {
      useSuspense: false
    });
  });

  it('完整语言包就绪后正常翻译', () => {
    vi.mocked(useTranslation).mockReturnValue({
      t: ((key: string) => `translated:${key}`) as never,
      i18n: { language: 'en' } as never,
      ready: true
    });

    function TestComponent() {
      const { t } = useClientTranslation('account');
      return createElement('span', null, t('account:personal_information'));
    }

    expect(renderToStaticMarkup(createElement(TestComponent))).toContain(
      'translated:account:personal_information'
    );
  });

  it('支持动态翻译 key，并原样渲染普通字符串', () => {
    vi.mocked(useTranslation).mockReturnValue({
      t: ((key: string) => `translated:${key}`) as never,
      i18n: { language: 'en' } as never,
      ready: true
    });

    function TestComponent() {
      const { t } = useClientTranslation('account');
      const dynamicKey: string = 'account:personal_information';

      return createElement('span', null, `${t(dynamicKey)}|${t('09:30')}`);
    }

    expect(renderToStaticMarkup(createElement(TestComponent))).toContain(
      'translated:account:personal_information|09:30'
    );
  });
});
