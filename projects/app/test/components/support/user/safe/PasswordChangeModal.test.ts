import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type ChakraProviderComponent = (typeof import('@chakra-ui/react'))['ChakraProvider'];
type PasswordChangeModalComponent =
  (typeof import('@/components/support/user/safe/PasswordChangeModal'))['default'];
type PasswordChangeStore =
  (typeof import('@/web/support/user/account/password/store'))['usePasswordChangeStore'];

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
  authorizePasswordChange: vi.fn(),
  createPasswordVerification: vi.fn(),
  updatePassword: vi.fn(),
  initUserInfo: vi.fn()
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ asPath: '/account/info', replace: mocks.replace })
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock('@chakra-ui/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@chakra-ui/react')>();
  const createContainer = ({ children }: React.PropsWithChildren) => {
    const ReactRuntime = (globalThis as any).React as typeof React;
    return ReactRuntime.createElement('div', undefined, children);
  };

  return {
    ...original,
    ModalBody: createContainer,
    ModalFooter: createContainer
  };
});

vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    userInfo: { username: 'local-user', hasPassword: true },
    initUserInfo: mocks.initUserInfo
  })
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: Object.assign(() => ({ feConfigs: {} }), {
    getState: () => ({ setLoginStore: vi.fn() })
  })
}));

vi.mock('@/web/support/user/account/password/api', () => ({
  authorizePasswordChange: mocks.authorizePasswordChange,
  createPasswordVerification: mocks.createPasswordVerification,
  updatePassword: mocks.updatePassword
}));

vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children, onClose, closeOnOverlayClick }: any) => {
    const ReactRuntime = (globalThis as any).React as typeof React;
    return ReactRuntime.createElement(
      'section',
      {
        'data-testid': 'password-modal',
        'data-closable': String(typeof onClose === 'function'),
        'data-overlay-close': String(closeOnOverlayClick)
      },
      typeof onClose === 'function'
        ? ReactRuntime.createElement(
            'button',
            { type: 'button', 'data-testid': 'modal-close', onClick: onClose },
            'close'
          )
        : null,
      children
    );
  }
}));

describe('PasswordChangeModal', () => {
  let dom: JSDOM;
  let createRoot: typeof import('react-dom/client').createRoot;
  let ChakraProvider: ChakraProviderComponent;
  let PasswordChangeModal: PasswordChangeModalComponent;
  let usePasswordChangeStore: PasswordChangeStore;
  let container: HTMLDivElement;
  let root: Root;

  const authorized = {
    status: 'authorized' as const,
    token: 'password-change-token',
    expiredAt: '2026-07-22T08:05:00.000Z'
  };

  const flushEffects = async () => {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  };

  const changeInput = (input: HTMLInputElement, value: string) => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!valueSetter) throw new Error('HTMLInputElement value setter is unavailable');

    act(() => {
      valueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const getInput = (label: string) => {
    const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    if (!input) throw new Error(`Input did not render: ${label}`);
    return input;
  };

  const getConfirmButton = () => {
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === 'account_info:password_confirm_action'
    );
    if (!button) throw new Error('Confirm button did not render');
    return button;
  };

  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.example.com/account/info'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('File', dom.window.File);
    vi.stubGlobal('FileList', dom.window.FileList);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      dom.window.setTimeout(() => callback(Date.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => dom.window.clearTimeout(handle));
    vi.stubGlobal('React', React);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    ({ createRoot } = await import('react-dom/client'));
    ({ ChakraProvider } = await import('@chakra-ui/react'));
    ({ default: PasswordChangeModal } =
      await import('@/components/support/user/safe/PasswordChangeModal'));
    ({ usePasswordChangeStore } = await import('@/web/support/user/account/password/store'));
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePasswordChange.mockResolvedValue(authorized);
    mocks.updatePassword.mockResolvedValue(undefined);
    mocks.initUserInfo.mockResolvedValue(undefined);
    usePasswordChangeStore.getState().setAuthorization(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderModal = async (props: Record<string, unknown> = {}) => {
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          undefined,
          React.createElement(PasswordChangeModal, props)
        )
      );
    });
    await flushEffects();
  };

  it('enters the password form from recent login and shows validation errors', async () => {
    const onSuccess = vi.fn();
    await renderModal({ onSuccess, onClose: vi.fn() });

    const newPasswordInput = getInput('account_info:password_new_placeholder');
    const confirmPasswordInput = getInput('account_info:password_confirm_placeholder');
    expect(document.activeElement).not.toBe(newPasswordInput);
    expect(document.activeElement).not.toBe(confirmPasswordInput);
    expect(container.querySelector('[data-testid="password-modal"]')).toMatchObject({
      dataset: expect.objectContaining({ closable: 'true', overlayClose: 'true' })
    });
    expect(container.textContent).toContain('account_info:password_tip');
    expect(container.textContent).not.toContain('common:Cancel');
    expect(mocks.authorizePasswordChange).toHaveBeenCalledTimes(1);

    changeInput(newPasswordInput, 'short');
    changeInput(confirmPasswordInput, 'different');
    act(() => getConfirmButton().click());
    await flushEffects();

    expect(container.textContent).toContain('login:password_tip');
    expect(container.textContent).toContain('user:password.not_match');
    expect(mocks.updatePassword).not.toHaveBeenCalled();

    changeInput(newPasswordInput, 'Strong-password-123');
    changeInput(confirmPasswordInput, 'Strong-password-123');
    act(() => getConfirmButton().click());
    await flushEffects();

    expect(mocks.updatePassword).toHaveBeenCalledWith({
      newPassword: 'Strong-password-123',
      passwordChangeToken: authorized.token
    });
    expect(mocks.initUserInfo).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not expose any close path for a required password flow', async () => {
    await renderModal({ required: true });

    const modal = container.querySelector<HTMLElement>('[data-testid="password-modal"]');
    expect(modal?.dataset.closable).toBe('false');
    expect(modal?.dataset.overlayClose).toBe('false');
    expect(container.querySelector('[data-testid="modal-close"]')).toBeNull();
  });

  it('clears the password form and returns to verification when the JWT is invalid', async () => {
    mocks.authorizePasswordChange
      .mockResolvedValueOnce(authorized)
      .mockResolvedValueOnce({ status: 'verificationRequired', method: 'oldPassword' });
    mocks.createPasswordVerification.mockResolvedValue({
      method: 'oldPassword',
      preLoginCode: 'new-pre-login-code'
    });
    mocks.updatePassword.mockRejectedValue({
      statusText: UserErrEnum.passwordChangeAuthorizationInvalid
    });
    await renderModal({ onClose: vi.fn() });

    changeInput(getInput('account_info:password_new_placeholder'), 'Strong-password-123');
    changeInput(getInput('account_info:password_confirm_placeholder'), 'Strong-password-123');
    act(() => getConfirmButton().click());
    await flushEffects();
    await flushEffects();

    expect(mocks.authorizePasswordChange).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector('input[aria-label="account_info:password_new_placeholder"]')
    ).toBeNull();
    expect(
      container.querySelector('input[placeholder="account_info:password_old_placeholder"]')
    ).not.toBeNull();
    expect(usePasswordChangeStore.getState().authorization).toBeUndefined();
  });
});
