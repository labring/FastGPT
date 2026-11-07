import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseToastOptions } from '@chakra-ui/react';
import { useToast } from '../../hooks/useToast';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  translate: vi.fn((key: string) => `translated:${key}`)
}));

vi.mock('@chakra-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chakra-ui/react')>();
  return { ...actual, useToast: () => mocks.toast };
});
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: mocks.translate })
}));

describe('useToast', () => {
  beforeEach(() => vi.clearAllMocks());

  /** SSR 挂载真实 hook，仅替换 Chakra 的通知出口以检查传入内容。 */
  const notify = (options: UseToastOptions) => {
    let toast!: ReturnType<typeof useToast>['toast'];
    const Harness = () => {
      toast = useToast().toast;
      return null;
    };
    renderToStaticMarkup(React.createElement(Harness));
    toast(options);
    return mocks.toast.mock.lastCall![0];
  };

  it('continues translating string titles and descriptions for error messages', () => {
    const result = notify({ status: 'error', title: 'failed', description: 'reason' });
    expect(result).toMatchObject({ title: 'translated:failed', duration: 5000 });
    expect(renderToStaticMarkup(result.description)).toContain('translated:reason');
  });

  it('preserves emphasized version titles without passing React elements to translation', () => {
    const title = React.createElement(
      'span',
      null,
      React.createElement('strong', null, '「AI 生成版本 1」'),
      ' 应用成功'
    );
    const result = notify({ status: 'success', title });
    expect(result.title).toBe(title);
    expect(renderToStaticMarkup(result.title)).toBe(
      '<span><strong>「AI 生成版本 1」</strong> 应用成功</span>'
    );
    expect(mocks.translate).not.toHaveBeenCalled();
    expect(result.duration).toBe(3000);
  });
});
