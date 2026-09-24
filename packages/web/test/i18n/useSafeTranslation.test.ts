import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useTranslation } from 'next-i18next';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

vi.mock('next-i18next', () => ({
  useTranslation: vi.fn()
}));

describe('useSafeTranslation', () => {
  beforeEach(() => {
    vi.mocked(useTranslation).mockReturnValue({
      t: ((key: string) => key) as never,
      i18n: { language: 'en' } as never,
      ready: true
    });
  });

  it('调用 useTranslation 获取上下文', () => {
    function TestComponent() {
      useSafeTranslation();
      return null;
    }

    renderToStaticMarkup(createElement(TestComponent));

    expect(useTranslation).toHaveBeenCalled();
  });

  it('完整语言包就绪后正常翻译', () => {
    vi.mocked(useTranslation).mockReturnValue({
      t: ((key: string) => `translated:${key}`) as never,
      i18n: { language: 'en' } as never,
      ready: true
    });

    function TestComponent() {
      const { t } = useSafeTranslation();
      return createElement('span', null, t('account:personal_information'));
    }

    expect(renderToStaticMarkup(createElement(TestComponent))).toContain(
      'translated:account:personal_information'
    );
  });

  it('支持动态翻译 key，并对未知 namespace 或普通字符串原样返回', () => {
    vi.mocked(useTranslation).mockReturnValue({
      t: ((key: string) => `translated:${key}`) as never,
      i18n: { language: 'en' } as never,
      ready: true
    });

    function TestComponent() {
      const { t } = useSafeTranslation();
      const dynamicKey: string = 'account:personal_information';

      return createElement('span', null, `${t(dynamicKey)}|${t('09:30')}`);
    }

    expect(renderToStaticMarkup(createElement(TestComponent))).toContain(
      'translated:account:personal_information|09:30'
    );
  });
});
