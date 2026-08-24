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
});
