import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleSubmit: vi.fn(),
  submit: vi.fn(),
  refreshCaptcha: vi.fn(),
  register: vi.fn(() => ({ name: 'code' }))
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: vi.fn()
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

vi.mock('@chakra-ui/react', () => ({
  Button: 'button',
  Input: 'input',
  ModalBody: 'modal-body',
  ModalFooter: 'modal-footer',
  Skeleton: 'skeleton'
}));

vi.mock('@fastgpt/web/components/common/Image/MyImage', () => ({ default: 'image' }));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({ default: 'modal' }));

vi.stubGlobal('React', await import('react'));

const SendCodeAuthModal = (await import('@/components/support/user/safe/SendCodeAuthModal'))
  .default;

const findElement = (node: ReactNode, type: string): ReactElement => {
  if (!node || typeof node !== 'object') throw new Error(`Unable to find ${type}`);

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === type) return element;

  const children = Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children];
  for (const child of children) {
    try {
      return findElement(child, type);
    } catch {}
  }

  throw new Error(`Unable to find ${type}`);
};

const renderModal = () =>
  SendCodeAuthModal({
    username: 'user@example.com',
    purpose: 'register',
    onClose: vi.fn(),
    onSending: false,
    onSendCode: vi.fn(async () => undefined)
  });

describe('SendCodeAuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleSubmit.mockReturnValue(mocks.submit);
  });

  it('registers only the success callback for button and Enter submissions', () => {
    const modal = renderModal();
    const input = findElement(modal, 'input');

    expect(mocks.handleSubmit).toHaveBeenCalledTimes(1);
    expect(mocks.handleSubmit.mock.calls[0]).toHaveLength(1);

    input.props.onKeyDown({
      stopPropagation: vi.fn(),
      nativeEvent: { isComposing: false },
      keyCode: 13,
      key: 'Enter'
    });

    expect(mocks.handleSubmit).toHaveBeenCalledTimes(2);
    expect(mocks.handleSubmit.mock.calls[1]).toHaveLength(1);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['IME composition', { nativeEvent: { isComposing: true }, keyCode: 13, key: 'Enter' }],
    ['IME fallback key code', { nativeEvent: { isComposing: false }, keyCode: 229, key: 'Enter' }],
    ['another key', { nativeEvent: { isComposing: false }, keyCode: 65, key: 'a' }]
  ])('does not submit for %s', (_name, event) => {
    const modal = renderModal();
    const input = findElement(modal, 'input');

    input.props.onKeyDown({
      stopPropagation: vi.fn(),
      ...event
    });

    expect(mocks.handleSubmit).toHaveBeenCalledTimes(1);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
