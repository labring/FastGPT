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
  useTranslation: () => ({
    t: (key: string) => {
      if (!key.startsWith('common:')) throw new Error(`Unexpected i18n namespace: ${key}`);
      return key;
    }
  })
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
      (item) => item.textContent === 'common:password_confirm_action'
    );
    if (!button) throw new Error('Confirm button did not render');
    return button;
  };

  const completeOldPasswordVerification = async () => {
    await flushEffects();
    const oldPasswordInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="common:password_old_placeholder"]'
    );
    if (!oldPasswordInput) throw new Error('Old password input did not render');

    changeInput(oldPasswordInput, 'Existing-password-123');
    const verifyButton = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === 'common:password_verify'
    );
    if (!verifyButton) throw new Error('Password verification button did not render');

    act(() => verifyButton.click());
    await flushEffects();
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
    mocks.authorizePasswordChange.mockImplementation(({ source }: { source: string }) =>
      Promise.resolve(
        source === 'verificationMethod'
          ? { status: 'verificationRequired', method: 'oldPassword' }
          : authorized
      )
    );
    mocks.createPasswordVerification.mockResolvedValue({
      method: 'oldPassword',
      preLoginCode: 'pre-login-code'
    });
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

  it('requires verification before showing the password form and disables overlay close', async () => {
    const onSuccess = vi.fn();
    await renderModal({ onSuccess, onClose: vi.fn() });

    expect(
      container.querySelector('input[aria-label="common:password_new_placeholder"]')
    ).toBeNull();
    expect(mocks.authorizePasswordChange).toHaveBeenCalledWith({ source: 'verificationMethod' });
    expect(container.querySelector('[data-testid="password-modal"]')).toMatchObject({
      dataset: expect.objectContaining({ closable: 'true', overlayClose: 'true' })
    });

    await completeOldPasswordVerification();

    const newPasswordInput = getInput('common:password_new_placeholder');
    const confirmPasswordInput = getInput('common:password_confirm_placeholder');
    expect(document.activeElement).not.toBe(newPasswordInput);
    expect(document.activeElement).not.toBe(confirmPasswordInput);
    expect(container.querySelector('[data-testid="password-modal"]')).toMatchObject({
      dataset: expect.objectContaining({ closable: 'true', overlayClose: 'false' })
    });
    expect(container.textContent).toContain('common:password_tip');
    expect(container.textContent).not.toContain('common:Cancel');
    expect(mocks.authorizePasswordChange).toHaveBeenCalledTimes(2);

    changeInput(newPasswordInput, 'short');
    changeInput(confirmPasswordInput, 'different');
    act(() => getConfirmButton().click());
    await flushEffects();

    expect(container.textContent?.match(/common:password_tip/g)).toHaveLength(1);
    expect(newPasswordInput.getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toContain('common:password_not_match');
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
    mocks.updatePassword.mockRejectedValue({
      statusText: UserErrEnum.passwordChangeAuthorizationInvalid
    });
    await renderModal({ onClose: vi.fn() });
    await completeOldPasswordVerification();

    changeInput(getInput('common:password_new_placeholder'), 'Strong-password-123');
    changeInput(getInput('common:password_confirm_placeholder'), 'Strong-password-123');
    act(() => getConfirmButton().click());
    await flushEffects();
    await flushEffects();

    expect(mocks.authorizePasswordChange).toHaveBeenCalledTimes(3);
    expect(
      container.querySelector('input[aria-label="common:password_new_placeholder"]')
    ).toBeNull();
    expect(
      container.querySelector('input[placeholder="common:password_old_placeholder"]')
    ).not.toBeNull();
    expect(usePasswordChangeStore.getState().authorization).toBeUndefined();
  });

  it.each([
    ['voluntary password change', false],
    ['expired required password change', true]
  ])('shows the same-password business error for %s', async (_caseName, isExpired) => {
    mocks.updatePassword.mockRejectedValue({
      statusText: UserErrEnum.newPasswordSameAsOld,
      message: 'common:user.Password has no change'
    });
    await renderModal(
      isExpired ? { required: true, showExpiredPrompt: true } : { onClose: vi.fn() }
    );

    if (isExpired) {
      const continueButton = [...container.querySelectorAll('button')].find(
        (item) => item.textContent === 'common:password_expired_action'
      );
      if (!continueButton) throw new Error('Expired password action did not render');

      act(() => continueButton.click());
      await flushEffects();
      await flushEffects();
    }

    await completeOldPasswordVerification();

    changeInput(getInput('common:password_new_placeholder'), 'Strong-password-123');
    changeInput(getInput('common:password_confirm_placeholder'), 'Strong-password-123');
    act(() => getConfirmButton().click());
    await flushEffects();

    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'common:user.Password has no change'
    });
  });
});
