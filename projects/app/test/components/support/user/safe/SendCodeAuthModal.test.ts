import { act, createElement, type ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true
});
vi.stubGlobal('window', dom.window);
vi.stubGlobal('document', dom.window.document);
vi.stubGlobal('navigator', dom.window.navigator);
vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
vi.stubGlobal('Element', dom.window.Element);
vi.stubGlobal('SVGElement', dom.window.SVGElement);
vi.stubGlobal('HTMLIFrameElement', dom.window.HTMLIFrameElement);
vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);
vi.stubGlobal('Node', dom.window.Node);
vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
vi.stubGlobal('React', await import('react'));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const { createRoot } = await import('react-dom/client');
const { ChakraProvider, FormControl } = await import('@chakra-ui/react');

const mocks = vi.hoisted(() => ({
  handleSubmit: vi.fn(),
  submit: vi.fn(),
  refreshCaptcha: vi.fn(),
  register: vi.fn(() => ({ name: 'code' }))
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    register: mocks.register,
    handleSubmit: mocks.handleSubmit
  })
}));

vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({
    data: { captchaImage: 'data:image/png;base64,captcha' },
    loading: false,
    run: mocks.refreshCaptcha
  })
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('ahooks', () => ({
  useMemoizedFn: (fn: unknown) => fn
}));

vi.mock('@fastgpt/web/components/common/Image/MyImage', () => ({
  default: ({ src, alt }: { src?: string; alt: string }) => createElement('img', { src, alt })
}));

vi.mock('@fastgpt/web/components/common/MyModal', async () => {
  const { Modal, ModalContent } = await import('@chakra-ui/react');

  return {
    default: ({ children }: { children: ReactNode }) =>
      createElement(
        Modal,
        {
          isOpen: true,
          onClose: () => undefined,
          motionPreset: 'none',
          trapFocus: false,
          useInert: false,
          blockScrollOnMount: false
        },
        createElement(ModalContent, undefined, children)
      )
  };
});

const SendCodeAuthModal = (await import('@/components/support/user/safe/SendCodeAuthModal'))
  .default;

const roots: Root[] = [];

const renderModal = ({
  onClose = vi.fn(),
  onSendCode = vi.fn(async () => undefined),
  outerInvalid = false
}: {
  onClose?: () => void;
  onSendCode?: (params: { username: string; captcha: string }) => Promise<void>;
  outerInvalid?: boolean;
} = {}) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(
      createElement(
        ChakraProvider,
        undefined,
        createElement(
          FormControl,
          { isInvalid: outerInvalid },
          createElement(SendCodeAuthModal, {
            username: 'user@example.com',
            purpose: 'register',
            onClose,
            onSending: false,
            onSendCode
          })
        )
      )
    );
  });

  const input = document.body.querySelector('input');
  if (!input) throw new Error('Unable to find captcha input');

  return { input, onClose, onSendCode };
};

describe('SendCodeAuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleSubmit.mockReturnValue(mocks.submit);
  });

  afterEach(() => {
    act(() => {
      roots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
  });

  it('isolates the portal input from an invalid outer FormControl', () => {
    const { input } = renderModal({ outerInvalid: true });

    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    expect(input.getAttribute('data-invalid')).toBeNull();
  });

  it('registers only the success callback for button and Enter submissions', () => {
    const { input } = renderModal();

    expect(mocks.handleSubmit).toHaveBeenCalledTimes(1);
    expect(mocks.handleSubmit.mock.calls[0]).toHaveLength(1);

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Enter',
          keyCode: 13
        })
      );
    });

    expect(mocks.handleSubmit).toHaveBeenCalledTimes(2);
    expect(mocks.handleSubmit.mock.calls[1]).toHaveLength(1);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it('keeps the current captcha when sending fails', async () => {
    const onClose = vi.fn();
    const onSendCode = vi.fn(async () => Promise.reject(new Error('send failed')));
    renderModal({ onClose, onSendCode });
    const onSubmit = mocks.handleSubmit.mock.calls[0][0];

    await expect(onSubmit({ code: 'captcha' })).rejects.toThrow('send failed');

    expect(mocks.refreshCaptcha).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ['IME composition', { isComposing: true, keyCode: 13, key: 'Enter' }],
    ['IME fallback key code', { isComposing: false, keyCode: 229, key: 'Enter' }],
    ['another key', { isComposing: false, keyCode: 65, key: 'a' }]
  ])('does not submit for %s', (_name, event) => {
    const { input } = renderModal();

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...event }));
    });

    expect(mocks.handleSubmit).toHaveBeenCalledTimes(1);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
