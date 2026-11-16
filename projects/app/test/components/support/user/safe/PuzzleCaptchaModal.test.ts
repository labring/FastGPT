import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PuzzleCaptchaModal from '@/components/support/user/safe/PuzzleCaptchaModal';
import { verifyPuzzleCaptcha } from '@/web/support/user/api';
import { puzzleCaptchaFixture } from '@test/datas/captcha';

vi.mock('@/web/support/user/api', () => ({ verifyPuzzleCaptcha: vi.fn() }));
vi.mock('next-i18next', async () => {
  const { default: messages } = await import('@fastgpt/web/i18n/zh-CN/common.json');
  const t = (key: string) => messages[key.replace(/^common:/, '') as keyof typeof messages] ?? key;
  return { useTranslation: () => ({ t }) };
});
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children)
}));
vi.mock('@chakra-ui/react', () => {
  const Element = ({ as = 'div', children, ...props }: any) =>
    React.createElement(
      as,
      {
        role: props.role,
        type: props.type,
        value: props.value,
        min: props.min,
        max: props.max,
        disabled: props.disabled,
        onKeyDown: props.onKeyDown,
        onChange: props.onChange,
        'aria-label': props['aria-label']
      },
      children
    );
  return {
    Box: Element,
    Flex: Element,
    Icon: Element,
    ModalBody: Element,
    Text: Element,
    Spinner: () => React.createElement('span', { role: 'progressbar' }),
    Image: ({ src }: { src: string }) => React.createElement('img', { src }),
    IconButton: ({ onClick, isDisabled, 'aria-label': label }: any) =>
      React.createElement('button', { onClick, disabled: isDisabled, 'aria-label': label })
  };
});

describe('PuzzleCaptchaModal errors', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLElement;
  const getCaptcha = vi.fn(async () => puzzleCaptchaFixture);
  const onVerified = vi.fn(async (_captcha: string) => undefined);

  const render = async () => {
    await act(async () =>
      root.render(
        React.createElement(PuzzleCaptchaModal, {
          purpose: 'register',
          getCaptcha,
          onVerified,
          onClose: vi.fn()
        })
      )
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
  };

  const submit = async () => {
    const slider = container.querySelector('input')!;
    // 使用组件真实的键盘入口启动轨迹并提交，接口响应由本用例控制。
    for (const key of ['ArrowRight', 'Enter']) {
      await act(async () =>
        slider.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }))
      );
    }
  };

  beforeEach(async () => {
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    vi.clearAllMocks();
    getCaptcha.mockReset().mockResolvedValue({
      ...puzzleCaptchaFixture,
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    onVerified.mockReset().mockResolvedValue(undefined);
    vi.mocked(verifyPuzzleCaptcha).mockReset();
    container = document.getElementById('root')!;
    const { createRoot } = await import('react-dom/client');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    {
      error: { code: 503006, message: '操作过于频繁，请稍后重试' },
      expected: '操作过于频繁，请稍后重试'
    },
    {
      error: {
        response: {
          status: 429,
          data: { message: 'common:error.verify_code_too_frequently' }
        }
      },
      expected: '操作过于频繁，请稍后重试'
    },
    { error: undefined, expected: '图片加载失败，请点击换一张' }
  ])('shows the image request error with a fallback: $expected', async ({ error, expected }) => {
    getCaptcha.mockRejectedValueOnce(error);
    await render();
    expect(container.querySelector('[role=status]')?.textContent).toBe(expected);
    expect(container.querySelector('input')?.disabled).toBe(true);

    const refresh = container.querySelector<HTMLButtonElement>('[aria-label="换一张"]')!;
    expect(refresh.disabled).toBe(false);
    await act(async () => refresh.click());
    expect(getCaptcha).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role=status]')?.textContent).toBe('');
    expect(container.querySelector('input')?.disabled).toBe(false);
  });

  it.each([
    {
      phase: 'verification',
      error: { message: '操作过于频繁，请稍后重试' },
      expected: '操作过于频繁，请稍后重试'
    },
    { phase: 'delivery', error: { message: '邮件服务暂不可用' }, expected: '邮件服务暂不可用' },
    { phase: 'verification', error: undefined, expected: '未能完成验证，请重新拖动' }
  ])(
    'preserves the $phase error after refreshing: $expected',
    async ({ phase, error, expected }) => {
      if (phase === 'verification') {
        vi.mocked(verifyPuzzleCaptcha).mockRejectedValue(error);
      } else {
        vi.mocked(verifyPuzzleCaptcha).mockResolvedValue({
          status: 'passed',
          captcha: 'a'.repeat(64)
        });
        onVerified.mockRejectedValue(error);
      }
      await render();
      await submit();

      expect(verifyPuzzleCaptcha).toHaveBeenCalledOnce();
      expect(onVerified).toHaveBeenCalledTimes(phase === 'delivery' ? 1 : 0);
      expect(getCaptcha).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[role=status]')?.textContent).toBe(expected);
      expect(container.querySelector('input')?.disabled).toBe(false);
    }
  );
});
